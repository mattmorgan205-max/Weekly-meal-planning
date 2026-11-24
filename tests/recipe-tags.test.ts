import assert from "node:assert/strict";
import test from "node:test";
import { draftToRecipe, recipeToDraft, type Recipe } from "../lib/domain";
import { addRecipeTags, canonicalTag, cleanRecipeTags, displayRecipeTags, inferredRecipeTags, knownTotalMinutes, preferenceTags, recipeSearchText, sourceTags, standardRecipeTags, tagCleanupChanged } from "../lib/recipe-tags";
import { emptyRecipeFilters, matchesRecipeFilters } from "../lib/recipe-filters";
import { catalogRecipeForHousehold, recipeForCatalog } from "../lib/recipe-sync";
import { buildAutoDinnerPlan } from "../lib/dinner-planner";

function recipe(names: string[] = ["lentils", "tomatoes", "onion"], extra: Partial<Recipe> = {}): Recipe {
  return { id: "test-recipe", title: "Lentil soup", servings: 4, mealTypes: ["dinner"], tags: [], favorite: false,
    prepMinutes: 10, cookMinutes: 20, ingredients: names.map((name, i) => ({ id: `row-${i}`, name, category: "Other" })),
    instructions: ["Simmer until cooked."], createdAt: "2026-11-24", updatedAt: "2026-11-24", ...extra };
}

test("canonical names merge spelling, case and category aliases", () => {
  for (const [input, output] of [[" Tray bake ", "traybake"], ["ONE PAN", "one-pot"], ["freezer friendly", "freezer-friendly"], ["noodles", "rice / noodles"], ["duck", "other meat"]]) assert.equal(canonicalTag(input), output);
});

test("protein comes from actual ingredients, not burger or mince in titles", () => {
  const burger = inferredRecipeTags(recipe(["black beans", "onion"], { title: "Black bean burger" }));
  assert.ok(burger.includes("pizza / burger")); assert.ok(burger.includes("vegetarian")); assert.ok(!burger.includes("beef"));
  const mince = inferredRecipeTags(recipe(["mince"], { title: "Mince pie" }));
  assert.ok(!mince.includes("beef")); assert.ok(!mince.includes("vegetarian"));
});

test("meat and seafood are never automatically vegetarian", () => {
  for (const [name, tag] of [["turkey", "chicken"], ["beef", "beef"], ["pancetta", "pork"], ["lamb", "lamb"], ["duck", "other meat"], ["venison", "other meat"], ["anchovies", "fish"], ["prawns", "fish"]]) {
    const tags = inferredRecipeTags(recipe([name, "carrot"])); assert.ok(tags.includes(tag), name); assert.ok(!tags.includes("vegetarian"), name);
  }
});

test("animal stocks and sauces block vegetarian without claiming a main protein", () => {
  for (const name of ["fish sauce", "chicken stock", "beef broth"]) {
    const tags = inferredRecipeTags(recipe([name, "carrots"]));
    for (const tag of ["fish", "chicken", "beef", "vegetarian", "vegan"]) assert.ok(!tags.includes(tag), `${name}: ${tag}`);
  }
});

test("plant substitutes and oyster mushrooms do not create meat tags", () => {
  for (const name of ["vegan chicken pieces", "vegetarian mince", "oyster mushrooms", "beef tomatoes", "lamb's lettuce", "duck eggs"]) {
    const tags = inferredRecipeTags(recipe([name, "rice"], { title: `${name} bowl` }));
    assert.ok(tags.includes("vegetarian"), name);
    for (const tag of ["chicken", "fish", "beef", "lamb", "other meat"]) assert.ok(!tags.includes(tag), `${name}: ${tag}`);
  }
  assert.ok(!inferredRecipeTags(recipe(["vegetable stock or chicken stock"])).includes("vegetarian"));
  assert.ok(!inferredRecipeTags(recipe(["vegan cheese or cheddar"])).includes("vegan"));
});

test("missing, uncertain and ambiguous ingredients do not imply a diet", () => {
  for (const meal of [recipe([]), recipe([""]), recipe(["special sauce"]), recipe(["gelatine"]), recipe(["tomatoes"], { instructions: [] }), recipe(["tomatoes"], { title: "Chicken soup" }), recipe(["parmesan"]), recipe(["green pesto"])]) {
    assert.ok(!inferredRecipeTags(meal).includes("vegetarian"), JSON.stringify(meal.ingredients));
  }
  const uncertain = recipe(); uncertain.ingredients[0].confidence = "low";
  assert.ok(!inferredRecipeTags(uncertain).includes("vegan")); uncertain.ingredients[0].reviewed = true;
  assert.ok(inferredRecipeTags(uncertain).includes("vegan"));
});

