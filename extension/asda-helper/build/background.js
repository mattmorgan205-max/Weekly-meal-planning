"use strict";
(() => {
    const appUrlPatterns = ["http://localhost/*", "http://127.0.0.1/*", "https://weekly-meal-planning-alpha.vercel.app/*"];
    const defaultState = {
        currentIndex: 0,
        productLinks: {},
        itemStatus: {}
    };
    function normalizeState(value) {
        return {
            queue: value?.queue,
            currentIndex: typeof value?.currentIndex === "number" ? value.currentIndex : 0,
            productLinks: value?.productLinks ?? {},
            itemStatus: value?.itemStatus ?? {},
            lastImportedAt: value?.lastImportedAt
        };
    }
    function getState() {
        return new Promise((resolve) => {
            chrome.storage.local.get(defaultState, (result) => resolve(normalizeState(result)));
        });
    }
    function saveState(state) {
        return new Promise((resolve) => chrome.storage.local.set(state, resolve));
    }
    function itemStatus(item, state) {
        return state.itemStatus[item.itemId] ?? item.status;
    }
    function itemOpenUrl(item, state) {
        return state.productLinks[item.shoppingKey] || item.savedProductUrl || item.searchUrl;
    }
    function findNextIndex(items, statusById, startIndex) {
        if (!items.length)
            return 0;
        for (let offset = 0; offset < items.length; offset += 1) {
            const index = (startIndex + offset) % items.length;
            const status = statusById[items[index].itemId] ?? items[index].status;
            if (status !== "added" && status !== "unavailable")
                return index;
        }
        return 0;
    }
    function currentItem(state) {
        const items = state.queue?.items ?? [];
        return items[state.currentIndex] ?? null;
    }
    function findItem(state, itemId) {
        const items = state.queue?.items ?? [];
        if (!items.length)
            return { item: null, index: -1 };
        if (!itemId)
            return { item: currentItem(state), index: state.currentIndex };
        const index = items.findIndex((item) => item.itemId === itemId);
        return { item: index >= 0 ? items[index] : null, index };
    }
    function sendUpdateToApp(item, update) {
        chrome.tabs.query({ url: appUrlPatterns }, (tabs) => {
            tabs.forEach((tab) => {
                if (!tab.id)
                    return;
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
    async function importQueue(queue) {
        const state = await getState();
        const productLinks = { ...state.productLinks };
        const itemStatusMap = { ...state.itemStatus };
        queue.items.forEach((item) => {
            if (item.savedProductUrl)
                productLinks[item.shoppingKey] = item.savedProductUrl;
            if (item.status)
                itemStatusMap[item.itemId] = item.status;
        });
        const nextState = {
            queue,
            productLinks,
            itemStatus: itemStatusMap,
            currentIndex: findNextIndex(queue.items, itemStatusMap, 0),
            lastImportedAt: new Date().toISOString()
        };
        await saveState(nextState);
        queue.items.forEach((item) => {
            const rememberedUrl = productLinks[item.shoppingKey];
            if (rememberedUrl && rememberedUrl !== item.savedProductUrl)
                sendUpdateToApp(item, { productUrl: rememberedUrl });
        });
        return { ok: true, state: nextState };
    }
    async function openItem(itemId) {
        const state = await getState();
        const { item, index } = findItem(state, itemId);
        if (!item || !state.queue)
            return { ok: false, error: "No shopping item is ready. Send a list from Weekwise first." };
        const nextStatus = itemStatus(item, state) ?? "opened";
        const nextState = {
            ...state,
            currentIndex: index,
            itemStatus: { ...state.itemStatus, [item.itemId]: nextStatus }
        };
        await saveState(nextState);
        if (nextStatus === "opened")
            sendUpdateToApp(item, { status: "opened" });
        chrome.tabs.create({ url: itemOpenUrl(item, nextState) });
        return { ok: true, state: nextState, item };
    }
    async function openNextItem() {
        const state = await getState();
        const items = state.queue?.items ?? [];
        if (!items.length)
            return { ok: false, error: "No shopping list has been imported yet." };
        const nextIndex = findNextIndex(items, state.itemStatus, state.currentIndex);
        return openItem(items[nextIndex].itemId);
    }
    async function setStatus(itemId, status) {
        if (!status)
            return { ok: false, error: "No status was supplied." };
        const state = await getState();
        const { item, index } = findItem(state, itemId);
        if (!item)
            return { ok: false, error: "That shopping item is no longer in the helper queue." };
        const nextState = {
            ...state,
            currentIndex: index >= 0 ? index : state.currentIndex,
            itemStatus: { ...state.itemStatus, [item.itemId]: status }
        };
        await saveState(nextState);
        sendUpdateToApp(item, { status });
        return { ok: true, state: nextState, item };
    }
    async function saveProductLink(itemId, productUrl) {
        const cleanUrl = (productUrl ?? "").trim();
        if (!cleanUrl)
            return { ok: false, error: "No Asda product URL was supplied." };
        const state = await getState();
        const { item, index } = findItem(state, itemId);
        if (!item)
            return { ok: false, error: "That shopping item is no longer in the helper queue." };
        const nextState = {
            ...state,
            currentIndex: index >= 0 ? index : state.currentIndex,
            productLinks: { ...state.productLinks, [item.shoppingKey]: cleanUrl }
        };
        await saveState(nextState);
        sendUpdateToApp(item, { productUrl: cleanUrl });
        return { ok: true, state: nextState, item };
    }
    async function clearRun() {
        const state = await getState();
        const nextState = {
            ...state,
            currentIndex: 0,
            itemStatus: {}
        };
        await saveState(nextState);
        return { ok: true, state: nextState };
    }
    async function handleMessage(message) {
        switch (message.type) {
            case "IMPORT_QUEUE":
                return message.queue ? importQueue(message.queue) : { ok: false, error: "No shopping queue was received." };
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
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        handleMessage(message)
            .then(sendResponse)
            .catch((error) => {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : "Asda Helper failed." });
        });
        return true;
    });
})();
