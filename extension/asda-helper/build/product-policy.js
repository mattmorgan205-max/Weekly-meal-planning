"use strict";
const glutenFreeLabel = /\b(?:gluten[\s\p{Pd}]*free|free\s+(?:of|from)\s+gluten|(?:made\s+)?without\s+gluten|gf)\b/iu;
const dietBadgeSelector = '[data-testid*="badge" i],[data-auto-id*="badge" i],[data-testid*="diet" i],[aria-label*="gluten" i],[alt*="gluten" i]';
function withDietBadge(name, container) {
    if (!container || glutenFreeLabel.test(name))
        return name;
    for (const node of container.querySelectorAll(dietBadgeSelector)) {
        const label = node.getAttribute("aria-label") || node.getAttribute("alt") || node.textContent || "";
        if (label.length <= 80 && glutenFreeLabel.test(label))
            return name + " (gluten-free)";
    }
    return name;
}
function compatibleAsdaVariant(request, product) {
    const requested = glutenFreeLabel.test(request);
    if (requested !== glutenFreeLabel.test(product))
        return false;
    return requested || !/\bfree[\s-]+from\b/i.test(product) || /\bfree[\s-]+from\b/i.test(request);
}
