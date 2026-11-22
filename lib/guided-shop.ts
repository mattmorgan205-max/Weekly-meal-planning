import {
  addDays, createId, formatDateKey, generateShoppingList, normalizeUnit,
  type AppState, type DinnerAttendance, type GuidedShop,
  type HouseholdDiner, type PlannedMeal, type Recipe, type ShoppingListItem, type SupplyCheck
} from "./domain";
import { snackShoppingMeals } from "./snacks";

export const guidedSteps = ["Dates & diners", "Meals", "Snacks and extras", "Check supplies", "Review & shop"];
export const shopRangeKey = (shop: Pick<GuidedShop, "startDate" | "endDate">) => `${shop.startDate}__${shop.endDate}`;

export function shopDates(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [];
  const first = new Date(`${start}T12:00:00`), last = new Date(`${end}T12:00:00`);
  if (!Number.isFinite(+first) || !Number.isFinite(+last) || last < first || formatDateKey(first) !== start || formatDateKey(last) !== end) return [];
  const dates: string[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    dates.push(formatDateKey(date));
    if (dates.length > 14) return [];
  }
  return dates;
}

export function defaultDiners(people: number): HouseholdDiner[] {
  return Array.from({ length: Math.max(1, Math.ceil(people)) }, (_, index) => ({
    id: `diner-${index + 1}`, name: `Person ${index + 1}`, portions: index + 1 > people ? people % 1 : 1, usual: true
  }));
}
export function defaultAttendance(diners: HouseholdDiner[]): DinnerAttendance {
  return { confirmed: false, portions: Object.fromEntries(diners.filter(diner => diner.usual).map(diner => [diner.id, diner.portions])), guests: 0,
    sophiaEating: diners.some(diner => diner.usual && diner.portions > 0 && diner.name.trim().toLowerCase() === "sophia") };
}
export function attendancePortions(attendance: DinnerAttendance | undefined, fallback: number) {
  return attendance ? Math.max(0, Object.values(attendance.portions).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0) + (Number(attendance.guests) || 0)) : fallback;
}
export function dinnerNeedsMeal(attendance?: DinnerAttendance) {
  return (!attendance?.dinnerStatus || attendance.dinnerStatus === "plan") && (!attendance?.confirmed || attendancePortions(attendance, 0) > 0);
}
export function recipeAllowedForDinner(recipe: Recipe, date: string, attendance: Record<string, DinnerAttendance> = {}, notes: Record<string, string> = {}) {
  if (!dinnerNeedsMeal(attendance[date])) return false;
  if (!recipe.tags.some(tag => tag.trim().toLowerCase() === "not sophia friendly")) return true;
  return attendance[date]?.confirmed ? !attendance[date].sophiaEating : /\bsophia\s+nursery\b/i.test(notes[date] ?? "");
}
export function scaleMealPortions(meal: PlannedMeal, portions: number): PlannedMeal {
  const next = Math.max(0, portions);
  const previous = meal.peopleCount > 0 ? meal.peopleCount : meal.sidePortions;
  return { ...meal, peopleCount: next, sidePortions: next > 0 ? next : previous, extraSideIngredients: meal.extraSideIngredients?.map(ingredient => ({
    ...ingredient, quantity: typeof ingredient.quantity === "number" && previous && next > 0 ? ingredient.quantity * next / previous : ingredient.quantity
  })) };
}
export function attendanceForSlot(state: AppState, date: string, slot: "lunch" | "dinner"): DinnerAttendance {
  const saved = (slot === "lunch" ? state.lunchAttendance : state.dinnerAttendance)?.[date];
  if (saved) return saved;
  // Older planned lunches keep their requirements until attendance is explicitly changed.
  if (slot === "dinner" || state.plannedMeals.some(meal => meal.date === date && meal.slot === "lunch")) return defaultAttendance(state.settings.diners ?? defaultDiners(state.settings.defaultPeople));
  return { confirmed: true, portions: {}, guests: 0, sophiaEating: false };
}

