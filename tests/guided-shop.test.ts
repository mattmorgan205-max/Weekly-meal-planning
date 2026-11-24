import assert from "node:assert/strict";
import test from "node:test";
import { commonExtraUsageForProfile, draftToRecipe, recipeToDraft, occasionalItemsForProfile, recordCompletedShoppingList, recordManualExtraUsage, seedState, type AppState, type DinnerAttendance, type PlannedMeal, type Recipe, type ShoppingListItem } from "../lib/domain";
import { addedShopExtras, attendanceForSlot, attendancePortions, changeDiners, changeShopDates, createShop, defaultAttendance, dinnerNeedsMeal, migrateGuidedState, recipeAllowedForDinner, removeMealFromPlan, requiredShopItems, requirementSignature, resolveShop, resolveSupply, scaleMealPortions, setAttendance, shopDates, shopIsFinalized, shopSignature } from "../lib/guided-shop";
import { buildAutoDinnerPlan } from "../lib/dinner-planner";
import { addLeftoverMeal, applyGuidedDinnerPreview, calendarDays, calendarRange, mealCalendarDays, mealFromDinnerEntry, mealSource, placeGuidedMeal, removeDinnerPreviewEntry } from "../lib/guided-planning";
import { assignSnackGroup, defaultSnackGroups, setSnackSelection, snackColumn, snackRecipeGroups } from "../lib/snacks";
import { copyAttendanceToDates } from "../lib/guided-shop";
import { allDinersSelected, dayNoteForDate, planningDefaultsForDates, recipeAllowedForState, refreshDinerPortions, toggleAllDiners, weekdayForDate } from "../lib/guided-shop";
import { dinerColor, dinerPalette, dinerTextColor, nextDinerColor, normalizeDinerColors } from "../lib/diner-colors";

const start = "2026-11-23", end = "2026-11-29";
const diners = [{ id: "adult", name: "Matt", portions: 1, usual: true }, { id: "child", name: "Sophia", portions: 0.5, usual: true }];
const attendance = (sophia: boolean): DinnerAttendance => ({ confirmed: true, portions: { adult: 1, ...(sophia ? { child: 0.5 } : {}) }, guests: 0, sophiaEating: sophia });
const item = (id = "carrots", quantity: number | undefined = 600, unit = "g"): ShoppingListItem => ({ id, name: id, canonicalName: id, quantity, unit, displayQuantity: quantity === undefined ? "as needed" : `${quantity} ${unit}`, category: "Produce", checked: false, sourceMeals: ["Test"] });
const recipe = (id: string, restricted = false): Recipe => ({ id, title: id, servings: 2, mealTypes: ["dinner"], prepMinutes: 5, cookMinutes: 15, tags: restricted ? ["Not Sophia friendly"] : [], favorite: false, ingredients: [{ id: `${id}-carrot`, name: "carrots", quantity: 600, unit: "g", category: "Produce" }], instructions: ["Cook"], createdAt: "2026-11-01", updatedAt: "2026-11-01" });
const meal = (id = "m", peopleCount = 2): PlannedMeal => ({ id, date: start, slot: "dinner", recipeId: "r", peopleCount, extraSideIngredients: [{ id: "side", name: "rice", quantity: 200, unit: "g", category: "Pantry", role: "side" }] });
function state(): AppState { const initial = seedState(); return migrateGuidedState({ ...initial, recipes: [recipe("r")], plannedMeals: [], settings: { ...initial.settings, diners }, manualShoppingItems: [], shoppingChecks: {}, asdaShoppingStatus: {} }, start, end); }

test("legacy diners gain distinct persistent colours and existing choices survive migration", () => {
  const current = state();
  const rows = current.settings.diners!;
  assert.equal(new Set(rows.map(row => row.color)).size, rows.length);
  rows[1].color = "#ffee00";
  const restored = migrateGuidedState(JSON.parse(JSON.stringify(current)), start, end);
  assert.deepEqual(restored.settings.diners, rows);
  assert.equal(normalizeDinerColors([...rows].reverse())[1].color, rows[0].color);
  assert.ok(!rows.some(row => row.color === nextDinerColor(rows)));
  assert.equal(dinerColor({ ...rows[0], color: "invalid" }, 2), dinerPalette[2]);
});

test("diner badges use readable foregrounds for custom and palette colours", () => {
  assert.equal(dinerTextColor("#ffffff"), "#000000");
  assert.equal(dinerTextColor("#000000"), "#ffffff");
  assert.equal(dinerTextColor("#ffff00"), "#000000");
  assert.equal(dinerTextColor("#0000ff"), "#ffffff");
  for (const color of dinerPalette) assert.ok(["#ffffff", "#000000"].includes(dinerTextColor(color)));
});

test("changing only a diner colour leaves meals, attendance and weekly defaults untouched", () => {
  const current = state();
  current.plannedMeals = [{ ...meal(), portionSource: "diners" }];
  current.settings.weeklyDefaults = { mon: { dinner: ["adult"] } };
  const next = changeDiners(current, current.settings.diners!.map(diner => ({ ...diner, color: "#ffee00" })));
  assert.equal(next.plannedMeals, current.plannedMeals);
  assert.equal(next.dinnerAttendance, current.dinnerAttendance);
  assert.equal(next.settings.weeklyDefaults, current.settings.weeklyDefaults);
  assert.equal(next.settings.diners![0].color, "#ffee00");
});

test("all-diner toggles select everyone from partial or empty days, then clear both slots", () => {
  let current = state();
  current.settings.diners = diners.map(diner => ({ ...diner, usual: false }));
  current = toggleAllDiners(current, start);
  assert.equal(allDinersSelected(current, start, ["lunch", "dinner"]), true);
  assert.equal(attendanceForSlot(current, start, "lunch").sophiaEating, true);
  assert.equal(attendancePortions(attendanceForSlot(current, start, "dinner"), 0), 1.5);
  current = toggleAllDiners(JSON.parse(JSON.stringify(current)), start);
  assert.equal(attendancePortions(attendanceForSlot(current, start, "lunch"), 0), 0);
  assert.equal(attendancePortions(attendanceForSlot(current, start, "dinner"), 0), 0);
  current = toggleAllDiners(current, start, ["lunch"]);
  assert.equal(allDinersSelected(current, start, ["lunch"]), true);
  assert.equal(attendancePortions(attendanceForSlot(current, start, "dinner"), 0), 0);
});

