(() => {
  const appUrlPatterns = ["http://localhost/*", "http://127.0.0.1/*", "https://weekly-meal-planning-alpha.vercel.app/*", "https://*.vercel.app/*"];
  const defaultState: AsdaHelperState = {
    currentIndex: 0,
    productLinks: {},
    itemStatus: {}
  };

  function normalizeState(value: Partial<AsdaHelperState> | undefined): AsdaHelperState {
    return {
      queue: value?.queue,
      currentIndex: typeof value?.currentIndex === "number" ? value.currentIndex : 0,
      productLinks: value?.productLinks ?? {},
      itemStatus: value?.itemStatus ?? {},
      lastImportedAt: value?.lastImportedAt
    };
  }

  function getState(): Promise<AsdaHelperState> {
    return new Promise((resolve) => {
      chrome.storage.local.get(defaultState, (result: Partial<AsdaHelperState>) => resolve(normalizeState(result)));
    });
  }

  function saveState(state: AsdaHelperState): Promise<void> {
    return new Promise((resolve) => chrome.storage.local.set(state, resolve));
  }

  function itemStatus(item: AsdaHelperQueueItem, state: AsdaHelperState) {
    return state.itemStatus[item.itemId] ?? item.status;
  }

  function itemOpenUrl(item: AsdaHelperQueueItem, state: AsdaHelperState) {
    return state.productLinks[item.shoppingKey] || item.savedProductUrl || item.searchUrl;
  }

  function findNextIndex(items: AsdaHelperQueueItem[], statusById: Record<string, StoreShoppingStatus>, startIndex: number) {
    if (!items.length) return 0;

    for (let offset = 0; offset < items.length; offset += 1) {
      const index = (startIndex + offset) % items.length;
      const status = statusById[items[index].itemId] ?? items[index].status;
      if (status !== "added" && status !== "unavailable") return index;
    }

    return 0;
  }

  function currentItem(state: AsdaHelperState) {
    const items = state.queue?.items ?? [];
    return items[state.currentIndex] ?? null;
  }

  function findItem(state: AsdaHelperState, itemId?: string) {
    const items = state.queue?.items ?? [];
    if (!items.length) return { item: null, index: -1 };
    if (!itemId) return { item: currentItem(state), index: state.currentIndex };
    const index = items.findIndex((item) => item.itemId === itemId);
    return { item: index >= 0 ? items[index] : null, index };
  }

  function sendUpdateToApp(item: AsdaHelperQueueItem, update: { status?: StoreShoppingStatus; productUrl?: string }) {
    chrome.tabs.query({ url: appUrlPatterns }, (tabs: Array<{ id?: number }>) => {
      tabs.forEach((tab) => {
        if (!tab.id) return;
        chrome.tabs.sendMessage(tab.id, {
          type: "APPLY_UPDATE",
          payload: {
            itemId: item.itemId,
            shoppingKey: item.shoppingKey,
            statusKey: item.statusKey,
            status: update.status,
            productUrl: update.productUrl
          }
        });
      });
    });
  }

  function queryTabs(queryInfo: Record<string, unknown>): Promise<Array<{ id?: number }>> {
    return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
  }

  function isQueue(value: unknown): value is AsdaHelperQueue {
    const possibleQueue = value as Partial<AsdaHelperQueue> | null;
    return Boolean(
      possibleQueue &&
        possibleQueue.version === 1 &&
        typeof possibleQueue.rangeStartDate === "string" &&
        typeof possibleQueue.rangeEndDate === "string" &&
        Array.isArray(possibleQueue.items)
    );
  }

  function readQueueFromTab(tabId: number): Promise<AsdaHelperQueue | null> {
    return new Promise((resolve) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => {
            const queueElement = document.getElementById("weekwise-asda-helper-queue");
            const queueText = queueElement?.textContent?.trim();

            if (queueText) {
              try {
                return JSON.parse(queueText);
              } catch {
                return null;
              }
            }

            return (window as any).__WEEKWISE_ASDA_QUEUE__ ?? null;
          }
        },
        (results: Array<{ result?: unknown }> | undefined) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }

          const queue = results?.[0]?.result;
          resolve(isQueue(queue) ? queue : null);
        }
      );
    });
  }

  async function importQueue(queue: AsdaHelperQueue): Promise<AsdaHelperRuntimeResponse> {
    const state = await getState();
    const productLinks = { ...state.productLinks };
    const itemStatusMap = { ...state.itemStatus };

    queue.items.forEach((item) => {
      if (item.savedProductUrl) productLinks[item.shoppingKey] = item.savedProductUrl;
      if (item.status) itemStatusMap[item.itemId] = item.status;
    });

    const nextState: AsdaHelperState = {
      queue,
      productLinks,
      itemStatus: itemStatusMap,
      currentIndex: findNextIndex(queue.items, itemStatusMap, 0),
      lastImportedAt: new Date().toISOString()
    };

    await saveState(nextState);
    queue.items.forEach((item) => {
      const rememberedUrl = productLinks[item.shoppingKey];
      if (rememberedUrl && rememberedUrl !== item.savedProductUrl) sendUpdateToApp(item, { productUrl: rememberedUrl });
    });
    return { ok: true, state: nextState };
  }

  async function importFromAppTab(): Promise<AsdaHelperRuntimeResponse> {
    const tabs = await queryTabs({ url: appUrlPatterns });

    for (const tab of tabs) {
      if (!tab.id) continue;
      const queue = await readQueueFromTab(tab.id);
      if (queue) return importQueue(queue);
    }

    return {
      ok: false,
      error: "No Weekwise shopping queue was found. Open Weekwise on the Shopping tab, then click Send to Asda Helper."
    };
  }

  async function openItem(itemId?: string): Promise<AsdaHelperRuntimeResponse> {
    const state = await getState();
    const { item, index } = findItem(state, itemId);
    if (!item || !state.queue) return { ok: false, error: "No shopping item is ready. Send a list from Weekwise first." };

    const nextStatus = itemStatus(item, state) ?? "opened";
    const nextState: AsdaHelperState = {
      ...state,
      currentIndex: index,
      itemStatus: { ...state.itemStatus, [item.itemId]: nextStatus }
    };

    await saveState(nextState);
    if (nextStatus === "opened") sendUpdateToApp(item, { status: "opened" });
    chrome.tabs.create({ url: itemOpenUrl(item, nextState) });

    return { ok: true, state: nextState, item };
  }

  async function openNextItem(): Promise<AsdaHelperRuntimeResponse> {
    const state = await getState();
    const items = state.queue?.items ?? [];
    if (!items.length) return { ok: false, error: "No shopping list has been imported yet." };

    const nextIndex = findNextIndex(items, state.itemStatus, state.currentIndex);
    return openItem(items[nextIndex].itemId);
  }

  async function setStatus(itemId: string | undefined, status: StoreShoppingStatus | undefined): Promise<AsdaHelperRuntimeResponse> {
    if (!status) return { ok: false, error: "No status was supplied." };

    const state = await getState();
    const { item, index } = findItem(state, itemId);
    if (!item) return { ok: false, error: "That shopping item is no longer in the helper queue." };

    const nextState: AsdaHelperState = {
      ...state,
      currentIndex: index >= 0 ? index : state.currentIndex,
      itemStatus: { ...state.itemStatus, [item.itemId]: status }
    };

    await saveState(nextState);
    sendUpdateToApp(item, { status });
    return { ok: true, state: nextState, item };
  }

  async function saveProductLink(itemId: string | undefined, productUrl: string | undefined): Promise<AsdaHelperRuntimeResponse> {
    const cleanUrl = (productUrl ?? "").trim();
    if (!cleanUrl) return { ok: false, error: "No Asda product URL was supplied." };

    const state = await getState();
    const { item, index } = findItem(state, itemId);
    if (!item) return { ok: false, error: "That shopping item is no longer in the helper queue." };

    const nextState: AsdaHelperState = {
      ...state,
      currentIndex: index >= 0 ? index : state.currentIndex,
      productLinks: { ...state.productLinks, [item.shoppingKey]: cleanUrl }
    };

    await saveState(nextState);
    sendUpdateToApp(item, { productUrl: cleanUrl });
    return { ok: true, state: nextState, item };
  }

  async function clearRun(): Promise<AsdaHelperRuntimeResponse> {
    const state = await getState();
    const nextState: AsdaHelperState = {
      ...state,
      currentIndex: 0,
      itemStatus: {}
    };

    await saveState(nextState);
    return { ok: true, state: nextState };
  }

  async function handleMessage(message: AsdaHelperRuntimeMessage): Promise<AsdaHelperRuntimeResponse> {
    switch (message.type) {
      case "IMPORT_QUEUE":
        return message.queue ? importQueue(message.queue) : { ok: false, error: "No shopping queue was received." };
      case "IMPORT_FROM_APP_TAB":
        return importFromAppTab();
      case "GET_STATE":
        return { ok: true, state: await getState() };
      case "OPEN_ITEM":
        return openItem(message.itemId);
      case "OPEN_NEXT":
        return openNextItem();
      case "SET_STATUS":
        return setStatus(message.itemId, message.status);
      case "SAVE_PRODUCT_LINK":
        return saveProductLink(message.itemId, message.productUrl);
      case "SAVE_CURRENT_PRODUCT_URL":
        return saveProductLink(undefined, message.productUrl);
      case "CLEAR_RUN":
        return clearRun();
      default:
        return { ok: false, error: "Unknown Asda Helper action." };
    }
  }

  chrome.runtime.onMessage.addListener((message: AsdaHelperRuntimeMessage, _sender: unknown, sendResponse: (response: AsdaHelperRuntimeResponse) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Asda Helper failed." });
      });

    return true;
  });
})();
