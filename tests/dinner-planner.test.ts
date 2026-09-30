import assert from "node:assert/strict";
import test from "node:test";
import { buildAutoDinnerPlan, type DinnerCategory } from "../lib/dinner-planner";
import type { Ingredient, PlannedMeal, Recipe } from "../lib/domain";

const now = "2026-08-01T12:00:00.000Z";

function ingredient(id: string, name: string, role: Ingredient["role"] = "required"): Ingredient {
  return { id, name, quantity: 1, unit: "item", category: "Produce", role };
}

function recipe(
  id: string,
  title: string,
  ingredientName: string,
  minutes = 45,
  extraIngredients: Ingredient[] = []
): Recipe {
  return {
    id,
    title,
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: Math.max(0, minutes - 10),
    tags: [],
    favorite: false,
    ingredients: [ingredient(`${id}_main`, ingredientName), ...extraIngredients],
    instructions: ["Cook."],
    createdAt: now,
    updatedAt: now
  };
}

function plannedMeal(id: string, date: string, recipeId?: string, manualTitle?: string): PlannedMeal {
  return { id, date, slot: "dinner", recipeId, manualTitle, peopleCount: 2 };
}

function baseRequest(recipes: Recipe[], plannedMeals: PlannedMeal[] = []) {
  return {
    startDate: "2026-08-10",
    endDate: "2026-08-16",
    mode: "replace" as const,
    recipes,
    plannedMeals,
    useUpIngredients: [],
    ingredientAliases: {},
    peopleCount: 2,
    variationSeed: 0
  };
}

test("builds the requested seven-day category mix with quick and familiar meals", () => {
  const recipes = [
    recipe("veg_1", "Vegetable curry", "lentils", 25),
    recipe("veg_2", "Mushroom risotto", "mushrooms", 25),
    recipe("veg_3", "Tomato pasta", "tomatoes"),
    recipe("chicken_1", "Chicken traybake", "chicken thighs"),
    recipe("chicken_2", "Quick chicken noodles", "chicken breast", 20),
    recipe("fish_1", "Salmon and potatoes", "salmon"),
    recipe("red_1", "Beef chilli", "beef mince")
  ];
  const history = [
    plannedMeal("history_1", "2026-07-10", "veg_1"),
    plannedMeal("history_2", "2026-07-11", "veg_1"),
    plannedMeal("history_3", "2026-07-12", "chicken_1")
  ];
  const plan = buildAutoDinnerPlan(baseRequest(recipes, history));

  assert.equal(plan.entries.length, 7);
  assert.deepEqual(plan.summary.categoryTargets, { vegetarian: 3, chicken: 2, fish: 1, "pork-beef": 1 });
  assert.deepEqual(
    Object.fromEntries((["vegetarian", "chicken", "fish", "pork-beef"] as DinnerCategory[]).map((category) => [
      category,
      plan.summary.categoryCounts[category]
    ])),
    { vegetarian: 3, chicken: 2, fish: 1, "pork-beef": 1 }
  );
  assert.ok(plan.summary.quickCount >= 2);
  assert.equal(plan.summary.familiarCount, 1);
  assert.equal(plan.entries.filter((entry) => entry.familiar).length, 1);
});

test("never proposes a recipe used in the preceding seven days", () => {
  const repeated = recipe("recent", "Recent chicken", "chicken breast");
  const alternative = recipe("alternative", "Bean stew", "beans");
  const request = {
    ...baseRequest([repeated, alternative], [plannedMeal("recent_meal", "2026-08-06", repeated.id)]),
    endDate: "2026-08-10"
  };
  const plan = buildAutoDinnerPlan(request);

  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].recipeId, alternative.id);
});

