import type { Recipe } from "./domain";
import { canonicalTag, displayRecipeTags, knownTotalMinutes, preferenceTags, sourceTags } from "./recipe-tags";

export type RecipeFilters = {
  time: "all" | "15" | "30" | "60" | "quick" | "30-60" | "over-60";
  protein: "all" | "vegetarian" | "chicken" | "pork" | "beef" | "fish" | "lamb" | "duck" | "other meat";
  favoritesOnly: boolean;
  tag: string;
  diet?: string;
  dish?: string;
  method?: string;
  practical?: string;
  source?: string;
  familiarOnly?: boolean;
  sophia?: string;
};

export const emptyRecipeFilters: RecipeFilters = { time: "all", protein: "all", favoritesOnly: false, tag: "" };

export function hasRecipeFilters(filters: RecipeFilters) {
  return filters.time !== "all" || filters.protein !== "all" || filters.favoritesOnly || Boolean(filters.tag || filters.diet || filters.dish || filters.method || filters.practical || filters.source || filters.familiarOnly || filters.sophia);
}

export function matchesRecipeFilters(recipe: Recipe, filters: RecipeFilters) {
  const minutes = knownTotalMinutes(recipe);
  if (["15", "30", "60"].includes(filters.time) && !(minutes > 0 && minutes <= Number(filters.time))) return false;
  if (filters.time === "quick" && !(minutes > 0 && minutes < 30)) return false;
  if (filters.time === "30-60" && !(minutes >= 30 && minutes <= 60)) return false;
  if (filters.time === "over-60" && !(minutes > 60)) return false;
  if (filters.favoritesOnly && !recipe.favorite) return false;
  const tags = displayRecipeTags(recipe);
  const preferences = preferenceTags(recipe);
  if (filters.protein !== "all" && !tags.includes(canonicalTag(filters.protein))) return false;
  if ([filters.diet, filters.dish, filters.method, filters.practical].some(tag => tag && !tags.includes(canonicalTag(tag)))) return false;
  if (filters.tag && ![...tags, ...preferences, ...sourceTags(recipe)].includes(canonicalTag(filters.tag))) return false;
  if (filters.source && !sourceTags(recipe).includes(filters.source)) return false;
  if (filters.familiarOnly && !preferences.includes("familiar")) return false;
  if (filters.sophia && !preferences.includes(filters.sophia)) return false;
  return true;
}
