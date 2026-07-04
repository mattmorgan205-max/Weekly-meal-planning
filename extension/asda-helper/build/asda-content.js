"use strict";
(() => {
    let latestState;
    let collapsed = false;
    function sendMessage(message) {
        return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response)));
    }
    function escapeHtml(value) {
        return value.replace(/[&<>"']/g, (character) => {
            const replacements = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            };
            return replacements[character] ?? character;
        });
    }
    function currentItem(state) {
        return state.queue?.items[state.currentIndex] ?? null;
    }
    function statusFor(item, state) {
        return state.itemStatus[item.itemId] ?? item.status;
    }
    function findConfidentAddButton() {
        const candidates = Array.from(document.querySelectorAll("button, [role='button']"))
            .filter((element) => {
            const text = `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`.trim();
            const disabled = element instanceof HTMLButtonElement ? element.disabled : element.getAttribute("aria-disabled") === "true";
            return !disabled && /\b(add|add to trolley|add item)\b/i.test(text);
        });
        const isProductPage = /\/product\//i.test(window.location.pathname);
        if (isProductPage && candidates.length > 0)
            return candidates[0];
        if (candidates.length === 1)
            return candidates[0];
        return null;
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
        ${item
            ? `
              <div class="weekwise-item">
                <small>${escapeHtml(`${(state?.currentIndex ?? 0) + 1}/${state?.queue?.items.length ?? 0}`)} · ${escapeHtml(status ?? "not started")}</small>
                <strong>${escapeHtml([item.displayQuantity, item.name].filter(Boolean).join(" "))}</strong>
                <small>${escapeHtml(item.sourceMeals.join(", ") || item.category)}</small>
              </div>
              <div class="weekwise-grid">
                <button id="weekwise-click-add" class="weekwise-primary" type="button" ${confidentAddButton ? "" : "disabled"}>Add this item</button>
                <button id="weekwise-remember" type="button">Remember page</button>
                <button id="weekwise-added" type="button">Mark added</button>
                <button id="weekwise-unavailable" type="button">Unavailable</button>
                <button id="weekwise-next" class="weekwise-primary" type="button">Next item</button>
                <button id="weekwise-refresh" type="button">Refresh</button>
              </div>
              <small class="weekwise-note">${confidentAddButton
                ? "Add this item clicks the visible Asda add button, then marks the item added."
                : "No single safe Add button was detected. Add manually, then mark added."}</small>
            `
            : `
              <div class="weekwise-item">
                <strong>No shopping queue</strong>
                <small>Open Weekwise Shopping and click Send to Asda Helper, or import from an open Weekwise tab.</small>
              </div>
              <button id="weekwise-import" class="weekwise-primary" type="button">Import from Weekwise</button>
              <button id="weekwise-refresh" type="button">Refresh</button>
            `}
      </div>
    `;
        const root = existing ?? document.createElement("section");
        root.id = "weekwise-asda-helper";
        root.className = collapsed ? "weekwise-collapsed" : "";
        root.innerHTML = html;
        if (!existing)
            document.body.append(root);
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
            if (!item)
                return;
            await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "added" });
            await refresh();
        });
        document.getElementById("weekwise-unavailable")?.addEventListener("click", async () => {
            if (!item)
                return;
            await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "unavailable" });
            await refresh();
        });
        document.getElementById("weekwise-next")?.addEventListener("click", async () => {
            await sendMessage({ type: "OPEN_NEXT" });
            await refresh();
        });
        document.getElementById("weekwise-click-add")?.addEventListener("click", async () => {
            const addButton = findConfidentAddButton();
            if (!item || !addButton)
                return;
            addButton.click();
            await new Promise((resolve) => setTimeout(resolve, 750));
            await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "added" });
            await refresh();
        });
    }
    void refresh();
    chrome.storage.onChanged.addListener(() => void refresh());
})();
