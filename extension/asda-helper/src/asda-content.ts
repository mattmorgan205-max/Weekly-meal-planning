(() => {
  let latestState: AsdaHelperState | undefined;
  let collapsed = false;
  let recommendations: AsdaRecommendation[] = [];
  let recommendationItemId = "";
  let recommendationMessage = "";

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
                      <article class="weekwise-recommend-card">
                        ${recommendation.product.imageUrl ? `<img src="${escapeHtml(recommendation.product.imageUrl)}" alt="" />` : ""}
                        <div>
                          <strong>${escapeHtml(recommendation.product.name)}</strong>
                          <small>${escapeHtml([recommendation.product.priceText, recommendation.product.unitPriceText, recommendation.product.offerText].filter(Boolean).join(" · ") || "No visible price")}</small>
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
