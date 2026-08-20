import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTO_ADDED_RECIPE_PACK_ID,
  autoAddedRecipes,
  installAutoAddedRecipePack
} from "../lib/auto-added-recipes";
import type { Recipe } from "../lib/domain";

test("curated pack contains 20 complete, attributed dinner recipes", () => {
  assert.equal(autoAddedRecipes.length, 20);
  assert.equal(new Set(autoAddedRecipes.map((recipe) => recipe.id)).size, 20);
  assert.equal(new Set(autoAddedRecipes.map((recipe) => recipe.sourceUrl)).size, 20);

  autoAddedRecipes.forEach((recipe) => {
    assert.ok(recipe.tags.includes("auto-added"), `${recipe.title} is missing the auto-added tag`);
    assert.deepEqual(recipe.mealTypes, ["dinner"]);
    assert.equal(recipe.source, "Good Food");
    assert.match(recipe.sourceUrl ?? "", /^https:\/\/www\.bbcgoodfood\.com\/recipes\//);
    assert.ok(recipe.ingredients.length >= 6, `${recipe.title} needs a useful ingredient list`);
    assert.ok(recipe.instructions.length >= 2, `${recipe.title} needs a useful method`);
    assert.equal(recipe.importedFrom, "url");
  });
});

test("curated pack supports the automatic dinner category targets", () => {
  const countTag = (tag: string) => autoAddedRecipes.filter((recipe) => recipe.tags.includes(tag)).length;

  assert.equal(countTag("vegetarian"), 8);
  assert.equal(countTag("chicken"), 5);
  assert.equal(countTag("fish"), 4);
  assert.equal(countTag("pork") + countTag("beef"), 3);
  assert.ok(countTag("under 30 mins") >= 4);
});

test("time labels agree with saved prep and cooking times", () => {
  autoAddedRecipes.forEach((recipe) => {
    const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
    const expected = total < 30 ? "under 30 mins" : total <= 60 ? "30-60 mins" : "over 60 mins";
    assert.ok(recipe.tags.includes(expected), `${recipe.title} should be tagged ${expected}`);
  });
});

test("recipe pack installs once and does not restore a later deletion", () => {
  const existingRecipe: Recipe = {
    id: "existing",
    title: "House favourite",
    servings: 4,
    mealTypes: ["dinner"],
    tags: [],
    favorite: true,
    ingredients: [{ id: "existing_ingredient", name: "onion", category: "Produce" }],
    instructions: ["Cook."],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };

  const firstInstall = installAutoAddedRecipePack([existingRecipe]);
  assert.equal(firstInstall.addedCount, 20);
  assert.equal(firstInstall.recipes.length, 21);
  assert.deepEqual(firstInstall.installedRecipePacks, [AUTO_ADDED_RECIPE_PACK_ID]);

  const afterDeletion = firstInstall.recipes.filter((recipe) => recipe.id !== autoAddedRecipes[0].id);
  const secondInstall = installAutoAddedRecipePack(afterDeletion, firstInstall.installedRecipePacks);
  assert.equal(secondInstall.addedCount, 0);
  assert.equal(secondInstall.recipes.length, 20);
  assert.ok(!secondInstall.recipes.some((recipe) => recipe.id === autoAddedRecipes[0].id));
});

test("first installation skips a recipe that the household already has", () => {
  const existing = { ...autoAddedRecipes[0], id: "household-copy" };
  const installed = installAutoAddedRecipePack([existing]);

  assert.equal(installed.addedCount, 19);
  assert.equal(installed.recipes.length, 20);
});
