(() => {
  const appSource = "weekwise-meal-planner";
  const extensionSource = "weekwise-asda-helper-extension";
  const invalidContextMessage = "Asda Helper was reloaded. Refresh this Weekwise tab, then click Send to Asda Helper again.";

  function safePostMessage(type: string, payload: Record<string, unknown> | undefined) {
    try {
      window.postMessage(
        {
          source: extensionSource,
          type,
          payload
        },
        "*"
      );
    } catch {
      // Chrome can leave a stale content script running after an extension reload.
      // In that state even posting back to the page can throw; the next page refresh fixes it.
    }
  }

  function postImportResult(payload: { itemCount?: number; error?: string }) {
    safePostMessage("ASDA_HELPER_IMPORT_RESULT", payload);
  }

  function extensionContextReady() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  window.addEventListener("message", (event: MessageEvent<{ source?: string; type?: string; payload?: unknown }>) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    const message = event.data;
    if (!message || message.source !== appSource || !message.payload) return;

    if (!extensionContextReady()) {
      postImportResult({ error: invalidContextMessage });
      return;
    }

    if (message.type === "ASDA_HELPER_SYNC_ITEM") {
      try {
        const payload = message.payload as { itemId?: string; statusKey?: string; status?: StoreShoppingStatus };
        chrome.runtime.sendMessage({ type: "SYNC_ITEM_STATUS", ...payload }, () => {
          void chrome.runtime.lastError;
        });
      } catch {
        // A refreshed Weekwise tab will reconnect a stale extension content script.
      }
      return;
    }

    if (message.type !== "ASDA_HELPER_IMPORT_QUEUE") return;
    const queue = message.payload as AsdaHelperQueue;

    try {
      chrome.runtime.sendMessage({ type: "IMPORT_QUEUE", queue }, (response: AsdaHelperRuntimeResponse) => {
        const runtimeError = chrome.runtime.lastError?.message;
        const itemCount = response?.state?.queue?.items.length ?? queue.items.length ?? 0;

        postImportResult(
          response?.ok
            ? { itemCount }
            : { error: runtimeError?.includes("Extension context invalidated") ? invalidContextMessage : response?.error ?? runtimeError ?? "Asda Helper could not import this list." }
        );
      });
    } catch (error) {
      postImportResult({
        error: error instanceof Error && error.message.includes("Extension context invalidated") ? invalidContextMessage : "Asda Helper could not import this list."
      });
    }
  });

  if (!extensionContextReady()) return;

  try {
    chrome.runtime.onMessage.addListener((message: AsdaHelperRuntimeMessage, _sender: unknown, sendResponse: (response: { ok: boolean }) => void) => {
      if (message.type !== "APPLY_UPDATE") return;

      safePostMessage("ASDA_HELPER_UPDATE_ITEM", message.payload);
      sendResponse({ ok: true });
    });
  } catch {
    postImportResult({ error: invalidContextMessage });
  }
})();
