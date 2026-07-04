(() => {
  const statusElement = document.getElementById("status") as HTMLElement;
  const currentElement = document.getElementById("current") as HTMLElement;
  const queueElement = document.getElementById("queue") as HTMLElement;
  const importWeekwiseButton = document.getElementById("import-weekwise") as HTMLButtonElement;
  const openCurrentButton = document.getElementById("open-current") as HTMLButtonElement;
  const openNextButton = document.getElementById("open-next") as HTMLButtonElement;
  const markAddedButton = document.getElementById("mark-added") as HTMLButtonElement;
  const markUnavailableButton = document.getElementById("mark-unavailable") as HTMLButtonElement;
  const clearRunButton = document.getElementById("clear-run") as HTMLButtonElement;
  let latestState: AsdaHelperState | undefined;

  function sendMessage(message: AsdaHelperRuntimeMessage): Promise<AsdaHelperRuntimeResponse> {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, (response: AsdaHelperRuntimeResponse) => resolve(response)));
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

  function statusLabel(status?: StoreShoppingStatus) {
    if (status === "added") return "Added";
    if (status === "unavailable") return "Unavailable";
    if (status === "opened") return "Opened";
    return "Not started";
  }

  function render(state: AsdaHelperState) {
    latestState = state;
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

    if (!activeItem) {
      currentElement.textContent = "No current item.";
    } else {
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

  openCurrentButton.addEventListener("click", async () => {
    const item = latestState ? currentItem(latestState) : null;
    if (!item) return;
    await sendMessage({ type: "OPEN_ITEM", itemId: item.itemId });
    await refresh();
  });

  openNextButton.addEventListener("click", async () => {
    await sendMessage({ type: "OPEN_NEXT" });
    await refresh();
  });

  markAddedButton.addEventListener("click", async () => {
    const item = latestState ? currentItem(latestState) : null;
    if (!item) return;
    await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "added" });
    await refresh();
  });

  markUnavailableButton.addEventListener("click", async () => {
    const item = latestState ? currentItem(latestState) : null;
    if (!item) return;
    await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "unavailable" });
    await refresh();
  });

  clearRunButton.addEventListener("click", async () => {
    await sendMessage({ type: "CLEAR_RUN" });
    await refresh();
  });

  void refresh();
})();
