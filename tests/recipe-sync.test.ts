import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "../lib/domain";
import { shouldReplaceRecipeWithCatalog } from "../lib/recipe-sync";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "recipe_black_bean_tacos",
    title: "Black bean tacos",
    servings: 4,
    mealTypes: ["dinner"],
    tags: ["vegetarian"],
    favorite: false,
    visibility: "global",
    ingredients: [],
    instructions: ["Cook and serve."],
    importedFrom: "manual",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    catalogSourceHouseholdId: "household_one",
    ...overrides
  };
}

test("keeps a newer household edit instead of restoring an older catalogue recipe", () => {
  const existing = recipe({ mealTypes: ["lunch"], updatedAt: "2026-09-30T10:00:00.000Z" });
  const catalog = recipe({ mealTypes: ["dinner"], updatedAt: "2026-09-20T10:00:00.000Z" });

  assert.equal(
    shouldReplaceRecipeWithCatalog(existing, catalog, "2026-09-20T10:00:00.000Z"),
    false
  );
});

test("accepts a catalogue recipe when it is newer than the household snapshot", () => {
  const existing = recipe({ updatedAt: "2026-09-20T10:00:00.000Z" });
  const catalog = recipe({ mealTypes: ["lunch"], updatedAt: "2026-09-30T10:00:00.000Z" });

  assert.equal(
    shouldReplaceRecipeWithCatalog(existing, catalog, "2026-09-30T10:00:00.000Z"),
    true
  );
});

test("never replaces a household-only recipe with a shared catalogue entry", () => {
  const existing = recipe({ visibility: "household", updatedAt: "2026-09-20T10:00:00.000Z" });
  const catalog = recipe({ updatedAt: "2026-09-30T10:00:00.000Z" });

  assert.equal(shouldReplaceRecipeWithCatalog(existing, catalog), false);
});

test("does not replace a recipe owned by a different catalogue source", () => {
  const existing = recipe({ catalogSourceHouseholdId: "household_one" });
  const catalog = recipe({ catalogSourceHouseholdId: "household_two", updatedAt: "2026-09-30T10:00:00.000Z" });

  assert.equal(shouldReplaceRecipeWithCatalog(existing, catalog), false);
});
