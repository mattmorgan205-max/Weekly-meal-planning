"use strict";
(() => {
    const appSource = "weekwise-meal-planner";
    const extensionSource = "weekwise-asda-helper-extension";
    window.addEventListener("message", (event) => {
        if (event.source !== window || event.origin !== window.location.origin)
            return;
        const message = event.data;
        if (!message || message.source !== appSource || message.type !== "ASDA_HELPER_IMPORT_QUEUE" || !message.payload)
            return;
        chrome.runtime.sendMessage({ type: "IMPORT_QUEUE", queue: message.payload }, (response) => {
            const itemCount = response?.state?.queue?.items.length ?? message.payload?.items.length ?? 0;
            window.postMessage({
                source: extensionSource,
                type: "ASDA_HELPER_IMPORT_RESULT",
                payload: response?.ok ? { itemCount } : { error: response?.error ?? "Asda Helper could not import this list." }
            }, window.location.origin);
        });
    });
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type !== "APPLY_UPDATE")
            return;
        window.postMessage({
            source: extensionSource,
            type: "ASDA_HELPER_UPDATE_ITEM",
            payload: message.payload
        }, window.location.origin);
        sendResponse({ ok: true });
    });
})();
