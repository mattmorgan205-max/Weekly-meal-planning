import { addDays, createId, formatDateKey, type AppState, type PlannedMeal, type Recipe } from "./domain";
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
export type GuidedMealSlot = "lunch" | "dinner";

export function mealCalendarDays(start: string, end: string) {
  if (!shopDates(start, end).length) return [];
  const first = new Date(`${start}T12:00:00`);
  const monday = addDays(first, -((first.getDay() + 6) % 7));
  const last = new Date(`${end}T12:00:00`);
  const days: string[] = [];
  for (let date = monday; date <= last || days.length < 14 || days.length % 7 !== 0; date = addDays(date, 1)) days.push(formatDateKey(date));
  return days;
}

export function mealSource(recipe?: Recipe) {
  const value = recipe?.sourceUrl || recipe?.source;
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return { label: url.hostname.replace(/^www\./, ""), href: url.href };
    } catch { /* A cookbook or handwritten source is a label, not a URL. */ }
  }
  return { label: recipe?.source || ({ photo: "Photo import", url: "URL import", paste: "Text import", manual: "Manual" }[recipe?.importedFrom ?? "manual"]) };
}

export function addLeftoverMeal(state: AppState, meal: PlannedMeal): AppState {
  return { ...state, plannedMeals: [...state.plannedMeals, {
    id: createId("meal"), date: formatDateKey(addDays(new Date(`${meal.date}T12:00:00`), 1)), slot: "lunch",
    recipeId: meal.recipeId, manualTitle: meal.recipeId ? undefined : meal.manualTitle,
    peopleCount: 0, portionSource: "manual", notes: "Leftovers", selectedIngredientIds: meal.selectedIngredientIds,
    extraSideIngredients: meal.extraSideIngredients?.map(ingredient => ({ ...ingredient }))
  }] };
}

export function mealFromDinnerEntry(entry: AutoDinnerPlanEntry, fallback: number): PlannedMeal {
  return { id: createId("meal"), date: entry.date, slot: "dinner", recipeId: entry.recipeId,
    peopleCount: entry.peopleCount ?? fallback, portionSource: "diners",
    selectedIngredientIds: [...entry.selectedIngredientIds], extraSideIngredients: entry.extraSideIngredients.map(item => ({ ...item })),
    notes: entry.coveredUseUpIngredients.length ? `Auto planned: uses ${entry.coveredUseUpIngredients.join(", ")}` : "Auto planned" };
}

function destinationError(state: AppState, meal: PlannedMeal, date: string, slot: GuidedMealSlot) {
  const shop = state.guidedShop;
  if (!shop || !shopDates(shop.startDate, shop.endDate).includes(date)) return "Choose a day in this shop.";
  if (slot === "dinner" && !dinnerNeedsMeal(state.dinnerAttendance?.[date])) return "This day is marked as no dinner needed.";
  const recipe = state.recipes.find(row => row.id === meal.recipeId);
  if (meal.recipeId && !recipe) return "This recipe is no longer available.";
  if (slot === "dinner" && recipe && !recipeAllowedForDinner(recipe, date, state.dinnerAttendance, state.dayNotes)) return "This meal does not match the diners on that day.";
  return null;
}

export function placeGuidedMeal(state: AppState, source: GuidedMealSource, date: string | null, slot: GuidedMealSlot = "dinner", targetMealId?: string): { state: AppState; error?: string } {
  const shop = state.guidedShop;
  if (!shop) return { state, error: "Start a shop first." };
  const parked = shop.unplannedMeals ?? [];
  const meal = source.kind === "planned" ? state.plannedMeals.find(row => row.id === source.meal.id)
    : source.kind === "parked" ? parked.find(row => row.id === source.meal.id) : source.meal;
  if (!meal || meal.notes === "Guided dinner status") return { state, error: "Choose a meal to move." };
  if (date && source.kind === "planned" && meal.date === date && meal.slot === slot) return { state };
  if (date) {
    const error = destinationError(state, meal, date, slot);
    if (error) return { state, error };
  }
  const occupants = date ? state.plannedMeals.filter(row => row.date === date && row.slot === slot && row.id !== meal.id && (!targetMealId || row.id === targetMealId)) : [];
  if (targetMealId && !occupants.length) return { state, error: "That meal has moved. Choose its new slot." };
  if (source.kind === "planned" && occupants.length > 1) return { state, error: "Drop onto a particular meal to swap it." };
  const swap = source.kind === "planned" && (meal.slot === "lunch" || meal.slot === "dinner") && occupants.length === 1;
  if (swap) {
    const error = destinationError(state, occupants[0], meal.date, meal.slot as GuidedMealSlot);
    if (error) return { state, error: `Cannot swap: ${error}` };
  }
  const move = (row: PlannedMeal, day: string, destinationSlot: GuidedMealSlot): PlannedMeal => {
    const leftover = row.notes === "Leftovers" && row.peopleCount === 0;
    const dinerPortions = !leftover && destinationSlot === "dinner" && (row.portionSource === "diners" || row.slot !== "dinner");
    const portions = dinerPortions ? attendancePortions(state.dinnerAttendance?.[day], state.settings.defaultPeople) + (row.extraPortions ?? 0)
      : destinationSlot === "lunch" && source.kind === "new" && row.id === meal.id ? state.settings.defaultPeople : row.peopleCount;
    return { ...scaleMealPortions(row, portions), date: day, slot: destinationSlot,
      portionSource: dinerPortions ? "diners" : "manual" };
  };
  const removedIds = new Set([meal.id, ...occupants.map(row => row.id)]);
  const plannedMeals = state.plannedMeals.filter(row => !removedIds.has(row.id));
  const unplannedMeals = parked.filter(row => !removedIds.has(row.id));
  if (date) plannedMeals.push(move(meal, date, slot)); else unplannedMeals.push(meal);
  if (swap) plannedMeals.push(move(occupants[0], meal.date, meal.slot as GuidedMealSlot)); else unplannedMeals.push(...occupants);
  return { state: { ...state, plannedMeals, guidedShop: { ...shop, unplannedMeals } } };
}

export function applyGuidedDinnerPreview(state: AppState, plan: AutoDinnerPlanResult) {
  return plan.entries.reduce((current, entry) => {
    if (plan.mode === "fill" && current.plannedMeals.some(meal => meal.date === entry.date && meal.slot === "dinner")) return current;
    return placeGuidedMeal(current, { kind: "new", meal: mealFromDinnerEntry(entry, current.settings.defaultPeople) }, entry.date).state;
  }, state);
}

export function removeDinnerPreviewEntry(plan: AutoDinnerPlanResult, entry: AutoDinnerPlanEntry) {
  return { ...plan, entries: plan.entries.filter(row => row !== entry), summary: { ...plan.summary,
    categoryCounts: { ...plan.summary.categoryCounts, [entry.category]: Math.max(0, plan.summary.categoryCounts[entry.category] - 1) },
    quickCount: plan.summary.quickCount - Number(entry.quick), familiarCount: plan.summary.familiarCount - Number(entry.familiar), recipeDinnerCount: plan.summary.recipeDinnerCount - 1 } };
}
