import assert from "node:assert/strict";
import test from "node:test";
import { batchExtraDuplicates, createManualShoppingItemFromLine, oldestShoppingAddFirst, splitManualShoppingLines } from "../lib/shopping-extras";
import { generateShoppingList, itemsForAsdaHelper, seedState, shoppingItemCategoryKey, shoppingListIncludesExtra, type Recipe, type ShoppingListItem } from "../lib/domain";
import { emptyRecipeFilters, matchesRecipeFilters } from "../lib/recipe-filters";

test("batch extras preserve quantities and identify existing and repeated items", () => {
  const lines = splitManualShoppingLines("Milk\n2 onions\n500 g carrots\nMilk");
  const items = lines.map(line => createManualShoppingItemFromLine(line, "shop")!);
  assert.equal(items.length, 4); assert.equal(items[1].quantity, 2);
  assert.equal(items[2].quantity, 500); assert.equal(items[2].unit, "g");
  assert.ok(items.every(item => item.manual && item.shoppingRangeKey === "shop"));
  assert.deepEqual(batchExtraDuplicates(items, [createManualShoppingItemFromLine("1 onion", "shop")!], {}), [false, true, false, true]);
  assert.equal(createManualShoppingItemFromLine("  ", "shop"), null);
  assert.deepEqual(splitManualShoppingLines("\r\n\n"), []);
});

test("occasional extras sort never recorded first then oldest shopping date", () => {
  const rows = [{ id: "recent", name: "Bags", intervalDays: 5, lastAddedAt: "2026-11-20" }, { id: "never", name: "Wipes", intervalDays: 28 }, { id: "old", name: "Soap", intervalDays: 100, lastAddedAt: "2026-08-01" }];
  assert.deepEqual(oldestShoppingAddFirst(rows).map(row => row.id), ["never", "old", "recent"]);
  assert.equal(rows[0].id, "recent");
});

function item(name: string, extra: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return { id: name, name, category: "Other", displayQuantity: "", sourceMeals: [], checked: false, ...extra };
}

function recipe(extra: Partial<Recipe> = {}): Recipe {
  return { ...seedState().recipes[0], title: "Chicken curry", tags: ["familiar"], favorite: false,
    ingredients: [{ id: "chicken", name: "chicken breast", category: "Meat & Fish" }], ...extra };
}

test("common extras recognise generated items, plurals, case and checked rows", () => {
  const items = [item("onion", { sourceMeals: ["Curry"], checked: true })];
  assert.ok(shoppingListIncludesExtra(items, "Onions"));
  assert.ok(shoppingListIncludesExtra([item("Milk", { manual: true })], "milk"));
  assert.equal(shoppingListIncludesExtra(items, "red onion"), false);
  assert.equal(shoppingListIncludesExtra(items, ""), false);
});

test("common extras respect canonical names, source ingredients and household aliases", () => {
  assert.ok(shoppingListIncludesExtra([item("custom name", { canonicalName: "onion" })], "onions"));
  assert.ok(shoppingListIncludesExtra([item("custom name", { sourceIngredients: ["milk"] })], "Milk"));
  assert.ok(shoppingListIncludesExtra([item("aubergine")], "eggplant", { eggplant: "aubergine" }));
});

test("Asda excludes both checked items and independently marked added statuses", () => {
  const items = [item("checked", { checked: true }), item("added"), item("opened"), item("unavailable"), item("pending"), item("extra", { manual: true, additional: true })];
  assert.deepEqual(itemsForAsdaHelper(items, { added: "added", opened: "opened", unavailable: "unavailable" }).map((row) => row.id), ["opened", "unavailable", "pending", "extra"]);
  assert.equal(itemsForAsdaHelper([item("done", { checked: true })], {}).length, 0);
  assert.equal(items[0].checked, true);
});

