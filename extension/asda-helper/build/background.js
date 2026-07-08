"use strict";
(() => {
    const appUrlPatterns = ["http://localhost/*", "http://127.0.0.1/*", "https://weekly-meal-planning-alpha.vercel.app/*", "https://*.vercel.app/*"];
    const asdaUrlPatterns = ["https://groceries.asda.com/*", "https://www.asda.com/groceries/*"];
    const defaultState = {
        currentIndex: 0,
        productLinks: {},
        itemStatus: {}
    };
    let runtimeState = defaultState;
    function hasQueue(state) {
        return Boolean(state.queue?.items.length);
    }
    function normalizeState(value) {
        return {
            queue: value?.queue,
            currentIndex: typeof value?.currentIndex === "number" ? value.currentIndex : 0,
            activeAsdaTabId: typeof value?.activeAsdaTabId === "number" ? value.activeAsdaTabId : undefined,
            productLinks: value?.productLinks ?? {},
            itemStatus: value?.itemStatus ?? {},
            autoAddReviews: Array.isArray(value?.autoAddReviews) ? value.autoAddReviews : [],
            lastAutoAddMessage: value?.lastAutoAddMessage,
            lastImportedAt: value?.lastImportedAt
        };
    }
    function persistState(state) {
        return new Promise((resolve, reject) => {
            const storableState = JSON.parse(JSON.stringify(state));
            chrome.storage.local.set(storableState, () => {
                const error = chrome.runtime.lastError?.message;
                if (error) {
                    reject(new Error(error));
                    return;
                }
                resolve();
            });
        });
    }
    async function getState(fallbackState) {
        return new Promise((resolve) => {
            chrome.storage.local.get(defaultState, (result) => {
                const storedState = normalizeState(result);
                const fallback = normalizeState(fallbackState);
                const bestState = hasQueue(storedState) ? storedState : hasQueue(runtimeState) ? runtimeState : hasQueue(fallback) ? fallback : storedState;
                runtimeState = bestState;
                if (!hasQueue(storedState) && hasQueue(bestState)) {
                    void persistState(bestState);
                }
                resolve(bestState);
            });
        });
    }
    function saveState(state) {
        runtimeState = normalizeState(JSON.parse(JSON.stringify(state)));
        return persistState(runtimeState);
    }
    function itemStatus(item, state) {
        return state.itemStatus[item.itemId] ?? item.status;
    }
    function itemOpenUrl(item, state) {
        return state.productLinks[item.shoppingKey] || item.savedProductUrl || item.searchUrl;
    }
    function normalizeOpenUrl(value) {
        const trimmed = value.trim();
        if (!trimmed)
            return "";
        try {
            const url = new URL(trimmed);
            return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
        }
        catch {
            try {
                return new URL(`https://${trimmed}`).toString();
            }
            catch {
                return "";
            }
        }
    }
    function openShoppingTab(url, active = true) {
        return new Promise((resolve, reject) => {
            chrome.tabs.create({ url, active }, (tab) => {
                const error = chrome.runtime.lastError?.message;
                if (error) {
                    reject(new Error(error));
                    return;
                }
                if (!tab?.id) {
                    reject(new Error("Chrome did not create a shopping tab."));
                    return;
                }
                resolve(tab.id);
            });
        });
    }
    function updateShoppingTab(tabId, url, active = true) {
        return new Promise((resolve, reject) => {
            chrome.tabs.update(tabId, { url, active }, (tab) => {
                const error = chrome.runtime.lastError?.message;
                if (error) {
                    reject(new Error(error));
                    return;
                }
                if (!tab?.id) {
                    reject(new Error("The saved Asda tab is no longer available."));
                    return;
                }
                resolve(tab.id);
            });
        });
    }
    async function findReusableAsdaTab() {
        const tabs = await queryTabs({ url: asdaUrlPatterns });
        return tabs.find((tab) => typeof tab.id === "number")?.id ?? null;
    }
    async function openOrReuseShoppingTab(url, state, active = true) {
        if (typeof state.activeAsdaTabId === "number") {
            try {
                const tabId = await updateShoppingTab(state.activeAsdaTabId, url, active);
                return { tabId, state: { ...state, activeAsdaTabId: tabId } };
            }
            catch {
            }
        }
        const reusableTabId = await findReusableAsdaTab();
        if (typeof reusableTabId === "number") {
            const tabId = await updateShoppingTab(reusableTabId, url, active);
            return { tabId, state: { ...state, activeAsdaTabId: tabId } };
        }
        const tabId = await openShoppingTab(url, active);
        return { tabId, state: { ...state, activeAsdaTabId: tabId } };
    }
    function closeTab(tabId) {
        return new Promise((resolve) => chrome.tabs.remove(tabId, () => resolve()));
    }
    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    function waitForTabComplete(tabId, timeoutMs = 12000) {
        return new Promise((resolve) => {
            let settled = false;
            const timeout = setTimeout(() => finish(), timeoutMs);
            function finish() {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timeout);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
            function listener(updatedTabId, changeInfo) {
                if (updatedTabId === tabId && changeInfo.status === "complete")
                    finish();
            }
            chrome.tabs.onUpdated.addListener(listener);
        });
    }
    function clickAddButtonInTab(tabId) {
        return new Promise((resolve) => {
            chrome.scripting.executeScript({
                target: { tabId },
                func: async () => {
                    function elementVisible(element) {
                        const rect = element.getBoundingClientRect();
                        const style = window.getComputedStyle(element);
                        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
                    }
                    function buttonDisabled(element) {
                        return element instanceof HTMLButtonElement ? element.disabled : element.getAttribute("aria-disabled") === "true";
                    }
                    function findAddButton() {
                        const selectors = ["button", "[role='button']", "[data-testid*='add' i]", "[data-auto-id*='add' i]", "[aria-label*='add' i]"];
                        const candidates = Array.from(document.querySelectorAll(selectors.join(",")))
                            .filter((element) => elementVisible(element) && !buttonDisabled(element))
                            .map((element) => {
                            const text = `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("data-testid") ?? ""} ${element.getAttribute("data-auto-id") ?? ""}`
                                .replace(/\s+/g, " ")
                                .trim();
                            const lowerText = text.toLowerCase();
                            let score = 0;
                            if (/\badd\b/.test(lowerText))
                                score += 4;
                            if (/add to (basket|trolley|cart)/.test(lowerText))
                                score += 8;
                            if (/^add$/.test(lowerText))
                                score += 6;
                            if (/\/product\//i.test(window.location.pathname))
                                score += 3;
                            if (/(favourite|favorite|list|address|voucher|promo|coupon|postcode|address)/.test(lowerText))
                                score -= 10;
                            return { element, score };
                        })
                            .filter((candidate) => candidate.score >= 4)
                            .sort((a, b) => b.score - a.score);
                        return candidates[0]?.element ?? null;
                    }
                    for (let attempt = 0; attempt < 10; attempt += 1) {
                        const addButton = findAddButton();
                        if (addButton) {
                            addButton.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
                            addButton.focus();
                            await new Promise((resolve) => setTimeout(resolve, 250));
                            addButton.click();
                            await new Promise((resolve) => setTimeout(resolve, 1800));
                            return { ok: true };
                        }
                        await new Promise((resolve) => setTimeout(resolve, 800));
                    }
                    return { ok: false, error: "No single safe Asda add button was found." };
                }
            }, (results) => {
                const error = chrome.runtime.lastError?.message;
                const result = results?.[0]?.result;
                resolve({
                    ok: Boolean(result?.ok),
                    error: result?.error ?? error ?? "The Asda add button could not be found confidently."
                });
            });
        });
    }
    function productUrlForAutoAdd(item, state) {
        const savedUrl = state.productLinks[item.shoppingKey] || item.savedProductUrl;
        const normalizedUrl = normalizeOpenUrl(savedUrl || "");
        if (!normalizedUrl)
            return "";
        return /\/product\//i.test(normalizedUrl) ? normalizedUrl : "";
    }
    function findNextPendingIndex(items, statusById, startIndex) {
        if (!items.length)
            return null;
        for (let offset = 0; offset < items.length; offset += 1) {
            const index = (startIndex + offset) % items.length;
            const status = statusById[items[index].itemId] ?? items[index].status;
            if (status !== "added" && status !== "unavailable")
                return index;
        }
        return null;
    }
    function findNextIndex(items, statusById, startIndex) {
        return findNextPendingIndex(items, statusById, startIndex) ?? 0;
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
    function queryTabs(queryInfo) {
        return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
    }
    function isQueue(value) {
        const possibleQueue = value;
        return Boolean(possibleQueue &&
            possibleQueue.version === 1 &&
            typeof possibleQueue.rangeStartDate === "string" &&
            typeof possibleQueue.rangeEndDate === "string" &&
            Array.isArray(possibleQueue.items));
    }
    function readQueueFromTab(tabId) {
        return new Promise((resolve) => {
            chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    const queueElement = document.getElementById("weekwise-asda-helper-queue");
                    const queueText = queueElement?.textContent?.trim();
                    if (queueText) {
                        try {
                            return JSON.parse(queueText);
                        }
                        catch {
                            return null;
                        }
                    }
                    return window.__WEEKWISE_ASDA_QUEUE__ ?? null;
                }
            }, (results) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                }
                const queue = results?.[0]?.result;
                resolve(isQueue(queue) ? queue : null);
            });
        });
    }
    async function importQueue(queue, fallbackState) {
        const state = await getState(fallbackState);
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
            autoAddReviews: [],
            lastAutoAddMessage: "",
            activeAsdaTabId: state.activeAsdaTabId,
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
    async function importFromAppTab() {
        const tabs = await queryTabs({ url: appUrlPatterns });
        for (const tab of tabs) {
            if (!tab.id)
                continue;
            const queue = await readQueueFromTab(tab.id);
            if (queue)
                return importQueue(queue);
        }
        return {
            ok: false,
            error: "No Weekwise shopping queue was found. Open Weekwise on the Shopping tab, then click Send to Asda Helper."
        };
    }
    async function openItem(itemId, fallbackState) {
        const state = await getState(fallbackState);
        const { item, index } = findItem(state, itemId);
        if (!item || !state.queue)
            return { ok: false, error: "No shopping item is ready. Send a list from Weekwise first." };
        const openUrl = normalizeOpenUrl(itemOpenUrl(item, state));
        if (!openUrl)
            return { ok: false, state, item, error: `The Asda URL for ${item.name} is not valid.` };
        const nextStatus = itemStatus(item, state) ?? "opened";
        const nextState = {
            ...state,
            currentIndex: index,
            itemStatus: { ...state.itemStatus, [item.itemId]: nextStatus }
        };
        await saveState(nextState);
        if (nextStatus === "opened")
            sendUpdateToApp(item, { status: "opened" });
        try {
            const opened = await openOrReuseShoppingTab(openUrl, nextState);
            await saveState(opened.state);
            return { ok: true, state: opened.state, item, openUrl, tabId: opened.tabId };
        }
        catch (error) {
            return {
                ok: false,
                state: nextState,
                item,
                openUrl,
                error: error instanceof Error ? `Chrome could not open the Asda tab: ${error.message}` : "Chrome could not open the Asda tab."
            };
        }
    }
    async function openNextItem(fallbackState) {
        const state = await getState(fallbackState);
        const items = state.queue?.items ?? [];
        if (!items.length)
            return { ok: false, error: "No shopping list has been imported yet." };
        const nextIndex = findNextPendingIndex(items, state.itemStatus, (state.currentIndex + 1) % items.length);
        if (nextIndex === null)
            return { ok: false, state, error: "All imported items are marked added or unavailable." };
        return openItem(items[nextIndex].itemId, state);
    }
    async function setStatus(itemId, status, fallbackState, options = {}) {
        if (!status)
            return { ok: false, error: "No status was supplied." };
        const state = await getState(fallbackState);
        const { item, index } = findItem(state, itemId);
        if (!item)
            return { ok: false, error: "That shopping item is no longer in the helper queue." };
        const items = state.queue?.items ?? [];
        const nextStatusMap = { ...state.itemStatus, [item.itemId]: status };
        const nextPendingIndex = options.advance || options.openNext ? findNextPendingIndex(items, nextStatusMap, Math.max(index, 0)) : null;
        const nextState = {
            ...state,
            currentIndex: nextPendingIndex ?? (index >= 0 ? index : state.currentIndex),
            itemStatus: nextStatusMap
        };
        await saveState(nextState);
        sendUpdateToApp(item, { status });
        if (options.openNext) {
            if (nextPendingIndex === null)
                return { ok: true, state: nextState, item, error: "All imported items are marked added or unavailable." };
            return openItem(items[nextPendingIndex].itemId, nextState);
        }
        return { ok: true, state: nextState, item };
    }
    async function autoAddSavedProducts(fallbackState) {
        let state = await getState(fallbackState);
        const items = state.queue?.items ?? [];
        if (!items.length)
            return { ok: false, error: "No shopping list has been imported yet." };
        let addedCount = 0;
        let skippedCount = 0;
        const reviewItems = [];
        for (const item of items) {
            const currentStatus = itemStatus(item, state);
            if (currentStatus === "added" || currentStatus === "unavailable") {
                skippedCount += 1;
                continue;
            }
            const productUrl = productUrlForAutoAdd(item, state);
            if (!productUrl) {
                skippedCount += 1;
                continue;
            }
            let tabId = null;
            try {
                tabId = await openShoppingTab(productUrl, false);
                await waitForTabComplete(tabId);
                await wait(2200);
                const clickResult = await clickAddButtonInTab(tabId);
                if (!clickResult.ok) {
                    reviewItems.push({
                        itemId: item.itemId,
                        name: item.name,
                        displayQuantity: item.displayQuantity,
                        openUrl: productUrl,
                        reason: clickResult.error ?? "The Asda add button could not be found confidently."
                    });
                    continue;
                }
                const nextStatusMap = { ...state.itemStatus, [item.itemId]: "added" };
                state = {
                    ...state,
                    itemStatus: nextStatusMap,
                    currentIndex: findNextPendingIndex(items, nextStatusMap, state.currentIndex) ?? state.currentIndex
                };
                await saveState(state);
                sendUpdateToApp(item, { status: "added" });
                addedCount += 1;
                await wait(1800);
            }
            catch (error) {
                reviewItems.push({
                    itemId: item.itemId,
                    name: item.name,
                    displayQuantity: item.displayQuantity,
                    openUrl: productUrl,
                    reason: error instanceof Error ? error.message : "Auto-add failed."
                });
            }
            finally {
                if (tabId !== null)
                    await closeTab(tabId);
            }
        }
        state = {
            ...state,
            autoAddReviews: reviewItems,
            lastAutoAddMessage: `Auto-add finished: ${addedCount} added, ${skippedCount} skipped${reviewItems.length ? `, ${reviewItems.length} need review` : ""}.`
        };
        await saveState(state);
        return {
            ok: true,
            state,
            message: state.lastAutoAddMessage,
            error: reviewItems.length ? state.lastAutoAddMessage : undefined
        };
    }
    async function saveProductLink(itemId, productUrl, fallbackState) {
        const cleanUrl = (productUrl ?? "").trim();
        if (!cleanUrl)
            return { ok: false, error: "No Asda product URL was supplied." };
        const state = await getState(fallbackState);
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
    async function clearRun(fallbackState) {
        const state = await getState(fallbackState);
        const nextState = {
            ...state,
            currentIndex: 0,
            itemStatus: {},
            autoAddReviews: [],
            lastAutoAddMessage: ""
        };
        await saveState(nextState);
        return { ok: true, state: nextState };
    }
    async function handleMessage(message) {
        switch (message.type) {
            case "IMPORT_QUEUE":
                return message.queue ? importQueue(message.queue, message.fallbackState) : { ok: false, error: "No shopping queue was received." };
            case "IMPORT_FROM_APP_TAB":
                return importFromAppTab();
            case "GET_STATE":
                return { ok: true, state: await getState(message.fallbackState) };
            case "OPEN_ITEM":
                return openItem(message.itemId, message.fallbackState);
            case "OPEN_NEXT":
                return openNextItem(message.fallbackState);
            case "SET_STATUS":
                return setStatus(message.itemId, message.status, message.fallbackState, { advance: message.advance, openNext: message.openNext });
            case "AUTO_ADD_SAVED":
                return autoAddSavedProducts(message.fallbackState);
            case "SAVE_PRODUCT_LINK":
                return saveProductLink(message.itemId, message.productUrl, message.fallbackState);
            case "SAVE_CURRENT_PRODUCT_URL":
                return saveProductLink(undefined, message.productUrl, message.fallbackState);
            case "CLEAR_RUN":
                return clearRun(message.fallbackState);
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
