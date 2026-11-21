import assert from "node:assert/strict";
import test from "node:test";
import { commonExtraUsageForProfile, occasionalItemsForProfile, recordCompletedShoppingList, recordManualExtraUsage, seedState, type AppState, type DinnerAttendance, type PlannedMeal, type Recipe, type ShoppingListItem } from "../lib/domain";
import { attendancePortions, changeDiners, changeShopDates, createShop, defaultAttendance, dinnerNeedsMeal, migrateGuidedState, recipeAllowedForDinner, removeMealFromPlan, requiredShopItems, requirementSignature, resolveShop, resolveSupply, scaleMealPortions, setAttendance, shopDates, shopIsFinalized, shopSignature } from "../lib/guided-shop";
import { buildAutoDinnerPlan } from "../lib/dinner-planner";

const start = "2026-11-23", end = "2026-11-29";
const diners = [{ id: "adult", name: "Matt", portions: 1, usual: true }, { id: "child", name: "Sophia", portions: 0.5, usual: true }];
const attendance = (sophia: boolean): DinnerAttendance => ({ confirmed: true, portions: { adult: 1, ...(sophia ? { child: 0.5 } : {}) }, guests: 0, sophiaEating: sophia });
const item = (id = "carrots", quantity: number | undefined = 600, unit = "g"): ShoppingListItem => ({ id, name: id, canonicalName: id, quantity, unit, displayQuantity: quantity === undefined ? "as needed" : `${quantity} ${unit}`, category: "Produce", checked: false, sourceMeals: ["Test"] });
const recipe = (id: string, restricted = false): Recipe => ({ id, title: id, servings: 2, mealTypes: ["dinner"], prepMinutes: 5, cookMinutes: 15, tags: restricted ? ["Not Sophia friendly"] : [], favorite: false, ingredients: [{ id: `${id}-carrot`, name: "carrots", quantity: 600, unit: "g", category: "Produce" }], instructions: ["Cook"], createdAt: "2026-11-01", updatedAt: "2026-11-01" });
const meal = (id = "m", peopleCount = 2): PlannedMeal => ({ id, date: start, slot: "dinner", recipeId: "r", peopleCount, extraSideIngredients: [{ id: "side", name: "rice", quantity: 200, unit: "g", category: "Pantry", role: "side" }] });
function state(): AppState { const initial = seedState(); return migrateGuidedState({ ...initial, recipes: [recipe("r")], plannedMeals: [], settings: { ...initial.settings, diners }, manualShoppingItems: [], shoppingChecks: {}, asdaShoppingStatus: {} }, start, end); }

test("dates validate calendar days and allow 1 to 14 inclusive", () => {
  assert.equal(shopDates(start, end).length, 7);
  assert.equal(shopDates(start, "2026-12-06").length, 14);
  assert.equal(shopDates(start, "2026-12-07").length, 0);
  assert.equal(shopDates("2026-02-30", "2026-03-03").length, 0);
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
test("partial supplies subtract only compatible quantities", () => {
  const shop = createShop(start, end), carrots = item();
  shop.supplyChecks.carrots = { status: "some", quantity: 0.2, unit: "kg", requirement: requirementSignature(carrots) };
  assert.equal(resolveSupply(carrots, shop).buy?.quantity, 400);
  shop.supplyChecks.carrots.unit = "ml";
  assert.match(resolveSupply(carrots, shop).reviewReason!, /Units/);
  shop.supplyChecks.carrots = { status: "some", quantity: 200, requirement: requirementSignature(carrots) };
  assert.equal(resolveSupply(carrots, shop).buy?.quantity, 400);
  shop.supplyChecks.carrots.quantity = 900;
  assert.equal(resolveSupply(carrots, shop).buy, null);
});
test("partial volume and count quantities work; unspecified quantities require review", () => {
  const shop = createShop(start, end), milk = item("milk", 1, "l"), onions = item("onions", 4, "item"), unknown = { ...item("herbs"), quantity: undefined, displayQuantity: "as needed" };
  shop.supplyChecks.milk = { status: "some", quantity: 200, unit: "ml", requirement: requirementSignature(milk) };
  shop.supplyChecks.onions = { status: "some", quantity: 2, unit: "", requirement: requirementSignature(onions) };
  shop.supplyChecks.herbs = { status: "some", quantity: 1, unit: "g", requirement: requirementSignature(unknown) };
  assert.equal(resolveSupply(milk, shop).buy?.quantity, 0.8);
  assert.equal(resolveSupply(onions, shop).buy?.quantity, 2);
  assert.ok(resolveSupply(unknown, shop).reviewReason);
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
