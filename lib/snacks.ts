import type { AppState, GuidedShop, PlannedMeal, Recipe } from "./domain";

export const defaultSnackGroups = ["Sophia lunches", "Smoothies", "Puddings", "Snacks"];

export function snackRecipeGroups(recipes: Recipe[], selectedIds: string[] = []) {
  const groups = new Map<string, { name: string; recipes: Recipe[] }>();
  for (const recipe of recipes) {
    if (!recipe.snackGroup?.trim() && !recipe.mealTypes.includes("snack") && !selectedIds.includes(recipe.id)) continue;
    const name = recipe.snackGroup?.trim().replace(/\s+/g, " ") || "Snacks";
    const key = name.toLocaleLowerCase("en-GB");
    if (!groups.has(key)) groups.set(key, { name, recipes: [] });
    groups.get(key)!.recipes.push(recipe);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)).map(group => ({
    ...group, recipes: group.recipes.sort((a, b) => a.title.localeCompare(b.title))
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