export function setAttendance(state: AppState, date: string, attendance: DinnerAttendance, slot: "lunch" | "dinner" = "dinner"): AppState {
  const key = slot === "lunch" ? "lunchAttendance" : "dinnerAttendance";
  return { ...state, [key]: { ...state[key], [date]: { ...attendance, portions: { ...attendance.portions } } }, plannedMeals: state.plannedMeals.map(meal =>
    meal.date === date && meal.slot === slot && meal.portionSource === "diners" && meal.notes !== "Leftovers"
      ? scaleMealPortions(meal, dinnerNeedsMeal(attendance) ? attendancePortions(attendance, state.settings.defaultPeople) + (meal.extraPortions ?? 0) : 0) : meal) };
}

export function removeMealFromPlan(state: AppState, id: string, excludeRecipe = false): AppState {
  const meal = state.plannedMeals.find(row => row.id === id);
  if (!meal) return state;
  const dinnerAttendance = { ...state.dinnerAttendance };
  if (meal.notes === "Guided dinner status" && dinnerAttendance[meal.date]) {
    dinnerAttendance[meal.date] = { ...dinnerAttendance[meal.date], dinnerStatus: "plan" };
  }
  return { ...state, dinnerAttendance, plannedMeals: state.plannedMeals.filter(row => row.id !== id),
    guidedShop: excludeRecipe && meal.recipeId && state.guidedShop ? { ...state.guidedShop,
      excludedRecipeIds: Array.from(new Set([...state.guidedShop.excludedRecipeIds, meal.recipeId])) } : state.guidedShop };
}

export function copyAttendanceToDates(state: AppState, sourceDate: string, slot: "lunch" | "dinner", targets: string[]): AppState {
  const source = attendanceForSlot(state, sourceDate, slot);
  const allowed = state.guidedShop ? shopDates(state.guidedShop.startDate, state.guidedShop.endDate) : [];
  return [...new Set(targets)].filter(date => allowed.includes(date)).reduce((next, date) => setAttendance(next, date, {
    ...source, confirmed: true, dinnerStatus: attendanceForSlot(next, date, slot).dinnerStatus
  }, slot), state);
}

export function createShop(startDate: string, endDate: string, id = createId("shop")): GuidedShop {
  return { id, startDate, endDate, step: 0, method: "checklist", supplyChecks: {}, basketChecks: {}, excludedRecipeIds: [] };
}

function shoppingItemsForMeals(state: AppState, shop: GuidedShop, meals: PlannedMeal[]) {
  const range = shopRangeKey(shop);
  const hidden = Object.fromEntries(Object.entries(state.hiddenShoppingItems).filter(([key]) => key.startsWith(`${range}__`)).map(([key, value]) => [key.slice(range.length + 2), value]));
  return generateShoppingList(state.recipes, meals,
    { ...state.settings, includeStaples: true }, {}, hidden,
    state.manualShoppingItems.filter(item => item.shoppingRangeKey === range).map(item => ({ ...item, checked: false })));
}

export function requiredShopItems(state: AppState, shop: GuidedShop) {
  const dinnersIncluded = state.plannedMeals.filter(meal => meal.date >= shop.startDate && meal.date <= shop.endDate
    && ((meal.slot !== "dinner" && meal.slot !== "lunch") || dinnerNeedsMeal(attendanceForSlot(state, meal.date, meal.slot))));
  return shoppingItemsForMeals(state, shop, [...dinnersIncluded, ...snackShoppingMeals(shop)]);
}

// This is a projection, not a second shopping list: only snack contributions and manual extras.
export function addedShopExtras(state: AppState, shop: GuidedShop) {
  return shoppingItemsForMeals(state, shop, snackShoppingMeals(shop));
}

export function requirementSignature(item: ShoppingListItem) {
  return JSON.stringify([item.canonicalName || item.name.toLowerCase(), item.quantity ?? null, normalizeUnit(item.unit), item.displayQuantity]);
}