test("weekly defaults resolve across weeks, slots and reloads without changing date overrides", () => {
  let current = state();
  current.settings.weeklyDefaults = { mon: { lunch: ["child"], dinner: [], note: "Swimming" } };
  assert.equal(weekdayForDate("2026-11-30"), "mon");
  for (const date of [start, "2026-11-30"]) {
    assert.equal(attendancePortions(attendanceForSlot(current, date, "lunch"), 0), 0.5);
    assert.equal(dinnerNeedsMeal(attendanceForSlot(current, date, "dinner")), false);
    assert.equal(dayNoteForDate(current, date), "Swimming");
  }
  current = setAttendance(current, start, attendance(true));
  current.dayNotes[start] = "";
  current = changeShopDates(JSON.parse(JSON.stringify(current)), "2026-11-30", "2026-12-06");
  assert.equal(attendancePortions(attendanceForSlot(current, start, "dinner"), 0), 1.5);
  assert.equal(dayNoteForDate(current, start), "");
  assert.equal(dayNoteForDate(current, "2026-11-30"), "Swimming");
  assert.equal(current.dayNotes["2026-11-30"], undefined);
});

test("weekly default changes scale automatic meals and sides, not explicit diners or manual portions", () => {
  let current = state();
  current.plannedMeals = [{ ...meal(), portionSource: "diners" }, { ...meal("manual", 5), portionSource: "manual" }, { ...meal("leftover", 0), notes: "Leftovers" }];
  current.settings.weeklyDefaults = { mon: { dinner: ["adult"] } };
  current = refreshDinerPortions(current);
  assert.equal(current.plannedMeals[0].peopleCount, 1);
  assert.equal(current.plannedMeals[0].extraSideIngredients![0].quantity, 100);
  assert.equal(current.plannedMeals[1].peopleCount, 5);
  current.settings.weeklyDefaults!.mon!.dinner = [];
  current = refreshDinerPortions(current);
  assert.equal(requiredShopItems(current, current.guidedShop!).length, 0);
  assert.equal(current.plannedMeals.length, 3);
  current.settings.weeklyDefaults!.mon!.dinner = ["adult", "child"];
  current = refreshDinerPortions(current);
  assert.equal(current.plannedMeals[0].extraSideIngredients![0].quantity, 150);
  current = setAttendance(current, start, attendance(false));
  current.settings.weeklyDefaults!.mon!.dinner = [];
  assert.equal(refreshDinerPortions(current).plannedMeals[0].peopleCount, 1);
});

test("recurring notes and diners drive autoplan and drag rules without being persisted as overrides", () => {
  const current = state();
  current.settings.weeklyDefaults = { mon: { dinner: [], note: "Away" }, tue: { dinner: ["adult"], note: "Sophia nursery" } };
  const dates = shopDates(start, end), projected = planningDefaultsForDates(current, dates);
  const plan = buildAutoDinnerPlan({ startDate: start, endDate: end, mode: "fill", recipes: [recipe("restricted", true), recipe("safe")], plannedMeals: [], peopleCount: 4, ingredientAliases: {}, useUpIngredients: [], dayNotes: projected.dayNotes, dinnerAttendance: projected.dinnerAttendance });
  assert.ok(plan.entries.length);
  assert.ok(plan.entries.every(entry => entry.date !== start));
  assert.equal(recipeAllowedForState(current, recipe("restricted", true), "2026-11-24"), true);
  assert.ok(placeGuidedMeal(current, { kind: "new", meal: meal() }, start).error);
  assert.equal(projected.dayNotes[start], "Away");
  assert.equal(current.dayNotes[start], undefined);
  assert.equal(current.dinnerAttendance![start].confirmed, false);
});

test("removed diners are ignored in weekly defaults and renamed Sophia keeps the correct restriction", () => {
  const current = state(); current.settings.weeklyDefaults = { mon: { lunch: ["adult", "child"] } };
  const next = changeDiners(current, [{ ...diners[0], name: "Sophia" }]);
  assert.deepEqual(attendanceForSlot(next, start, "lunch").portions, { adult: 1 });
  assert.equal(attendanceForSlot(next, start, "lunch").sophiaEating, true);
});

test("editing only weekly notes leaves planned portions unchanged", () => {
  const current = state(); current.plannedMeals = [{ ...meal(), portionSource: "diners" }];
  const next = { ...current, settings: { ...current.settings, weeklyDefaults: { mon: { note: "Swimming" } } } };
  assert.deepEqual(refreshDinerPortions(next, current).plannedMeals, current.plannedMeals);
});

test("weekly diners retain eating-out statuses and toggles clear guest quantities", () => {
  let current = state(); current.settings.weeklyDefaults = { mon: { dinner: ["adult"] } };
  current.dinnerAttendance![start] = { ...defaultAttendance(diners), dinnerStatus: "out" };
  assert.equal(dinnerNeedsMeal(attendanceForSlot(current, start, "dinner")), false);
  current = setAttendance(current, start, { ...attendance(true), guests: 2 });
  current = toggleAllDiners(current, start, ["dinner"]);
  assert.equal(attendancePortions(attendanceForSlot(current, start, "dinner"), 0), 0);
});

test("new lunches default to no diners while existing legacy lunches remain included", () => {
  const current = state();
  assert.equal(dinnerNeedsMeal(attendanceForSlot(current, start, "lunch")), false);
  assert.equal(attendancePortions(attendanceForSlot(current, start, "dinner"), 0), 1.5);
  current.plannedMeals = [{ ...meal(), slot: "lunch" }];
  assert.ok(requiredShopItems(current, current.guidedShop!).length);
  assert.ok(dinnerNeedsMeal(attendanceForSlot(current, start, "lunch")));
});

