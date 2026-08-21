import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import {
  AUTO_ADDED_RECIPE_PACK_ID,
  autoAddedRecipes,
  installAutoAddedRecipePack
} from "../lib/auto-added-recipes";
import {
  AUTO_ADDED_RECIPE_PACK_V2_ID,
  autoAddedRecipesV2,
  installAutoAddedRecipePackV2
} from "../lib/auto-added-recipes-v2";
import {
  GREEN_ROASTING_TIN_RECIPE_PACK_ID,
  greenRoastingTinRecipes,
  installGreenRoastingTinRecipePack
} from "../lib/green-roasting-tin-recipes";
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

test("second curated pack contains 20 different recipes with meal pictures", () => {
  const firstPackTitles = new Set(autoAddedRecipes.map((recipe) => recipe.title.toLowerCase()));
  const firstPackSources = new Set(autoAddedRecipes.map((recipe) => recipe.sourceUrl?.toLowerCase()));

  assert.equal(autoAddedRecipesV2.length, 20);
  assert.equal(new Set(autoAddedRecipesV2.map((recipe) => recipe.id)).size, 20);
  assert.equal(new Set(autoAddedRecipesV2.map((recipe) => recipe.sourceUrl)).size, 20);

  autoAddedRecipesV2.forEach((recipe) => {
    assert.ok(!firstPackTitles.has(recipe.title.toLowerCase()), `${recipe.title} duplicates the first pack`);
    assert.ok(!firstPackSources.has(recipe.sourceUrl?.toLowerCase()), `${recipe.title} reuses an existing source`);
    assert.ok(recipe.tags.includes("auto-added"), `${recipe.title} is missing the auto-added tag`);
    assert.deepEqual(recipe.mealTypes, ["dinner"]);
    assert.equal(recipe.source, "Good Food");
    assert.match(recipe.sourceUrl ?? "", /^https:\/\/www\.bbcgoodfood\.com\/recipes\//);
    assert.match(recipe.mealImageUrl ?? "", /^https:\/\/images\.immediate\.co\.uk\//);
    assert.ok(recipe.ingredients.length >= 7, `${recipe.title} needs a useful ingredient list`);
    assert.ok(recipe.instructions.length >= 2, `${recipe.title} needs a useful method`);
    assert.equal(recipe.importedFrom, "url");
  });
});

test("second pack supports the automatic dinner targets and correct time labels", () => {
  const countTag = (tag: string) => autoAddedRecipesV2.filter((recipe) => recipe.tags.includes(tag)).length;

  assert.equal(countTag("vegetarian"), 8);
  assert.equal(countTag("chicken"), 5);
  assert.equal(countTag("fish"), 4);
  assert.equal(countTag("pork") + countTag("beef"), 3);
  assert.ok(countTag("under 30 mins") >= 4);

  autoAddedRecipesV2.forEach((recipe) => {
    const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
    const expected = total < 30 ? "under 30 mins" : total <= 60 ? "30-60 mins" : "over 60 mins";
    assert.ok(recipe.tags.includes(expected), `${recipe.title} should be tagged ${expected}`);
  });
});

test("second recipe pack installs after the first and respects later deletions", () => {
  const firstInstall = installAutoAddedRecipePack([]);
  const secondInstall = installAutoAddedRecipePackV2(firstInstall.recipes, firstInstall.installedRecipePacks);

  assert.equal(secondInstall.addedCount, 20);
  assert.equal(secondInstall.recipes.length, 40);
  assert.deepEqual(secondInstall.installedRecipePacks, [AUTO_ADDED_RECIPE_PACK_ID, AUTO_ADDED_RECIPE_PACK_V2_ID]);

  const deletedRecipeId = autoAddedRecipesV2[0].id;
  const afterDeletion = secondInstall.recipes.filter((recipe) => recipe.id !== deletedRecipeId);
  const repeatedInstall = installAutoAddedRecipePackV2(afterDeletion, secondInstall.installedRecipePacks);

  assert.equal(repeatedInstall.addedCount, 0);
  assert.equal(repeatedInstall.recipes.length, 39);
  assert.ok(!repeatedInstall.recipes.some((recipe) => recipe.id === deletedRecipeId));
});

test("Green Roasting Tin pack contains 12 attributed recipes with local meal pictures", () => {
  assert.equal(greenRoastingTinRecipes.length, 12);
  assert.equal(new Set(greenRoastingTinRecipes.map((recipe) => recipe.id)).size, 12);
  assert.equal(greenRoastingTinRecipes.filter((recipe) => recipe.mealTypes.includes("breakfast")).length, 1);
  assert.equal(greenRoastingTinRecipes.filter((recipe) => recipe.mealTypes.includes("dinner")).length, 11);

  greenRoastingTinRecipes.forEach((recipe) => {
    assert.equal(recipe.source, "The Green Roasting Tin");
    assert.equal(recipe.importedFrom, "photo");
    assert.ok(recipe.tags.includes("cookbook"), `${recipe.title} is missing the cookbook tag`);
    assert.match(recipe.mealImageUrl ?? "", /^\/recipe-images\/green-roasting-tin\/[a-z0-9-]+\.jpg$/);
    const imagePath = path.join(process.cwd(), "public", (recipe.mealImageUrl ?? "").replace(/^\//, ""));
    assert.ok(fs.existsSync(imagePath), `${recipe.title} is missing its local meal picture`);
    assert.ok(fs.statSync(imagePath).size > 20_000, `${recipe.title} meal picture is unexpectedly small`);
    assert.ok(recipe.ingredients.length >= 8, `${recipe.title} needs a useful ingredient list`);
    assert.ok(recipe.instructions.length >= 3, `${recipe.title} needs a useful condensed method`);
  });
});

test("Green Roasting Tin pack installs once after both curated packs", () => {
  const firstInstall = installAutoAddedRecipePack([]);
  const secondInstall = installAutoAddedRecipePackV2(firstInstall.recipes, firstInstall.installedRecipePacks);
  const cookbookInstall = installGreenRoastingTinRecipePack(secondInstall.recipes, secondInstall.installedRecipePacks);

  assert.equal(cookbookInstall.addedCount, 12);
  assert.equal(cookbookInstall.recipes.length, 52);
  assert.deepEqual(cookbookInstall.installedRecipePacks, [
    AUTO_ADDED_RECIPE_PACK_ID,
    AUTO_ADDED_RECIPE_PACK_V2_ID,
    GREEN_ROASTING_TIN_RECIPE_PACK_ID
  ]);

  const deletedRecipeId = greenRoastingTinRecipes[0].id;
  const afterDeletion = cookbookInstall.recipes.filter((recipe) => recipe.id !== deletedRecipeId);
  const repeatedInstall = installGreenRoastingTinRecipePack(afterDeletion, cookbookInstall.installedRecipePacks);

  assert.equal(repeatedInstall.addedCount, 0);
  assert.equal(repeatedInstall.recipes.length, 51);
  assert.ok(!repeatedInstall.recipes.some((recipe) => recipe.id === deletedRecipeId));
});
