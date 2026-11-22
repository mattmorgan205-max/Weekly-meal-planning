import { addDays, createId, formatDateKey, type AppState, type PlannedMeal } from "./domain";
import { attendancePortions, dinnerNeedsMeal, recipeAllowedForDinner, scaleMealPortions, shopDates } from "./guided-shop";
import type { AutoDinnerPlanEntry, AutoDinnerPlanResult } from "./dinner-planner";

export function calendarDays(month: string) {
  const first = new Date(`${month.slice(0, 7)}-01T12:00:00`);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => formatDateKey(addDays(start, index)));
}

export function calendarRange(anchor: string, date: string) {
  const [start, end] = [anchor, date].sort();
  return shopDates(start, end).length ? { start, end } : null;
}

export type GuidedMealSource = { kind: "planned" | "parked" | "new"; meal: PlannedMeal };

export function mealFromDinnerEntry(entry: AutoDinnerPlanEntry, fallback: number): PlannedMeal {
  return { id: createId("meal"), date: entry.date, slot: "dinner", recipeId: entry.recipeId,
    peopleCount: entry.peopleCount ?? fallback, portionSource: "diners",
    selectedIngredientIds: [...entry.selectedIngredientIds], extraSideIngredients: entry.extraSideIngredients.map(item => ({ ...item })),
    notes: entry.coveredUseUpIngredients.length ? `Auto planned: uses ${entry.coveredUseUpIngredients.join(", ")}` : "Auto planned" };
}

function destinationError(state: AppState, meal: PlannedMeal, date: string) {
  const shop = state.guidedShop;
  if (!shop || !shopDates(shop.startDate, shop.endDate).includes(date)) return "Choose a day in this shop.";
  if (!dinnerNeedsMeal(state.dinnerAttendance?.[date])) return "This day is marked as no dinner needed.";
  const recipe = state.recipes.find(row => row.id === meal.recipeId);
  if (meal.recipeId && !recipe) return "This recipe is no longer available.";
  if (recipe && !recipeAllowedForDinner(recipe, date, state.dinnerAttendance, state.dayNotes)) return "This meal does not match the diners on that day.";
  return null;
}

export function placeGuidedMeal(state: AppState, source: GuidedMealSource, date: string | null): { state: AppState; error?: string } {
  const shop = state.guidedShop;
  if (!shop) return { state, error: "Start a shop first." };
  const parked = shop.unplannedMeals ?? [];
  const meal = source.kind === "planned" ? state.plannedMeals.find(row => row.id === source.meal.id)
    : source.kind === "parked" ? parked.find(row => row.id === source.meal.id) : source.meal;
  if (!meal || meal.notes === "Guided dinner status") return { state, error: "Choose a dinner to move." };
  if (date && source.kind === "planned" && meal.date === date && meal.slot === "dinner") return { state };
  if (date) {
    const error = destinationError(state, meal, date);
    if (error) return { state, error };
  }
  const occupants = date ? state.plannedMeals.filter(row => row.date === date && row.slot === "dinner" && row.id !== meal.id) : [];
  const swap = source.kind === "planned" && meal.slot === "dinner" && occupants.length === 1;
  if (swap) {
    const error = destinationError(state, occupants[0], meal.date);
    if (error) return { state, error: `Cannot swap: ${error}` };
  }
  const move = (row: PlannedMeal, day: string) => ({
    ...(row.portionSource === "diners" ? scaleMealPortions(row, attendancePortions(state.dinnerAttendance?.[day], state.settings.defaultPeople) + (row.extraPortions ?? 0)) : row),
    date: day, slot: "dinner" as const
  });
  const removedIds = new Set([meal.id, ...occupants.map(row => row.id)]);
  const plannedMeals = state.plannedMeals.filter(row => !removedIds.has(row.id));
  const unplannedMeals = parked.filter(row => !removedIds.has(row.id));
  if (date) plannedMeals.push(move(meal, date)); else unplannedMeals.push(meal);
  if (swap) plannedMeals.push(move(occupants[0], meal.date)); else unplannedMeals.push(...occupants);
  return { state: { ...state, plannedMeals, guidedShop: { ...shop, unplannedMeals } } };
}

export function applyGuidedDinnerPreview(state: AppState, plan: AutoDinnerPlanResult) {
  return plan.entries.reduce((current, entry) => {
    if (plan.mode === "fill" && current.plannedMeals.some(meal => meal.date === entry.date && meal.slot === "dinner")) return current;
    return placeGuidedMeal(current, { kind: "new", meal: mealFromDinnerEntry(entry, current.settings.defaultPeople) }, entry.date).state;
  }, state);
}
