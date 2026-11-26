import { displayQuantity, groceryCategories, normalizeUnit, shoppingConversion, shoppingItemCategoryKey, type AppSettings, type ShoppingListItem } from "./domain";

export const matchName = (row: ShoppingListItem) => (row.canonicalName || row.name).trim().toLowerCase();
export const matchParts = (row: ShoppingListItem) => row.matchedParts ?? [row];
const unique = (names: string[]) => [...new Set(names)];

function measurement(row: ShoppingListItem, settings: AppSettings) {
  const unit = normalizeUnit(row.unit);
  // Generated quantities have already been converted using the source recipe's convention.
  const conversion = row.manual ? shoppingConversion(unit, settings.measurementSystem) : undefined;
  const base = conversion?.base ?? unit;
  const family = row.mergeKey?.split("::").slice(1).join("::") ?? conversion?.family ?? (unit ? `raw-${unit}` : "no-unit");
  const amount = row.quantity === undefined ? undefined : row.quantity * (conversion?.factor ?? 1);
  const freeText = row.manual && amount === undefined && row.displayQuantity.trim() && normalizeUnit(row.displayQuantity) !== unit;
  const basis = JSON.stringify([family, base, typeof amount, freeText ? row.id : ""]);
  return { basis, amount, base };
}

export function compatibleMatch(a: ShoppingListItem, b: ShoppingListItem, settings: AppSettings) {
  return measurement(matchParts(a)[0], settings).basis === measurement(matchParts(b)[0], settings).basis;
}

// Rules point directly to a preferred shopping name. Retarget existing aliases together.
export function rememberMatch(rules: Record<string, string>, from: string, to: string) {
  const next = Object.fromEntries(Object.entries(rules).map(([key, value]) => [key, value === from ? to : value]));
  return { ...next, [from]: to };
}

export function projectShoppingMatches(items: ShoppingListItem[], settings: AppSettings, hidden: Record<string, boolean>, prefix: string) {
  const rules = settings.shoppingMatches ?? {}, targets = new Set(Object.values(rules));
  if (!targets.size) return items;
  const result: ShoppingListItem[] = [], groups = new Map<string, { name: string; parts: ShoppingListItem[] }>();
  for (const row of items) {
    const key = matchName(row);
    if (!Object.hasOwn(rules, key) && !targets.has(key)) { result.push(row); continue; }
    const name = Object.hasOwn(rules, key) ? rules[key] : key;
    const id = "match_" + encodeURIComponent(JSON.stringify([name, measurement(row, settings).basis]));
    const group = groups.get(id) ?? { name, parts: [] };
    group.parts.push(row);
    groups.set(id, group);
  }
  for (const [id, { name, parts }] of groups) {
    if (hidden[prefix + id]) continue;
    const preferred = parts.find(row => matchName(row) === name) ?? parts[0];
    const { base, amount } = measurement(preferred, settings);
    const quantity = amount === undefined ? undefined : parts.reduce((sum, row) => sum + measurement(row, settings).amount!, 0);
    const categoryKey = shoppingItemCategoryKey({ name }, settings.ingredientAliases);
    result.push({ id, name, canonicalName: name, category: settings.shoppingCategoryOverrides?.[categoryKey] ?? preferred.category,
      quantity, unit: base, displayQuantity: quantity === undefined ? preferred.displayQuantity : displayQuantity(quantity, base),
      matchedParts: parts, staple: parts.every(row => row.staple), checked: false,
      sourceMeals: unique(parts.flatMap(row => row.sourceMeals)), sourceRecipeIds: unique(parts.flatMap(row => row.sourceRecipeIds ?? [])),
      sourceIngredients: unique(parts.flatMap(row => [row.name, ...(row.sourceIngredients ?? [])])),
      ingredientSources: parts.flatMap(row => row.ingredientSources ?? []),
      conversionNotes: unique(parts.flatMap(row => row.conversionNotes ?? [])), mergeWarnings: unique(parts.flatMap(row => row.mergeWarnings ?? []))
    });
  }
  return result.sort((a,b) => groceryCategories.indexOf(a.category) - groceryCategories.indexOf(b.category) || a.name.localeCompare(b.name));
}
