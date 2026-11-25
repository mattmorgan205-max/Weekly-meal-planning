import type { Recipe } from "./domain";
import { canonicalTag, householdTagNames, preferenceTags, cleanRecipeTags } from "./recipe-tags";
import { jsonState, mergeHousehold } from "./household-sync";

export function mergeEditedRecipe(base: Recipe, edited: Recipe, latest?: Recipe) {
  // Derived tags must be normalised on all sides: changing a title can change
  // automatic tags even when neither person has edited the tags themselves.
  const merged = mergeHousehold(jsonState(cleanRecipeTags(base)), jsonState(cleanRecipeTags(edited)), latest ? jsonState(cleanRecipeTags(latest)) : undefined);
  return { conflicts: merged.conflicts, recipe: merged.state ? cleanRecipeTags(merged.state as Recipe) : undefined };
}

export function recipeForCatalog(recipe: Recipe): Recipe {
  return { ...recipe, favorite: false, householdTags: [],
    tags: recipe.tags.filter(tag => !householdTagNames.includes(canonicalTag(tag))),
    confirmedTags: recipe.confirmedTags?.filter(tag => !householdTagNames.includes(canonicalTag(tag)))
  };
}

export function catalogRecipeForHousehold(catalogRecipe: Recipe, existing?: Recipe): Recipe {
  return { ...recipeForCatalog(catalogRecipe), favorite: existing?.favorite ?? false, householdTags: existing ? preferenceTags(existing) : [] };
}

function timestamp(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function shouldReplaceRecipeWithCatalog(
  existing: Recipe,
  catalogRecipe: Recipe,
  catalogRowUpdatedAt?: string
) {
  if (existing.visibility !== "global") return false;
  if (
    existing.catalogSourceHouseholdId &&
    catalogRecipe.catalogSourceHouseholdId &&
    existing.catalogSourceHouseholdId !== catalogRecipe.catalogSourceHouseholdId
  ) {
    return false;
  }

  const existingUpdatedAt = timestamp(existing.updatedAt);
  const catalogUpdatedAt = Math.max(timestamp(catalogRecipe.updatedAt), timestamp(catalogRowUpdatedAt));

  return !existingUpdatedAt || !catalogUpdatedAt || catalogUpdatedAt >= existingUpdatedAt;
}
