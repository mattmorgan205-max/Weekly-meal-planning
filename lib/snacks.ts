import type { AppState, GuidedShop, PlannedMeal, Recipe } from "./domain";

export const defaultSnackGroups = ["Snacks and smoothies", "Sophia lunches", "Puddings", "Breakfast"];

export function snackColumn(value?: string) {
  const key = value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
  // Preserve assignments made before the four-column picker was introduced.
  if (key === "puddings & sweet treats") return "Puddings";
  if (key === "snacks" || key === "smoothies") return "Snacks and smoothies";
  return defaultSnackGroups.find(name => name.toLocaleLowerCase("en-GB") === key);
}

export function assignSnackGroup(recipes: Recipe[], ids: string[], group: string, updatedAt = new Date().toISOString()) {
  const normalized = snackColumn(group);
  if (group && !normalized) return recipes;
  const selected = new Set(ids);
  return recipes.map(recipe => selected.has(recipe.id) ? { ...recipe, snackGroup: normalized, updatedAt } : recipe);
}

export function snackRecipeGroups(recipes: Recipe[]) {
  return defaultSnackGroups.map(name => ({
    name, recipes: recipes.filter(recipe => snackColumn(recipe.snackGroup) === name).sort((a, b) => a.title.localeCompare(b.title))
  }));
}

export function setSnackSelection(state: AppState, recipeId: string, servings: number, selectedIngredientIds?: string[]): AppState {
  if (!state.guidedShop || !Number.isFinite(servings)) return state;
  const recipe = state.recipes.find(row => row.id === recipeId);
  if (!recipe && servings > 0) return state;
  const current = state.guidedShop.snackSelections ?? [];
  const previous = current.find(row => row.recipeId === recipeId);
  const selections = current.filter(row => row.recipeId !== recipeId);
  if (servings > 0) selections.push({ recipeId, servings: Math.min(100, Math.max(0.5, servings)),
    selectedIngredientIds: (selectedIngredientIds ?? previous?.selectedIngredientIds ?? []).filter(id => recipe!.ingredients.some(row => row.id === id)) });
  return { ...state, guidedShop: { ...state.guidedShop, snackSelections: selections } };
}

// Shop-wide selections use the existing ingredient scaling/merging engine without adding a dated planner meal.
export function snackShoppingMeals(shop: GuidedShop): PlannedMeal[] {
  return (shop.snackSelections ?? []).filter(row => Number.isFinite(row.servings) && row.servings > 0).map(row => ({
    id: `snack-${row.recipeId}`, recipeId: row.recipeId, date: shop.startDate, slot: "snack", peopleCount: row.servings,
    selectedIngredientIds: row.selectedIngredientIds, portionSource: "manual"
  }));
}