test("lunch attendance scales sides, preserves overrides and leftovers, and excludes all lunch ingredients when empty", () => {
  let current = state();
  current.plannedMeals = [{ ...meal("scaled"), slot: "lunch", portionSource: "diners" }, { ...meal("manual", 5), slot: "lunch", portionSource: "manual" }, { ...meal("leftover", 0), slot: "lunch", portionSource: "diners", notes: "Leftovers" }];
  current = setAttendance(current, start, attendance(true), "lunch");
  assert.equal(current.plannedMeals[0].peopleCount, 1.5);
  assert.equal(current.plannedMeals[0].extraSideIngredients![0].quantity, 150);
  assert.equal(current.plannedMeals[1].peopleCount, 5);
  assert.equal(current.plannedMeals[2].peopleCount, 0);
  const before = requiredShopItems(current, current.guidedShop!);
  current = setAttendance(current, start, { ...attendance(false), portions: {} }, "lunch");
  assert.equal(requiredShopItems(current, current.guidedShop!).length, 0);
  assert.equal(current.plannedMeals.length, 3);
  current = setAttendance(current, start, attendance(true), "lunch");
  assert.deepEqual(requiredShopItems(current, current.guidedShop!), before);
});

test("lunch attendance survives date changes and snapshots, independently of dinner", () => {
  let current = setAttendance(state(), start, attendance(false), "lunch");
  current.dayNotes[start] = "Packed lunch";
  current = changeShopDates(current, "2026-11-25", "2026-12-01");
  current = migrateGuidedState(JSON.parse(JSON.stringify(current)), start, end);
  current = changeShopDates(current, start, end);
  assert.deepEqual(current.lunchAttendance![start], attendance(false));
  assert.equal(current.dayNotes[start], "Packed lunch");
  assert.equal(attendancePortions(current.dinnerAttendance![start], 0), 1.5);
});

test("copy attendance changes only chosen in-range dates and one meal slot, without sharing portion objects", () => {
  const current = setAttendance(state(), start, attendance(false), "lunch");
  current.dayNotes[end] = "Keep this comment";
  const copied = copyAttendanceToDates(current, start, "lunch", [end, "2027-01-01"]);
  assert.deepEqual(copied.lunchAttendance![end], { ...attendance(false), dinnerStatus: undefined });
  assert.equal(copied.lunchAttendance!["2027-01-01"], undefined);
  assert.equal(copied.lunchAttendance!["2026-11-24"], undefined);
  assert.notEqual(copied.lunchAttendance![end].portions, copied.lunchAttendance![start].portions);
  assert.deepEqual(copied.dinnerAttendance, current.dinnerAttendance);
  assert.deepEqual(copied.dayNotes, current.dayNotes);
});

test("manual portion overrides survive moving between lunch and dinner, and empty lunches reject drops", () => {
  const current = state(); current.plannedMeals = [{ ...meal("manual", 5), portionSource: "manual" }];
  assert.match(placeGuidedMeal(current, { kind: "planned", meal: current.plannedMeals[0] }, end, "lunch").error!, /No lunch diners/);
  current.lunchAttendance = { [end]: attendance(false) };
  const moved = placeGuidedMeal(current, { kind: "planned", meal: current.plannedMeals[0] }, end, "lunch").state;
  assert.equal(moved.plannedMeals[0].peopleCount, 5);
  assert.equal(moved.plannedMeals[0].portionSource, "manual");
  const renamed = changeDiners(moved, [{ ...diners[0], name: "New name" }]);
  assert.deepEqual(renamed.lunchAttendance![end].portions, { adult: 1 });
});

