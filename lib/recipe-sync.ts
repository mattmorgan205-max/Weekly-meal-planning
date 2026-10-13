import type { Recipe } from "./domain";

export function catalogRecipeForHousehold(catalogRecipe: Recipe, existing?: Recipe): Recipe {
  return { ...catalogRecipe, favorite: existing?.favorite ?? false };
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
