(() => {
  let latestState: AsdaHelperState | undefined;
  let collapsed = false;

  function sendMessage(message: AsdaHelperRuntimeMessage): Promise<AsdaHelperRuntimeResponse> {
    const messageWithFallback = latestState ? { ...message, fallbackState: latestState } : message;

    return new Promise((resolve) =>
      chrome.runtime.sendMessage(messageWithFallback, (response: AsdaHelperRuntimeResponse | undefined) => {
        const error = chrome.runtime.lastError?.message;
        resolve(response ?? { ok: false, error: error ?? "Asda Helper did not respond." });
      })
    );
  }

  function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
      const replacements: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };
      return replacements[character] ?? character;
    });
  }

  function currentItem(state: AsdaHelperState) {
    return state.queue?.items[state.currentIndex] ?? null;
  }

  function statusFor(item: AsdaHelperQueueItem, state: AsdaHelperState) {
    return state.itemStatus[item.itemId] ?? item.status;
  }

  function elementVisible(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function buttonDisabled(element: HTMLButtonElement | HTMLElement) {
    return element instanceof HTMLButtonElement ? element.disabled : element.getAttribute("aria-disabled") === "true";
  }

  function findConfidentAddButton() {
    const candidates = Array.from(
      document.querySelectorAll<HTMLButtonElement | HTMLElement>(
        [
          "button",
          "[role='button']",
          "[data-testid*='add' i]",
          "[data-auto-id*='add' i]",
          "[aria-label*='add' i]"
        ].join(",")
      )
    )
      .filter((element) => elementVisible(element) && !buttonDisabled(element))
      .map((element) => {
        const text = `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("data-testid") ?? ""} ${element.getAttribute("data-auto-id") ?? ""}`
          .replace(/\s+/g, " ")
          .trim();
        const lowerText = text.toLowerCase();
        let score = 0;

        if (/\badd\b/.test(lowerText)) score += 4;
        if (/add to (basket|trolley|cart)/.test(lowerText)) score += 8;
        if (/^add$/.test(lowerText)) score += 6;
        if (/\/product\//i.test(window.location.pathname)) score += 3;
        if (/(favourite|favorite|list|address|voucher|promo|coupon)/.test(lowerText)) score -= 10;

        return { element, score, text };
      })
      .filter((candidate) => candidate.score >= 4)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.element ?? null;
  }

  async function clickAddButtonWithRetry() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const addButton = findConfidentAddButton();
      if (addButton) {
        addButton.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
        addButton.focus();
        await new Promise((resolve) => setTimeout(resolve, 200));
        addButton.click();
        await new Promise((resolve) => setTimeout(resolve, 1600));
        return { ok: true };
      }

      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    return { ok: false, error: "No single safe Asda add button was found." };
  }

  async function refresh() {
    const response = await sendMessage({ type: "GET_STATE" });
    latestState = response.state;
    render();
  }

  function render() {
    const existing = document.getElementById("weekwise-asda-helper");
    const state = latestState;
    const item = state ? currentItem(state) : null;
    const confidentAddButton = findConfidentAddButton();
    const status = item && state ? statusFor(item, state) : undefined;

    const html = `
      <div class="weekwise-head">
        <strong>Weekwise Asda Helper</strong>
        <button id="weekwise-toggle" type="button">${collapsed ? "Show" : "Hide"}</button>
      </div>
      <div class="weekwise-body">
        ${
          item
            ? `
              <div class="weekwise-item">
                <small>${escapeHtml(`${(state?.currentIndex ?? 0) + 1}/${state?.queue?.items.length ?? 0}`)} · ${escapeHtml(status ?? "not started")}</small>
                <strong>${escapeHtml([item.displayQuantity, item.name].filter(Boolean).join(" "))}</strong>
                <small>${escapeHtml(item.sourceMeals.join(", ") || item.category)}</small>
              </div>
              <div class="weekwise-grid">
                <button id="weekwise-click-add" class="weekwise-primary" type="button" ${confidentAddButton ? "" : "disabled"}>Add + next</button>
                <button id="weekwise-remember" type="button">Remember page</button>
                <button id="weekwise-added" type="button">Added + next</button>
                <button id="weekwise-unavailable" type="button">Unavailable + next</button>
                <button id="weekwise-next" class="weekwise-primary" type="button">Next item</button>
                <button id="weekwise-refresh" type="button">Refresh</button>
              </div>
              <small class="weekwise-note">${
                confidentAddButton
                  ? "Add + next clicks the visible Asda add button, marks this item added, then opens the next item."
                  : "No single safe Add button was detected. Add manually, then mark added."
              }</small>
            `
            : `
              <div class="weekwise-item">
                <strong>No shopping queue</strong>
                <small>Open Weekwise Shopping and click Send to Asda Helper, or import from an open Weekwise tab.</small>
              </div>
              <button id="weekwise-import" class="weekwise-primary" type="button">Import from Weekwise</button>
              <button id="weekwise-refresh" type="button">Refresh</button>
            `
        }
      </div>
    `;

    const root = existing ?? document.createElement("section");
    root.id = "weekwise-asda-helper";
    root.className = collapsed ? "weekwise-collapsed" : "";
    root.innerHTML = html;

    if (!existing) document.body.append(root);

    document.getElementById("weekwise-toggle")?.addEventListener("click", () => {
      collapsed = !collapsed;
      render();
    });
    document.getElementById("weekwise-refresh")?.addEventListener("click", () => void refresh());
    document.getElementById("weekwise-import")?.addEventListener("click", async () => {
      await sendMessage({ type: "IMPORT_FROM_APP_TAB" });
      await refresh();
    });
    document.getElementById("weekwise-remember")?.addEventListener("click", async () => {
      await sendMessage({ type: "SAVE_CURRENT_PRODUCT_URL", productUrl: window.location.href });
      await refresh();
    });
    document.getElementById("weekwise-added")?.addEventListener("click", async () => {
      if (!item) return;
      await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "added", advance: true, openNext: true });
      await refresh();
    });
    document.getElementById("weekwise-unavailable")?.addEventListener("click", async () => {
      if (!item) return;
      await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "unavailable", advance: true, openNext: true });
      await refresh();
    });
    document.getElementById("weekwise-next")?.addEventListener("click", async () => {
      await sendMessage({ type: "OPEN_NEXT" });
      await refresh();
    });
    document.getElementById("weekwise-click-add")?.addEventListener("click", async () => {
      if (!item) return;
      const result = await clickAddButtonWithRetry();
      if (!result.ok) return;
      await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "added", advance: true, openNext: true });
      await refresh();
    });
  }

  void refresh();
  chrome.storage.onChanged.addListener(() => void refresh());
  chrome.runtime.onMessage.addListener((message: AsdaHelperRuntimeMessage, _sender: unknown, sendResponse: (response: { ok: boolean; error?: string }) => void) => {
    if (message.type !== "CLICK_ADD_IF_CONFIDENT") return;

    clickAddButtonWithRetry().then(sendResponse);
    return true;
  });
})();