test("dates validate calendar days and allow 1 to 14 inclusive", () => {
  assert.equal(shopDates(start, end).length, 7);
  assert.equal(shopDates(start, "2026-12-06").length, 14);
  assert.equal(shopDates(start, "2026-12-07").length, 0);
  assert.equal(shopDates("2026-02-30", "2026-03-03").length, 0);
});
test("mini-month has six Monday-first weeks and supports ranges across months in either direction", () => {
  const days = calendarDays("2026-11-01");
  assert.equal(days.length, 42); assert.equal(days[0], "2026-10-26"); assert.equal(days[41], "2026-12-06");
  assert.deepEqual(calendarRange("2026-12-06", "2026-11-23"), { start: "2026-11-23", end: "2026-12-06" });
  assert.deepEqual(calendarRange(start, start), { start, end: start });
  assert.equal(calendarRange(start, "2026-12-07"), null);
});
test("meal calendar shows complete Monday-first weeks with a two-week minimum", () => {
  assert.equal(mealCalendarDays(start, start).length, 14);
  assert.equal(mealCalendarDays(start, "2026-12-06").length, 14);
  const midweek = mealCalendarDays("2026-11-25", "2026-12-08");
  assert.equal(midweek.length, 21); assert.equal(midweek[0], start); assert.equal(midweek[20], "2026-12-13");
  const newYear = mealCalendarDays("2026-12-30", "2027-01-04");
  assert.equal(newYear[0], "2026-12-28"); assert.equal(newYear[13], "2027-01-10");
  assert.deepEqual(mealCalendarDays("invalid", end), []);
});
test("lunch moves keep portions and can use a day with no dinner", () => {
  const current = state(), nextDay = "2026-11-24";
  current.plannedMeals = [{ ...meal("lunch", 3), slot: "lunch" }];
  current.dinnerAttendance![nextDay] = { ...attendance(false), dinnerStatus: "out" };
  current.lunchAttendance = { [nextDay]: attendance(true) };
  const result = placeGuidedMeal(current, { kind: "planned", meal: current.plannedMeals[0] }, nextDay, "lunch");
  assert.equal(result.error, undefined);
  assert.equal(result.state.plannedMeals[0].peopleCount, 3);
  assert.equal(result.state.plannedMeals[0].date, nextDay);
  assert.equal(result.state.plannedMeals[0].slot, "lunch");
  assert.ok(placeGuidedMeal(current, { kind: "planned", meal: current.plannedMeals[0] }, nextDay, "dinner").error);
});
test("same-day lunch and dinner swaps use attendance for diner-controlled portions", () => {
  const current = state(); current.dinnerAttendance![start] = attendance(true);
  current.plannedMeals = [{ ...meal("lunch", 3), slot: "lunch" }, { ...meal("dinner", 2), portionSource: "diners" }];
  const result = placeGuidedMeal(current, { kind: "planned", meal: current.plannedMeals[0] }, start, "dinner");
  assert.equal(result.error, undefined);
  const dinner = result.state.plannedMeals.find(row => row.id === "lunch")!;
  assert.equal(dinner.slot, "dinner"); assert.equal(dinner.peopleCount, 1.5); assert.equal(dinner.portionSource, "diners");
  assert.equal(dinner.extraSideIngredients![0].quantity, 100);
  const lunch = result.state.plannedMeals.find(row => row.id === "dinner")!;
  assert.equal(lunch.slot, "lunch"); assert.equal(lunch.peopleCount, 1.5); assert.equal(lunch.portionSource, "diners");
});
test("new lunch suggestions use lunch diners rather than dinner attendance", () => {
  const current = state(); current.settings.defaultPeople = 4; current.dinnerAttendance![start] = attendance(false);
  current.lunchAttendance = { [start]: { ...attendance(true), guests: 1 } };
  const result = placeGuidedMeal(current, { kind: "new", meal: { ...meal("new", 1), portionSource: "diners" } }, start, "lunch");
  assert.equal(result.state.plannedMeals[0].peopleCount, 2.5);
  assert.equal(result.state.plannedMeals[0].extraSideIngredients![0].quantity, 500);
  assert.equal(result.state.plannedMeals[0].portionSource, "diners");
});
test("lunch swaps validate the displaced recipe before moving it to dinner", () => {
  const current = state(); current.recipes.push(recipe("restricted", true)); current.dinnerAttendance![start] = attendance(true);
  current.plannedMeals = [meal("safe"), { ...meal("restricted"), recipeId: "restricted", slot: "lunch" }];
  const result = placeGuidedMeal(current, { kind: "planned", meal: current.plannedMeals[0] }, start, "lunch");
  assert.match(result.error!, /Cannot swap/); assert.equal(result.state, current);
});
test("swapping with a specific lunch preserves the other lunch and rejects stale targets", () => {
  const current = state(), nextDay = "2026-11-24";
  current.plannedMeals = [meal("dinner"), { ...meal("lunch"), date: nextDay, slot: "lunch" }, { ...meal("leftover", 0), date: nextDay, slot: "lunch", notes: "Leftovers" }];
  const source = { kind: "planned" as const, meal: current.plannedMeals[0] };
  assert.match(placeGuidedMeal(current, source, nextDay, "lunch").error!, /particular meal/);
  assert.match(placeGuidedMeal(current, source, nextDay, "lunch", "missing").error!, /has moved/);
  const result = placeGuidedMeal(current, source, nextDay, "lunch", "lunch");
  assert.equal(result.error, undefined); assert.equal(result.state.plannedMeals.length, 3);
  assert.deepEqual(result.state.plannedMeals.find(row => row.id === "leftover"), current.plannedMeals[2]);
  assert.equal(result.state.plannedMeals.find(row => row.id === "lunch")?.slot, "dinner");
});
test("leftovers append beyond the shop without replacing lunch or adding shopping requirements", () => {
  const current = state(); current.plannedMeals = [{ ...meal("dinner"), date: end }, { ...meal("existing"), date: "2026-11-30", slot: "lunch" }];
  const before = requiredShopItems(current, current.guidedShop!);
  const result = addLeftoverMeal(current, current.plannedMeals[0]);
  const leftover = result.plannedMeals[2];
  assert.equal(result.plannedMeals[1], current.plannedMeals[1]);
  assert.equal(leftover.date, "2026-11-30"); assert.equal(leftover.slot, "lunch"); assert.equal(leftover.peopleCount, 0);
  assert.equal(leftover.portionSource, "manual"); assert.equal(leftover.notes, "Leftovers");
  assert.deepEqual(requiredShopItems(result, result.guidedShop!), before);
  const inside = placeGuidedMeal(result, { kind: "planned", meal: leftover }, start, "dinner");
  assert.equal(inside.state.plannedMeals.find(row => row.id === leftover.id)?.peopleCount, 0);
  assert.deepEqual(requiredShopItems(inside.state, inside.state.guidedShop!), before);
});
test("recipe source labels retain cookbook names and only link HTTP sources", () => {
  assert.deepEqual(mealSource(), { label: "Manual" });
  assert.deepEqual(mealSource({ ...recipe("r"), importedFrom: "photo" }), { label: "Photo import" });
  assert.deepEqual(mealSource({ ...recipe("r"), source: "The Roasting Tin, page 40" }), { label: "The Roasting Tin, page 40" });
  assert.deepEqual(mealSource({ ...recipe("r"), sourceUrl: "https://www.bbcgoodfood.com/recipes/example" }), { label: "bbcgoodfood.com", href: "https://www.bbcgoodfood.com/recipes/example" });
  assert.equal(mealSource({ ...recipe("r"), source: "javascript:alert(1)" }).href, undefined);
});
test("moving between occupied dinner days swaps meals and scales diner-controlled portions and sides", () => {
  const current = state(), nextDay = "2026-11-24";
  const first = { ...meal("first"), portionSource: "diners" as const, extraPortions: 1 };
  current.plannedMeals = [first, { ...meal("second", 4), date: nextDay, portionSource: "diners" }];
  current.dinnerAttendance![start] = attendance(true); current.dinnerAttendance![nextDay] = { ...attendance(false), guests: 2 };
  const result = placeGuidedMeal(current, { kind: "planned", meal: first }, nextDay);
  assert.equal(result.error, undefined);
  assert.equal(result.state.plannedMeals.find(row => row.id === "first")?.peopleCount, 4);
  assert.equal(result.state.plannedMeals.find(row => row.id === "first")?.extraSideIngredients?.[0].quantity, 400);
  assert.equal(result.state.plannedMeals.find(row => row.id === "second")?.date, start);
  assert.equal(result.state.plannedMeals.find(row => row.id === "second")?.peopleCount, 1.5);
  assert.equal(result.state.guidedShop!.unplannedMeals!.length, 0);
});
test("new suggestions park displaced dinners and unscheduling removes ingredients without deleting the meal", () => {
  const current = state(); current.plannedMeals = [meal("old")];
  const result = placeGuidedMeal(current, { kind: "new", meal: meal("new") }, start).state;
  assert.deepEqual(result.plannedMeals.map(row => row.id), ["new"]);
  assert.deepEqual(result.guidedShop!.unplannedMeals!.map(row => row.id), ["old"]);
  const parked = placeGuidedMeal(result, { kind: "planned", meal: result.plannedMeals[0] }, null).state;
  assert.equal(requiredShopItems(parked, parked.guidedShop!).length, 0);
  assert.equal(parked.guidedShop!.unplannedMeals!.length, 2);
  const restored = placeGuidedMeal(parked, { kind: "parked", meal: meal("old") }, start).state;
  assert.equal(restored.plannedMeals[0].id, "old"); assert.equal(restored.guidedShop!.unplannedMeals!.length, 1);
  assert.equal(restored.plannedMeals[0].peopleCount, 2);
});
test("drops reject restricted diners, zero diners, blocked and outside dates without losing data", () => {
  const current = state(); current.recipes = [recipe("r", true)]; current.dinnerAttendance![start] = attendance(true);
  current.plannedMeals = [meal()];
  const source = { kind: "new" as const, meal: meal("new") };
  assert.equal(placeGuidedMeal(current, source, start).state, current);
  current.dinnerAttendance![start] = { ...attendance(false), portions: {} };
  assert.ok(placeGuidedMeal(current, source, start).error);
  current.dinnerAttendance![start] = { ...attendance(false), dinnerStatus: "out" };
  assert.ok(placeGuidedMeal(current, source, start).error);
  assert.ok(placeGuidedMeal(current, source, "2026-12-31").error);
});
test("swaps check the displaced meal against the original day's diners", () => {
  const current = state(), nextDay = "2026-11-24";
  current.recipes = [recipe("safe"), recipe("restricted", true)];
  current.dinnerAttendance![start] = attendance(true); current.dinnerAttendance![nextDay] = attendance(false);
  current.plannedMeals = [{ ...meal("safe"), recipeId: "safe" }, { ...meal("restricted"), recipeId: "restricted", date: nextDay }];
  const result = placeGuidedMeal(current, { kind: "planned", meal: current.plannedMeals[0] }, nextDay);
  assert.match(result.error!, /Cannot swap/); assert.equal(result.state, current);
});
test("moving multiple dinners parks all displaced meals without deleting lunch or manual portion overrides", () => {
  const current = state(); current.plannedMeals = [meal("a"), meal("b"), { ...meal("lunch"), slot: "lunch" }];
  const result = placeGuidedMeal(current, { kind: "new", meal: meal("new", 6) }, start).state;
  assert.equal(result.plannedMeals.length, 2); assert.equal(result.plannedMeals.find(row => row.id === "new")?.peopleCount, 6);
  assert.deepEqual(result.guidedShop!.unplannedMeals!.map(row => row.id), ["a", "b"]);
});
test("applying dinner previews preserves manual meals in fill mode and parks them in replace mode", () => {
  const current = state(); current.plannedMeals = [meal("old")]; current.dinnerAttendance![start] = attendance(true);
  const preview = buildAutoDinnerPlan({ startDate: start, endDate: start, mode: "replace", recipes: current.recipes, plannedMeals: current.plannedMeals, peopleCount: 4, ingredientAliases: {}, useUpIngredients: [], dinnerAttendance: current.dinnerAttendance });
  const filled = applyGuidedDinnerPreview(current, { ...preview, mode: "fill" });
  assert.equal(filled.plannedMeals[0].id, "old");
  const replaced = applyGuidedDinnerPreview(current, preview);
  assert.equal(replaced.plannedMeals[0].peopleCount, 1.5);
  assert.equal(replaced.guidedShop!.unplannedMeals![0].id, "old");
});
test("confirmed diners override nursery notes while unconfirmed dates keep the legacy rule", () => {
  const restricted = recipe("restricted", true);
  assert.equal(recipeAllowedForDinner(restricted, start, { [start]: attendance(true) }, { [start]: "Sophia nursery" }), false);
  assert.equal(recipeAllowedForDinner(restricted, start, { [start]: attendance(false) }), true);
  assert.equal(recipeAllowedForDinner(restricted, start, { [start]: defaultAttendance(diners) }, { [start]: "Sophia nursery" }), true);
  assert.equal(recipeAllowedForDinner(restricted, start), false);
  assert.equal(attendancePortions({ ...attendance(true), guests: 2 }, 4), 3.5);
});
test("zero confirmed diners and intentional dinner statuses are not open slots", () => {
  assert.equal(dinnerNeedsMeal({ ...attendance(false), portions: {} }), false);
  assert.equal(dinnerNeedsMeal({ ...attendance(false), portions: {}, confirmed: false }), true);
  for (const dinnerStatus of ["out", "none", "leftovers"] as const) assert.equal(dinnerNeedsMeal({ ...attendance(true), dinnerStatus }), false);
});
test("attendance scales new recipes and their sides without changing manual portions", () => {
  let current = state();
  current.plannedMeals = [{ ...meal(), portionSource: "diners", extraPortions: 1 }, meal("manual", 5)];
  current = setAttendance(current, start, attendance(true));
  assert.equal(current.plannedMeals[0].peopleCount, 2.5);
  assert.equal(current.plannedMeals[0].extraSideIngredients![0].quantity, 250);
  assert.equal(current.plannedMeals[1].peopleCount, 5);
  const zero = scaleMealPortions(current.plannedMeals[0], 0);
  assert.equal(scaleMealPortions(zero, 2).extraSideIngredients![0].quantity, 200);
});
test("household edits refresh Sophia identity and unconfirmed defaults, preserving explicit attendance", () => {
  let current = state(); current.dinnerAttendance![start] = attendance(true);
  current = changeDiners(current, [{ ...diners[0], portions: 2 }, { ...diners[1], name: "Alex" }]);
  assert.equal(current.dinnerAttendance![start].portions.adult, 1);
  assert.equal(current.dinnerAttendance![start].sophiaEating, false);
  assert.equal(current.dinnerAttendance!["2026-11-24"].portions.adult, 2);
});
test("removing dinner placeholders in either view reopens the day; guided recipe removals prevent refill repeats", () => {
  const current = state();
  current.dinnerAttendance![start] = { ...attendance(true), dinnerStatus: "out" };
  current.plannedMeals = [{ id: "out", date: start, slot: "dinner", peopleCount: 0, manualTitle: "Eating out", notes: "Guided dinner status" }, meal()];
  for (const guided of [false, true]) {
    const next = removeMealFromPlan(current, "out", guided);
    assert.equal(dinnerNeedsMeal(next.dinnerAttendance![start]), true);
    assert.equal(next.plannedMeals.length, 1);
    assert.deepEqual(next.dinnerAttendance![start].portions, attendance(true).portions);
  }
  assert.deepEqual(removeMealFromPlan(current, "m", true).guidedShop!.excludedRecipeIds, ["r"]);
  assert.deepEqual(removeMealFromPlan(current, "m").guidedShop!.excludedRecipeIds, []);
});
test("legacy partial supplies require a fresh yes/no check and never silently subtract stock", () => {
  const shop = createShop(start, end), carrots = item();
  shop.supplyChecks.carrots = { status: "some", quantity: 0.2, unit: "kg", requirement: requirementSignature(carrots) };
  assert.equal(resolveSupply(carrots, shop).buy?.quantity, 600);
  assert.match(resolveSupply(carrots, shop).reviewReason!, /Already got or Need to buy/);
  shop.supplyChecks.carrots.quantity = 900;
  assert.equal(resolveSupply(carrots, shop).buy?.quantity, 600);
});
test("already got removes the whole requirement and undo restores it, including unspecified quantities", () => {
  const shop = createShop(start, end);
  for (const required of [item(), item("milk", 1, "l"), { ...item("herbs"), quantity: undefined }]) {
    shop.supplyChecks[required.id] = { status: "enough", requirement: requirementSignature(required) };
    assert.equal(resolveSupply(required, shop).buy, null);
    shop.supplyChecks[required.id] = { status: "need", requirement: requirementSignature(required) };
    assert.equal(resolveSupply(required, shop).buy?.quantity, required.quantity);
    assert.equal(resolveSupply(required, shop).reviewReason, undefined);
  }
});
test("snack groups survive recipe editing and combine case and whitespace variants", () => {
  const lunch = { ...recipe("Quesadillas"), mealTypes: ["lunch" as const], snackGroup: " Sophia   lunches " };
  const saved = draftToRecipe(recipeToDraft(lunch));
  assert.equal(saved.snackGroup, "Sophia lunches");
  const groups = snackRecipeGroups([saved, { ...recipe("Wraps"), snackGroup: "sophia lunches" }, { ...recipe("Fruit"), mealTypes: ["snack"] }, recipe("Dinner")]);
  assert.deepEqual(groups.map(group => group.name), defaultSnackGroups);
  assert.equal(groups.find(group => group.name === "Sophia lunches")?.recipes.length, 2);
  assert.equal(groups.find(group => group.name === "Snacks and smoothies")?.recipes.length, 0);
  assert.equal(snackColumn(" Puddings & sweet treats "), "Puddings");
  assert.equal(snackColumn("Breakfast"), "Breakfast");
  assert.equal(draftToRecipe({ ...recipeToDraft(lunch), snackGroup: " " }).snackGroup, undefined);
});
test("all four columns require an explicit assignment, independent of meal type", () => {
  const recipes = defaultSnackGroups.map((snackGroup, index) => ({ ...recipe(String(index)), snackGroup }));
  const groups = snackRecipeGroups([...recipes, { ...recipe("unassigned snack"), mealTypes: ["snack"] }]);
  assert.deepEqual(groups.map(group => group.recipes.length), [1, 1, 1, 1]);
  assert.deepEqual(snackRecipeGroups([]).map(group => group.name), defaultSnackGroups);
  assert.equal(snackRecipeGroups([{ ...recipe("legacy"), snackGroup: "Puddings" }])[2].recipes[0].id, "legacy");
});

