"use strict";
(() => {
    let latestState;
    let collapsed = false;
    let recommendations = [];
    let recommendationItemId = "";
    let recommendationMessage = "";
    let basketChecks = [];
    let basketLines = [];
    let basketMessage = "";
    let checkedQueueDate;
    let checkedBasket;
    let checkedWithCount = false;
    let checkTimer;
    let scanGeneration = 0;
    let confirmVisibleSignature;
    let choiceGroups = new Map();
    let findingChoices = false;
    function sendMessage(message) {
        const messageWithFallback = latestState ? { ...message, fallbackState: latestState } : message;
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
    function elementVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }
    function buttonDisabled(element) {
        return element instanceof HTMLButtonElement ? element.disabled : element.getAttribute("aria-disabled") === "true";
    }
    function insideWeekwiseHelper(element) {
        return Boolean(element.closest("#weekwise-asda-helper"));
    }
    function controlLabel(element) {
        return `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""} ${element.getAttribute("data-testid") ?? ""} ${element.getAttribute("data-auto-id") ?? ""}`
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }
    function visibleEnabledControls(container) {
        return Array.from(container.querySelectorAll("button, [role='button']")).filter((button) => !insideWeekwiseHelper(button) && elementVisible(button) && !buttonDisabled(button));
    }
    function normalizeText(value) {
        return value
            .toLowerCase()
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    function tokenize(value) {
        const stopWords = new Set(["and", "the", "with", "for", "asda", "fresh", "chosen", "by"]);
        return normalizeText(value)
            .split(" ")
            .filter((token) => token.length > 2 && !stopWords.has(token));
    }
    function comparableToken(token) {
        if (token.endsWith("ies") && token.length > 4)
            return `${token.slice(0, -3)}y`;
        if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3)
            return token.slice(0, -1);
        return token;
    }
    function exactItemNameMatch(requiredName, productName) {
        if (!compatibleAsdaVariant(requiredName, productName))
            return false;
        const requiredTokens = tokenize(requiredName.replace(glutenFreeLabel, "gluten free")).map(comparableToken);
        const productTokens = new Set(tokenize(productName.replace(glutenFreeLabel, "gluten free")).map(comparableToken));
        return requiredTokens.length > 0 && requiredTokens.every((token) => productTokens.has(token));
    }
    function absoluteUrl(value) {
        try {
            return new URL(value, window.location.origin).toString();
        }
        catch {
            return value;
        }
    }
    function visibleText(element) {
        if (!element)
            return "";
        return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    }
    function firstUsefulLine(value) {
        const lines = value
            .split(/\n| {2,}/)
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => !/^\s*(add|save|favourite|favorite|offer|view|details)\b/i.test(line))
            .filter((line) => !/^(?:\u00a3|£|\d+p\b)/i.test(line));
        return lines.sort((a, b) => b.length - a.length)[0] ?? value.trim();
    }
    function findProductContainer(anchor) {
        let current = anchor;
        for (let depth = 0; current && depth < 8; depth += 1) {
            const text = visibleText(current);
            const hasButton = Boolean(current.querySelector("button, [role='button']"));
            if (text.length > 45 && (hasButton || /(?:\u00a3|£|\d+p\b)/i.test(text)))
                return current;
            current = current.parentElement;
        }
        return anchor.closest("article, li, [data-testid], [data-auto-id]");
    }
    function findPriceText(value) {
        return value.match(/(?:\u00a3|£)\s?\d+(?:\.\d{1,2})?|\b\d+\s?p\b/i)?.[0]?.trim();
    }
    function findUnitPriceText(value) {
        return value.match(/(?:(?:\u00a3|£)\s?\d+(?:\.\d{1,2})?|\d+\s?p)\s?\/\s?(?:kg|g|100g|l|litre|ml|100ml|each|item)/i)?.[0]?.trim();
    }
    function findOfferText(value) {
        const lines = value
            .split(/\n| {2,}/)
            .map((line) => line.trim())
            .filter(Boolean);
        return lines.find((line) => /\b(offer|rollback|save|was|now|any\s+\d|2\s+for|3\s+for|multibuy)\b/i.test(line));
    }
    function findPackSizeText(value) {
        return value.match(/\b\d+\s?x\s?\d+(?:\.\d+)?\s?(?:kg|g|ml|l|cl)\b/i)?.[0]?.trim() ?? value.match(/\b\d+(?:\.\d+)?\s?(?:kg|g|ml|l|cl|pack|pcs|pieces|each)\b/i)?.[0]?.trim();
    }
    function normalizedUnit(unit) {
        const lowerUnit = (unit ?? "").toLowerCase().trim();
        if (["kg", "g", "gram", "grams"].includes(lowerUnit))
            return lowerUnit === "kg" ? "kg" : "g";
        if (["l", "litre", "litres", "ml", "cl"].includes(lowerUnit))
            return lowerUnit === "l" || lowerUnit.startsWith("litre") ? "l" : lowerUnit;
        if (["item", "items", "each", "pack", "packs", "piece", "pieces", "pcs", "clove", "cloves", "can", "cans", "tin", "tins"].includes(lowerUnit))
            return "item";
        return lowerUnit;
    }
    function toBaseQuantity(quantity, unit) {
        if (typeof quantity !== "number" || Number.isNaN(quantity))
            return null;
        const cleanUnit = normalizedUnit(unit);
        if (cleanUnit === "kg")
            return { quantity: quantity * 1000, family: "weight", unit: "g" };
        if (cleanUnit === "g")
            return { quantity, family: "weight", unit: "g" };
        if (cleanUnit === "l")
            return { quantity: quantity * 1000, family: "volume", unit: "ml" };
        if (cleanUnit === "cl")
            return { quantity: quantity * 10, family: "volume", unit: "ml" };
        if (cleanUnit === "ml")
            return { quantity, family: "volume", unit: "ml" };
        if (!cleanUnit || cleanUnit === "item")
            return { quantity, family: "count", unit: "item" };
        return null;
    }
    function extractProductQuantity(value) {
        const multiplied = value.match(/\b(\d+)\s*[x\u00d7]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cl)\b/i);
        if (multiplied) {
            const count = Number(multiplied[1]);
            const amount = Number(multiplied[2]);
            const unit = normalizedUnit(multiplied[3]);
            const base = toBaseQuantity(count * amount, unit);
            return base ? { quantity: base.quantity, unit: base.unit } : undefined;
        }
        const measured = value.match(/\b(\d+(?:\.\d+)?)\s?(kg|g|ml|l|cl)\b/i);
        if (measured) {
            const base = toBaseQuantity(Number(measured[1]), measured[2]);
            return base ? { quantity: base.quantity, unit: base.unit } : undefined;
        }
        const counted = value.match(/\b(\d+)\s?(?:pack|pcs|pieces|items|each)\b/i);
        return counted ? { quantity: Number(counted[1]), unit: "item" } : undefined;
    }
    const approximateProduceWeightGrams = {
        apple: 150,
        banana: 120,
        broccoli: 350,
        carrot: 80,
        courgette: 200,
        cucumber: 300,
        lemon: 100,
        lime: 70,
        onion: 150,
        "red onion": 150,
        "white onion": 150,
        pepper: 160,
        potato: 175,
        "sweet potato": 250
    };
    function approximateItemWeight(name) {
        const normalizedName = normalizeText(name);
        return Object.entries(approximateProduceWeightGrams)
            .sort(([first], [second]) => second.length - first.length)
            .find(([ingredientName]) => normalizedName.includes(ingredientName))?.[1];
    }
    function productCoverage(item, product) {
        const offered = toBaseQuantity(product.quantity, product.unit);
        let required = toBaseQuantity(item.requiredQuantity ?? item.quantity, item.requiredUnit ?? item.unit);
        let estimated = false;
        if (!required || !offered || required.quantity <= 0 || offered.quantity <= 0)
            return null;
        if (required.family !== offered.family) {
            const approximateWeight = approximateItemWeight(item.canonicalName || item.name);
            if (required.family !== "count" || offered.family !== "weight" || !approximateWeight)
                return null;
            required = { quantity: required.quantity * approximateWeight, family: "weight", unit: "g" };
            estimated = true;
        }
        const packCount = Math.max(1, Math.ceil(required.quantity / offered.quantity));
        return {
            packCount,
            estimated,
            required,
            offered,
            display: `${packCount} x ${product.packSizeText || displayBaseQuantity(offered.quantity, offered.unit)}`
        };
    }
    function unitPriceValue(candidate) {
        const text = candidate.unitPriceText ?? "";
        const match = text.match(/((?:\u00a3|£)\s?\d+(?:\.\d{1,2})?|\d+\s?p)\s?\/\s?(kg|g|100g|l|litre|ml|100ml|each|item)/i);
        if (!match)
            return null;
        let amount = Number(match[1].replace(/[^\d.]/g, ""));
        if (/p/i.test(match[1]) && !/(?:\u00a3|£)/.test(match[1]))
            amount /= 100;
        const unit = match[2].toLowerCase();
        if (unit === "100g" || unit === "100ml")
            amount *= 10;
        if (unit === "g" || unit === "ml")
            amount *= 1000;
        return amount;
    }
    function scanVisibleProducts() {
        const products = new Map();
        const anchors = Array.from(document.querySelectorAll("a[href]")).filter((anchor) => /\/(?:groceries\/)?product\//i.test(anchor.href));
        anchors.forEach((anchor) => {
            const url = absoluteUrl(anchor.href);
            if (products.has(url))
                return;
            const container = findProductContainer(anchor);
            const rawText = visibleText(container) || visibleText(anchor);
            const image = container?.querySelector("img") ?? anchor.querySelector("img");
            const name = withDietBadge(firstUsefulLine(image?.alt || anchor.getAttribute("aria-label") || visibleText(anchor) || rawText), container);
            if (!name || name.length < 3)
                return;
            const quantity = extractProductQuantity(`${name} ${rawText}`);
            products.set(url, {
                url,
                name,
                imageUrl: image?.currentSrc || image?.src || undefined,
                priceText: findPriceText(rawText),
                unitPriceText: findUnitPriceText(rawText),
                offerText: findOfferText(rawText),
                packSizeText: findPackSizeText(`${name} ${rawText}`),
                available: !/\b(out of stock|unavailable|currently unavailable)\b/i.test(rawText),
                addable: Boolean(container?.querySelector("button, [role='button']")),
                quantity: quantity?.quantity,
                unit: quantity?.unit,
                rawText
            });
        });
        if (/\/(?:groceries\/)?product\//i.test(window.location.href) && !products.has(window.location.href)) {
            const rawText = visibleText(document.body);
            const heading = visibleText(document.querySelector("h1")) || document.title;
            const quantity = extractProductQuantity(`${heading} ${rawText}`);
            products.set(window.location.href, {
                url: window.location.href,
                name: firstUsefulLine(heading),
                imageUrl: document.querySelector("img")?.currentSrc || document.querySelector("img")?.src || undefined,
                priceText: findPriceText(rawText),
                unitPriceText: findUnitPriceText(rawText),
                offerText: findOfferText(rawText),
                packSizeText: findPackSizeText(`${heading} ${rawText}`),
                available: !/\b(out of stock|unavailable|currently unavailable)\b/i.test(rawText),
                addable: Boolean(findConfidentAddButton()),
                quantity: quantity?.quantity,
                unit: quantity?.unit,
                rawText
            });
        }
        return Array.from(products.values()).slice(0, 24);
    }
    function isBasketPage() {
        return /\/groceries\/(?:trolley|basket|cart)\b/i.test(window.location.pathname) || /\b(trolley|basket)\b/i.test(document.title);
    }
    function displayBaseQuantity(quantity, unit) {
        if (typeof quantity !== "number" || Number.isNaN(quantity))
            return "";
        if (unit === "g" && quantity >= 1000)
            return `${Number((quantity / 1000).toFixed(2))} kg`;
        if (unit === "ml" && quantity >= 1000)
            return `${Number((quantity / 1000).toFixed(2))} l`;
        return `${Number(quantity.toFixed(2))} ${unit || "items"}`.trim();
    }
    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async function activateElement(element) {
        element.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
        element.focus();
        await wait(150);
        const pointerOptions = { bubbles: true, cancelable: true, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1 };
        const mouseOptions = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 };
        try {
            element.dispatchEvent(new PointerEvent("pointerdown", pointerOptions));
        }
        catch {
        }
        element.dispatchEvent(new MouseEvent("mousedown", mouseOptions));
        element.dispatchEvent(new MouseEvent("mouseup", { ...mouseOptions, buttons: 0 }));
        try {
            element.dispatchEvent(new PointerEvent("pointerup", { ...pointerOptions, buttons: 0 }));
        }
        catch {
        }
        element.click();
    }
    function quantityInput(container) {
        return Array.from(container.querySelectorAll("input")).find((element) => {
            const label = `${element.getAttribute("aria-label") ?? ""} ${element.name ?? ""} ${element.id ?? ""}`.toLowerCase();
            return !insideWeekwiseHelper(element) && elementVisible(element) && !element.disabled && /qty|quantity|amount/.test(label);
        });
    }
    function quantitySelect(container) {
        return Array.from(container.querySelectorAll("select")).find((element) => {
            const label = `${element.getAttribute("aria-label") ?? ""} ${element.name ?? ""} ${element.id ?? ""}`.toLowerCase();
            return !insideWeekwiseHelper(element) && elementVisible(element) && !element.disabled && /qty|quantity|amount/.test(label);
        });
    }
    function setControlValue(control, value) {
        const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (setter)
            setter.call(control, value);
        else
            control.value = value;
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
    }
    async function increaseQuantityControl(container) {
        const button = findIncreaseButton(container);
        if (button) {
            await activateElement(button);
            return true;
        }
        const input = quantityInput(container);
        const inputValue = input ? Number(input.value) : Number.NaN;
        if (input && Number.isFinite(inputValue)) {
            setControlValue(input, String(inputValue + 1));
            input.blur();
            return true;
        }
        const select = quantitySelect(container);
        if (select) {
            const currentValue = Number(select.value);
            const nextOption = Array.from(select.options)
                .map((option) => ({ option, value: Number(option.value || option.textContent) }))
                .filter((entry) => Number.isFinite(entry.value) && entry.value > currentValue)
                .sort((a, b) => a.value - b.value)[0];
            if (nextOption) {
                setControlValue(select, nextOption.option.value);
                select.blur();
                return true;
            }
        }
        return false;
    }
    function extractBasketLineQuantity(container) {
        const input = quantityInput(container);
        if (input)
            return /^\d+$/.test(input.value) ? Number(input.value) : undefined;
        const select = quantitySelect(container);
        if (select)
            return /^\d+$/.test(select.value) ? Number(select.value) : undefined;
        const explicitCount = /\b(?:qty|quantity)(?:\s+of)?\s*:?\s*(\d+)(?![\d.,])\b(?!\s*(?:kg|g|ml|l)\b)/i;
        for (const el of container.querySelectorAll("[aria-label], [data-testid], [data-auto-id], [title]")) {
            if (!elementVisible(el) || insideWeekwiseHelper(el))
                continue;
            const label = controlLabel(el);
            if (!/qty|quantity/i.test(label))
                continue;
            const value = visibleText(el);
            if (/^\d+$/.test(value))
                return Number(value);
            const match = explicitCount.exec(el.getAttribute("aria-label") || el.getAttribute("title") || "");
            if (match)
                return Number(match[1]);
        }
        const minus = visibleEnabledControls(container).find(el => /decrease|decrement|minus|remove one|^[-−]$/.test(controlLabel(el)));
        const stepper = minus?.parentElement;
        if (stepper && findIncreaseButton(stepper)) {
            const number = Array.from(stepper.querySelectorAll("span,button,output")).find(el => elementVisible(el) && /^\d+$/.test(visibleText(el)));
            if (number)
                return Number(visibleText(number));
        }
        const match = explicitCount.exec(visibleText(container));
        if (match)
            return Number(match[1]);
        return undefined;
    }
    function findIncreaseButton(container) {
        const visibleButtons = visibleEnabledControls(container);
        const explicitIncreaseButton = visibleButtons.find((button) => {
            const text = controlLabel(button);
            if (/(increase|increment|add one|add 1|plus|quantity up)/.test(text))
                return true;
            return text === "+" || text === "＋";
        });
        if (explicitIncreaseButton)
            return explicitIncreaseButton;
        const quantityButtonIndex = visibleButtons.findIndex((button) => /^\d+$/.test(visibleText(button)));
        if (quantityButtonIndex >= 0)
            return visibleButtons[quantityButtonIndex + 1];
        const quantityTextElement = Array.from(container.querySelectorAll("span, div, p, strong")).find((element) => {
            if (insideWeekwiseHelper(element) || !elementVisible(element) || !/^\d+$/.test(visibleText(element)))
                return false;
            return visibleEnabledControls(element.parentElement ?? container).length >= 2;
        });
        const siblingButtons = quantityTextElement?.parentElement ? visibleEnabledControls(quantityTextElement.parentElement) : [];
        if (siblingButtons.length >= 2)
            return siblingButtons[siblingButtons.length - 1];
        return undefined;
    }
    function findBasketContainer(anchor) {
        let current = anchor;
        for (let depth = 0; current && current !== document.body && depth < 12; depth += 1) {
            const text = visibleText(current);
            const urls = new Set(Array.from(current.querySelectorAll("a[href*='/product/']")).map(link => new URL(link.href).pathname));
            if (urls.size > 1)
                break;
            const hasQuantityControl = quantityInput(current) || quantitySelect(current) ||
                visibleEnabledControls(current).some(button => /decrease|decrement|remove|minus|^[-−]$/.test(controlLabel(button)));
            const looksLikeBasketLine = urls.size === 1 && (hasQuantityControl ||
                current.matches("[data-testid*='trolley-item' i], [data-auto-id*='trolley-item' i], [data-testid*='basket-item' i]") ||
                /\b(remove|save for later|(?:qty|quantity)\s*:?\s*\d+)\b/i.test(text));
            if (looksLikeBasketLine)
                return current;
            current = current.parentElement;
        }
        return null;
    }
    const nonBasketArea = "nav, header, footer, #weekwise-asda-helper, [aria-label*='recommend' i], [data-testid*='recommend' i], [data-auto-id*='recommend' i], [data-testid*='carousel' i]";
    function basketAnchors() {
        const root = document.querySelector("main") ?? document.body;
        return Array.from(root.querySelectorAll("a[href*='/product/']"))
            .filter(anchor => elementVisible(anchor) && !anchor.closest(nonBasketArea));
    }
    function productKey(href) {
        try {
            const url = new URL(href, location.origin);
            return url.origin + url.pathname.replace(/\/$/, "");
        }
        catch {
            return "";
        }
    }
    function scanBasketLines(anchors = basketAnchors()) {
        const lines = new Map();
        anchors.forEach((anchor) => {
            const url = productKey(anchor.href);
            if (lines.has(url))
                return;
            const container = findBasketContainer(anchor);
            if (!container)
                return;
            const rawText = visibleText(container);
            const image = container.querySelector("img") ?? anchor.querySelector("img");
            const name = withDietBadge(firstUsefulLine(image?.alt || anchor.getAttribute("aria-label") || visibleText(anchor) || rawText), container);
            const lineQuantity = extractBasketLineQuantity(container);
            const packText = rawText.replace(/(?:\/|\bper)\s*(?:100\s*)?(?:kg|g|ml|l)\b/gi, "");
            const packQuantity = extractProductQuantity(name) ?? extractProductQuantity(packText);
            const totalQuantity = lineQuantity !== undefined && packQuantity ? packQuantity.quantity * lineQuantity : lineQuantity;
            const totalUnit = packQuantity?.unit ?? "item";
            lines.set(url, {
                index: lines.size,
                url,
                name,
                rawText,
                lineQuantity,
                packQuantity: packQuantity?.quantity,
                packUnit: packQuantity?.unit,
                totalQuantity,
                totalUnit,
                canIncrease: Boolean(findIncreaseButton(container) || quantityInput(container) || quantitySelect(container)),
                element: container
            });
        });
        return Array.from(lines.values());
    }
    function basketSignature(lines) {
        return JSON.stringify(lines.map(line => JSON.stringify([line.url, line.name, line.lineQuantity,
            line.packQuantity, line.packUnit, line.totalQuantity, line.totalUnit])).sort());
    }
    function stopBasketWatch() {
        scanGeneration++;
        confirmVisibleSignature = undefined;
        basketObserver.disconnect();
        window.clearTimeout(checkTimer);
        checkTimer = undefined;
        checkedBasket = undefined;
    }
    function checkStillCurrent() {
        if (checkedBasket === undefined)
            return false;
        const lines = isBasketPage() ? scanBasketLines() : [];
        const readiness = basketReadiness(lines);
        if (isBasketPage() && !readiness.blocked && (!checkedWithCount || readiness.countKnown) && basketSignature(lines) === checkedBasket) {
            basketLines = lines;
            return true;
        }
        stopBasketWatch();
        choiceGroups = new Map();
        findingChoices = false;
        basketLines = [];
        basketChecks = [];
        basketMessage = "Basket changed. Verify basket again before continuing.";
        render();
        return false;
    }
    function scheduleBasketCheck() {
        if (checkedBasket === undefined || checkTimer !== undefined)
            return;
        checkTimer = window.setTimeout(() => {
            checkTimer = undefined;
            checkStillCurrent();
        }, 250);
    }
    const basketObserver = new MutationObserver(records => {
        if (records.some(record => {
            const target = record.target instanceof Element ? record.target : record.target.parentElement;
            return target && !insideWeekwiseHelper(target);
        }))
            scheduleBasketCheck();
    });
    for (const event of ["input", "change"])
        document.addEventListener(event, e => {
            if (e.target instanceof Element && !insideWeekwiseHelper(e.target))
                scheduleBasketCheck();
        }, true);
    window.addEventListener("focus", scheduleBasketCheck);
    document.addEventListener("visibilitychange", scheduleBasketCheck);
    function lineMatchScore(item, state, line) {
        let score = 0;
        const productText = normalizeText(`${line.name} ${line.rawText ?? ""}`.replace(glutenFreeLabel, "gluten free"));
        const targetName = normalizeText(item.name.replace(glutenFreeLabel, "gluten free"));
        const savedUrl = state.productLinks[item.shoppingKey] || item.savedProductUrl;
        if (savedUrl && line.url && absoluteUrl(savedUrl) === line.url)
            score += 100;
        if (targetName && productText.includes(targetName))
            score += 40;
        tokenize(item.name).forEach((token) => {
            if (productText.includes(token))
                score += 12;
            else
                score -= 8;
        });
        (item.avoidTerms ?? []).forEach((term) => {
            if (productText.includes(normalizeText(term)))
                score -= 50;
        });
        return score;
    }
    function allocateBasket(state, lines) {
        const items = state.queue.items;
        const rows = items.map(item => {
            const amount = item.requiredQuantity ?? item.quantity;
            const required = toBaseQuantity(amount, item.requiredUnit ?? item.unit);
            const display = (item.displayQuantity ?? "").trim().toLowerCase();
            const presence = amount == null && !/\d/.test(display) && (!display ||
                display === (item.requiredUnit ?? item.unit)?.toLowerCase() || /^(?:as needed|as required|to taste|unspecified|optional)$/.test(display));
            return { item, required, presence, used: 0, present: false, candidates: [],
                assigned: [], variant: false, uncertain: false };
        });
        const remaining = lines.map(() => 1);
        const edges = rows.flatMap((row, r) => lines.flatMap((line, l) => {
            const score = lineMatchScore(row.item, state, line);
            const saved = state.productLinks[row.item.shoppingKey] || row.item.savedProductUrl;
            const exactUrl = Boolean(saved && line.url && productKey(absoluteUrl(saved)) === line.url);
            const exactName = exactItemNameMatch(row.item.name, line.name);
            if (!exactUrl && !exactName && score < 20)
                return [];
            if (!compatibleAsdaVariant(row.item.name, line.name) ||
                row.item.avoidTerms?.some(term => normalizeText(line.name).includes(normalizeText(term)))) {
                row.variant = true;
                return [];
            }
            if (!exactUrl && !exactName) {
                row.uncertain = true;
                return [];
            }
            if (line.lineQuantity === 0)
                return [];
            row.candidates.push(line);
            return [{ r, l, rank: exactUrl ? 2 : 1, specificity: tokenize(row.item.name).length, score }];
        })).sort((a, b) => b.rank - a.rank || b.specificity - a.specificity ||
            Number(rows[a.r].presence) - Number(rows[b.r].presence) || b.score - a.score || a.r - b.r || a.l - b.l);
        for (const { r, l } of edges) {
            const row = rows[r], line = lines[l], left = remaining[l];
            if (left <= 1e-9)
                continue;
            if (row.presence) {
                if (row.present)
                    continue;
                const pack = 1 / (line.lineQuantity || 1);
                if (left + 1e-9 < pack)
                    continue;
                remaining[l] = Math.max(0, left - pack);
                row.present = true;
            }
            else {
                const req = row.required;
                if (!req || row.used >= req.quantity - 1e-9)
                    continue;
                const packRequested = /^(?:pack|tin|can)s?$/i.test(row.item.requiredUnit ?? row.item.unit ?? "");
                const capacity = req.family === "count" && (packRequested || line.totalUnit !== "item")
                    ? toBaseQuantity(line.lineQuantity, "item") : toBaseQuantity(line.totalQuantity, line.totalUnit);
                if (!capacity || capacity.family !== req.family || !(capacity.quantity > 0)) {
                    row.uncertain = true;
                    continue;
                }
                const take = Math.min(req.quantity - row.used, capacity.quantity * left);
                remaining[l] = Math.max(0, left - take / capacity.quantity);
                row.used += take;
            }
            row.assigned.push(line);
        }
        return rows.map(({ item, required, presence, used, present, candidates, assigned, variant, uncertain }) => {
            const line = assigned[0] ?? candidates[0];
            const enough = present || Boolean(required && used + 1e-9 >= required.quantity && candidates.length);
            const status = enough ? "ok" : uncertain || (!candidates.length && variant) || (line && !required) ? "unknown" : line ? "short" : "missing";
            const message = enough ? (presence ? "Present in trolley; no amount specified." : "Required amount covered.")
                : status === "missing" ? "Not found in the checked trolley."
                    : status === "short" ? `Allocated ${displayBaseQuantity(used, required?.unit)} of ${item.displayQuantity} needed.`
                        : variant && !line ? "Different product variant; not counted."
                            : presence && line ? "Matching packs are allocated to another item."
                                : "Product or quantity could not be confirmed safely.";
            return { itemId: item.itemId, shoppingKey: item.shoppingKey, name: item.name, displayQuantity: item.displayQuantity,
                sourceMeals: item.sourceMeals, requiredQuantity: required?.quantity, requiredUnit: required?.unit,
                basketQuantity: required && line && status !== "unknown" ? used : undefined, basketUnit: required?.unit,
                basketLineName: (assigned.length ? assigned : candidates).map(x => x.name).join(", "),
                basketProductUrl: line?.url, basketLineIndex: line?.index, canIncrease: status === "short" && line?.canIncrease,
                openUrl: state.productLinks[item.shoppingKey] || item.savedProductUrl || item.searchUrl, status, message };
        });
    }
    function basketReadiness(lines, anchors = basketAnchors()) {
        const root = document.querySelector("main") ?? document.body;
        const visible = (selector) => Array.from(root.querySelectorAll(selector))
            .filter(el => !el.closest(nonBasketArea) && elementVisible(el));
        const busy = root.getAttribute("aria-busy") === "true" ||
            visible("[aria-busy=true], [role=progressbar], [data-testid*='skeleton' i], [data-auto-id*='skeleton' i]").length > 0;
        const more = visible("button, a, [role=button]").find(el => !buttonDisabled(el) &&
            (el.getAttribute("rel") === "next" || /^(?:(?:load|show|view) more(?: (?:trolley |basket )?(?:items|products))?|next page)$/i.test((el.getAttribute("aria-label") || visibleText(el)).trim())));
        const group = visible("button[aria-expanded=false][aria-controls]").find(button => {
            if (buttonDisabled(button))
                return false;
            const section = document.getElementById(button.getAttribute("aria-controls") ?? "");
            return section && root.contains(section) && !section.closest(nonBasketArea) &&
                section.querySelector("a[href*='/product/']") && !elementVisible(section);
        });
        const found = new Set(lines.map(line => line.url));
        const unread = anchors.some(anchor => !found.has(productKey(anchor.href))) ||
            visible("[data-testid='trolley-item' i],[data-auto-id='trolley-item' i],[data-testid='basket-item' i]").some(row => !Array.from(row.querySelectorAll("a[href*='/product/']")).some(a => found.has(productKey(a.href))));
        let countKnown = false, mismatch = false;
        for (const el of visible("h1,h2,h3,[role=heading],[data-testid*='count' i],[data-auto-id*='count' i],[data-testid*='empty' i],[data-auto-id*='empty' i],[aria-label*='trolley' i],[aria-label*='basket' i],p,[role=status]")) {
            const label = (el.getAttribute("aria-label") || visibleText(el)).trim();
            if (label.length > 120)
                continue;
            const empty = /^(?:your |the )?(?:basket|trolley) is (?:currently )?empty[.!]?$/i.test(label);
            const count = /(?:trolley|basket)\s*[:(,\-]?\s*(\d+)\s*(items?|products?)\b|^(\d+)\s*(items?|products?)(?:\s+in (?:your |the )?(?:basket|trolley)\b|$)/i.exec(label);
            if (!empty && !count)
                continue;
            const n = empty ? 0 : Number(count[1] ?? count[3]);
            if (empty || /product/i.test(count?.[2] ?? count?.[4] ?? "")) {
                countKnown = true;
                mismatch ||= n !== lines.length;
            }
            else {
                const min = lines.reduce((sum, line) => sum + (line.lineQuantity ?? 1), 0);
                const allKnown = lines.every(line => line.lineQuantity !== undefined);
                mismatch ||= n < min || (allKnown && n !== min);
                countKnown ||= allKnown && n === min;
            }
        }
        return { blocked: busy || Boolean(more || group) || unread || mismatch || (!lines.length && !countKnown), countKnown, group, more, busy, mismatch };
    }
    async function verifyBasket(state, confirmed) {
        stopBasketWatch();
        const generation = scanGeneration;
        checkedQueueDate = state.queue?.createdAt;
        basketLines = [];
        basketChecks = [];
        choiceGroups = new Map();
        findingChoices = false;
        if (!state.queue?.items.length || !isBasketPage()) {
            basketMessage = "Open the Asda trolley and import a shopping list first.";
            render();
            return false;
        }
        basketMessage = "Reading your trolley...";
        render();
        let previous;
        const expanded = new Set();
        const openedGroups = new Set();
        for (let attempt = 0; attempt < 12; attempt++) {
            if (generation !== scanGeneration || latestState?.queue?.createdAt !== checkedQueueDate || !isBasketPage())
                return false;
            const anchors = basketAnchors();
            const lines = scanBasketLines(anchors), readiness = basketReadiness(lines, anchors);
            const sig = basketSignature(lines);
            const more = readiness.more;
            const group = readiness.group;
            if (!readiness.busy && group instanceof HTMLButtonElement && (!group.form || group.type === "button")) {
                const id = group.getAttribute("aria-controls");
                if (!openedGroups.has(id)) {
                    openedGroups.add(id);
                    group.click();
                }
            }
            else if (!readiness.busy && more instanceof HTMLButtonElement && (!more.form || more.type === "button") && !expanded.has(sig) &&
                /^(?:load|show|view) more (?:trolley |basket )?(?:items|products)$/i.test((more.getAttribute("aria-label") || visibleText(more)).trim())) {
                expanded.add(sig);
                more.click();
            }
            if (readiness.mismatch && !readiness.busy && !more && !group && !expanded.has(sig) && lines.length) {
                expanded.add(sig);
                lines[lines.length - 1].element?.scrollIntoView({ block: "nearest", behavior: "instant" });
            }
            if (!readiness.blocked && sig === previous) {
                if (!readiness.countKnown && confirmed !== sig) {
                    confirmVisibleSignature = sig;
                    basketMessage = "ASDA hasn't shown a trolley count. Check that all items are visible.";
                    render();
                    return false;
                }
                checkedBasket = sig;
                checkedWithCount = readiness.countKnown;
                basketLines = lines;
                basketObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
                basketChecks = allocateBasket(state, lines);
                basketMessage = "Trolley checked.";
                render();
                return true;
            }
            previous = readiness.blocked ? undefined : sig;
            await wait(350);
        }
        if (generation === scanGeneration) {
            basketMessage = "The full trolley could not be read. Let it finish loading or show the remaining items, then verify again.";
            render();
        }
        return false;
    }
    async function addOneMoreForCheck(check) {
        const line = basketLines.find(entry => entry.url === check.basketProductUrl);
        if (!line?.element) {
            basketMessage = "Could not find a safe quantity increase button for that basket line.";
            render();
            return;
        }
        const beforeQuantity = check.basketQuantity;
        const attempted = await increaseQuantityControl(line.element);
        if (!attempted) {
            basketMessage = "Could not find a safe quantity increase control for that basket line.";
            render();
            return;
        }
        basketMessage = "Trying to increase the basket quantity. Rechecking...";
        render();
        await wait(1800);
        const state = latestState;
        if (state) {
            if (!await verifyBasket(state))
                return;
            const afterCheck = basketChecks.find((candidate) => candidate.itemId === check.itemId);
            const afterQuantity = afterCheck?.basketQuantity;
            if (afterCheck?.status === "ok") {
                basketMessage = `${afterCheck.name} now looks adequate.`;
            }
            else if (typeof beforeQuantity === "number" && typeof afterQuantity === "number" && afterQuantity > beforeQuantity) {
                basketMessage = `${afterCheck?.name ?? check.name} increased, but still looks short.`;
            }
            else {
                basketMessage = `I tried to increase ${check.name}, but Asda did not show a quantity change. Use Open product or adjust the basket quantity manually.`;
            }
        }
        render();
    }
    const basketStatusRank = { short: 0, missing: 1, unknown: 2, ok: 3 };
    function reviewableBasketChecks() {
        return basketChecks.filter((check) => check.status !== "ok").sort((a, b) => basketStatusRank[a.status] - basketStatusRank[b.status]);
    }
    function remainingShopBrief(state) {
        if (!isBasketPage() || !state.queue || checkedQueueDate !== state.queue.createdAt)
            return "";
        const items = new Map(state.queue.items.map(item => [item.itemId, item]));
        const rows = reviewableBasketChecks().flatMap(check => {
            const item = items.get(check.itemId);
            if (!item)
                return [];
            const group = choiceGroups.get(check.itemId);
            if (group?.selected === -1)
                return [];
            const need = check.displayQuantity || displayBaseQuantity(check.requiredQuantity, check.requiredUnit) || "unspecified";
            const row = [check.name, `Total needed: ${need}`];
            if (group && group.selected === undefined)
                row.push("Awaiting shopper decision; do not add independently.");
            const chosen = group?.selected !== undefined && group.products[group.selected];
            if (chosen)
                row.push(`My choice for this shop only: ${chosen.name} (${chosen.url}). Use this exact product or leave unresolved.`);
            if (check.status === "missing") {
                row.push("Missing from visible trolley", `Outstanding if still absent: ${need}`);
            }
            else if (check.status === "short" && check.requiredQuantity !== undefined && check.basketQuantity !== undefined &&
                check.requiredUnit === check.basketUnit) {
                row.push(`In trolley: ${displayBaseQuantity(check.basketQuantity, check.basketUnit)}`, `Short by: ${displayBaseQuantity(check.requiredQuantity - check.basketQuantity, check.requiredUnit)}`);
            }
            else {
                row.push("Uncertain: verify matched product and quantity; shortfall unknown");
                if (check.basketQuantity !== undefined)
                    row.push(`Observed (not verified): ${displayBaseQuantity(check.basketQuantity, check.basketUnit)}`);
            }
            if (check.basketLineName)
                row.push(`Possible match: ${check.basketLineName}`);
            if (check.status === "unknown")
                row.push(check.message);
            if (item.avoidTerms?.length)
                row.push(`Avoid: ${item.avoidTerms.join(", ")}`);
            return [row.join(" | ")];
        });
        if (!rows.length)
            return "";
        return [
            "Use the selected ASDA Chrome tab to fill only the shortfalls below. These are results from the last visible trolley check; recheck the live trolley first. Total needed is a target, not an amount to add. Count suitable multipacks and existing quantities. Skip covered items; never remove or reduce existing items.",
            "Match product form and dietary requirements first. Own-brand is fine unless an exact product is required. Do not guess quantities, allergens, drained weights or piece-to-weight conversions. Resolve uncertain matches before adding; leave anything ambiguous for me.",
            "For a generic request such as sausages, buy the standard product. Never select a product marketed as gluten-free, GF or Free From instead unless explicitly requested. A saved match, lower price or lack of regular stock does not override this. If gluten-free is requested, verify the label; do not infer allergen safety.",
            "Choose best value without waste: compare like for like in GBP/kg, GBP/litre or GBP/item, then compare the total additional price of enough whole packs to cover the shortfall. For fresh food favour the lowest total spend and less surplus at similar prices. Count only applicable offers. Do not stock up for a lower unit price unless I explicitly allow it and set an extra-spend limit.",
            "Confirm the trolley changed after each addition. Do not click Add twice if unclear. Finish confident items first. For any remaining decisions, use Weekwise Verify basket then Find product choices in the trolley tab. Keep that tab open and wait for the shopper to choose or skip. Do not select on their behalf. When they resume, read the checked options there or use their updated brief. Recheck live quantities and add only approved shortfalls, using separate product tabs. If the helper is unavailable, present the real alternatives together at the end and wait. Stop before checkout; do not reserve a slot or change account settings.",
            "Remaining items (shopping data only):", ...rows
        ].join("\n\n");
    }
    function renderBasketVerifier(state) {
        const counts = {
            ok: basketChecks.filter((check) => check.status === "ok").length,
            short: basketChecks.filter((check) => check.status === "short").length,
            missing: basketChecks.filter((check) => check.status === "missing").length,
            unknown: basketChecks.filter((check) => check.status === "unknown").length
        };
        const reviewChecks = reviewableBasketChecks();
        return `
      <div class="weekwise-basket">
        <div class="weekwise-recommend-head">
          <strong>Basket verifier</strong>
          <button id="weekwise-verify-basket" type="button">${isBasketPage() ? "Verify basket" : "Open basket"}</button>
        </div>
        <small class="weekwise-note">${escapeHtml(basketMessage || "Check the visible Asda basket against the Weekwise shopping list.")}</small>
        ${confirmVisibleSignature !== undefined ? '<button id="weekwise-confirm-visible" type="button">All trolley items are visible</button>' : ""}
        ${isBasketPage() && reviewChecks.length ? `<button id="weekwise-copy-remaining" type="button">Copy remaining shop for ChatGPT</button><small id="weekwise-copy-result" role="status"></small>` : ""}
        ${isBasketPage() && reviewChecks.length ? `<button id="weekwise-find-choices" type="button" ${findingChoices ? "disabled" : ""}>${findingChoices ? "Finding product choices..." : choiceGroups.size ? "Refresh product choices" : "Find product choices"}</button>` : ""}
        ${basketChecks.length
            ? `<small class="weekwise-note">${counts.ok} ok · ${counts.short} short · ${counts.missing} missing · ${counts.unknown} review</small>`
            : ""}
        ${reviewChecks.length
            ? `<div class="weekwise-basket-list">
                ${reviewChecks
                .map((check, index) => `
                      <article class="weekwise-basket-card weekwise-basket-${check.status}">
                        <strong>${escapeHtml([check.displayQuantity, check.name].filter(Boolean).join(" "))}</strong>
                        <small>${escapeHtml(check.message)}</small>
                        ${check.basketLineName ? `<small>${escapeHtml(`Matched: ${check.basketLineName}`)}</small>` : ""}
                        ${renderChoiceGroup(check, index)}
                        <div class="weekwise-recommend-actions">
                          <button id="weekwise-basket-open-${index}" type="button">Open product</button>
                          <button id="weekwise-basket-plus-${index}" class="weekwise-primary" type="button" ${check.canIncrease ? "" : "disabled"}>Add one more</button>
                          <button id="weekwise-basket-ok-${index}" type="button">Looks ok</button>
                        </div>
                      </article>
                    `)
                .join("")}
              </div>`
            : basketChecks.length
                ? `<div class="weekwise-basket-card weekwise-basket-ok"><strong>All checked items look adequate</strong><small>Still review substitutions and freshness before checkout.</small></div>`
                : ""}
      </div>
    `;
    }
    function renderChoiceGroup(check, index) {
        const group = choiceGroups.get(check.itemId);
        if (!group)
            return "";
        const labels = group.products.map(p => [p.name, p.packSizeText, p.priceText, p.unitPriceText].filter(Boolean).join(" · "));
        return `<fieldset class="weekwise-choices"><legend>Choose for this shop</legend>
      ${labels.length ? "" : `<small>${escapeHtml(group.error || "No suitable products found. Review manually or skip.")}</small>`}
      ${[...labels, "Skip this item"].map((label, i) => {
            const value = i === labels.length ? -1 : i;
            return `<label><input type="radio" name="weekwise-choice-${index}" value="${value}" ${group.selected === value ? "checked" : ""}> ${escapeHtml(label)}</label>`;
        }).join("")}</fieldset>`;
    }
    async function findChoices() {
        if (findingChoices || !checkStillCurrent())
            return;
        const groups = new Map();
        choiceGroups = groups;
        findingChoices = true;
        render();
        try {
            for (const check of reviewableBasketChecks()) {
                if (groups !== choiceGroups)
                    break;
                const response = await sendMessage({ type: "FIND_REVIEW_CHOICES", itemId: check.itemId });
                if (groups !== choiceGroups)
                    break;
                groups.set(check.itemId, { products: response.choices ?? [], error: response.error });
                render();
            }
        }
        finally {
            if (groups === choiceGroups) {
                findingChoices = false;
                render();
            }
        }
    }
    function scoreProduct(item, state, product) {
        let score = 0;
        const reasons = [];
        const warnings = [];
        const productName = normalizeText(product.name);
        const productText = normalizeText(`${product.name} ${product.rawText ?? ""}`);
        const targetName = normalizeText(item.name);
        const targetTokens = tokenize(item.name);
        const savedUrl = state.productLinks[item.shoppingKey] || item.savedProductUrl;
        const exactNameMatch = exactItemNameMatch(item.name, product.name);
        if (!exactNameMatch) {
            score -= 200;
            warnings.push("not an exact item-name match");
        }
        if (exactNameMatch && savedUrl && absoluteUrl(savedUrl) === product.url) {
            score += 55;
            reasons.push("saved preference");
        }
        if (targetName && productName.includes(targetName)) {
            score += 45;
            reasons.push("best match");
        }
        else if (targetName && productText.includes(targetName)) {
            score += 28;
            reasons.push("best match");
        }
        const matchedTokens = targetTokens.filter((token) => productText.includes(token));
        score += matchedTokens.length * 10;
        score -= Math.max(0, targetTokens.length - matchedTokens.length) * 8;
        (item.avoidTerms ?? []).forEach((term) => {
            const cleanTerm = normalizeText(term);
            if (!cleanTerm)
                return;
            if (productName.includes(cleanTerm)) {
                score -= 80;
                warnings.push(`may be ${term}`);
            }
            else if (productText.includes(cleanTerm)) {
                score -= 35;
                warnings.push(`check ${term}`);
            }
        });
        if (product.available === false) {
            score -= 80;
            warnings.push("unavailable");
        }
        if (product.addable)
            score += 5;
        if (product.offerText) {
            score += 8;
            reasons.push("offer");
        }
        const coverage = productCoverage(item, product);
        if (coverage) {
            if (coverage.offered.quantity >= coverage.required.quantity) {
                const wasteRatio = (coverage.offered.quantity - coverage.required.quantity) / coverage.required.quantity;
                score += Math.max(0, 18 - wasteRatio * 8);
                if (wasteRatio <= 0.75)
                    reasons.push("least waste");
            }
            else {
                score += 7;
                warnings.push(`buy ${coverage.packCount} packs`);
            }
        }
        return { product, score, reasons: Array.from(new Set(reasons)), warnings: Array.from(new Set(warnings)) };
    }
    function recommendProducts(item, state, products = scanVisibleProducts()) {
        const rejectedUrls = new Set(state.rejectedRecommendations?.[item.itemId] ?? []);
        const scored = products
            .filter(product => compatibleAsdaVariant(item.name, product.name))
            .filter((product) => !rejectedUrls.has(product.url))
            .map((product) => scoreProduct(item, state, product))
            .filter((recommendation) => recommendation.score >= 20)
            .sort((a, b) => b.score - a.score);
        const pricedRecommendations = scored
            .map((recommendation) => ({ recommendation, unitPrice: unitPriceValue(recommendation.product) }))
            .filter((entry) => typeof entry.unitPrice === "number");
        const cheapest = pricedRecommendations.sort((a, b) => a.unitPrice - b.unitPrice)[0]?.recommendation;
        if (cheapest) {
            cheapest.score += 8;
            if (!cheapest.reasons.includes("cheapest per kg"))
                cheapest.reasons.push("cheapest per kg");
            scored.sort((a, b) => b.score - a.score);
        }
        return scored.slice(0, 3);
    }
    function renderRecommendations(item, state) {
        const currentRecommendations = recommendationItemId === item.itemId ? recommendations : [];
        const savedRecommendation = state.lastRecommendations?.[item.shoppingKey];
        function productPriceSummary(product) {
            const parts = [product.priceText, product.unitPriceText];
            const offerText = product.offerText?.trim();
            if (offerText && offerText.length < 80 && normalizeText(offerText) !== normalizeText(product.name))
                parts.push(offerText);
            return parts.filter(Boolean).join(" · ") || "No visible price";
        }
        function productPurchaseSummary(product) {
            const coverage = productCoverage(item, product);
            const requiredText = item.displayQuantity ? `${item.displayQuantity} ${item.name}` : `${item.name} (quantity not specified)`;
            if (!coverage)
                return `<small>Need ${escapeHtml(requiredText)}</small>`;
            return `<small class="weekwise-purchase-amount"><strong>Buy ${escapeHtml(coverage.display)}</strong> · Need ${escapeHtml(requiredText)}${coverage.estimated ? " · estimated from typical item weight" : ""}</small>`;
        }
        return `
      <div class="weekwise-recommend">
        <div class="weekwise-recommend-head">
          <strong>Product suggestions</strong>
          <button id="weekwise-scan-products" type="button">Scan visible products</button>
        </div>
        ${savedRecommendation
            ? `<small class="weekwise-note">Last saved: ${escapeHtml(savedRecommendation.productName)}${savedRecommendation.packSizeText ? ` · ${escapeHtml(savedRecommendation.packSizeText)}` : ""}${savedRecommendation.priceText ? ` · ${escapeHtml(savedRecommendation.priceText)}` : ""}</small>`
            : ""}
        <small class="weekwise-note">${escapeHtml(recommendationMessage || "Open the Asda search page, then scan the products currently visible on screen.")}</small>
        ${currentRecommendations.length
            ? `<div class="weekwise-recommend-list">
                ${currentRecommendations
                .map((recommendation, index) => `
                      <article class="weekwise-recommend-card${recommendation.product.imageUrl ? "" : " weekwise-no-image"}">
                        ${recommendation.product.imageUrl ? `<img src="${escapeHtml(recommendation.product.imageUrl)}" alt="" />` : ""}
                        <div>
                          <strong>${escapeHtml(recommendation.product.name)}</strong>
                          <small>${escapeHtml(productPriceSummary(recommendation.product))}</small>
                          ${productPurchaseSummary(recommendation.product)}
                          <small>${escapeHtml(recommendation.reasons.join(" · ") || "possible match")}${recommendation.warnings?.length ? ` · Check: ${escapeHtml(recommendation.warnings.join(", "))}` : ""}</small>
                          <div class="weekwise-recommend-actions">
                            <button id="weekwise-rec-open-${index}" type="button">Open</button>
                            <button id="weekwise-rec-save-${index}" class="weekwise-primary" type="button">Remember</button>
                            <button id="weekwise-rec-reject-${index}" type="button">Reject</button>
                          </div>
                        </div>
                      </article>
                    `)
                .join("")}
              </div>`
            : ""}
      </div>
    `;
    }
    function findConfidentAddButton() {
        const item = latestState && currentItem(latestState);
        const heading = document.querySelector("h1");
        if (!item || !heading || !/\/product\//i.test(window.location.pathname) ||
            !exactItemNameMatch(item.name, withDietBadge(visibleText(heading), heading.parentElement)))
            return null;
        const candidates = Array.from(document.querySelectorAll([
            "button",
            "[role='button']",
            "[data-testid*='add' i]",
            "[data-auto-id*='add' i]",
            "[aria-label*='add' i]"
        ].join(",")))
            .filter((element) => !insideWeekwiseHelper(element) && elementVisible(element) && !buttonDisabled(element))
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
            if (/(favourite|favorite|list|address|voucher|promo|coupon)/.test(lowerText))
                score -= 10;
            return { element, score, text };
        })
            .filter((candidate) => candidate.score >= 4)
            .sort((a, b) => b.score - a.score);
        return candidates.length === 1 ? candidates[0].element : null;
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
        if (checkedQueueDate !== undefined && (checkedQueueDate !== state?.queue?.createdAt || !isBasketPage())) {
            stopBasketWatch();
            choiceGroups = new Map();
            findingChoices = false;
            basketChecks = [];
            basketLines = [];
            basketMessage = "";
            checkedQueueDate = undefined;
        }
        const item = state ? currentItem(state) : null;
        const confidentAddButton = findConfidentAddButton();
        const status = item && state ? statusFor(item, state) : undefined;
        if (item?.itemId !== recommendationItemId) {
            recommendations = [];
            recommendationItemId = item?.itemId ?? "";
            recommendationMessage = "";
        }
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
                <button id="weekwise-click-add" class="weekwise-primary" type="button" ${confidentAddButton ? "" : "disabled"}>Add + next</button>
                <button id="weekwise-remember" type="button">Remember page</button>
                <button id="weekwise-added" type="button">Added + next</button>
                <button id="weekwise-unavailable" type="button">Unavailable + next</button>
                <button id="weekwise-next" class="weekwise-primary" type="button">Next item</button>
                <button id="weekwise-refresh" type="button">Refresh</button>
              </div>
              <small class="weekwise-note">${confidentAddButton
                ? "Add + next clicks the visible Asda add button, marks this item added, then opens the next item."
                : "No single safe Add button was detected. Add manually, then mark added."}</small>
              ${state ? renderRecommendations(item, state) : ""}
              ${state ? renderBasketVerifier(state) : ""}
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
            if (!item)
                return;
            const visibleProducts = scanVisibleProducts();
            const currentProduct = visibleProducts.find((product) => absoluteUrl(product.url) === absoluteUrl(window.location.href));
            if (currentProduct) {
                await sendMessage({
                    type: "SAVE_RECOMMENDATION",
                    itemId: item.itemId,
                    productUrl: currentProduct.url,
                    candidate: { ...currentProduct, rawText: undefined }
                });
            }
            else if (/\/(?:groceries\/)?product\//i.test(window.location.pathname)) {
                await sendMessage({ type: "SAVE_CURRENT_PRODUCT_URL", productUrl: window.location.href });
            }
            else {
                recommendationMessage = "Open the chosen product page before remembering it.";
            }
            await refresh();
        });
        document.getElementById("weekwise-added")?.addEventListener("click", async () => {
            if (!item)
                return;
            await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "added", advance: true, openNext: true });
            await refresh();
        });
        document.getElementById("weekwise-unavailable")?.addEventListener("click", async () => {
            if (!item)
                return;
            await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "unavailable", advance: true, openNext: true });
            await refresh();
        });
        document.getElementById("weekwise-next")?.addEventListener("click", async () => {
            await sendMessage({ type: "OPEN_NEXT" });
            await refresh();
        });
        document.getElementById("weekwise-click-add")?.addEventListener("click", async () => {
            if (!item)
                return;
            const result = await clickAddButtonWithRetry();
            if (!result.ok)
                return;
            await sendMessage({ type: "SET_STATUS", itemId: item.itemId, status: "added", advance: true, openNext: true });
            await refresh();
        });
        document.getElementById("weekwise-verify-basket")?.addEventListener("click", async () => {
            if (!state)
                return;
            if (!isBasketPage()) {
                basketMessage = "Opening Asda basket...";
                render();
                await sendMessage({ type: "OPEN_BASKET" });
                return;
            }
            await verifyBasket(state);
        });
        document.getElementById("weekwise-confirm-visible")?.addEventListener("click", () => {
            if (state && confirmVisibleSignature !== undefined)
                void verifyBasket(state, confirmVisibleSignature);
        });
        document.getElementById("weekwise-copy-remaining")?.addEventListener("click", async () => {
            if (!checkStillCurrent())
                return;
            const result = document.getElementById("weekwise-copy-result");
            const brief = state && remainingShopBrief(state);
            if (!result)
                return;
            if (!brief) {
                result.textContent = "Nothing to copy. All remaining items were skipped or covered.";
                return;
            }
            try {
                await navigator.clipboard.writeText(brief);
                result.textContent = "Copied. Paste into ChatGPT with your ASDA tab selected.";
            }
            catch {
                const field = document.createElement("textarea");
                field.readOnly = true;
                field.setAttribute("aria-label", "Remaining shop for ChatGPT");
                field.value = brief;
                result.textContent = "Clipboard unavailable. Copy the selected brief manually.";
                result.append(field);
                field.focus();
                field.select();
            }
        });
        document.getElementById("weekwise-find-choices")?.addEventListener("click", () => void findChoices());
        reviewableBasketChecks().forEach((check, index) => {
            root.querySelectorAll(`input[name="weekwise-choice-${index}"]`).forEach(input => input.addEventListener("change", () => {
                if (!checkStillCurrent())
                    return;
                const group = choiceGroups.get(check.itemId);
                if (group)
                    group.selected = Number(input.value);
                const result = document.getElementById("weekwise-copy-result");
                if (result)
                    result.textContent = "Choice recorded. Copy the updated brief to continue in ChatGPT.";
            }));
            document.getElementById(`weekwise-basket-open-${index}`)?.addEventListener("click", () => {
                if (!checkStillCurrent())
                    return;
                window.location.href = check.basketProductUrl || check.openUrl;
            });
            document.getElementById(`weekwise-basket-plus-${index}`)?.addEventListener("click", () => {
                if (!checkStillCurrent())
                    return;
                void addOneMoreForCheck(check);
            });
            document.getElementById(`weekwise-basket-ok-${index}`)?.addEventListener("click", () => {
                if (!checkStillCurrent())
                    return;
                basketChecks = basketChecks.map((candidate) => (candidate.itemId === check.itemId ? { ...candidate, status: "ok", message: "Marked as adequate after review." } : candidate));
                basketMessage = "Marked item as adequate.";
                render();
            });
        });
        document.getElementById("weekwise-scan-products")?.addEventListener("click", () => {
            if (!item || !state)
                return;
            recommendations = recommendProducts(item, state);
            recommendationItemId = item.itemId;
            recommendationMessage = recommendations.length
                ? `Showing ${recommendations.length} suggested product${recommendations.length === 1 ? "" : "s"} from the visible Asda page.`
                : "Manual review needed: no confident product matches were found on this visible page.";
            render();
        });
        recommendations.forEach((recommendation, index) => {
            document.getElementById(`weekwise-rec-open-${index}`)?.addEventListener("click", () => {
                window.location.href = recommendation.product.url;
            });
            document.getElementById(`weekwise-rec-save-${index}`)?.addEventListener("click", async () => {
                if (!item)
                    return;
                const response = await sendMessage({
                    type: "SAVE_RECOMMENDATION",
                    itemId: item.itemId,
                    productUrl: recommendation.product.url,
                    candidate: { ...recommendation.product, rawText: undefined }
                });
                recommendationMessage = response.ok ? "Saved this product for future shops." : response.error ?? "Could not save this product.";
                await refresh();
            });
            document.getElementById(`weekwise-rec-reject-${index}`)?.addEventListener("click", async () => {
                if (!item)
                    return;
                await sendMessage({ type: "REJECT_RECOMMENDATION", itemId: item.itemId, productUrl: recommendation.product.url });
                recommendations = recommendations.filter((_, recommendationIndex) => recommendationIndex !== index);
                recommendationMessage = recommendations.length ? "Removed that suggestion." : "Removed that suggestion. Scan again to look for alternatives.";
                await refresh();
            });
        });
    }
    void refresh();
    chrome.storage.onChanged.addListener(() => void refresh());
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type === "SCAN_REVIEW_CHOICES") {
            const state = latestState;
            const item = state?.queue?.items.find(entry => entry.itemId === message.itemId);
            const products = scanVisibleProducts();
            if (!state || !item || !products.length) {
                sendResponse({ ok: false });
                return;
            }
            const choices = recommendProducts(item, state, products.filter(p => p.available !== false && exactItemNameMatch(item.name, p.name) &&
                !(item.avoidTerms ?? []).some(term => normalizeText(p.name).includes(normalizeText(term))) &&
                /^https:\/\/(?:www|groceries)\.asda\.com\/(?:groceries\/)?product\//i.test(p.url))).map(({ product: p }) => ({ url: p.url, name: p.name, priceText: p.priceText, unitPriceText: p.unitPriceText, packSizeText: p.packSizeText }));
            sendResponse({ ok: true, choices });
            return;
        }
        if (message.type !== "CLICK_ADD_IF_CONFIDENT")
            return;
        clickAddButtonWithRetry().then(sendResponse);
        return true;
    });
})();