export function migrateGuidedState(state: AppState, startDate: string, endDate: string): AppState {
  const diners = state.settings.diners ?? defaultDiners(state.settings.defaultPeople);
  const attendance = { ...state.dinnerAttendance };
  for (const date of shopDates(state.guidedShop?.startDate ?? startDate, state.guidedShop?.endDate ?? endDate)) attendance[date] ??= defaultAttendance(diners);
  if (state.guidedShop) return { ...state, dinnerAttendance: attendance, settings: { ...state.settings, diners } };
  const shop = createShop(startDate, endDate, `${startDate}__${endDate}`);
  shop.method = "asda";
  const items = requiredShopItems(state, shop);
  for (const item of items) {
    const added = state.asdaShoppingStatus[`asda__${shopRangeKey(shop)}__${item.id}`] === "added";
    const checked = state.shoppingChecks[item.id] || state.manualShoppingItems.find(row => row.id === item.id)?.checked;
    if (added) shop.basketChecks[item.id] = requirementSignature(item);
    else if (checked) shop.supplyChecks[item.id] = { status: "enough", requirement: requirementSignature(item) };
  }
  return { ...state, guidedShop: shop, dinnerAttendance: attendance, settings: { ...state.settings, diners } };
}

export function changeShopDates(state: AppState, startDate: string, endDate: string): AppState {
  if (!state.guidedShop || !shopDates(startDate, endDate).length) return state;
  const previous = shopRangeKey(state.guidedShop), next = `${startDate}__${endDate}`;
  const statuses = { ...state.asdaShoppingStatus }, hidden = { ...state.hiddenShoppingItems };
  for (const [key, value] of Object.entries(statuses)) if (key.startsWith(`asda__${previous}__`)) statuses[key.replace(`asda__${previous}__`, `asda__${next}__`)] = value;
  for (const [key, value] of Object.entries(hidden)) if (key.startsWith(`${previous}__`)) hidden[key.replace(`${previous}__`, `${next}__`)] = value;
  return migrateGuidedState({ ...state, guidedShop: { ...state.guidedShop, startDate, endDate }, asdaShoppingStatus: statuses, hiddenShoppingItems: hidden,
    manualShoppingItems: state.manualShoppingItems.map(item => item.shoppingRangeKey === previous ? { ...item, shoppingRangeKey: next } : item) }, startDate, endDate);
}

export type SupplyResult = { required: ShoppingListItem; buy: ShoppingListItem | null; check?: SupplyCheck; reviewReason?: string };
export function resolveSupply(item: ShoppingListItem, shop: GuidedShop): SupplyResult {
  const signature = requirementSignature(item), check = shop.supplyChecks[item.id];
  const result: SupplyResult = { required: item, check, buy: { ...item, checked: shop.basketChecks[item.id] === signature } };
  if (check && check.requirement !== signature) return { ...result, reviewReason: "Required amount changed. Check supplies again." };
  if (!check || check.status === "need") return result;
  if (check.status === "enough") return { ...result, buy: null };
  return { ...result, reviewReason: "Previously marked as Have some. Choose Already got or Need to buy." };
}
export function resolveShop(items: ShoppingListItem[], shop: GuidedShop) { return items.map(item => resolveSupply(item, shop)); }
export function shopSignature(items: ShoppingListItem[], shop: GuidedShop) {
  return JSON.stringify([shop.startDate, shop.endDate, resolveShop(items, shop).map(row => [row.required.id, requirementSignature(row.required), row.buy?.displayQuantity ?? null, row.reviewReason ?? ""]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
}
export function shopIsFinalized(items: ShoppingListItem[], shop: GuidedShop) { return shop.finalizedSignature === shopSignature(items, shop); }

export function changeDiners(state: AppState, diners: HouseholdDiner[]): AppState {
  let next: AppState = { ...state, settings: { ...state.settings, diners } };
  for (const slot of ["lunch", "dinner"] as const) for (const [date, attendance] of Object.entries((slot === "lunch" ? state.lunchAttendance : state.dinnerAttendance) ?? {})) {
    const portions = Object.fromEntries(Object.entries(attendance.portions).filter(([id]) => diners.some(diner => diner.id === id)));
    const updated = attendance.confirmed ? { ...attendance, portions } : { ...defaultAttendance(diners), dinnerStatus: attendance.dinnerStatus };
    updated.sophiaEating = diners.some(diner => diner.name.trim().toLowerCase() === "sophia" && (updated.portions[diner.id] ?? 0) > 0);
    next = setAttendance(next, date, updated, slot);
  }
  return next;
}