test("dairy, eggs and honey allow vegetarian but not vegan", () => {
  for (const name of ["milk", "eggs", "honey", "cheddar", "yoghurt"]) {
    const tags = inferredRecipeTags(recipe([name])); assert.ok(tags.includes("vegetarian")); assert.ok(!tags.includes("vegan"));
  }
});

test("practical claims require explicit positive recipe evidence", () => {
  assert.ok(!inferredRecipeTags(recipe()).includes("freezer-friendly"));
  const tags = inferredRecipeTags(recipe(undefined, { notes: "Can be frozen for a month. Make ahead the day before. Good for a packed lunch." }));
  for (const tag of ["freezer-friendly", "make ahead", "packed lunch"]) assert.ok(tags.includes(tag));
  const negative = inferredRecipeTags(recipe(undefined, { notes: "Not freezer friendly. Do not make ahead. Unsuitable for a packed lunch." }));
  for (const tag of ["freezer-friendly", "make ahead", "packed lunch"]) assert.ok(!negative.includes(tag));
});

test("fast prep does not mark a slow-cooker meal as quick overall", () => {
  const meal = recipe(["chicken"], { prepMinutes: 5, cookMinutes: 240, instructions: ["Cook in a slow cooker."] });
  assert.ok(displayRecipeTags(meal).includes("quick prep")); assert.ok(displayRecipeTags(meal).includes("slow cooker"));
  assert.equal(matchesRecipeFilters(meal, { ...emptyRecipeFilters, time: "30" }), false);
});

test("unknown total times are not filled from just one timing", () => {
  assert.equal(knownTotalMinutes(recipe(undefined, { cookMinutes: undefined })), 0);
  assert.equal(knownTotalMinutes(recipe(undefined, { totalMinutes: 80 })), 80);
  assert.ok(matchesRecipeFilters(recipe(), { ...emptyRecipeFilters, time: "30" }));
  assert.ok(!matchesRecipeFilters(recipe(), { ...emptyRecipeFilters, time: "15" }));
});

test("manual confirmations and removals survive recipe and draft round trips", () => {
  const meal = recipe(undefined, { confirmedTags: ["freezer-friendly"], suppressedAutoTags: ["vegan", "soup / stew"] });
  const restored = draftToRecipe(recipeToDraft(cleanRecipeTags(meal)));
  assert.ok(displayRecipeTags(restored).includes("freezer-friendly"));
  assert.ok(!displayRecipeTags(restored).includes("vegan")); assert.ok(!displayRecipeTags(restored).includes("soup / stew"));
  assert.deepEqual(restored.suppressedAutoTags, meal.suppressedAutoTags);
});

test("a confirmed vegan choice also matches vegetarian", () => {
  const meal = recipe(["special sauce"], { confirmedTags: ["vegan"] });
  assert.ok(matchesRecipeFilters(meal, { ...emptyRecipeFilters, diet: "vegetarian" }));
});

test("cleanup is nonmutating, idempotent and preserves custom and recipe content", () => {
  const meal = recipe(undefined, { tags: ["SOUP", "soup / stew", "cosy", "AUTO ADDED", "Familiar", "Not Sophia friendly"], favorite: true, sourceUrl: "https://example.test/recipe", notes: "Our notes" });
  const before = structuredClone(meal), cleaned = cleanRecipeTags(meal);
  assert.deepEqual(meal, before); assert.ok(cleaned.tags.includes("cosy"));
  assert.equal(cleaned.tags.filter(tag => tag === "soup / stew").length, 1);
  assert.ok(!cleaned.tags.includes("30-60 mins")); assert.equal(cleaned.prepMinutes, 10); assert.equal(cleaned.cookMinutes, 20);
  assert.deepEqual(cleaned.householdTags, ["familiar", "not sophia friendly"]); assert.ok(sourceTags(cleaned).includes("auto-added"));
  for (const key of ["id", "favorite", "ingredients", "instructions", "sourceUrl", "notes", "mealTypes"] as const) assert.deepEqual(cleaned[key], meal[key]);
  assert.ok(tagCleanupChanged(meal, cleaned)); assert.ok(!tagCleanupChanged(cleaned, cleanRecipeTags(cleaned)));
});