test("legacy snack and smoothie columns combine without changing selections or ingredients", () => {
  const current = state(); current.recipes = [{ ...recipe("snack"), snackGroup: "Snacks" }, { ...recipe("smoothie"), snackGroup: " Smoothies " }];
  const selected = setSnackSelection(setSnackSelection(current, "snack", 2), "smoothie", 3);
  const before = requiredShopItems(selected, selected.guidedShop!);
  assert.deepEqual(snackRecipeGroups(selected.recipes)[0].recipes.map(row => row.id), ["smoothie", "snack"]);
  const updated = { ...selected, recipes: assignSnackGroup(selected.recipes, ["snack", "smoothie"], "Breakfast", "2026-11-22") };
  assert.deepEqual(requiredShopItems(updated, updated.guidedShop!), before);
  assert.deepEqual(updated.guidedShop!.snackSelections, selected.guidedShop!.snackSelections);
  assert.deepEqual(updated.recipes[0].mealTypes, ["dinner"]);
  assert.equal(updated.recipes[0].updatedAt, "2026-11-22");
  assert.equal(assignSnackGroup(updated.recipes, ["snack"], "")[0].snackGroup, undefined);
  assert.equal(assignSnackGroup(updated.recipes, ["snack"], "unknown"), updated.recipes);
});