test("scales quick and familiar targets for a short plan", () => {
  const familiar = recipe("familiar", "Quick lentil curry", "lentils", 20);
  const lessUsed = recipe("less_used", "Quick tomato pasta", "tomatoes", 20);
  const plan = buildAutoDinnerPlan({
    ...baseRequest(
      [familiar, lessUsed],
      [plannedMeal("old_familiar", "2026-07-01", familiar.id)]
    ),
    endDate: "2026-08-11"
  });

  assert.equal(plan.summary.quickTarget, 2);
  assert.equal(plan.summary.quickCount, 2);
  assert.equal(plan.summary.familiarTarget, 1);
  assert.equal(plan.entries.filter((entry) => entry.familiar).length, 1);
});

test("fill mode preserves dinners and balances the remaining dates around them", () => {
  const existing = recipe("existing", "Quick chicken", "chicken breast", 20);
  const vegetarian = recipe("vegetarian", "Lentil bake", "lentils");
  const fish = recipe("fish", "Cod traybake", "cod");
  const plan = buildAutoDinnerPlan({
    ...baseRequest([existing, vegetarian, fish], [plannedMeal("fixed", "2026-08-10", existing.id)]),
    endDate: "2026-08-12",
    mode: "fill"
  });

  assert.equal(plan.preservedDinners.length, 1);
  assert.equal(plan.entries.length, 2);
  assert.equal(plan.summary.recipeDinnerCount, 3);
  assert.equal(plan.summary.categoryCounts.chicken, 1);
  assert.equal(plan.summary.quickCount, 1);
});

test("replace mode plans every selected date instead of preserving existing dinners", () => {
  const oldDinner = recipe("old", "Old chicken dinner", "chicken breast");
  const replacements = [
    recipe("new_veg", "New lentil dinner", "lentils", 20),
    recipe("new_fish", "New salmon dinner", "salmon", 20)
  ];
  const plan = buildAutoDinnerPlan({
    ...baseRequest([oldDinner, ...replacements], [plannedMeal("old_meal", "2026-08-10", oldDinner.id)]),
    endDate: "2026-08-11",
    mode: "replace"
  });

  assert.equal(plan.preservedDinners.length, 0);
  assert.equal(plan.entries.length, 2);
  assert.deepEqual(plan.entries.map((entry) => entry.date), ["2026-08-10", "2026-08-11"]);
});

test("use-up planning selects a matching optional protein and editable side", () => {
  const flexible = recipe(
    "stir_fry",
    "Flexible stir fry",
    "flat rice noodles",
    25,
    [
      ingredient("choice_chicken", "chicken breast", "optional"),
      ingredient("choice_pork", "pork fillet", "optional"),
      ingredient("side_broccoli", "broccoli", "side")
    ]
  );
  const plan = buildAutoDinnerPlan({
    ...baseRequest([flexible]),
    endDate: "2026-08-10",
    useUpIngredients: ["chicken breast", "broccoli"]
  });

  assert.equal(plan.entries.length, 1);
  assert.deepEqual(plan.entries[0].selectedIngredientIds, ["choice_chicken"]);
  assert.equal(plan.entries[0].extraSideIngredients[0]?.name, "broccoli");
  assert.deepEqual(plan.entries[0].coveredUseUpIngredients, ["chicken breast", "broccoli"]);
});

test("builds a balanced fourteen-day plan", () => {
  const recipes = [
    ...Array.from({ length: 6 }, (_, index) => recipe(`veg_${index}`, `Vegetable meal ${index}`, "beans", index < 2 ? 20 : 45)),
    ...Array.from({ length: 3 }, (_, index) => recipe(`chicken_${index}`, `Chicken meal ${index}`, "chicken breast", index === 0 ? 20 : 45)),
    ...Array.from({ length: 3 }, (_, index) => recipe(`fish_${index}`, `Fish meal ${index}`, "salmon", index === 0 ? 20 : 45)),
    ...Array.from({ length: 2 }, (_, index) => recipe(`beef_${index}`, `Beef meal ${index}`, "beef mince"))
  ];
  recipes[0].tags = ["familiar"];
  recipes[6].tags = ["Familiar"];
  const plan = buildAutoDinnerPlan({
    ...baseRequest(recipes),
    endDate: "2026-08-23"
  });

  assert.equal(plan.entries.length, 14);
  assert.equal(plan.summary.quickTarget, 4);
  assert.ok(plan.summary.quickCount >= 4);
  assert.equal(plan.summary.familiarTarget, 2);
  assert.equal(plan.summary.familiarCount, 2);
  assert.deepEqual(plan.summary.categoryTargets, { vegetarian: 6, chicken: 3, fish: 3, "pork-beef": 2 });
});