test("category overrides persist for generated, manual and future shopping lists without changing recipe data", () => {
  const state = seedState();
  const meal = recipe({ ingredients: [{ id: "unknown", name: "special seasoning", quantity: 2, unit: "tsp", category: "Other" }] });
  const plan = [{ id: "meal", date: "2026-11-21", slot: "dinner" as const, recipeId: meal.id, peopleCount: 4 }];
  const key = shoppingItemCategoryKey(item("special seasoning"));
  const settings = { ...state.settings, includeStaples: true, shoppingCategoryOverrides: { [key]: "Spices" as const } };
  const list = generateShoppingList([meal], plan, settings, {}, {}, [item("special seasoning", { manual: true })]);
  assert.equal(list.length, 2);
  assert.ok(list.every((row) => row.category === "Spices"));
  assert.equal(meal.ingredients[0].category, "Other");
  assert.equal(generateShoppingList([meal], plan, JSON.parse(JSON.stringify(settings)), {}, {}, [])[0].category, "Spices");
  assert.equal(generateShoppingList([meal], plan, { ...state.settings, includeStaples: true }, {}, {}, [])[0].category, "Other");
});

test("quick filter uses total time with strict 30-minute boundary and excludes unknown time", () => {
  const filters = { ...emptyRecipeFilters, time: "quick" as const };
  assert.ok(matchesRecipeFilters(recipe({ totalMinutes: 29, cookMinutes: 120 }), filters));
  assert.equal(matchesRecipeFilters(recipe({ totalMinutes: 30 }), filters), false);
  assert.equal(matchesRecipeFilters(recipe({ prepMinutes: undefined, cookMinutes: undefined }), filters), false);
  assert.equal(matchesRecipeFilters(recipe({ prepMinutes: 5, cookMinutes: 180 }), filters), false);
  assert.ok(matchesRecipeFilters(recipe({ prepMinutes: 10, cookMinutes: 15 }), filters));
});

test("meal filters combine type, time, favourites and tags", () => {
  const filters = { time: "quick" as const, protein: "chicken" as const, favoritesOnly: true, tag: "familiar" };
  assert.ok(matchesRecipeFilters(recipe({ totalMinutes: 20, favorite: true }), filters));
  assert.equal(matchesRecipeFilters(recipe({ totalMinutes: 20 }), filters), false);
  assert.equal(matchesRecipeFilters(recipe({ totalMinutes: 40, favorite: true }), filters), false);
  assert.equal(matchesRecipeFilters(recipe({ totalMinutes: 20, favorite: true, tags: [] }), filters), false);
});

test("protein filters infer missing tags and respect suppressed tags", () => {
  for (const [name, protein] of [["pork", "pork"], ["beef", "beef"], ["salmon", "fish"], ["lentils", "vegetarian"], ["lamb", "lamb"]] as const) {
    const meal = recipe({ title: `${name} stew`, ingredients: [{ id: name, name, category: "Other" }], tags: [] });
    assert.ok(matchesRecipeFilters(meal, { ...emptyRecipeFilters, protein }));
    if (protein !== "vegetarian") assert.equal(matchesRecipeFilters(meal, { ...emptyRecipeFilters, protein: "vegetarian" }), false);
  }
  assert.equal(matchesRecipeFilters(recipe({ suppressedAutoTags: ["chicken"] }), { ...emptyRecipeFilters, protein: "chicken" }), false);
  const sausages = recipe({ title: "Sausage casserole", ingredients: [], confirmedTags: ["pork"] });
  assert.ok(matchesRecipeFilters(sausages, { ...emptyRecipeFilters, protein: "pork" }));
  assert.equal(matchesRecipeFilters(sausages, { ...emptyRecipeFilters, protein: "vegetarian" }), false);
  assert.equal(matchesRecipeFilters(sausages, { ...emptyRecipeFilters, tag: "vegetarian" }), false);
  const veggieBurger = recipe({ title: "Vegetarian burger", ingredients: [], confirmedTags: ["vegetarian"] });
  assert.ok(matchesRecipeFilters(veggieBurger, { ...emptyRecipeFilters, protein: "vegetarian" }));
  assert.equal(matchesRecipeFilters(veggieBurger, { ...emptyRecipeFilters, protein: "beef" }), false);
});