test("custom tag decisions keep, rename, merge or remove only when requested", () => {
  const meal = recipe(undefined, { tags: ["cosy", "family special", "holiday"] });
  const cleaned = cleanRecipeTags(meal, { cosy: "freezer friendly", "family special": null });
  assert.ok(cleaned.tags.includes("freezer-friendly")); assert.ok(cleaned.confirmedTags?.includes("freezer-friendly"));
  assert.ok(cleaned.tags.includes("holiday")); assert.ok(!cleaned.tags.includes("family special"));
  assert.ok(cleanRecipeTags(meal).tags.includes("family special"));
});

test("cleanup removes unsupported legacy automatic tags but not suppressions", () => {
  const meal = recipe(["lamb"], { tags: ["vegetarian", "quick", "healthy"], suppressedAutoTags: ["lamb"] });
  const cleaned = cleanRecipeTags(meal);
  assert.ok(!cleaned.tags.includes("vegetarian")); assert.ok(!cleaned.tags.includes("quick")); assert.ok(!cleaned.tags.includes("lamb")); assert.ok(cleaned.tags.includes("healthy"));
});

test("legacy favourite tag becomes the existing favourite flag", () => {
  const cleaned = cleanRecipeTags(recipe(undefined, { tags: ["favourite"] }));
  assert.equal(cleaned.favorite, true); assert.ok(!cleaned.tags.includes("favourite"));
});

test("batch additions are explicit, normalize aliases and preserve household preferences", () => {
  const cleaned = addRecipeTags(recipe(undefined, { tags: ["familiar"], suppressedAutoTags: ["freezer-friendly"] }), ["Freezer friendly", "Not Sophia friendly"]);
  assert.ok(cleaned.confirmedTags?.includes("freezer-friendly")); assert.ok(!cleaned.suppressedAutoTags?.includes("freezer-friendly"));
  assert.deepEqual(preferenceTags(cleaned), ["familiar", "not sophia friendly"]);
});

test("grouped filters combine with source and household preferences", () => {
  const meal = cleanRecipeTags(recipe(undefined, { tags: ["auto-added", "familiar"], favorite: true, notes: "Can be frozen.", importedFrom: "url" }));
  assert.ok(matchesRecipeFilters(meal, { ...emptyRecipeFilters, time: "30", diet: "vegan", dish: "soup / stew", practical: "freezer-friendly", source: "auto-added", familiarOnly: true, favoritesOnly: true }));
  assert.ok(!matchesRecipeFilters(meal, { ...emptyRecipeFilters, protein: "chicken" }));
  assert.ok(!matchesRecipeFilters(meal, { ...emptyRecipeFilters, sophia: "sophia friendly" }));
  assert.ok(recipeSearchText(meal).includes("familiar")); assert.ok(recipeSearchText(meal).includes("auto-added"));
});

test("catalogue writes and reads isolate household preferences", () => {
  const source = recipe(undefined, { tags: ["familiar", "not sophia friendly"], householdTags: ["familiar"], favorite: true });
  assert.deepEqual(preferenceTags(recipeForCatalog(source)), []);
  assert.deepEqual(preferenceTags(catalogRecipeForHousehold(source)), []);
  const existing = recipe(undefined, { householdTags: ["sophia friendly"], favorite: true });
  const received = catalogRecipeForHousehold(source, existing);
  assert.deepEqual(preferenceTags(received), ["sophia friendly"]); assert.equal(received.favorite, true);
});

test("cleaned household tags still drive familiar and Sophia autoplan rules", () => {
  const meal = cleanRecipeTags(recipe(undefined, { tags: ["familiar", "not sophia friendly"] }));
  const request = { startDate: "2026-11-24", endDate: "2026-11-24", mode: "replace" as const, recipes: [meal], plannedMeals: [], useUpIngredients: [], ingredientAliases: {}, peopleCount: 4 };
  assert.equal(buildAutoDinnerPlan(request).entries.length, 0);
  const plan = buildAutoDinnerPlan({ ...request, dayNotes: { "2026-11-24": "Sophia nursery" } });
  assert.equal(plan.entries.length, 1); assert.equal(plan.entries[0].familiar, true);
});

test("unknown meals have other planning category rather than vegetarian", () => {
  const meal = recipe(["mystery filling"], { title: "Something new", instructions: [] });
  assert.deepEqual(standardRecipeTags([], meal).filter(tag => ["vegetarian", "vegan"].includes(tag)), []);
  const plan = buildAutoDinnerPlan({ startDate: "2026-11-24", endDate: "2026-11-24", mode: "replace", recipes: [meal], plannedMeals: [], useUpIngredients: [], ingredientAliases: {}, peopleCount: 4 });
  assert.equal(plan.entries[0].category, "other");
});
