import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeIngredientName, draftToRecipe, generateShoppingList, ingredientIncludedInShopping, parseIngredientLine, parseRecipeText, recipeToDraft, seedState, type Ingredient } from "../lib/domain";
import { draftStorageKey, ingredientIssues, readDraftArchive, reviewRecipe, upsertDraftArchive, type SavedRecipeDraft } from "../lib/recipe-review";

const draft = () => parseRecipeText("Test soup\nServes 4\nIngredients\n500g carrots\nMethod\nRoast until tender.", "paste");
function shopping(ingredients: Ingredient[]) {
  const recipe = draftToRecipe({ ...draft(), ingredients });
  return generateShoppingList([recipe], [{ id: "meal", date: "2026-11-23", slot: "dinner", recipeId: recipe.id, peopleCount: 4 }], { ...seedState().settings, includeStaples: true }, {}, {}, []);
}
test("known spellings and plurals combine without collapsing product identity", () => {
  for (const [a,b] of [["onions, finely chopped", "onion"], ["yogurt", "yoghurt"], ["eggplant", "aubergine"], ["tomato purée", "tomato puree"]]) assert.equal(canonicalizeIngredientName(a).canonicalName, canonicalizeIngredientName(b).canonicalName);
  for (const [a,b] of [["fresh coriander", "dried coriander"], ["cooked rice", "rice"], ["coconut cream", "coconut milk"], ["garlic powder", "garlic"], ["peanut butter", "butter"], ["black pepper", "red pepper"], ["frozen peas", "peas"], ["gluten free pasta", "pasta"]]) assert.notEqual(canonicalizeIngredientName(a).canonicalName, canonicalizeIngredientName(b).canonicalName);
});
test("compatible units combine and originals remain intact", () => {
  const ingredients = [parseIngredientLine("500g carrots"), parseIngredientLine("0.5kg carrot")];
  const before = JSON.stringify(ingredients);
  assert.equal(shopping(ingredients)[0].quantity, 1000);
  assert.equal(JSON.stringify(ingredients), before);
  assert.equal(shopping([parseIngredientLine("250ml milk"), parseIngredientLine("0.5l milk")])[0].quantity, 750);
  assert.equal(shopping([parseIngredientLine("500g carrots"), parseIngredientLine("2 carrots")]).length, 2);
});
test("fractions, packs and drained weights retain meaning", () => {
  assert.equal(parseIngredientLine("1 1/2 tbsp oil").quantity, 1.5);
  assert.equal(parseIngredientLine("1/2 tsp salt").quantity, 0.5);
  const pack = parseIngredientLine("2 x 400g tins chickpeas, drained");
  assert.equal(pack.quantity, 2); assert.equal(pack.packSize, 400); assert.equal(pack.weightBasis, "net");
  assert.equal(shopping([pack, parseIngredientLine("400g chickpeas")])[0].quantity, 1200);
  assert.equal(shopping([pack, { ...parseIngredientLine("400g chickpeas"), weightBasis: "drained" }]).length, 2);
  assert.equal(parseIngredientLine("2 x 300ml bottles milk").unit, "bottle");
});
test("ambiguous volume stays separate until a convention is explicitly selected", () => {
  const cup = parseIngredientLine("1 cup milk"), ml = parseIngredientLine("100ml milk");
  assert.equal(shopping([cup, ml]).length, 2);
  assert.ok(ingredientIssues(cup).some(row => row.key.endsWith(":measure")));
  assert.equal(shopping([{ ...cup, measurementSystem: "metric" }, ml])[0].quantity, 350);
  assert.ok(Math.abs(shopping([{ ...cup, measurementSystem: "us" }, ml])[0].quantity! - 336.588) < 0.00001);
});
test("shopping exclusions preserve recipe ingredients and allow explicit overrides", () => {
  const water = parseIngredientLine("50ml boiling water");
  assert.equal(ingredientIncludedInShopping(water), false);
  assert.equal(ingredientIncludedInShopping(parseIngredientLine("50ml sparkling water")), true);
  assert.equal(ingredientIncludedInShopping({ ...water, shoppingIncluded: true }), true);
  assert.equal(ingredientIncludedInShopping(parseIngredientLine("1 tsp salt"), ["salt"]), false);
  assert.equal(shopping([water, { ...parseIngredientLine("1 tsp salt"), shoppingIncluded: false }]).length, 0);
  const recipe = draftToRecipe({ ...draft(), ingredients: [{ ...water, shoppingIncluded: false }] });
  assert.equal(recipeToDraft(recipe).ingredients[0].shoppingIncluded, false);
  assert.equal(recipe.ingredients.length, 1);
});
test("review catches duplicates, invalid values, missing method and method-only ingredients", () => {
  const recipe = draftToRecipe(draft());
  assert.ok(reviewRecipe(draft(), [recipe]).some(row => row.key === "duplicate"));
  assert.ok(!reviewRecipe(draft(), [recipe], recipe.id).some(row => row.key === "duplicate"));
  assert.ok(reviewRecipe({ ...draft(), servings: 0 }).some(row => row.blocking));
  assert.ok(reviewRecipe({ ...draft(), instructions: [] }).some(row => row.key === "method"));
  assert.ok(reviewRecipe({ ...draft(), instructions: ["Stir in cornflour."] }).some(row => row.key === "method:cornflour"));
  assert.ok(ingredientIssues({ ...parseIngredientLine("1g salt"), quantity: -1, reviewed: true }).some(row => row.blocking));
});
test("text import preserves source and separates time fields", () => {
  const source = "Soup\nServes 4\nPrep: 10 mins\nCook: 1 hour 20 mins\nTotal: 90 mins\nIngredients\n2 carrots\nMethod\nRoast.";
  const result = parseRecipeText(source, "paste");
  assert.equal(result.sourceText, source); assert.equal(result.prepMinutes, 10); assert.equal(result.cookMinutes, 80); assert.equal(result.totalMinutes, 90);
});
test("draft archive round trips source and changes without overwriting other drafts or accounts", () => {
  const record: SavedRecipeDraft = { draft: draft(), editingRecipeId: null, tagInput: "test", importMode: "paste", importText: "source", importUrl: "", photoRawText: "", savedAt: "2026-11-23" };
  const second = { ...record, draft: { ...record.draft, id: "another" } };
  const records = upsertDraftArchive(upsertDraftArchive([], record), second);
  assert.equal(upsertDraftArchive(records, { ...record, tagInput: "changed" }).length, 2);
  assert.equal(JSON.stringify(readDraftArchive(JSON.stringify(records))), JSON.stringify(records));
  assert.notEqual(draftStorageKey("account:a"), draftStorageKey("account:b"));
  assert.throws(() => readDraftArchive("{}"));
});
