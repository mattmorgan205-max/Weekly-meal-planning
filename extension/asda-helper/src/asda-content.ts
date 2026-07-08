(() => {
  let latestState: AsdaHelperState | undefined;
  let collapsed = false;
  let recommendations: AsdaRecommendation[] = [];
  let recommendationItemId = "";
  let recommendationMessage = "";
  let basketChecks: AsdaBasketCheck[] = [];
  let basketLines: Array<AsdaBasketLine & { element?: HTMLElement }> = [];
  let basketMessage = "";

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

  function insideWeekwiseHelper(element: Element) {
    return Boolean(element.closest("#weekwise-asda-helper"));
  }

  function controlLabel(element: HTMLElement) {
    return `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""} ${element.getAttribute("data-testid") ?? ""} ${element.getAttribute("data-auto-id") ?? ""}`
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function visibleEnabledControls(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLButtonElement | HTMLElement>("button, [role='button']")).filter(
      (button) => !insideWeekwiseHelper(button) && elementVisible(button) && !buttonDisabled(button)
    );
  }

  function normalizeText(value: string) {
    return value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(value: string) {
    const stopWords = new Set(["and", "the", "with", "for", "asda", "fresh", "chosen", "by"]);
    return normalizeText(value)
      .split(" ")
      .filter((token) => token.length > 2 && !stopWords.has(token));
  }

  function absoluteUrl(value: string) {
    try {
      return new URL(value, window.location.origin).toString();
    } catch {
      return value;
    }
  }

  function visibleText(element: Element | null) {
    if (!element) return "";
    return ((element as HTMLElement).innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function firstUsefulLine(value: string) {
    const lines = value
      .split(/\n| {2,}/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^\s*(add|save|favourite|favorite|offer|view|details)\b/i.test(line))
      .filter((line) => !/^(?:\u00a3|£|\d+p\b)/i.test(line));

    return lines.sort((a, b) => b.length - a.length)[0] ?? value.trim();
  }

  function findProductContainer(anchor: HTMLAnchorElement) {
    let current: HTMLElement | null = anchor;
    for (let depth = 0; current && depth < 8; depth += 1) {
      const text = visibleText(current);
      const hasButton = Boolean(current.querySelector("button, [role='button']"));
      if (text.length > 45 && (hasButton || /(?:\u00a3|£|\d+p\b)/i.test(text))) return current;
      current = current.parentElement;
    }

    return anchor.closest("article, li, [data-testid], [data-auto-id]") as HTMLElement | null;
  }

  function findPriceText(value: string) {
    return value.match(/(?:\u00a3|£)\s?\d+(?:\.\d{1,2})?|\b\d+\s?p\b/i)?.[0]?.trim();
  }

  function findUnitPriceText(value: string) {
    return value.match(/(?:(?:\u00a3|£)\s?\d+(?:\.\d{1,2})?|\d+\s?p)\s?\/\s?(?:kg|g|100g|l|litre|ml|100ml|each|item)/i)?.[0]?.trim();
  }

  function findOfferText(value: string) {
    const lines = value
      .split(/\n| {2,}/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.find((line) => /\b(offer|rollback|save|was|now|any\s+\d|2\s+for|3\s+for|multibuy)\b/i.test(line));
  }

  function findPackSizeText(value: string) {
    return value.match(/\b\d+\s?x\s?\d+(?:\.\d+)?\s?(?:kg|g|ml|l|cl)\b/i)?.[0]?.trim() ?? value.match(/\b\d+(?:\.\d+)?\s?(?:kg|g|ml|l|cl|pack|pcs|pieces|each)\b/i)?.[0]?.trim();
  }

  function normalizedUnit(unit: string | undefined) {
    const lowerUnit = (unit ?? "").toLowerCase().trim();
    if (["kg", "g", "gram", "grams"].includes(lowerUnit)) return lowerUnit === "kg" ? "kg" : "g";
    if (["l", "litre", "litres", "ml", "cl"].includes(lowerUnit)) return lowerUnit === "l" || lowerUnit.startsWith("litre") ? "l" : lowerUnit;
    if (["item", "items", "each", "pack", "packs", "piece", "pieces", "pcs", "clove", "cloves", "can", "cans", "tin", "tins"].includes(lowerUnit)) return "item";
    return lowerUnit;
  }

  function toBaseQuantity(quantity: number | undefined, unit: string | undefined) {
    if (typeof quantity !== "number" || Number.isNaN(quantity)) return null;
    const cleanUnit = normalizedUnit(unit);

    if (cleanUnit === "kg") return { quantity: quantity * 1000, family: "weight", unit: "g" };
    if (cleanUnit === "g") return { quantity, family: "weight", unit: "g" };
    if (cleanUnit === "l") return { quantity: quantity * 1000, family: "volume", unit: "ml" };
    if (cleanUnit === "cl") return { quantity: quantity * 10, family: "volume", unit: "ml" };
    if (cleanUnit === "ml") return { quantity, family: "volume", unit: "ml" };
    if (!cleanUnit || cleanUnit === "item") return { quantity, family: "count", unit: "item" };
    return null;
  }

  function extractProductQuantity(value: string) {
    const multiplied = value.match(/\b(\d+)\s?x\s?(\d+(?:\.\d+)?)\s?(kg|g|ml|l|cl)\b/i);
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

  function unitPriceValue(candidate: AsdaProductCandidate) {
    const text = candidate.unitPriceText ?? "";
    const match = text.match(/((?:\u00a3|£)\s?\d+(?:\.\d{1,2})?|\d+\s?p)\s?\/\s?(kg|g|100g|l|litre|ml|100ml|each|item)/i);
    if (!match) return null;

    let amount = Number(match[1].replace(/[^\d.]/g, ""));
    if (/p/i.test(match[1]) && !/(?:\u00a3|£)/.test(match[1])) amount /= 100;

    const unit = match[2].toLowerCase();
    if (unit === "100g" || unit === "100ml") amount *= 10;
    if (unit === "g" || unit === "ml") amount *= 1000;

    return amount;
  }

  function scanVisibleProducts() {
    const products = new Map<string, AsdaProductCandidate>();
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((anchor) => /\/(?:groceries\/)?product\//i.test(anchor.href));

    anchors.forEach((anchor) => {
      const url = absoluteUrl(anchor.href);
      if (products.has(url)) return;

      const container = findProductContainer(anchor);
      const rawText = visibleText(container) || visibleText(anchor);
      const image = container?.querySelector<HTMLImageElement>("img") ?? anchor.querySelector<HTMLImageElement>("img");
      const name = firstUsefulLine(image?.alt || anchor.getAttribute("aria-label") || visibleText(anchor) || rawText);
      if (!name || name.length < 3) return;

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
        imageUrl: document.querySelector<HTMLImageElement>("img")?.currentSrc || document.querySelector<HTMLImageElement>("img")?.src || undefined,
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

  function displayBaseQuantity(quantity: number | undefined, unit: string | undefined) {
    if (typeof quantity !== "number" || Number.isNaN(quantity)) return "";
    if (unit === "g" && quantity >= 1000) return `${Number((quantity / 1000).toFixed(2))} kg`;
    if (unit === "ml" && quantity >= 1000) return `${Number((quantity / 1000).toFixed(2))} l`;
    return `${Number(quantity.toFixed(2))} ${unit || "items"}`.trim();
  }

  function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function activateElement(element: HTMLElement) {
    element.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
    element.focus();
    await wait(150);

    const pointerOptions = { bubbles: true, cancelable: true, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1 };
    const mouseOptions = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 };

    try {
      element.dispatchEvent(new PointerEvent("pointerdown", pointerOptions));
    } catch {
      // Older embedded browsers can lack PointerEvent support.
    }

    element.dispatchEvent(new MouseEvent("mousedown", mouseOptions));
    element.dispatchEvent(new MouseEvent("mouseup", { ...mouseOptions, buttons: 0 }));

    try {
      element.dispatchEvent(new PointerEvent("pointerup", { ...pointerOptions, buttons: 0 }));
    } catch {
      // Older embedded browsers can lack PointerEvent support.
    }

    element.click();
  }

  function quantityInput(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLInputElement>("input")).find((element) => {
      const label = `${element.getAttribute("aria-label") ?? ""} ${element.name ?? ""} ${element.id ?? ""}`.toLowerCase();
      return !insideWeekwiseHelper(element) && elementVisible(element) && !element.disabled && /qty|quantity|amount/.test(label);
    });
  }

  function quantitySelect(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLSelectElement>("select")).find((element) => {
      const label = `${element.getAttribute("aria-label") ?? ""} ${element.name ?? ""} ${element.id ?? ""}`.toLowerCase();
      return !insideWeekwiseHelper(element) && elementVisible(element) && !element.disabled && /qty|quantity|amount/.test(label);
    });
  }

  function setControlValue(control: HTMLInputElement | HTMLSelectElement, value: string) {
    const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (setter) setter.call(control, value);
    else control.value = value;

    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function increaseQuantityControl(container: HTMLElement) {
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

  function extractBasketLineQuantity(container: HTMLElement) {
    const input = quantityInput(container);
    if (input && Number(input.value) > 0) return Number(input.value);

    const select = quantitySelect(container);
    if (select && Number(select.value) > 0) return Number(select.value);

    const labelledQuantityElement = Array.from(container.querySelectorAll<HTMLElement>("[aria-label], [data-testid], [data-auto-id], [title]")).find((element) => {
      if (insideWeekwiseHelper(element) || !elementVisible(element)) return false;
      const label = controlLabel(element);
      return /\b(qty|quantity)\b/.test(label) && /\b\d+\b/.test(label);
    });
    const labelledQuantity = labelledQuantityElement
      ? `${labelledQuantityElement.textContent ?? ""} ${labelledQuantityElement.getAttribute("aria-label") ?? ""} ${labelledQuantityElement.getAttribute("title") ?? ""}`.match(/\b(\d+)\b/)
      : null;
    if (labelledQuantity) return Number(labelledQuantity[1]);

    const quantityButtons = visibleEnabledControls(container);
    const quantityNumberButton = quantityButtons.find((element) => /^\d+$/.test(visibleText(element)));
    if (quantityNumberButton) return Number(visibleText(quantityNumberButton));

    const quantityControl = quantityButtons.find((element) => /(increase|increment|add one|add 1|plus|decrease|minus|remove one|quantity)/i.test(controlLabel(element)));
    const nearbyQuantity = quantityControl?.parentElement ? visibleText(quantityControl.parentElement).match(/\b(\d+)\b/) : null;
    if (nearbyQuantity) return Number(nearbyQuantity[1]);

    const text = visibleText(container);
    const quantityMatch = text.match(/\b(?:qty|quantity)\s*:?\s*(\d+)\b/i);
    if (quantityMatch) return Number(quantityMatch[1]);

    return 1;
  }

  function findIncreaseButton(container: HTMLElement) {
    const visibleButtons = visibleEnabledControls(container);
    const explicitIncreaseButton = visibleButtons.find((button) => {
      const text = controlLabel(button);
      if (/(increase|increment|add one|add 1|plus|quantity up)/.test(text)) return true;
      return text === "+" || text === "＋";
    });
    if (explicitIncreaseButton) return explicitIncreaseButton;

    const quantityButtonIndex = visibleButtons.findIndex((button) => /^\d+$/.test(visibleText(button)));
    if (quantityButtonIndex >= 0) return visibleButtons[quantityButtonIndex + 1];

    const quantityTextElement = Array.from(container.querySelectorAll<HTMLElement>("span, div, p, strong")).find((element) => {
      if (insideWeekwiseHelper(element) || !elementVisible(element) || !/^\d+$/.test(visibleText(element))) return false;
      return visibleEnabledControls(element.parentElement ?? container).length >= 2;
    });
    const siblingButtons = quantityTextElement?.parentElement ? visibleEnabledControls(quantityTextElement.parentElement) : [];
    if (siblingButtons.length >= 2) return siblingButtons[siblingButtons.length - 1];

    return undefined;
  }

  function findBasketContainer(anchor: HTMLAnchorElement) {
    let current: HTMLElement | null = anchor;
    let fallback: HTMLElement | null = findProductContainer(anchor);

    for (let depth = 0; current && depth < 12; depth += 1) {
      const text = visibleText(current);
      const hasProductLink = Boolean(Array.from(current.querySelectorAll<HTMLAnchorElement>("a[href]")).some((link) => /\/(?:groceries\/)?product\//i.test(link.href)));
      const hasQuantityControl = Boolean(
        Array.from(current.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")).some((control) => !insideWeekwiseHelper(control) && elementVisible(control)) ||
          visibleEnabledControls(current).some((button) => /(increase|increment|add one|add 1|plus|decrease|minus|quantity|\+|＋)/i.test(controlLabel(button)))
      );
      const looksLikeBasketLine = hasProductLink && hasQuantityControl && /\b(remove|quantity|qty|subtotal|save for later|£|\u00a3)\b/i.test(text);

      if (looksLikeBasketLine) return current;
      if (!fallback && hasProductLink && text.length > 40) fallback = current;
      current = current.parentElement;
    }

    return fallback;
  }

  function scanBasketLines() {
    const lines = new Map<string, AsdaBasketLine & { element?: HTMLElement }>();
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((anchor) => /\/(?:groceries\/)?product\//i.test(anchor.href));

    anchors.forEach((anchor) => {
      const url = absoluteUrl(anchor.href);
      if (lines.has(url)) return;

      const container = findBasketContainer(anchor);
      if (!container) return;

      const rawText = visibleText(container);
      if (rawText.length < 20) return;
      if (!/(remove|quantity|qty|subtotal|save for later|£|\u00a3)/i.test(rawText)) return;

      const image = container.querySelector<HTMLImageElement>("img") ?? anchor.querySelector<HTMLImageElement>("img");
      const name = firstUsefulLine(image?.alt || anchor.getAttribute("aria-label") || visibleText(anchor) || rawText);
      const lineQuantity = extractBasketLineQuantity(container);
      const packQuantity = extractProductQuantity(`${name} ${rawText}`);
      const totalQuantity = packQuantity?.quantity && lineQuantity ? packQuantity.quantity * lineQuantity : lineQuantity;
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

    basketLines = Array.from(lines.values()).map((line, index) => ({ ...line, index }));
    return basketLines;
  }

  function lineMatchScore(item: AsdaHelperQueueItem, state: AsdaHelperState, line: AsdaBasketLine) {
    let score = 0;
    const productText = normalizeText(`${line.name} ${line.rawText ?? ""}`);
    const targetName = normalizeText(item.canonicalName || item.name);
    const savedUrl = state.productLinks[item.shoppingKey] || item.savedProductUrl;

    if (savedUrl && line.url && absoluteUrl(savedUrl) === line.url) score += 100;
    if (targetName && productText.includes(targetName)) score += 40;

    tokenize(item.canonicalName || item.name).forEach((token) => {
      if (productText.includes(token)) score += 12;
      else score -= 8;
    });

    (item.avoidTerms ?? []).forEach((term) => {
      if (productText.includes(normalizeText(term))) score -= 50;
    });

    return score;
  }

  function bestBasketLine(item: AsdaHelperQueueItem, state: AsdaHelperState, lines: AsdaBasketLine[]) {
    return matchingBasketLines(item, state, lines)[0];
  }

  function matchingBasketLines(item: AsdaHelperQueueItem, state: AsdaHelperState, lines: AsdaBasketLine[]) {
    return lines
      .map((line) => ({ line, score: lineMatchScore(item, state, line) }))
      .filter((entry) => entry.score >= 20)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.line);
  }

  function basketQuantityForLine(line: AsdaBasketLine, required: ReturnType<typeof toBaseQuantity>) {
    if (required?.family === "count") return toBaseQuantity(line.lineQuantity ?? line.totalQuantity, "item");

    const basket = toBaseQuantity(line.totalQuantity, line.totalUnit);
    if (!required || basket?.family === required.family) return basket;

    return toBaseQuantity(line.lineQuantity, "item");
  }

  function basketCheckForItem(item: AsdaHelperQueueItem, state: AsdaHelperState, lines: AsdaBasketLine[]): AsdaBasketCheck {
    const openUrl = state.productLinks[item.shoppingKey] || item.savedProductUrl || item.searchUrl;
    const required = toBaseQuantity(item.requiredQuantity ?? item.quantity, item.requiredUnit ?? item.unit);
    const matchedLines = matchingBasketLines(item, state, lines);
    const line = matchedLines[0];

    if (!line) {
      return {
        itemId: item.itemId,
        shoppingKey: item.shoppingKey,
        name: item.name,
        displayQuantity: item.displayQuantity,
        sourceMeals: item.sourceMeals,
        status: "missing",
        requiredQuantity: required?.quantity,
        requiredUnit: required?.unit,
        openUrl,
        message: "Not found in the visible basket."
      };
    }

    const basketQuantities = matchedLines
      .map((matchedLine) => ({ line: matchedLine, basket: basketQuantityForLine(matchedLine, required) }))
      .filter((entry) => entry.basket && (!required || entry.basket.family === required.family)) as Array<{
        line: AsdaBasketLine;
        basket: { quantity: number; family: string; unit: string };
      }>;
    const basket =
      basketQuantities.length > 0
        ? {
            quantity: basketQuantities.reduce((total, entry) => total + entry.basket.quantity, 0),
            family: basketQuantities[0].basket.family,
            unit: basketQuantities[0].basket.unit
          }
        : basketQuantityForLine(line, required);
    const matchedLineNames = matchedLines.map((matchedLine) => matchedLine.name).slice(0, 3).join(", ");
    const base: Omit<AsdaBasketCheck, "status" | "message"> = {
      itemId: item.itemId,
      shoppingKey: item.shoppingKey,
      name: item.name,
      displayQuantity: item.displayQuantity,
      sourceMeals: item.sourceMeals,
      requiredQuantity: required?.quantity,
      requiredUnit: required?.unit,
      basketQuantity: basket?.quantity,
      basketUnit: basket?.unit,
      basketLineIndex: line.index,
      basketLineName: matchedLineNames || line.name,
      basketProductUrl: line.url,
      openUrl,
      canIncrease: line.canIncrease
    };

    if (!required || !basket || required.family !== basket.family) {
      return {
        ...base,
        status: "unknown",
        message: "Found a likely basket item, but quantity could not be compared safely."
      };
    }

    if (basket.quantity >= required.quantity) {
      return {
        ...base,
        status: "ok",
        message: `Enough in basket: ${displayBaseQuantity(basket.quantity, basket.unit)} for ${displayBaseQuantity(required.quantity, required.unit)} needed.`
      };
    }

    return {
      ...base,
      status: "short",
      message: `Need more: basket has ${displayBaseQuantity(basket.quantity, basket.unit)}, list needs ${displayBaseQuantity(required.quantity, required.unit)}.`
    };
  }

  function verifyBasket(state: AsdaHelperState) {
    if (!state.queue?.items.length) {
      basketChecks = [];
      basketMessage = "No Weekwise shopping list is imported.";
      return;
    }

    if (!isBasketPage()) {
      basketChecks = [];
      basketMessage = "Open the Asda basket first, then run the verifier.";
      return;
    }

    const lines = scanBasketLines();
    basketChecks = state.queue.items.map((item) => basketCheckForItem(item, state, lines));
    const shortCount = basketChecks.filter((check) => check.status === "short").length;
    const missingCount = basketChecks.filter((check) => check.status === "missing").length;
    const unknownCount = basketChecks.filter((check) => check.status === "unknown").length;
    basketMessage = shortCount || missingCount || unknownCount
      ? `${shortCount} short, ${missingCount} missing, ${unknownCount} need manual review.`
      : "Basket looks adequate for the imported shopping list.";
  }

  async function addOneMoreForCheck(check: AsdaBasketCheck) {
    const line = typeof check.basketLineIndex === "number" ? basketLines[check.basketLineIndex] : undefined;
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
      verifyBasket(state);
      const afterCheck = basketChecks.find((candidate) => candidate.itemId === check.itemId);
      const afterQuantity = afterCheck?.basketQuantity;

      if (afterCheck?.status === "ok") {
        basketMessage = `${afterCheck.name} now looks adequate.`;
      } else if (typeof beforeQuantity === "number" && typeof afterQuantity === "number" && afterQuantity > beforeQuantity) {
        basketMessage = `${afterCheck?.name ?? check.name} increased, but still looks short.`;
      } else {
        basketMessage = `I tried to increase ${check.name}, but Asda did not show a quantity change. Use Open product or adjust the basket quantity manually.`;
      }
    }
    render();
  }

  const basketStatusRank: Record<AsdaBasketCheckStatus, number> = { short: 0, missing: 1, unknown: 2, ok: 3 };

  function reviewableBasketChecks() {
    return basketChecks.filter((check) => check.status !== "ok").sort((a, b) => basketStatusRank[a.status] - basketStatusRank[b.status]);
  }

  function renderBasketVerifier(state: AsdaHelperState) {
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
        ${
          basketChecks.length
            ? `<small class="weekwise-note">${counts.ok} ok · ${counts.short} short · ${counts.missing} missing · ${counts.unknown} review</small>`
            : ""
        }
        ${
          reviewChecks.length
            ? `<div class="weekwise-basket-list">
                ${reviewChecks
                  .map(
                    (check, index) => `
                      <article class="weekwise-basket-card weekwise-basket-${check.status}">
                        <strong>${escapeHtml([check.displayQuantity, check.name].filter(Boolean).join(" "))}</strong>
                        <small>${escapeHtml(check.message)}</small>
                        ${check.basketLineName ? `<small>${escapeHtml(`Matched: ${check.basketLineName}`)}</small>` : ""}
                        <div class="weekwise-recommend-actions">
                          <button id="weekwise-basket-open-${index}" type="button">Open product</button>
                          <button id="weekwise-basket-plus-${index}" class="weekwise-primary" type="button" ${check.canIncrease ? "" : "disabled"}>Add one more</button>
                          <button id="weekwise-basket-ok-${index}" type="button">Looks ok</button>
                        </div>
                      </article>
                    `
                  )
                  .join("")}
              </div>`
            : basketChecks.length
              ? `<div class="weekwise-basket-card weekwise-basket-ok"><strong>All checked items look adequate</strong><small>Still review substitutions and freshness before checkout.</small></div>`
              : ""
        }
      </div>
    `;
  }

  function scoreProduct(item: AsdaHelperQueueItem, state: AsdaHelperState, product: AsdaProductCandidate) {
    let score = 0;
    const reasons: string[] = [];
    const warnings: string[] = [];
    const productName = normalizeText(product.name);
    const productText = normalizeText(`${product.name} ${product.rawText ?? ""}`);
    const targetName = normalizeText(item.canonicalName || item.name);
    const targetTokens = tokenize(item.canonicalName || item.name);
    const savedUrl = state.productLinks[item.shoppingKey] || item.savedProductUrl;

    if (savedUrl && absoluteUrl(savedUrl) === product.url) {
      score += 55;
      reasons.push("saved preference");
    }

    if (targetName && productName.includes(targetName)) {
      score += 45;
      reasons.push("best match");
    } else if (targetName && productText.includes(targetName)) {
      score += 28;
      reasons.push("best match");
    }

    const matchedTokens = targetTokens.filter((token) => productText.includes(token));
    score += matchedTokens.length * 10;
    score -= Math.max(0, targetTokens.length - matchedTokens.length) * 8;

    (item.avoidTerms ?? []).forEach((term) => {
      const cleanTerm = normalizeText(term);
      if (!cleanTerm) return;
      if (productName.includes(cleanTerm)) {
        score -= 80;
        warnings.push(`may be ${term}`);
      } else if (productText.includes(cleanTerm)) {
        score -= 35;
        warnings.push(`check ${term}`);
      }
    });

    if (product.available === false) {
      score -= 80;
      warnings.push("unavailable");
    }

    if (product.addable) score += 5;
    if (product.offerText) {
      score += 8;
      reasons.push("offer");
    }

    const required = toBaseQuantity(item.requiredQuantity ?? item.quantity, item.requiredUnit ?? item.unit);
    const offered = toBaseQuantity(product.quantity, product.unit);
    if (required && offered && required.family === offered.family && required.quantity > 0) {
      if (offered.quantity >= required.quantity) {
        const wasteRatio = (offered.quantity - required.quantity) / required.quantity;
        score += Math.max(0, 18 - wasteRatio * 8);
        if (wasteRatio <= 0.75) reasons.push("least waste");
      } else {
        score += 7;
        warnings.push("may need more than one pack");
      }
    }

    return { product, score, reasons: Array.from(new Set(reasons)), warnings: Array.from(new Set(warnings)) };
  }

  function recommendProducts(item: AsdaHelperQueueItem, state: AsdaHelperState) {
    const rejectedUrls = new Set(state.rejectedRecommendations?.[item.itemId] ?? []);
    const scored = scanVisibleProducts()
      .filter((product) => !rejectedUrls.has(product.url))
      .map((product) => scoreProduct(item, state, product))
      .filter((recommendation) => recommendation.score >= 20)
      .sort((a, b) => b.score - a.score);

    const pricedRecommendations = scored
      .map((recommendation) => ({ recommendation, unitPrice: unitPriceValue(recommendation.product) }))
      .filter((entry) => typeof entry.unitPrice === "number") as Array<{ recommendation: AsdaRecommendation; unitPrice: number }>;
    const cheapest = pricedRecommendations.sort((a, b) => a.unitPrice - b.unitPrice)[0]?.recommendation;

    if (cheapest) {
      cheapest.score += 8;
      if (!cheapest.reasons.includes("cheapest per kg")) cheapest.reasons.push("cheapest per kg");
      scored.sort((a, b) => b.score - a.score);
    }

    return scored.slice(0, 3);
  }

  function renderRecommendations(item: AsdaHelperQueueItem, state: AsdaHelperState) {
    const currentRecommendations = recommendationItemId === item.itemId ? recommendations : [];
    const savedRecommendation = state.lastRecommendations?.[item.shoppingKey];

    function productPriceSummary(product: AsdaProductCandidate) {
      const parts = [product.priceText, product.unitPriceText];
      const offerText = product.offerText?.trim();
      if (offerText && offerText.length < 80 && normalizeText(offerText) !== normalizeText(product.name)) parts.push(offerText);
      return parts.filter(Boolean).join(" · ") || "No visible price";
    }

    return `
      <div class="weekwise-recommend">
        <div class="weekwise-recommend-head">
          <strong>Product suggestions</strong>
          <button id="weekwise-scan-products" type="button">Scan visible products</button>
        </div>
        ${
          savedRecommendation
            ? `<small class="weekwise-note">Last saved: ${escapeHtml(savedRecommendation.productName)}${savedRecommendation.priceText ? ` · ${escapeHtml(savedRecommendation.priceText)}` : ""}</small>`
            : ""
        }
        <small class="weekwise-note">${escapeHtml(recommendationMessage || "Open the Asda search page, then scan the products currently visible on screen.")}</small>
        ${
          currentRecommendations.length
            ? `<div class="weekwise-recommend-list">
                ${currentRecommendations
                  .map(
                    (recommendation, index) => `
                      <article class="weekwise-recommend-card${recommendation.product.imageUrl ? "" : " weekwise-no-image"}">
                        ${recommendation.product.imageUrl ? `<img src="${escapeHtml(recommendation.product.imageUrl)}" alt="" />` : ""}
                        <div>
                          <strong>${escapeHtml(recommendation.product.name)}</strong>
                          <small>${escapeHtml(productPriceSummary(recommendation.product))}</small>
                          <small>${escapeHtml(recommendation.reasons.join(" · ") || "possible match")}${recommendation.warnings?.length ? ` · Check: ${escapeHtml(recommendation.warnings.join(", "))}` : ""}</small>
                          <div class="weekwise-recommend-actions">
                            <button id="weekwise-rec-open-${index}" type="button">Open</button>
                            <button id="weekwise-rec-save-${index}" class="weekwise-primary" type="button">Remember</button>
                            <button id="weekwise-rec-reject-${index}" type="button">Reject</button>
                          </div>
                        </div>
                      </article>
                    `
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    `;
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
    document.getElementById("weekwise-verify-basket")?.addEventListener("click", async () => {
      if (!state) return;
      if (!isBasketPage()) {
        basketMessage = "Opening Asda basket...";
        render();
        await sendMessage({ type: "OPEN_BASKET" });
        return;
      }

      verifyBasket(state);
      render();
    });
    reviewableBasketChecks().forEach((check, index) => {
      document.getElementById(`weekwise-basket-open-${index}`)?.addEventListener("click", () => {
        window.location.href = check.basketProductUrl || check.openUrl;
      });
      document.getElementById(`weekwise-basket-plus-${index}`)?.addEventListener("click", () => {
        void addOneMoreForCheck(check);
      });
      document.getElementById(`weekwise-basket-ok-${index}`)?.addEventListener("click", () => {
        basketChecks = basketChecks.map((candidate) => (candidate.itemId === check.itemId ? { ...candidate, status: "ok", message: "Marked as adequate after review." } : candidate));
        basketMessage = "Marked item as adequate.";
        render();
      });
    });
    document.getElementById("weekwise-scan-products")?.addEventListener("click", () => {
      if (!item || !state) return;
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
        if (!item) return;
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
        if (!item) return;
        await sendMessage({ type: "REJECT_RECOMMENDATION", itemId: item.itemId, productUrl: recommendation.product.url });
        recommendations = recommendations.filter((_, recommendationIndex) => recommendationIndex !== index);
        recommendationMessage = recommendations.length ? "Removed that suggestion." : "Removed that suggestion. Scan again to look for alternatives.";
        await refresh();
      });
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
