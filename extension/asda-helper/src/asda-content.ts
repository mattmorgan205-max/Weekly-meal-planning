(() => {
  let latestState: AsdaHelperState | undefined;
  let collapsed = false;
  let recommendations: AsdaRecommendation[] = [];
  let recommendationItemId = "";
  let recommendationMessage = "";
  let basketChecks: AsdaBasketCheck[] = [];
  let basketLines: Array<AsdaBasketLine & { element?: HTMLElement }> = [];
  let basketMessage = "";
  let scanProducts: string[] = [];
  let checkedQueueDate: string | undefined;
  let checkedBasket: string | undefined;
  let checkedWithCount = false;
  let checkedLayout = "";
  let increasing: string | undefined;
  const approved = new Set<string>();
  const reviewEvidence = new Map<string, string>();
  let checkTimer: number | undefined;
  let scanGeneration = 0;
  let confirmVisibleSignature: string | undefined;
  type ChoiceGroup = { products: AsdaProductCandidate[]; selected?: number; error?: string };
  let choiceGroups = new Map<string, ChoiceGroup>();
  let findingChoices = false;

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
    return (element instanceof HTMLButtonElement && element.disabled) || element.getAttribute("aria-disabled") === "true";
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

  function comparableToken(token: string) {
    if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
    if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1);
    return token;
  }

  function exactItemNameMatch(requiredName: string, productName: string) {
    if (!compatibleAsdaVariant(requiredName, productName)) return false;
    const requiredTokens = tokenize(requiredName.replace(glutenFreeLabel, "gluten free")).map(comparableToken);
    const productTokens = new Set(tokenize(productName.replace(glutenFreeLabel, "gluten free")).map(comparableToken));
    return requiredTokens.length > 0 && requiredTokens.every((token) => productTokens.has(token));
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

  const approximateProduceWeightGrams: Record<string, number> = {
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

  function approximateItemWeight(name: string) {
    const normalizedName = normalizeText(name);
    return Object.entries(approximateProduceWeightGrams)
      .sort(([first], [second]) => second.length - first.length)
      .find(([ingredientName]) => normalizedName.includes(ingredientName))?.[1];
  }

  function productCoverage(item: AsdaHelperQueueItem, product: AsdaProductCandidate) {
    const offered = toBaseQuantity(product.quantity, product.unit);
    let required = toBaseQuantity(item.requiredQuantity ?? item.quantity, item.requiredUnit ?? item.unit);
    let estimated = false;
    if (!required || !offered || required.quantity <= 0 || offered.quantity <= 0) return null;

    if (required.family !== offered.family) {
      const approximateWeight = approximateItemWeight(item.canonicalName || item.name);
      if (required.family !== "count" || offered.family !== "weight" || !approximateWeight) return null;
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
      const name = withDietBadge(firstUsefulLine(image?.alt || anchor.getAttribute("aria-label") || visibleText(anchor) || rawText), container);
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
      button.click();
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
    if (input) return /^\d+$/.test(input.value) ? Number(input.value) : undefined;

    const select = quantitySelect(container);
    if (select) return /^\d+$/.test(select.value) ? Number(select.value) : undefined;

    const explicitCount = /\b(?:qty|quantity)(?:\s+of)?\s*:?\s*(\d+)(?![\d.,])\b(?!\s*(?:kg|g|ml|l)\b)/i;
    for (const el of container.querySelectorAll<HTMLElement>("[aria-label], [data-testid], [data-auto-id], [title]")) {
      if (!elementVisible(el) || insideWeekwiseHelper(el)) continue;
      const label = controlLabel(el);
      if (!/qty|quantity/i.test(label)) continue;
      const value = visibleText(el);
      if (/^\d+$/.test(value)) return Number(value);
      const match = explicitCount.exec(el.getAttribute("aria-label") || el.getAttribute("title") || "");
      if (match) return Number(match[1]);
    }
    const minus = visibleEnabledControls(container).find(el => /decrease|decrement|minus|remove one|^[-−]$/.test(controlLabel(el)));
    const stepper = minus?.parentElement;
    if (stepper && findIncreaseButton(stepper)) {
      const number = Array.from(stepper.querySelectorAll<HTMLElement>("span,button,output")).find(el => elementVisible(el) && /^\d+$/.test(visibleText(el)));
      if (number) return Number(visibleText(number));
    }
    const match = explicitCount.exec(visibleText(container));
    if (match) return Number(match[1]);

    return undefined;
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

  function findBasketContainer(anchor: HTMLAnchorElement, root: HTMLElement) {
    let current: HTMLElement | null = anchor;
    for (let depth = 0; current && current !== root && depth < 12; depth += 1) {
      const text = visibleText(current);
      const urls = new Set(Array.from(current.querySelectorAll<HTMLAnchorElement>("a[href*='/product/']")).map(link => new URL(link.href).pathname));
      if (urls.size > 1) break;
      const hasQuantityControl = quantityInput(current) || quantitySelect(current) ||
        visibleEnabledControls(current).some(button => /decrease|decrement|remove|minus|^[-−]$/.test(controlLabel(button)));
      const looksLikeBasketLine = urls.size === 1 && (hasQuantityControl ||
        current.matches("[data-testid*='trolley-item' i], [data-auto-id*='trolley-item' i], [data-testid*='basket-item' i]") ||
        /\b(remove|save for later|(?:qty|quantity)\s*:?\s*\d+)\b/i.test(text));

      if (looksLikeBasketLine) return current;
      current = current.parentElement;
    }

    return null;
  }

  const nonBasketArea = "nav, body > header, [role=banner], footer, #weekwise-asda-helper, [aria-label*='recommend' i], [aria-label*='you may also like' i], [data-testid*='recommend' i], [data-auto-id*='recommend' i], [data-testid*='carousel' i], [data-auto-id*='carousel' i]";
  const trolleyRow = "[data-testid='trolley-item' i],[data-auto-id='trolley-item' i],[data-testid='basket-item' i],[data-auto-id='basket-item' i]";

  function trolleyRoot() {
    const dialog = Array.from(document.querySelectorAll<HTMLElement>("dialog[open], [role=dialog]")).find(el => {
      const heading = el.querySelector("h1,h2,[role=heading]");
      const labelled = el.getAttribute("aria-labelledby")?.split(/\s+/).map(id => document.getElementById(id)?.textContent).join(" ");
      return elementVisible(el) && /\b(trolley|basket)\b/i.test(el.getAttribute("aria-label") || labelled || heading?.textContent || "");
    });
    return dialog ?? document.querySelector<HTMLElement>("main, [role=main]") ?? document.body;
  }

  function productKey(href: string) {
    try {
      const url = new URL(href, location.origin);
      return url.origin + url.pathname.replace(/\/$/, "");
    } catch { return ""; }
  }

  function scanTrolley() {
    const root = trolleyRoot();
    const visible = (selector: string) => Array.from(root.querySelectorAll<HTMLElement>(selector))
      .filter(el => !root.contains(el.closest(nonBasketArea)) && elementVisible(el));
    const anchors = visible("a[href*='/product/']") as HTMLAnchorElement[];
    const lines = new Map<string, AsdaBasketLine & { element: HTMLElement }>();
    const record = (container: HTMLElement, name: string, url?: string) => {
      const rawText = visibleText(container);
      name = withDietBadge(firstUsefulLine(name), container);
      const lineQuantity = extractBasketLineQuantity(container);
      const packText = rawText.replace(/(?:\/|\bper)\s*(?:100\s*)?(?:kg|g|ml|l)\b/gi, "");
      const packQuantity = extractProductQuantity(name) ?? extractProductQuantity(packText);
      const totalQuantity = lineQuantity !== undefined && packQuantity ? packQuantity.quantity * lineQuantity : lineQuantity;
      const totalUnit = packQuantity?.unit ?? "item";

      lines.set(url || normalizeText(name), {
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
    };
    for (const anchor of anchors) {
      const url = productKey(anchor.href);
      if (lines.has(url)) continue;
      const container = findBasketContainer(anchor, root);
      if (container) record(container, container.querySelector<HTMLImageElement>("img")?.alt ||
        anchor.getAttribute("aria-label") || visibleText(anchor) || visibleText(container), url);
    }
    let unreadRows = 0;
    const names = new Set(Array.from(lines.values(), line => normalizeText(line.name)));
    const rows = visible(trolleyRow);
    for (const candidate of visible("article, li")) {
      if (!candidate.closest(trolleyRow) && !candidate.querySelector("article, li, " + trolleyRow) &&
          visibleEnabledControls(candidate).some(control => /\bremove\b.*\b(?:trolley|basket)\b/i.test(controlLabel(control)))) rows.push(candidate);
    }
    for (const row of rows) {
      const links = Array.from(row.querySelectorAll<HTMLAnchorElement>("a[href*='/product/']"));
      if (links.some(a => lines.has(productKey(a.href)))) continue;
      const title = row.querySelector("[data-testid*='product-name' i], [data-auto-id*='product-name' i], [data-auto-id*='productname' i], [itemprop=name], h2, h3, h4, [role=heading]");
      const name = visibleText(title) || row.querySelector<HTMLImageElement>("img[alt]")?.alt || "";
      const key = normalizeText(withDietBadge(firstUsefulLine(name), row));
      // An unlinked row must have a distinct product identity. Don't count duplicates by position.
      if (!key || names.has(key) || links.length) { unreadRows++; continue; }
      record(row, name);
      names.add(key);
    }
    const unreadLinks = new Set(anchors.map(a => productKey(a.href)).filter(url => !lines.has(url))).size;
    const products = Array.from(lines.values());
    const layout = JSON.stringify([products.map(line => JSON.stringify([line.url, line.name, line.packQuantity, line.packUnit])).sort(),
      Array.from(new Set(anchors.map(a => productKey(a.href)))).sort(), unreadRows]);
    return { lines: products, layout, readiness: basketReadiness(root, visible, products, unreadRows, unreadLinks) };
  }

  function basketSignature(lines: AsdaBasketLine[]) {
    return JSON.stringify(lines.map(line => JSON.stringify([line.url, line.name, line.lineQuantity,
      line.packQuantity, line.packUnit, line.totalQuantity, line.totalUnit])).sort());
  }

  function stopBasketWatch() {
    scanProducts = [];
    scanGeneration++;
    confirmVisibleSignature = undefined;
    basketObserver.disconnect();
    window.clearTimeout(checkTimer);
    checkTimer = undefined;
    checkedBasket = undefined;
  }

  function checkStillCurrent() {
    if (checkedBasket === undefined) return false;
    const {lines, readiness, layout} = scanTrolley();
    if (isBasketPage() && !readiness.blocked && (readiness.countKnown || (!checkedWithCount && layout === checkedLayout)) &&
        basketSignature(lines) === checkedBasket) {
      basketLines = lines;
      return true;
    }
    if (latestState && isBasketPage()) void verifyBasket(latestState, undefined, true);
    else render();
    return false;
  }

  function scheduleBasketCheck() {
    if (checkedBasket === undefined || checkTimer !== undefined) return;
    checkTimer = window.setTimeout(() => {
      checkTimer = undefined;
      checkStillCurrent();
    }, 250);
  }

  const basketObserver = new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return target && !insideWeekwiseHelper(target);
    })) scheduleBasketCheck();
  });
  for (const event of ["input", "change"]) document.addEventListener(event, e => {
    if (e.target instanceof Element && !insideWeekwiseHelper(e.target)) scheduleBasketCheck();
  }, true);
  window.addEventListener("focus", scheduleBasketCheck);
  document.addEventListener("visibilitychange", scheduleBasketCheck);

  function lineMatchScore(item: AsdaHelperQueueItem, state: AsdaHelperState, line: AsdaBasketLine) {
    let score = 0;
    const productText = normalizeText(`${line.name} ${line.rawText ?? ""}`.replace(glutenFreeLabel, "gluten free"));
    const targetName = normalizeText(item.name.replace(glutenFreeLabel, "gluten free"));
    const savedUrl = state.productLinks[item.shoppingKey] || item.savedProductUrl;

    if (savedUrl && line.url && absoluteUrl(savedUrl) === line.url) score += 100;
    if (targetName && productText.includes(targetName)) score += 40;

    tokenize(item.name).forEach((token) => {
      if (productText.includes(token)) score += 12;
      else score -= 8;
    });

    (item.avoidTerms ?? []).forEach((term) => {
      if (productText.includes(normalizeText(term))) score -= 50;
    });

    return score;
  }

  // Remaining capacity is a fraction of each trolley line, so a weight claim and
  // a pack-count claim cannot both spend the same product.
  function allocateBasket(state: AsdaHelperState, lines: AsdaBasketLine[]): AsdaBasketCheck[] {
    const items = state.queue!.items;
    const rows = items.map(item => {
      const amount = item.requiredQuantity ?? item.quantity;
      const required = toBaseQuantity(amount, item.requiredUnit ?? item.unit);
      const display = (item.displayQuantity ?? "").trim().toLowerCase();
      const presence = amount == null && !/\d/.test(display) && (!display ||
        display === (item.requiredUnit ?? item.unit)?.toLowerCase() || /^(?:as needed|as required|to taste|unspecified|optional)$/.test(display));
      return { item, required, presence, used: 0, present: false, candidates: [] as AsdaBasketLine[],
        assigned: [] as AsdaBasketLine[], variant: false, uncertain: false };
    });
    const remaining = lines.map(() => 1);
    const edges = rows.flatMap((row, r) => lines.flatMap((line, l) => {
      const score = lineMatchScore(row.item, state, line);
      const saved = state.productLinks[row.item.shoppingKey] || row.item.savedProductUrl;
      const exactUrl = Boolean(saved && line.url && productKey(absoluteUrl(saved)) === line.url);
      const exactName = exactItemNameMatch(row.item.name, line.name);
      if (!exactUrl && !exactName && score < 20) return [];
      if (!compatibleAsdaVariant(row.item.name, line.name) ||
          row.item.avoidTerms?.some(term => normalizeText(line.name).includes(normalizeText(term)))) { row.variant = true; return []; }
      if (!exactUrl && !exactName) { row.uncertain = true; return []; }
      if (line.lineQuantity === 0) return [];
      row.candidates.push(line);
      return [{ r, l, rank: exactUrl ? 2 : 1, specificity: tokenize(row.item.name).length, score }];
    })).sort((a,b) => b.rank - a.rank || b.specificity - a.specificity ||
      Number(rows[a.r].presence) - Number(rows[b.r].presence) || b.score - a.score || a.r - b.r || a.l - b.l);

    for (const { r, l } of edges) {
      const row = rows[r], line = lines[l], left = remaining[l];
      if (left <= 1e-9) continue;
      if (row.presence) {
        if (row.present) continue;
        const pack = 1 / (line.lineQuantity || 1);
        if (left + 1e-9 < pack) continue;
        remaining[l] = Math.max(0, left - pack);
        row.present = true;
      } else {
        const req = row.required;
        if (!req || row.used >= req.quantity - 1e-9) continue;
        const packRequested = /^(?:pack|tin|can)s?$/i.test(row.item.requiredUnit ?? row.item.unit ?? "");
        const capacity = req.family === "count" && (packRequested || line.totalUnit !== "item")
          ? toBaseQuantity(line.lineQuantity, "item") : toBaseQuantity(line.totalQuantity, line.totalUnit);
        if (!capacity || capacity.family !== req.family || !(capacity.quantity > 0)) { row.uncertain = true; continue; }
        const take = Math.min(req.quantity - row.used, capacity.quantity * left);
        remaining[l] = Math.max(0, left - take / capacity.quantity);
        row.used += take;
      }
      row.assigned.push(line);
    }
    return rows.map(({ item, required, presence, used, present, candidates, assigned, variant, uncertain }) => {
      const line = assigned[0] ?? candidates[0];
      const enough = present || Boolean(required && used + 1e-9 >= required.quantity && candidates.length);
      const status: AsdaBasketCheckStatus = enough ? "ok" : uncertain || (!candidates.length && variant) || (line && !required) ? "unknown" : line ? "short" : "missing";
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
        basketProductUrl: line?.url, basketLineIndex: line?.index, canIncrease: status === "short" && Boolean(line?.url) && line?.canIncrease,
        openUrl: state.productLinks[item.shoppingKey] || item.savedProductUrl || item.searchUrl, status, message };
    });
  }

  function basketReadiness(root: HTMLElement, visible: (selector: string) => HTMLElement[], lines: AsdaBasketLine[], unreadRows: number, unreadLinks: number) {
    const busy = root.getAttribute("aria-busy") === "true" ||
      visible("[aria-busy=true], [role=progressbar]:not([aria-valuenow]), [data-testid*='skeleton' i], [data-auto-id*='skeleton' i]").some(el =>
        !el.closest("[aria-label*='delivery' i], [data-testid*='delivery' i], [aria-label*='saving' i], [data-testid*='saving' i]"));
    const more = visible("button, a, [role=button]").find(el => {
      if (buttonDisabled(el)) return false;
      const label = (el.getAttribute("aria-label") || visibleText(el)).trim();
      if (/^(?:load|show|view) more (?:trolley |basket )?(?:items|products)$/i.test(label)) return true;
      if (el.getAttribute("rel") !== "next" && !/^(?:(?:show|load|view) more|next page)$/i.test(label)) return false;
      // A bare "Show more" in delivery details or an offer description isn't trolley pagination.
      const context = el.closest("section, [role=region], main, [role=main], [role=dialog]") ?? el.parentElement;
      return context?.querySelector("a[href*='/product/'], " + trolleyRow);
    });
    const group = visible("button[aria-expanded=false][aria-controls]").find(button => {
      if (buttonDisabled(button)) return false;
      const section = document.getElementById(button.getAttribute("aria-controls") ?? "");
      return section && root.contains(section) && !section.closest(nonBasketArea) &&
        section.querySelector("a[href*='/product/'], " + trolleyRow) && !elementVisible(section);
    });

    const packs = lines.every(line => line.lineQuantity !== undefined) ?
      lines.reduce((sum, line) => sum + line.lineQuantity!, 0) : undefined;
    let countKnown = false, mismatch = "";
    for (const el of visible("h1,h2,h3,[role=heading],[data-testid*='count' i],[data-auto-id*='count' i],[data-testid*='empty' i],[data-auto-id*='empty' i],[aria-label*='trolley' i],[aria-label*='basket' i],p,[role=status]")) {
      const label = (el.getAttribute("aria-label") || visibleText(el)).trim();
      if (label.length > 120) continue;
      const empty = /^(?:your |the )?(?:basket|trolley) is (?:currently )?empty[.!]?$/i.test(label);
      const count = /(?:trolley|basket)(?:\s+contains)?\s*[:(,\-]?\s*(\d+)\s*(items?|products?)\b|^(\d+)\s*(items?|products?)\s+in (?:your |the )?(?:basket|trolley)\b/i.exec(label);
      // Individual departments also say "3 items". Only use a bare count explicitly labelled as a trolley total.
      const bare = /(?:basket|trolley)/i.test([el.getAttribute("data-testid"), el.getAttribute("data-auto-id")].join(" ")) ?
        /^(\d+)\s*(items?|products?)$/i.exec(label) : null;
      if (!empty && !count && !bare) continue;
      const n = empty ? 0 : Number(count?.[1] ?? count?.[3] ?? bare?.[1]);
      const unit = count?.[2] ?? count?.[4] ?? bare?.[2] ?? "products";
      if (n === lines.length || (!empty && /^items?/i.test(unit) && packs === n)) countKnown = true;
      else if (empty || /^product/i.test(unit) || packs !== undefined || n < lines.length)
        mismatch = "ASDA shows " + n + " " + unit + ".";
    }
    const unresolved = unreadRows + unreadLinks;
    // A reconciled total can coexist with stray product links (e.g. an advert).
    // Ask for confirmation in that case; never override an unread trolley row or a conflicting total.
    const ambiguousLinks = unreadLinks > 0 && countKnown && lines.length > 0 && !unreadRows;
    const reason = busy ? "The trolley is still loading. Wait for it to finish, then verify again." :
      more || group ? "Open the remaining trolley items or sections, then verify again." :
      mismatch ? mismatch + " Show the full product list, then verify again." :
      unresolved && !ambiguousLinks ? "Some product rows could not be identified. Expand the product list and verify again." :
      !lines.length && !countKnown ? "Open the full trolley. No product rows or empty-trolley notice were found." : "";
    return { blocked: Boolean(reason), reason, countKnown: countKnown && !ambiguousLinks, group, more, busy, mismatch };
  }

  function applyBasketCheck(state: AsdaHelperState, lines: AsdaBasketLine[]) {
    basketChecks = allocateBasket(state, lines).map((check, index) => {
      const item = state.queue!.items[index];
      const matches = lines.filter(line => exactItemNameMatch(item.name, line.name) ||
        (line.url && line.url === check.basketProductUrl) || lineMatchScore(item, state, line) >= 20);
      const evidence = JSON.stringify([check.status, check.basketQuantity, check.requiredQuantity, check.requiredUnit,
        basketSignature(matches)]);
      if (reviewEvidence.get(check.itemId) !== evidence) {
        approved.delete(check.itemId);
        choiceGroups.delete(check.itemId);
      }
      reviewEvidence.set(check.itemId, evidence);
      return approved.has(check.itemId) ? { ...check, status: "ok", message: "Marked as adequate after review." } : check;
    });
  }

  async function verifyBasket(state: AsdaHelperState, confirmed?: string, live = false) {
    const trustedLayout = live && !checkedWithCount ? checkedLayout : undefined;
    stopBasketWatch();
    const generation = scanGeneration;
    checkedQueueDate = state.queue?.createdAt;
    // Cancel in-flight choice searches; keep completed decisions until the new evidence is compared.
    choiceGroups = new Map(choiceGroups); findingChoices = false;
    if (!state.queue?.items.length || !isBasketPage()) {
      basketMessage = "Open the Asda trolley and import a shopping list first.";
      render(); return false;
    }
    basketMessage = live ? "Updating trolley quantities..." : "Reading your trolley...";
    render();
    let previous: string | undefined;
    const expanded = new Set<string>();
    const openedGroups = new Set<string>();
    let progress = "", idleSince = performance.now();
    const deadline = idleSince + 25000;
    while (true) {
      if (generation !== scanGeneration || latestState?.queue?.createdAt !== checkedQueueDate || !isBasketPage()) return false;
      const {lines, readiness, layout} = scanTrolley();
      const sig = basketSignature(lines);
      const observed = sig + readiness.reason;
      if (observed !== progress) { progress = observed; idleSince = performance.now(); }
      // Expand inline product lists only. Never follow pagination or press a basket action.
      const more = readiness.more;
      const group = readiness.group;
      if (!live && !readiness.busy && group instanceof HTMLButtonElement && (!group.form || group.type === "button")) {
        const id = group.getAttribute("aria-controls")!;
        if (!openedGroups.has(id)) { openedGroups.add(id); group.click(); }
      } else if (!live && !readiness.busy && more instanceof HTMLButtonElement && (!more.form || more.type === "button") && !expanded.has(sig) &&
          /^(?:load|show|view) more (?:trolley |basket )?(?:items|products)$/i.test((more.getAttribute("aria-label") || visibleText(more)).trim())) {
        expanded.add(sig);
        more.click();
      }
      if (!live && readiness.mismatch && !readiness.busy && !more && !group && !expanded.has(sig) && lines.length) {
        // A lazy-loaded trolley may not request the next rows until its last product is on screen.
        expanded.add(sig);
        lines[lines.length - 1].element?.scrollIntoView({ block: "nearest", behavior: "instant" });
      }
      if (!readiness.blocked && sig === previous) {
        if (!readiness.countKnown && confirmed !== sig && trustedLayout !== layout) {
          basketLines = []; basketChecks = [];
          confirmVisibleSignature = sig;
          scanProducts = lines.map(line => line.name);
          basketMessage = "Read " + lines.length + " distinct trolley products. Confirm only if the products below match your full trolley.";
          render(); return false;
        }
        checkedBasket = sig; checkedWithCount = readiness.countKnown; checkedLayout = layout; basketLines = lines;
        basketObserver.observe(document.body, { childList:true, subtree:true, characterData:true, attributes:true });
        applyBasketCheck(state, lines);
        basketMessage = "Trolley checked.";
        render(); return true;
      }
      previous = readiness.blocked ? undefined : sig;
      if (performance.now() - idleSince >= 4500 || performance.now() >= deadline) {
        basketLines = []; basketChecks = [];
        scanProducts = lines.map(line => line.name);
        const covered = lines.length ? allocateBasket(state, lines).filter(check => check.status === "ok").length : 0;
        basketMessage = "Partial scan: read " + lines.length + " distinct product" + (lines.length === 1 ? ". " : "s. ") +
          (readiness.reason || "The trolley kept changing. Verify again when it settles.") +
          (lines.length ? " These products cover " + covered + " of " + state.queue.items.length + " shopping-list entries." : "") +
          " Nothing marked missing or short.";
        render(); return false;
      }
      await wait(350);
    }
  }

  async function addOneMoreForCheck(check: AsdaBasketCheck) {
    const line = check.basketProductUrl ? basketLines.find(entry => entry.url === check.basketProductUrl) : undefined;
    if (!line?.element) {
      basketMessage = "Could not find a safe quantity increase button for that basket line.";
      render();
      return;
    }

    if (increasing !== undefined) return;
    const shop = checkedQueueDate;
    increasing = check.itemId;
    basketMessage = "Updating " + check.name + "...";
    render();
    try {
      if (!await increaseQuantityControl(line.element)) {
        basketMessage = "Could not increase that quantity. Adjust it in the trolley.";
        return;
      }
      checkStillCurrent();
      await wait(1800);
      if (shop !== checkedQueueDate || !checkStillCurrent()) return;
      const updated = basketChecks.find(row => row.itemId === check.itemId);
      if (updated?.basketQuantity === check.basketQuantity && updated?.status === check.status)
        basketMessage = "ASDA has not confirmed the increase. Check the trolley quantity before adding again.";
    } finally {
      if (shop === checkedQueueDate) { increasing = undefined; render(); }
    }
  }

  const basketStatusRank: Record<AsdaBasketCheckStatus, number> = { short: 0, missing: 1, unknown: 2, ok: 3 };

  function reviewableBasketChecks() {
    return basketChecks.filter((check) => check.status !== "ok").sort((a, b) => basketStatusRank[a.status] - basketStatusRank[b.status]);
  }

  function remainingShopBrief(state: AsdaHelperState) {
    if (!isBasketPage() || !state.queue || checkedQueueDate !== state.queue.createdAt) return "";
    const items = new Map(state.queue.items.map(item => [item.itemId, item]));
    const rows = reviewableBasketChecks().flatMap(check => {
      const item = items.get(check.itemId);
      if (!item) return [];
      const group = choiceGroups.get(check.itemId);
      if (group?.selected === -1) return [];
      const need = check.displayQuantity || displayBaseQuantity(check.requiredQuantity, check.requiredUnit) || "unspecified";
      const row = [check.name, `Total needed: ${need}`];
      if (group && group.selected === undefined) row.push("Awaiting shopper decision; do not add independently.");
      const chosen = group?.selected !== undefined && group.products[group.selected];
      if (chosen) row.push(`My choice for this shop only: ${chosen.name} (${chosen.url}). Use this exact product or leave unresolved.`);
      if (check.status === "missing") {
        row.push("Missing from visible trolley", `Outstanding if still absent: ${need}`);
      } else if (check.status === "short" && check.requiredQuantity !== undefined && check.basketQuantity !== undefined &&
                 check.requiredUnit === check.basketUnit) {
        row.push(`In trolley: ${displayBaseQuantity(check.basketQuantity, check.basketUnit)}`,
          `Short by: ${displayBaseQuantity(check.requiredQuantity - check.basketQuantity, check.requiredUnit)}`);
      } else {
        row.push("Uncertain: verify matched product and quantity; shortfall unknown");
        if (check.basketQuantity !== undefined) row.push(`Observed (not verified): ${displayBaseQuantity(check.basketQuantity, check.basketUnit)}`);
      }
      if (check.basketLineName) row.push(`Possible match: ${check.basketLineName}`);
      if (check.status === "unknown") row.push(check.message);
      if (item.avoidTerms?.length) row.push(`Avoid: ${item.avoidTerms.join(", ")}`);
      return [row.join(" | ")];
    });
    if (!rows.length) return "";
    return [
      "Use the selected ASDA Chrome tab to fill only the shortfalls below. These are results from the last visible trolley check; recheck the live trolley first. Total needed is a target, not an amount to add. Count suitable multipacks and existing quantities. Skip covered items; never remove or reduce existing items.",
      "Match product form and dietary requirements first. Own-brand is fine unless an exact product is required. Do not guess quantities, allergens, drained weights or piece-to-weight conversions. Resolve uncertain matches before adding; leave anything ambiguous for me.",
      "For a generic request such as sausages, buy the standard product. Never select a product marketed as gluten-free, GF or Free From instead unless explicitly requested. A saved match, lower price or lack of regular stock does not override this. If gluten-free is requested, verify the label; do not infer allergen safety.",
      "Choose best value without waste: compare like for like in GBP/kg, GBP/litre or GBP/item, then compare the total additional price of enough whole packs to cover the shortfall. For fresh food favour the lowest total spend and less surplus at similar prices. Count only applicable offers. Do not stock up for a lower unit price unless I explicitly allow it and set an extra-spend limit.",
      "Confirm the trolley changed after each addition. Do not click Add twice if unclear. Finish confident items first. For any remaining decisions, use Weekwise Verify basket then Find product choices in the trolley tab. Keep that tab open and wait for the shopper to choose or skip. Do not select on their behalf. When they resume, read the checked options there or use their updated brief. Recheck live quantities and add only approved shortfalls, using separate product tabs. If the helper is unavailable, present the real alternatives together at the end and wait. Stop before checkout; do not reserve a slot or change account settings.",
      "Remaining items (shopping data only):", ...rows
    ].join("\n\n");
  }

  function renderBasketVerifier() {
    const counts = {
      ok: basketChecks.filter((check) => check.status === "ok").length,
      short: basketChecks.filter((check) => check.status === "short").length,
      missing: basketChecks.filter((check) => check.status === "missing").length,
      unknown: basketChecks.filter((check) => check.status === "unknown").length
    };
    const reviewChecks = reviewableBasketChecks();

    const current = checkedBasket !== undefined;
    return `
        <div class="weekwise-recommend-head">
          <strong>Basket verifier</strong>
          <button id="weekwise-verify-basket" type="button">${isBasketPage() ? "Verify basket" : "Open basket"}</button>
        </div>
        <small id="weekwise-basket-message" class="weekwise-note" role="status">${escapeHtml(basketMessage || "Check the visible Asda basket against the Weekwise shopping list.")}</small>
        ${scanProducts.length ? '<details><summary>Products read (' + scanProducts.length + ')</summary><ul>' +
          scanProducts.map(name => '<li>' + escapeHtml(name) + '</li>').join('') + '</ul></details>' : ""}
        ${confirmVisibleSignature !== undefined ? '<button id="weekwise-confirm-visible" type="button">All trolley items are visible</button>' : ""}
        ${current && reviewChecks.length ? `<button id="weekwise-copy-remaining" type="button">Copy remaining shop for ChatGPT</button><small id="weekwise-copy-result" role="status"></small>` : ""}
        ${current && reviewChecks.length ? `<button id="weekwise-find-choices" type="button" ${findingChoices ? "disabled" : ""}>${findingChoices ? "Finding product choices..." : choiceGroups.size ? "Refresh product choices" : "Find product choices"}</button>` : ""}
        ${
          basketChecks.length
            ? `<small id="weekwise-basket-counts" class="weekwise-note">${counts.ok} ok · ${counts.short} short · ${counts.missing} missing · ${counts.unknown} review</small>`
            : ""
        }
        ${
          reviewChecks.length
            ? `<div class="weekwise-basket-list" aria-busy="${!current}">
                ${reviewChecks
                  .map(
                    (check) => `
                      <article data-item-id="${escapeHtml(check.itemId)}" class="weekwise-basket-card weekwise-basket-${check.status}">
                        <strong>${escapeHtml([check.displayQuantity, check.name].filter(Boolean).join(" "))}</strong>
                        <small>${escapeHtml(check.message)}</small>
                        ${check.basketLineName ? `<small>${escapeHtml(`Matched: ${check.basketLineName}`)}</small>` : ""}
                        ${renderChoiceGroup(check)}
                        <div class="weekwise-recommend-actions">
                          <button data-action="open" type="button">Open product</button>
                          <button data-action="plus" class="weekwise-primary" type="button" ${check.canIncrease && increasing !== check.itemId ? "" : "disabled"}>Add one more</button>
                          <button data-action="ok" type="button">Looks ok</button>
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
    `;
  }

  function renderChoiceGroup(check: AsdaBasketCheck) {
    const group = choiceGroups.get(check.itemId);
    if (!group) return "";
    const labels = group.products.map(p => [p.name, p.packSizeText, p.priceText, p.unitPriceText].filter(Boolean).join(" · "));
    return `<fieldset class="weekwise-choices"><legend>Choose for this shop</legend>
      ${labels.length ? "" : `<small>${escapeHtml(group.error || "No suitable products found. Review manually or skip.")}</small>`}
      ${[...labels, "Skip this item"].map((label, i) => {
        const value = i === labels.length ? -1 : i;
        return `<label><input type="radio" name="weekwise-choice-${escapeHtml(check.itemId)}" value="${value}" ${group.selected === value ? "checked" : ""}> ${escapeHtml(label)}</label>`;
      }).join("")}</fieldset>`;
  }

  async function findChoices() {
    if (findingChoices || !checkStillCurrent()) return;
    const groups = new Map(choiceGroups);
    choiceGroups = groups;
    findingChoices = true;
    render();
    try {
      for (const check of reviewableBasketChecks()) {
        if (groups !== choiceGroups) break;
        const response = await sendMessage({type:"FIND_REVIEW_CHOICES", itemId:check.itemId});
        if (groups !== choiceGroups) break;
        if (!basketChecks.some(row => row.itemId === check.itemId && row.status !== "ok")) continue;
        const previous = groups.get(check.itemId);
        const url = previous?.selected !== undefined ? previous.products[previous.selected]?.url : undefined;
        const products = response.choices ?? [];
        const index = products.findIndex(product => product.url === url);
        groups.set(check.itemId, { products, error:response.error, selected:previous?.selected === -1 ? -1 : index >= 0 ? index : undefined });
        document.getElementById("weekwise-copy-result")?.replaceChildren();
        render();
      }
    } finally {
      if (groups === choiceGroups) { findingChoices = false; render(); }
    }
  }

  function scoreProduct(item: AsdaHelperQueueItem, state: AsdaHelperState, product: AsdaProductCandidate) {
    let score = 0;
    const reasons: string[] = [];
    const warnings: string[] = [];
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

    const coverage = productCoverage(item, product);
    if (coverage) {
      if (coverage.offered.quantity >= coverage.required.quantity) {
        const wasteRatio = (coverage.offered.quantity - coverage.required.quantity) / coverage.required.quantity;
        score += Math.max(0, 18 - wasteRatio * 8);
        if (wasteRatio <= 0.75) reasons.push("least waste");
      } else {
        score += 7;
        warnings.push(`buy ${coverage.packCount} packs`);
      }
    }

    return { product, score, reasons: Array.from(new Set(reasons)), warnings: Array.from(new Set(warnings)) };
  }

  function recommendProducts(item: AsdaHelperQueueItem, state: AsdaHelperState, products = scanVisibleProducts()) {
    const rejectedUrls = new Set(state.rejectedRecommendations?.[item.itemId] ?? []);
    const scored = products
      .filter(product => compatibleAsdaVariant(item.name, product.name))
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

    function productPurchaseSummary(product: AsdaProductCandidate) {
      const coverage = productCoverage(item, product);
      const requiredText = item.displayQuantity ? `${item.displayQuantity} ${item.name}` : `${item.name} (quantity not specified)`;
      if (!coverage) return `<small>Need ${escapeHtml(requiredText)}</small>`;

      return `<small class="weekwise-purchase-amount"><strong>Buy ${escapeHtml(coverage.display)}</strong> · Need ${escapeHtml(requiredText)}${coverage.estimated ? " · estimated from typical item weight" : ""}</small>`;
    }

    return `
      <div class="weekwise-recommend">
        <div class="weekwise-recommend-head">
          <strong>Product suggestions</strong>
          <button id="weekwise-scan-products" type="button">Scan visible products</button>
        </div>
        ${
          savedRecommendation
            ? `<small class="weekwise-note">Last saved: ${escapeHtml(savedRecommendation.productName)}${savedRecommendation.packSizeText ? ` · ${escapeHtml(savedRecommendation.packSizeText)}` : ""}${savedRecommendation.priceText ? ` · ${escapeHtml(savedRecommendation.priceText)}` : ""}</small>`
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
                          ${productPurchaseSummary(recommendation.product)}
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
    const item = latestState && currentItem(latestState);
    const heading = document.querySelector("h1");
    if (!item || !heading || !/\/product\//i.test(window.location.pathname) ||
        !exactItemNameMatch(item.name, withDietBadge(visibleText(heading), heading.parentElement))) return null;
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
      .filter((element) => !insideWeekwiseHelper(element) && elementVisible(element) && !buttonDisabled(element))
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

  async function copyRemaining(state: AsdaHelperState) {
    if (!checkStillCurrent()) return;
    const result = document.getElementById("weekwise-copy-result");
    const brief = remainingShopBrief(state);
    const signature = checkedBasket;
    if (!result) return;
    if (!brief) { result.textContent = "Nothing to copy. All remaining items were skipped or covered."; return; }
    try {
      await navigator.clipboard.writeText(brief);
      result.textContent = "Copied. Paste into ChatGPT with your ASDA tab selected.";
    } catch {
      if (!result.isConnected || checkedBasket !== signature || remainingShopBrief(state) !== brief) return;
      const field = document.createElement("textarea");
      field.readOnly = true;
      field.setAttribute("aria-label", "Remaining shop for ChatGPT");
      field.value = brief;
      result.textContent = "Clipboard unavailable. Copy the selected brief manually.";
      result.append(field);
      field.focus();
      field.select();
    }
  }

  function bindBasket(panel: HTMLElement) {
    panel.addEventListener("change", event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "radio" || !checkStillCurrent()) return;
      const group = choiceGroups.get(input.closest<HTMLElement>("[data-item-id]")?.dataset.itemId ?? "");
      if (!group) return;
      group.selected = Number(input.value);
      const result = panel.querySelector("#weekwise-copy-result");
      if (result) result.textContent = "Choice recorded. Copy the updated brief to continue in ChatGPT.";
    });
    panel.addEventListener("click", async event => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      const state = latestState;
      if (!button || !state || button.disabled) return;
      switch (button.id) {
        case "weekwise-verify-basket":
          if (isBasketPage()) await verifyBasket(state);
          else { basketMessage = "Opening Asda basket..."; render(); await sendMessage({ type: "OPEN_BASKET" }); }
          return;
        case "weekwise-confirm-visible":
          if (confirmVisibleSignature !== undefined) await verifyBasket(state, confirmVisibleSignature);
          return;
        case "weekwise-copy-remaining": await copyRemaining(state); return;
        case "weekwise-find-choices": await findChoices(); return;
      }
      const id = button.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
      if (!id || !checkStillCurrent()) return;
      const check = basketChecks.find(row => row.itemId === id);
      if (!check || check.status === "ok") return;
      switch (button.dataset.action) {
        case "open": window.location.href = check.basketProductUrl || check.openUrl; break;
        case "plus": await addOneMoreForCheck(check); break;
        case "ok":
          approved.add(id); check.status = "ok"; check.message = "Marked as adequate after review.";
          basketMessage = "Marked item as adequate.";
          panel.querySelector("#weekwise-copy-result")?.replaceChildren();
          render(); break;
      }
    });
  }

  const renderedMarkup = new WeakMap<Element, string>();
  function syncBasketChildren(parent: Element, next: Element | DocumentFragment) {
    const key = (el: Element) => el.hasAttribute("data-item-id") ? "item:" + el.getAttribute("data-item-id") : el.id || el.className || el.tagName;
    const existing = new Map(Array.from(parent.children, el => [key(el), el]));
    const desired = Array.from(next.children);
    const wanted = new Set(desired.map(key));
    for (const [id, el] of existing) if (!wanted.has(id)) el.remove();
    desired.forEach((fresh, index) => {
      let el = existing.get(key(fresh));
      if (fresh.matches(".weekwise-basket-list")) {
        el ??= fresh.cloneNode(false) as Element;
        el.setAttribute("aria-busy", fresh.getAttribute("aria-busy")!);
        syncBasketChildren(el, fresh);
      } else {
        const markup = fresh.outerHTML;
        if (!el || renderedMarkup.get(el) !== markup) {
          // A radio selection changes its property immediately. Keep the original focused
          // control when that's the only difference from the last rendered card.
          const previous = el && renderedMarkup.get(el);
          if (el && previous && el.hasAttribute("data-item-id") &&
              previous.replaceAll(' checked=""', '') === markup.replaceAll(' checked=""', '')) {
            const radios = fresh.querySelectorAll<HTMLInputElement>("input[type=radio]");
            el.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach((input, i) => { input.checked = radios[i].checked; });
          } else {
            if (el) el.replaceWith(fresh);
            el = fresh;
          }
          renderedMarkup.set(el, markup);
        }
      }
      if (parent.children[index] !== el) {
        const before = parent.children[index] ?? null;
        if (el.parentNode === parent && typeof parent.moveBefore === "function") parent.moveBefore(el, before);
        else parent.insertBefore(el, before);
      }
    });
  }

  function updateBasket(panel: HTMLElement) {
    const template = document.createElement("template");
    template.innerHTML = renderBasketVerifier();
    const list = panel.querySelector(".weekwise-basket-list");
    const top = list?.scrollTop;
    const body = panel.parentElement!;
    const bodyTop = body.scrollTop;
    const focus = document.activeElement instanceof HTMLElement && panel.contains(document.activeElement) ? document.activeElement : null;
    const card = focus?.closest<HTMLElement>("[data-item-id]");
    const oldIndex = card && list ? Array.from(list.children).indexOf(card) : -1;
    syncBasketChildren(panel, template.content);
    if (focus && !focus.isConnected) {
      const rows = Array.from(panel.querySelectorAll<HTMLElement>("[data-item-id]"));
      const row = rows.find(el => el.dataset.itemId === card?.dataset.itemId) ?? rows[Math.min(oldIndex, rows.length - 1)];
      const replacement = row && Array.from(row.querySelectorAll<HTMLElement>("button:not(:disabled), input")).find(el =>
        focus instanceof HTMLInputElement ? el instanceof HTMLInputElement && el.value === focus.value : el.dataset.action === focus.dataset.action);
      (replacement || (focus.id && document.getElementById(focus.id)) || panel.querySelector<HTMLElement>("#weekwise-verify-basket"))?.focus({preventScroll:true});
    }
    if (list?.isConnected && top !== undefined && list.scrollTop !== top) list.scrollTop = top;
    if (body.scrollTop !== bodyTop) body.scrollTop = bodyTop;
  }

  let lastShell = "";

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
      approved.clear(); reviewEvidence.clear(); checkedLayout = ""; increasing = undefined;
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
    let panel = root.querySelector<HTMLElement>(".weekwise-basket");
    const shellKey = JSON.stringify([html, state?.queue?.createdAt, item?.itemId, state?.productLinks, state?.rejectedRecommendations]);
    if (existing && lastShell === shellKey) {
      if (panel) updateBasket(panel);
      return;
    }
    lastShell = shellKey;
    if (!existing) {
      root.innerHTML = html;
      document.body.append(root);
    } else {
      const shell = document.createElement("template");
      shell.innerHTML = html;
      root.querySelector(".weekwise-head")!.replaceWith(shell.content.querySelector(".weekwise-head")!);
      const body = root.querySelector(".weekwise-body")!;
      for (const child of Array.from(body.children)) if (child !== panel) child.remove();
      body.prepend(...Array.from(shell.content.querySelector(".weekwise-body")!.children));
    }
    if (item) {
      if (!panel) {
        panel = document.createElement("div");
        panel.className = "weekwise-basket";
        root.querySelector(".weekwise-body")!.append(panel);
        bindBasket(panel);
      }
      updateBasket(panel);
    } else panel?.remove();

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
      if (!item) return;
      const visibleProducts = scanVisibleProducts();
      const currentProduct = visibleProducts.find((product) => absoluteUrl(product.url) === absoluteUrl(window.location.href));
      if (currentProduct) {
        await sendMessage({
          type: "SAVE_RECOMMENDATION",
          itemId: item.itemId,
          productUrl: currentProduct.url,
          candidate: { ...currentProduct, rawText: undefined }
        });
      } else if (/\/(?:groceries\/)?product\//i.test(window.location.pathname)) {
        await sendMessage({ type: "SAVE_CURRENT_PRODUCT_URL", productUrl: window.location.href });
      } else {
        recommendationMessage = "Open the chosen product page before remembering it.";
      }
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
  chrome.runtime.onMessage.addListener((message: AsdaHelperRuntimeMessage, _sender: unknown, sendResponse: (response: AsdaHelperRuntimeResponse) => void) => {
    if (message.type === "SCAN_REVIEW_CHOICES") {
      const state = latestState;
      const item = state?.queue?.items.find(entry => entry.itemId === message.itemId);
      const products = scanVisibleProducts();
      if (!state || !item || !products.length) { sendResponse({ok:false}); return; }
      const choices = recommendProducts(item, state, products.filter(p =>
        p.available !== false && exactItemNameMatch(item.name, p.name) &&
        !(item.avoidTerms ?? []).some(term => normalizeText(p.name).includes(normalizeText(term))) &&
        /^https:\/\/(?:www|groceries)\.asda\.com\/(?:groceries\/)?product\//i.test(p.url)
      )).map(({product:p}) => ({url:p.url,name:p.name,priceText:p.priceText,unitPriceText:p.unitPriceText,packSizeText:p.packSizeText}));
      sendResponse({ok:true,choices});
      return;
    }
    if (message.type !== "CLICK_ADD_IF_CONFIDENT") return;

    clickAddButtonWithRetry().then(sendResponse);
    return true;
  });
})();
