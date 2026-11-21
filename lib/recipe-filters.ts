import { mergeAutomaticRecipeTags, totalRecipeMinutes, type Recipe } from "./domain";

export type RecipeFilters = {
  time: "all" | "quick" | "30-60" | "over-60";
  protein: "all" | "vegetarian" | "chicken" | "pork" | "beef" | "fish" | "lamb" | "duck";
  favoritesOnly: boolean;
  tag: string;
};

export const emptyRecipeFilters: RecipeFilters = { time: "all", protein: "all", favoritesOnly: false, tag: "" };

export function hasRecipeFilters(filters: RecipeFilters) {
  return filters.time !== "all" || filters.protein !== "all" || filters.favoritesOnly || Boolean(filters.tag);
}

export function matchesRecipeFilters(recipe: Recipe, filters: RecipeFilters) {
  const minutes = totalRecipeMinutes(recipe);
  if (filters.time === "quick" && !(minutes > 0 && minutes < 30)) return false;
  if (filters.time === "30-60" && !(minutes >= 30 && minutes <= 60)) return false;
  if (filters.time === "over-60" && !(minutes > 60)) return false;
  if (filters.favoritesOnly && !recipe.favorite) return false;
  const suppressed = new Set((recipe.suppressedAutoTags ?? []).map((tag) => tag.toLowerCase()));
  const savedTags = recipe.tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => !suppressed.has(tag));
  const inferredTags = mergeAutomaticRecipeTags([], recipe, recipe.suppressedAutoTags);
  if (filters.tag && !savedTags.includes(filters.tag.trim().toLowerCase())) return false;
  if (filters.protein === "all") return true;
  // Older recipes can have a vegetarian auto-tag despite containing lamb or other game.
  const text = [recipe.title, ...recipe.ingredients.map((ingredient) => ingredient.name)].join(" ").toLowerCase();
  const lamb = /\blamb\b/.test(text);
  if (filters.protein === "lamb") return lamb;
  if (filters.protein === "vegetarian" && /\b(lamb|venison|rabbit)\b/.test(text)) return false;
  const proteinTags = savedTags.filter((tag) => ["vegetarian", "chicken", "pork", "beef", "fish", "lamb", "duck"].includes(tag));
  return (proteinTags.length ? proteinTags : inferredTags).includes(filters.protein);
}
