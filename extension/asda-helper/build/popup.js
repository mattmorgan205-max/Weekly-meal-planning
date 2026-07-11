"use strict";
(() => {
    const statusElement = document.getElementById("status");
    const currentElement = document.getElementById("current");
    const queueElement = document.getElementById("queue");
    const autoAddReviewElement = document.getElementById("auto-add-review");
    const importWeekwiseButton = document.getElementById("import-weekwise");
    const autoAddSavedButton = document.getElementById("auto-add-saved");
    const openCurrentButton = document.getElementById("open-current");
    const openNextButton = document.getElementById("open-next");
    const markAddedButton = document.getElementById("mark-added");
    const markUnavailableButton = document.getElementById("mark-unavailable");
    const verifyBasketButton = document.getElementById("verify-basket");
    const clearRunButton = document.getElementById("clear-run");
    const popupBackupKey = "weekwise-asda-helper-popup-state";
    let latestState;
    function stateHasQueue(state) {
        return Boolean(state?.queue?.items.length);
    }
    function loadBackupState() {
        try {
            const stored = window.localStorage.getItem(popupBackupKey);
            if (!stored)
                return undefined;
            const parsed = JSON.parse(stored);
            return stateHasQueue(parsed) ? parsed : undefined;
        }
        catch {
            return undefined;
        }
    }
    function saveBackupState(state) {
        if (!stateHasQueue(state))
            return;
        window.localStorage.setItem(popupBackupKey, JSON.stringify(state));
    }
    function clearBackupState() {
        window.localStorage.removeItem(popupBackupKey);
    }
    function sendMessage(message) {
        const fallbackState = latestState ?? loadBackupState();
        const messageWithFallback = fallbackState ? { ...message, fallbackState } : message;
        return new Promise((resolve) => chrome.runtime.sendMessage(messageWithFallback, (response) => {
            const error = chrome.runtime.lastError?.message;
            resolve(response ?? { ok: false, error: error ?? "Asda Helper did not respond." });
        }));
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
    function statusLabel(status) {
        if (status === "added")
            return "Added";
        if (status === "unavailable")
            return "Unavailable";
        if (status === "opened")
            return "Opened";
        return "Not started";
    }
    function shoppingListMeta(item, state, status) {
        const parts = [statusLabel(status), item.category];
        const sourceLabel = item.sourceMeals.slice(0, 2).join(", ");
        if (sourceLabel)
            parts.push(sourceLabel);
        parts.push(item.savedProductUrl || state.productLinks[item.shoppingKey] ? "Saved product" : "Asda search");
        return parts.filter(Boolean).join(" · ");
    }
    function openUrlFor(item, state) {
        return state.productLinks[item.shoppingKey] || item.savedProductUrl || item.searchUrl;
    }
    async function openAndRefresh(message) {
        statusElement.textContent = "Opening Asda...";
        const response = await sendMessage(message);
        if (!response.ok) {
            statusElement.textContent = response.openUrl
                ? `${response.error ?? "Chrome could not open Asda."} Use the fallback link shown below.`
                : response.error ?? "Chrome could not open Asda.";
        }
        await refresh();
        if (!response.ok && response.error)
            statusElement.textContent = response.error;
    }
    function render(state) {
        latestState = state;
        saveBackupState(state);
        const items = state.queue?.items ?? [];
        const activeItem = currentItem(state);
        const addedCount = items.filter((item) => statusFor(item, state) === "added").length;
        const unavailableCount = items.filter((item) => statusFor(item, state) === "unavailable").length;
        statusElement.textContent = items.length
            ? `${addedCount}/${items.length} added${unavailableCount ? `, ${unavailableCount} unavailable` : ""}`
            : "Open Weekwise Shopping, then click Send to Asda Helper or Import from Weekwise.";
        openCurrentButton.disabled = !activeItem;
        openNextButton.disabled = !items.length;
        markAddedButton.disabled = !activeItem;
        markUnavailableButton.disabled = !activeItem;
        verifyBasketButton.disabled = !items.length;
        autoAddSavedButton.disabled = !items.some((item) => statusFor(item, state) !== "added" && statusFor(item, state) !== "unavailable" && (item.savedProductUrl || state.productLinks[item.shoppingKey]));
        if (!activeItem) {
            currentElement.textContent = "No current item.";
        }
        else {
            const manualOpenUrl = openUrlFor(activeItem, state);
            currentElement.innerHTML = `
        <strong>${escapeHtml([activeItem.displayQuantity, activeItem.name].filter(Boolean).join(" "))}</strong>
        <small>${escapeHtml(statusLabel(statusFor(activeItem, state)))} · ${escapeHtml(activeItem.sourceMeals.join(", ") || activeItem.category)}</small>
        <a class="manual-open-link" href="${escapeHtml(manualOpenUrl)}" target="_blank" rel="noreferrer">Open Asda link manually</a>
      `;
        }
        autoAddReviewElement.textContent = "";
        const reviewItems = state.autoAddReviews ?? [];
        if (reviewItems.length) {
            const heading = document.createElement("strong");
            heading.textContent = "Needs review";
            autoAddReviewElement.append(heading);
            reviewItems.forEach((reviewItem) => {
                const panel = document.createElement("article");
                panel.className = "review-item";
                panel.innerHTML = `
          <strong>${escapeHtml([reviewItem.displayQuantity, reviewItem.name].filter(Boolean).join(" "))}</strong>
          <small>${escapeHtml(reviewItem.reason)}</small>
          <a href="${escapeHtml(reviewItem.openUrl)}" target="_blank" rel="noreferrer">Open item to review</a>
        `;
                autoAddReviewElement.append(panel);
            });
        }
        queueElement.textContent = "";
        if (items.length) {
            const listHeader = document.createElement("div");
            listHeader.className = "queue-heading";
            listHeader.innerHTML = `
        <strong>Shopping list</strong>
        <small>${items.length} item${items.length === 1 ? "" : "s"} · ${addedCount} added${unavailableCount ? ` · ${unavailableCount} unavailable` : ""}</small>
      `;
            queueElement.append(listHeader);
        }
        items.forEach((item, index) => {
            const itemStatus = statusFor(item, state);
            const button = document.createElement("button");
            button.type = "button";
            button.className = ["queue-item", index === state.currentIndex ? "active" : "", itemStatus ?? ""].filter(Boolean).join(" ");
            button.innerHTML = `
        <strong>${escapeHtml([item.displayQuantity, item.name].filter(Boolean).join(" "))}</strong>
        <small>${escapeHtml(shoppingListMeta(item, state, itemStatus))}</small>
      `;
            button.addEventListener("click", async () => {
                await openAndRefresh({ type: "OPEN_ITEM", itemId: item.itemId });
            });
            queueElement.append(button);
        });
    }
    async function refresh() {
        const response = await sendMessage({ type: "GET_STATE" });
        if (!response.ok || !response.state) {
            statusElement.textContent = response.error ?? "Asda Helper could not load.";
            return;
        }
        if (!stateHasQueue(response.state) && stateHasQueue(loadBackupState())) {
            statusElement.textContent = "Restoring imported list from popup backup...";
        }
        render(response.state);
    }
    async function importFromWeekwise() {
        statusElement.textContent = "Looking for an open Weekwise Shopping tab...";
        const response = await sendMessage({ type: "IMPORT_FROM_APP_TAB" });
        if (!response.ok || !response.state) {
            statusElement.textContent = response.error ?? "Asda Helper could not import from Weekwise.";
            return;
        }
        render(response.state);
    }
    importWeekwiseButton.addEventListener("click", async () => {
        await importFromWeekwise();
    });
    autoAddSavedButton.addEventListener("click", async () => {
        statusElement.textContent = "Auto-adding saved product pages...";
        const response = await sendMessage({ type: "AUTO_ADD_SAVED" });
        if (response.state)
            render(response.state);
        statusElement.textContent = response.message ?? response.error ?? "Auto-add finished.";
    });
    openCurrentButton.addEventListener("click", async () => {
        const item = latestState ? currentItem(latestState) : null;
        if (!item)
            return;
        await openAndRefresh({ type: "OPEN_ITEM", itemId: item.itemId });
    });
    openNextButton.addEventListener("click", async () => {
        await openAndRefresh({ type: "OPEN_NEXT" });
    });
    markAddedButton.addEventListener("click", async () => {
        const item = latestState ? currentItem(latestState) : null;
        if (!item)
            return;
        await openAndRefresh({ type: "SET_STATUS", itemId: item.itemId, status: "added", advance: true, openNext: true });
        await refresh();
    });
    markUnavailableButton.addEventListener("click", async () => {
        const item = latestState ? currentItem(latestState) : null;
        if (!item)
            return;
        await openAndRefresh({ type: "SET_STATUS", itemId: item.itemId, status: "unavailable", advance: true, openNext: true });
        await refresh();
    });
    verifyBasketButton.addEventListener("click", async () => {
        statusElement.textContent = "Opening Asda basket...";
        const response = await sendMessage({ type: "OPEN_BASKET" });
        if (response.state)
            render(response.state);
        statusElement.textContent = response.ok
            ? "Basket opened. Use Verify basket in the Weekwise overlay."
            : response.error ?? "Chrome could not open the Asda basket.";
    });
    clearRunButton.addEventListener("click", async () => {
        clearBackupState();
        await sendMessage({ type: "CLEAR_RUN" });
        await refresh();
    });
    chrome.storage.onChanged.addListener((_changes, areaName) => {
        if (areaName === "local")
            void refresh();
    });
    void refresh();
})();