test("returns a validation warning for ranges longer than fourteen days", () => {
  const plan = buildAutoDinnerPlan({
    ...baseRequest([recipe("veg", "Vegetable stew", "beans")]),
    endDate: "2026-08-24"
  });

  assert.equal(plan.entries.length, 0);
  assert.match(plan.warnings[0], /no more than fourteen days/i);
});

test("treats a familiar recipe tag as an explicit familiar choice", () => {
  const tagged = recipe("tagged_familiar", "Tagged familiar pasta", "tomatoes", 25);
  tagged.tags = ["familiar"];
  const untagged = recipe("untagged", "New tomato pasta", "tomatoes", 25);
  const plan = buildAutoDinnerPlan({
    ...baseRequest([untagged, tagged]),
    endDate: "2026-08-10"
  });

  assert.equal(plan.entries[0].recipeId, tagged.id);
  assert.equal(plan.entries[0].familiar, true);
});

test("does not reuse an excluded preview recipe when filling a gap", () => {
  const excluded = recipe("excluded", "Excluded pasta", "tomatoes", 25);
  const alternative = recipe("alternative_fill", "Alternative pasta", "tomatoes", 25);
  const plan = buildAutoDinnerPlan({
    ...baseRequest([excluded, alternative]),
    endDate: "2026-08-10",
    excludedRecipeIds: [excluded.id]
  });

  assert.equal(plan.entries[0].recipeId, alternative.id);
});

test("uses personal meal preference as a tie-breaker without changing planning targets", () => {
  const liked = recipe("liked", "Liked bean stew", "beans", 25);
  const unrated = recipe("unrated", "Unrated bean stew", "beans", 25);
  const plan = buildAutoDinnerPlan({
    ...baseRequest([unrated, liked]),
    endDate: "2026-08-10",
    recipePreferenceScores: { liked: 6, unrated: 0 }
  });

  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].recipeId, liked.id);
  assert.equal(plan.summary.categoryCounts.vegetarian, 1);
  assert.equal(plan.summary.quickCount, 1);
});

test("only places Not Sophia friendly recipes on Sophia nursery days", () => {
  const restricted = recipe("restricted", "Spicy bean chilli", "beans", 25);
  restricted.tags = ["Not Sophia friendly"];
  const familyMeal = recipe("family", "Family tomato pasta", "tomatoes", 25);
  const plan = buildAutoDinnerPlan({
    ...baseRequest([restricted, familyMeal]),
    endDate: "2026-08-11",
    dayNotes: { "2026-08-11": "Sophia nursery" }
  });

  assert.equal(plan.entries.length, 2);
  assert.equal(plan.entries.find((entry) => entry.recipeId === restricted.id)?.date, "2026-08-11");
  assert.equal(plan.entries.find((entry) => entry.recipeId === familyMeal.id)?.date, "2026-08-10");
});

test("does not suggest Not Sophia friendly recipes without a Sophia nursery day note", () => {
  const restricted = recipe("restricted_only", "Very spicy curry", "beans", 25);
  restricted.tags = ["not sophia friendly"];
  const plan = buildAutoDinnerPlan({
    ...baseRequest([restricted]),
    endDate: "2026-08-10",
    dayNotes: { "2026-08-10": "Matt on nights" }
  });

  assert.equal(plan.entries.length, 0);
});
