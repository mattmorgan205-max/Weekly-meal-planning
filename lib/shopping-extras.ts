import { canonicalizeIngredientName, createId, inferCategory, parseIngredientLine, shoppingListIncludesExtra, type Ingredient, type ShoppingListItem, type OccasionalItem } from "./domain";

export function splitManualShoppingLines(value: string) {
  const normalized = value.replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const primaryLines = normalized.split(/\n+/);
  const lines = primaryLines.length === 1 ? primaryLines[0].split(/;|,(?=\s*[A-Za-z])/g) : primaryLines;

  return lines
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]\])\s*/i, "").trim())
    .filter(Boolean);
}

function formatManualQuantity(ingredient: Ingredient) {
  const quantity =
    typeof ingredient.quantity === "number"
      ? Number.isInteger(ingredient.quantity)
        ? ingredient.quantity.toString()
        : ingredient.quantity.toFixed(2).replace(/\.?0+$/, "")
      : "";

  return [quantity, ingredient.unit].filter(Boolean).join(" ");
}

export function createManualShoppingItemFromLine(line: string, shoppingRangeKey: string): ShoppingListItem | null {
  const cleanedLine = line.trim();
  if (!cleanedLine) return null;

  const parsed = parseIngredientLine(cleanedLine, { strict: false });
  const name = parsed.name.trim() || cleanedLine;

  return {
    id: createId("manual"),
    shoppingRangeKey,
    name,
    canonicalName: canonicalizeIngredientName(name).canonicalName,
    displayQuantity: formatManualQuantity(parsed),
    quantity: parsed.quantity,
    unit: parsed.unit,
    category: parsed.category || inferCategory(name),
    sourceMeals: ["Manual"],
    checked: false,
    manual: true
  };
}

export function batchExtraDuplicates(items: ShoppingListItem[], existing: ShoppingListItem[], aliases: Record<string, string>) {
  return items.map((item, index) => shoppingListIncludesExtra([...existing, ...items.slice(0, index)], item.name, aliases));
}

export function oldestShoppingAddFirst(items: OccasionalItem[]) {
  return [...items].sort((a, b) => (a.lastAddedAt ?? "").localeCompare(b.lastAddedAt ?? "") || a.name.localeCompare(b.name));
}