test("placing one preview leaves remaining suggestions out of Meals to place", () => {
  const current = state(); current.recipes.push(recipe("second"));
  const preview = buildAutoDinnerPlan({ startDate: start, endDate: "2026-11-24", mode: "fill", recipes: current.recipes, plannedMeals: [], peopleCount: 4, ingredientAliases: {}, useUpIngredients: [] });
  const entry = preview.entries[0];
  const placed = placeGuidedMeal(current, { kind: "new", meal: mealFromDinnerEntry(entry, 4) }, entry.date).state;
  const remaining = removeDinnerPreviewEntry(preview, entry);
  assert.equal(placed.guidedShop!.unplannedMeals?.length ?? 0, 0);
  assert.equal(remaining.entries.length, preview.entries.length - 1);
  assert.equal(remaining.summary.recipeDinnerCount, preview.summary.recipeDinnerCount - 1);
  assert.equal(preview.entries.length, 2);
  assert.equal(applyGuidedDinnerPreview(placed, remaining).plannedMeals.length, 2);
});
test("clearing diners excludes manual and diner-sized dinners, including sides, without deleting meals", () => {
  let current = state();
  current.plannedMeals = [{ ...meal("diner"), portionSource: "diners", extraPortions: 1 }, meal("manual", 5), { ...meal("lunch", 1), slot: "lunch", extraSideIngredients: [] }];
  current = setAttendance(current, start, attendance(true));
  const original = requiredShopItems(current, current.guidedShop!);
  const beforeMeals = current.plannedMeals;
  current = setAttendance(current, start, { ...attendance(false), portions: {}, guests: 0 });
  assert.equal(current.plannedMeals.length, 3);
  assert.equal(current.plannedMeals.find(row => row.id === "manual")?.peopleCount, 5);
  const cleared = requiredShopItems(current, current.guidedShop!);
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].quantity, 300); // Lunch remains, no dinner or extra side quantities.
  current = setAttendance(current, start, attendance(true));
  assert.deepEqual(requiredShopItems(current, current.guidedShop!), original);
  assert.deepEqual(current.plannedMeals, beforeMeals);
});
test("confirmed guest-only dinners remain included, while unconfirmed defaults are not excluded", () => {
  let current = state(); current.plannedMeals = [meal()];
  assert.ok(requiredShopItems(current, current.guidedShop!).length);
  current = setAttendance(current, start, { confirmed: true, portions: {}, guests: 2, sophiaEating: false });
  assert.ok(requiredShopItems(current, current.guidedShop!).length);
});
test("Already added shows scaled snack contributions and manual extras, not unrelated dinner amounts", () => {
  let current = state(); current.plannedMeals = [meal()];
  current.recipes.push(recipe("smoothie"), recipe("snack"));
  current.manualShoppingItems = [{ ...item("milk", 2, "l"), manual: true, shoppingRangeKey: `${start}__${end}` }, { ...item("old"), manual: true, shoppingRangeKey: "older-shop" }];
  current = setSnackSelection(setSnackSelection(current, "smoothie", 4), "snack", 2);
  let added = addedShopExtras(current, current.guidedShop!);
  assert.equal(added.length, 2);
  assert.equal(added.find(row => !row.manual)?.quantity, 1800);
  assert.deepEqual(added.find(row => !row.manual)?.sourceMeals, ["smoothie", "snack"]);
  assert.equal(requiredShopItems(current, current.guidedShop!).find(row => row.name === added[0].name)?.quantity, 2400);
  const completed = recordCompletedShoppingList(current.settings, "local", "shop", added, "2026-11-22T12:00:00Z");
  assert.equal(commonExtraUsageForProfile(completed, "local", "carrots")?.count ?? 0, 0);
  assert.equal(commonExtraUsageForProfile(completed, "local", "milk")?.count, 1);
  current = setSnackSelection(current, "smoothie", 0);
  added = addedShopExtras(current, current.guidedShop!);
  assert.equal(added.find(row => !row.manual)?.quantity, 600);
  assert.equal(current.manualShoppingItems.length, 2);
  assert.equal(current.plannedMeals.length, 1);
});
test("shop snacks merge with dinner ingredients, scale, deselect and do not add dated meals", () => {
  let current = state(); current.plannedMeals = [{ ...meal(), extraSideIngredients: [] }];
  current.recipes.push({ ...recipe("smoothie"), snackGroup: "Smoothies" });
  current = setSnackSelection(current, "smoothie", 4);
  assert.equal(requiredShopItems(current, current.guidedShop!)[0].quantity, 1800);
  assert.equal(current.plannedMeals.length, 1);
  current = setSnackSelection(current, "smoothie", 1);
  assert.equal(current.guidedShop!.snackSelections!.length, 1);
  assert.equal(requiredShopItems(current, current.guidedShop!)[0].quantity, 900);
  current = setSnackSelection(current, "smoothie", 0);
  assert.equal(requiredShopItems(current, current.guidedShop!)[0].quantity, 600);
});
test("snack selections survive snapshots and date changes but new shops start empty", () => {
  const current = setSnackSelection(state(), "r", 3);
  const changed = changeShopDates(JSON.parse(JSON.stringify(current)), "2026-12-01", "2026-12-07");
  assert.deepEqual(changed.guidedShop!.snackSelections, current.guidedShop!.snackSelections);
  assert.equal(requiredShopItems(changed, changed.guidedShop!)[0].quantity, 900);
  assert.equal(createShop("2026-12-08", "2026-12-14").snackSelections, undefined);
  assert.equal(setSnackSelection(current, "missing", 2), current);
  assert.equal(setSnackSelection(current, "r", NaN), current);
  const withoutRecipe = { ...current, recipes: [] };
  assert.equal(requiredShopItems(withoutRecipe, withoutRecipe.guidedShop!).length, 0);
  assert.equal(setSnackSelection(withoutRecipe, "r", 0).guidedShop!.snackSelections!.length, 0);
});
test("optional snack ingredients are explicit and retain their selections when portions change", () => {
  let current = state(); current.recipes[0].ingredients.push({ id: "optional", name: "yoghurt", quantity: 100, unit: "g", category: "Dairy & Eggs", role: "optional" });
  current = setSnackSelection(current, "r", 2);
  assert.equal(requiredShopItems(current, current.guidedShop!).length, 1);
  current = setSnackSelection(current, "r", 4, ["optional", "unknown"]);
  assert.equal(requiredShopItems(current, current.guidedShop!).find(row => row.name.toLowerCase() === "yoghurt")?.quantity, 200);
  current = setSnackSelection(current, "r", 1);
  assert.deepEqual(current.guidedShop!.snackSelections![0].selectedIngredientIds, ["optional"]);
  assert.equal(requiredShopItems(current, current.guidedShop!).find(row => row.name.toLowerCase() === "yoghurt")?.quantity, 50);
});
test("snack changes invalidate affected supply checks and a finalised list", () => {
  let current = setSnackSelection(state(), "r", 2);
  const required = requiredShopItems(current, current.guidedShop!);
  current.guidedShop!.supplyChecks[required[0].id] = { status: "enough", requirement: requirementSignature(required[0]) };
  current.guidedShop!.finalizedSignature = shopSignature(required, current.guidedShop!);
  current = setSnackSelection(current, "r", 4);
  const nextItems = requiredShopItems(current, current.guidedShop!);
  assert.ok(resolveSupply(nextItems[0], current.guidedShop!).reviewReason);
  assert.equal(shopIsFinalized(nextItems, current.guidedShop!), false);
});
test("late requirements invalidate only affected supplies and basket acknowledgements", () => {
  const shop = createShop(start, end), carrots = item(), milk = item("milk", 2, "l");
  shop.supplyChecks.carrots = { status: "enough", requirement: requirementSignature(carrots) };
  shop.supplyChecks.milk = { status: "enough", requirement: requirementSignature(milk) };
  shop.basketChecks.carrots = requirementSignature(carrots);
  const results = resolveShop([item("carrots", 900), milk], shop);
  assert.ok(results[0].reviewReason); assert.equal(results[0].buy?.checked, false);
  assert.equal(results[1].buy, null); assert.equal(results[1].reviewReason, undefined);
});
test("migration separates legacy have-at-home checks from Asda basket checks", () => {
  const current = state(); delete current.guidedShop;
  const a = { ...item("Milk", 2, "l"), manual: true, checked: true, shoppingRangeKey: `${start}__${end}` };
  const b = { ...item("Bread", 1, "item"), manual: true, checked: true, shoppingRangeKey: `${start}__${end}` };
  current.manualShoppingItems = [a, b]; current.asdaShoppingStatus[`asda__${start}__${end}__Bread`] = "added";
  const restored = migrateGuidedState(current, start, end);
  assert.equal(restored.guidedShop!.id, `${start}__${end}`);
  assert.equal(restored.guidedShop!.supplyChecks.Milk.status, "enough");
  assert.equal(restored.guidedShop!.basketChecks.Bread, requirementSignature(b));
  assert.equal(restored.guidedShop!.supplyChecks.Bread, undefined);
  assert.deepEqual(migrateGuidedState(JSON.parse(JSON.stringify(restored)), start, end), restored);
});
test("date changes keep shop identity, extras, day notes, meals and existing progress", () => {
  const current = state(); current.plannedMeals = [meal()]; current.dayNotes[start] = "Swimming";
  current.guidedShop!.step = 3;
  current.manualShoppingItems = [{ ...item("Bread", 1, "item"), manual: true, shoppingRangeKey: `${start}__${end}` }];
  const next = changeShopDates(current, "2026-11-24", "2026-12-07");
  assert.equal(next.guidedShop!.id, current.guidedShop!.id);
  assert.equal(next.guidedShop!.step, 3);
  assert.equal(next.manualShoppingItems[0].shoppingRangeKey, "2026-11-24__2026-12-07");
  assert.deepEqual(next.plannedMeals, current.plannedMeals); assert.deepEqual(next.dayNotes, current.dayNotes);
  assert.ok(next.dinnerAttendance!["2026-12-07"]);
});
test("supply checks include staples even when the Shopping tab hides them", () => {
  const current = state(); current.plannedMeals = [meal()]; current.settings.includeStaples = false;
  current.settings.stapleIngredients = ["carrots"];
  assert.ok(requiredShopItems(current, current.guidedShop!).some(row => row.canonicalName === "carrot" && row.quantity === 600));
});
test("finalisation signature ignores basket progress but changes with supply requirements", () => {
  const shop = createShop(start, end), carrots = item(); shop.finalizedSignature = shopSignature([carrots], shop);
  shop.basketChecks.carrots = requirementSignature(carrots); shop.step = 2; shop.method = "tesco";
  assert.equal(shopIsFinalized([carrots], shop), true);
  shop.supplyChecks.carrots = { status: "enough", requirement: requirementSignature(carrots) };
  assert.equal(shopIsFinalized([carrots], shop), false);
});
test("re-finalising removes excluded extras and restores earlier occasional inclusion dates", () => {
  let settings = seedState().settings;
  const extras = [{ name: "Bin bags", manual: true }, { name: "Milk", manual: true }];
  settings = recordCompletedShoppingList(settings, "local", "older", extras, "2026-11-01T12:00:00Z");
  settings = recordCompletedShoppingList(settings, "local", "current", extras, "2026-11-21T12:00:00Z");
  settings = recordCompletedShoppingList(settings, "local", "current", [], "2026-11-22T12:00:00Z");
  assert.equal(commonExtraUsageForProfile(settings, "local", "Milk")?.count, 1);
  assert.equal(occasionalItemsForProfile(settings, "local").find(row => row.name === "Bin bags")?.lastAddedAt, "2026-11-01T12:00:00Z");
  assert.equal(recordCompletedShoppingList(settings, "local", "current", []), settings);
});
test("pre-completion usage history survives migration and edits to current completion", () => {
  let settings = recordManualExtraUsage(seedState().settings, "local", ["Milk"], "2026-10-01");
  settings = recordCompletedShoppingList(settings, "local", "current", [{ name: "Milk", manual: true }]);
  settings = recordCompletedShoppingList(settings, "local", "current", []);
  assert.equal(commonExtraUsageForProfile(settings, "local", "Milk")?.count, 1);
});
test("automatic regular, use-up and refill paths obey confirmed attendance and blocked dates", () => {
  const restricted = recipe("restricted", true), safe = recipe("safe");
  const request = { startDate: start, endDate: "2026-11-26", mode: "fill" as const, recipes: [restricted, safe], plannedMeals: [], peopleCount: 4, ingredientAliases: {},
    useUpIngredients: ["carrots"], dayNotes: { [start]: "Sophia nursery" }, dinnerAttendance: { [start]: attendance(true), "2026-11-24": attendance(false), "2026-11-25": { ...attendance(false), portions: {} }, "2026-11-26": { ...attendance(false), dinnerStatus: "out" as const } } };
  for (const useUpIngredients of [[], ["carrots"]]) {
    const plan = buildAutoDinnerPlan({ ...request, useUpIngredients });
    assert.equal(plan.entries.length, 2);
    assert.equal(plan.entries.find(entry => entry.recipeId === "restricted")?.date, "2026-11-24");
    assert.equal(plan.entries.find(entry => entry.date === start)?.peopleCount, 1.5);
    const refill = buildAutoDinnerPlan({ ...request, useUpIngredients, excludedRecipeIds: ["restricted"] });
    assert.ok(refill.entries.every(entry => entry.recipeId !== "restricted" && [start, "2026-11-24"].includes(entry.date)));
  }
});
