"use strict";
(() => {
    const statusElement = document.getElementById("status");
    const currentElement = document.getElementById("current");
    const queueElement = document.getElementById("queue");
    const openCurrentButton = document.getElementById("open-current");
    const openNextButton = document.getElementById("open-next");
    const markAddedButton = document.getElementById("mark-added");
    const markUnavailableButton = document.getElementById("mark-unavailable");
    const clearRunButton = document.getElementById("clear-run");
    let latestState;
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
    function statusLabel(status) {
        if (status === "added")
            return "Added";
        if (status === "unavailable")
            return "Unavailable";
        if (status === "opened")
            return "Opened";
        return "Not started";
    }
    function render(state) {
        latestState = state;
        const items = state.queue?.items ?? [];
        const activeItem = currentItem(state);
        const addedCount = items.filter((item) => statusFor(item, state) === "added").length;
        const unavailableCount = items.filter((item) => statusFor(item, state) === "unavailable").length;
        statusElement.textContent = items.length
            ? `${addedCount}/${items.length} added${unavailableCount ? `, ${unavailableCount} unavailable` : ""}`
            : "Open Weekwise Shopping and send a list to the helper.";
        openCurrentButton.disabled = !activeItem;
        openNextButton.disabled = !items.length;
        markAddedButton.disabled = !activeItem;
        markUnavailableButton.disabled = !activeItem;
        if (!activeItem) {
            currentElement.textContent = "No current item.";
        }
        else {
            currentElement.innerHTML = `
        <strong>${escapeHtml([activeItem.displayQuantity, activeItem.name].filter(Boolean).join(" "))}</strong>
        <small>${escapeHtml(statusLabel(statusFor(activeItem, state)))} · ${escapeHtml(activeItem.sourceMeals.join(", ") || activeItem.category)}</small>
      `;
        }
        queueElement.textContent = "";
        items.forEach((item, index) => {
            const itemStatus = statusFor(item, state);
            const button = document.createElement("button");
            button.type = "button";
            button.className = ["queue-item", index === state.currentIndex ? "active" : "", itemStatus ?? ""].filter(Boolean).join(" ");
            button.innerHTML = `
        <strong>${escapeHtml([item.displayQuantity, item.name].filter(Boolean).join(" "))}</strong>
        <small>${escapeHtml(statusLabel(itemStatus))} · ${escapeHtml(item.savedProductUrl || state.productLinks[item.shoppingKey] ? "Saved product" : "Asda search")}</small>
      `;
            button.addEventListener("click", async () => {
                await sendMessage({ type: "OPEN_ITEM", itemId: item.itemId });
                await refresh();
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
        render(response.state);
    }
    openCurrentButton.addEventListener("click", async () => {
        const item = latestState ? currentItem(latestState) : null;
        if (!item)
            return;
        await sendMessage({ type: "OPEN_ITEM", itemId: item.itemId });
        await refresh();
    });
    openNextButton.addEventListener("click", async () => {
        await sendMessage({ type: "OPEN_NEXT" });
        await refresh();
    });
    markAddedButton.addEventListener("click", async () => {
        const item = latestState ? currentItem(latestState) : null;
        if (!item)
            return;
        await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "added" });
        await refresh();
    });
    markUnavailableButton.addEventListener("click", async () => {
        const item = latestState ? currentItem(latestState) : null;
        if (!item)
            return;
        await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "unavailable" });
        await refresh();
    });
    clearRunButton.addEventListener("click", async () => {
        await sendMessage({ type: "CLEAR_RUN" });
        await refresh();
    });
    void refresh();
})();
