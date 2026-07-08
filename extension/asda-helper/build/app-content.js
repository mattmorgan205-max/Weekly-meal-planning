"use strict";
(() => {
    const appSource = "weekwise-meal-planner";
    const extensionSource = "weekwise-asda-helper-extension";
    const invalidContextMessage = "Asda Helper was reloaded. Refresh this Weekwise tab, then click Send to Asda Helper again.";
    function safePostMessage(type, payload) {
        try {
            window.postMessage({
                source: extensionSource,
                type,
                payload
            }, "*");
        }
        catch {
        }
    }
    function postImportResult(payload) {
        safePostMessage("ASDA_HELPER_IMPORT_RESULT", payload);
    }
    function extensionContextReady() {
        try {
            return Boolean(chrome?.runtime?.id);
        }
        catch {
            return false;
        }
    }
    window.addEventListener("message", (event) => {
        if (event.source !== window || event.origin !== window.location.origin)
            return;
        const message = event.data;
        if (!message || message.source !== appSource || message.type !== "ASDA_HELPER_IMPORT_QUEUE" || !message.payload)
            return;
        if (!extensionContextReady()) {
            postImportResult({ error: invalidContextMessage });
            return;
        }
        try {
            chrome.runtime.sendMessage({ type: "IMPORT_QUEUE", queue: message.payload }, (response) => {
                const runtimeError = chrome.runtime.lastError?.message;
                const itemCount = response?.state?.queue?.items.length ?? message.payload?.items.length ?? 0;
                postImportResult(response?.ok
                    ? { itemCount }
                    : { error: runtimeError?.includes("Extension context invalidated") ? invalidContextMessage : response?.error ?? runtimeError ?? "Asda Helper could not import this list." });
            });
        }
        catch (error) {
            postImportResult({
                error: error instanceof Error && error.message.includes("Extension context invalidated") ? invalidContextMessage : "Asda Helper could not import this list."
            });
        }
    });
    if (!extensionContextReady())
        return;
    try {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message.type !== "APPLY_UPDATE")
                return;
            safePostMessage("ASDA_HELPER_UPDATE_ITEM", message.payload);
            sendResponse({ ok: true });
        });
    }
    catch {
        postImportResult({ error: invalidContextMessage });
    }
})();
