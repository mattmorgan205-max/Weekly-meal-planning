import {
  addDays,
  canonicalizeIngredientName,
  formatDateKey,
  inferAutomaticRecipeTags,
  normalizeMealTypes,
  totalRecipeMinutes,
  type Ingredient,
  type PlannedMeal,
  type Recipe
} from "./domain";

export type AutoDinnerPlanMode = "fill" | "replace";
export type DinnerCategory = "vegetarian" | "chicken" | "fish" | "pork-beef" | "other";

type TargetDinnerCategory = Exclude<DinnerCategory, "other">;

export type AutoDinnerPlanRequest = {
  startDate: string;
  endDate: string;
  mode: AutoDinnerPlanMode;
  recipes: Recipe[];
  plannedMeals: PlannedMeal[];
  useUpIngredients: string[];
  ingredientAliases: Record<string, string>;
  peopleCount: number;
  variationSeed?: number;
};

export type AutoDinnerPlanEntry = {
  date: string;
  recipeId: string;
  selectedIngredientIds: string[];
  extraSideIngredients: Ingredient[];
  category: DinnerCategory;
  quick: boolean;
  familiar: boolean;
  lessUsed: boolean;
  coveredUseUpIngredients: string[];
  reasons: string[];
};

export type AutoDinnerPreservedDinner = {
  meal: PlannedMeal;
  category?: DinnerCategory;
  quick: boolean;
  familiar: boolean;
  previousWeekRepeat: boolean;
};

export type AutoDinnerPlanSummary = {
  categoryTargets: Record<TargetDinnerCategory, number>;
  categoryCounts: Record<DinnerCategory, number>;
  quickTarget: number;
  quickCount: number;
  familiarTarget: number;
  familiarCount: number;
  recipeDinnerCount: number;
};

export type AutoDinnerPlanResult = {
  startDate: string;
  endDate: string;
  mode: AutoDinnerPlanMode;
  entries: AutoDinnerPlanEntry[];
  preservedDinners: AutoDinnerPreservedDinner[];
  summary: AutoDinnerPlanSummary;
  warnings: string[];
};

type UseUpTarget = {
  displayName: string;
  canonicalName: string;
};

type DinnerCandidate = {
  key: string;
  recipe: Recipe;
  selectedIngredientIds: string[];
  extraSideIngredients: Ingredient[];
  category: DinnerCategory;
  quick: boolean;
  historyCount: number;
  coveredUseUpIngredients: string[];
  favorite: boolean;
};

type SelectedCandidate = {
  date: string;
  candidate: DinnerCandidate;
  useUpChoice: boolean;
};

type FixedRecipeDinner = {
  key: string;
  meal: PlannedMeal;
  recipe: Recipe;
  category: DinnerCategory;
  quick: boolean;
  historyCount: number;
  previousWeekRepeat: boolean;
};

type SearchState = {
  selections: SelectedCandidate[];
  usedRecipeIds: Set<string>;
};

const targetCategories: TargetDinnerCategory[] = ["vegetarian", "chicken", "fish", "pork-beef"];
const categoryWeights: Record<TargetDinnerCategory, number> = {
  vegetarian: 0.4,
  chicken: 0.25,
  fish: 0.2,
  "pork-beef": 0.15
};

const categoryLabels: Record<DinnerCategory, string> = {
  vegetarian: "Vegetarian",
  chicken: "Chicken",
  fish: "Fish",
  "pork-beef": "Pork/beef",
  other: "Other"
};

function dateFromKey(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKeysBetween(startDate: string, endDate: string) {
  const start = dateFromKey(startDate);
  const end = dateFromKey(endDate);
  if (!start || !end || end < start) return [];

  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    dates.push(formatDateKey(date));
    if (dates.length > 7) return [];
  }
  return dates;
}

function useUpTargets(values: string[], ingredientAliases: Record<string, string>) {
  const targets = values
    .flatMap((value) => value.split(/[,;\n]+/))
    .map((displayName) => displayName.trim())
    .filter(Boolean)
    .map<UseUpTarget>((displayName) => ({
      displayName,
      canonicalName: canonicalizeIngredientName(displayName, ingredientAliases).canonicalName
    }))
    .filter((target) => target.canonicalName && target.canonicalName !== "other");

  return targets.filter(
    (target, index) => targets.findIndex((candidate) => candidate.canonicalName === target.canonicalName) === index
  );
}

function ingredientNamesMatch(targetName: string, ingredientName: string) {
  if (targetName === ingredientName) return true;
  const interchangeableGroups = [
    new Set(["onion", "red onion", "white onion"]),
    new Set(["pepper", "red pepper", "yellow pepper", "green pepper"])
  ];
  return interchangeableGroups.some((group) => group.has(targetName) && group.has(ingredientName));
}

function categoryFromText(text: string): DinnerCategory {
  const normalized = text.toLowerCase();
  if (/\b(chicken|hen|turkey)\b/.test(normalized)) return "chicken";
  if (/\b(fish|salmon|tuna|cod|haddock|trout|prawn|prawns|shrimp|mackerel|sardine|seabass|sea bass)\b/.test(normalized)) {
    return "fish";
  }
  if (/\b(pork|bacon|ham|gammon|chorizo|prosciutto|salami|beef|steak|brisket|burger)\b/.test(normalized)) {
    return "pork-beef";
  }
  if (/\b(duck|lamb|venison)\b/.test(normalized)) return "other";
  return "vegetarian";
}

function classifyRecipe(recipe: Recipe, includedIngredients: Ingredient[], selectedOptional?: Ingredient) {
  if (selectedOptional) {
    const optionalCategory = categoryFromText(selectedOptional.name);
    if (optionalCategory !== "vegetarian") return optionalCategory;
  }

  const inferredTags = inferAutomaticRecipeTags({
    title: recipe.title,
    ingredients: includedIngredients,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes
  });
  if (inferredTags.includes("chicken")) return "chicken";
  if (inferredTags.includes("fish")) return "fish";
  if (inferredTags.includes("pork") || inferredTags.includes("beef")) return "pork-beef";
  if (inferredTags.includes("duck")) return "other";
  return "vegetarian";
}

function canonicalIngredientName(ingredient: Ingredient, ingredientAliases: Record<string, string>) {
  return canonicalizeIngredientName(ingredient.canonicalName || ingredient.name, ingredientAliases).canonicalName;
}

function coveredTargets(
  ingredients: Ingredient[],
  targets: UseUpTarget[],
  ingredientAliases: Record<string, string>
) {
  const ingredientNames = ingredients.map((ingredient) => canonicalIngredientName(ingredient, ingredientAliases));
  return targets
    .filter((target) => ingredientNames.some((ingredientName) => ingredientNamesMatch(target.canonicalName, ingredientName)))
    .map((target) => target.canonicalName);
}

function scaledSideIngredient(ingredient: Ingredient, recipe: Recipe, peopleCount: number): Ingredient {
  const factor = Math.max(0, peopleCount) / Math.max(1, recipe.servings);
  return {
    ...ingredient,
    id: `auto_side_${recipe.id}_${ingredient.id}`,
    quantity: typeof ingredient.quantity === "number" ? ingredient.quantity * factor : 1,
    unit: ingredient.unit || "item",
    role: "side",
    needsReview: false
  };
}

function buildRecipeCandidates(
  recipe: Recipe,
  targets: UseUpTarget[],
  ingredientAliases: Record<string, string>,
  peopleCount: number,
  historyCount: number
) {
  const requiredIngredients = recipe.ingredients.filter((ingredient) => (ingredient.role ?? "required") === "required");
  const optionalIngredients = recipe.ingredients.filter((ingredient) => ingredient.role === "optional");
  const sideIngredients = recipe.ingredients.filter((ingredient) => ingredient.role === "side");
  const optionalChoices: Array<Ingredient | undefined> = [undefined, ...optionalIngredients];

  const candidates = optionalChoices.map<DinnerCandidate>((selectedOptional) => {
    const includedWithoutSides = selectedOptional ? [...requiredIngredients, selectedOptional] : requiredIngredients;
    const matchedSides = sideIngredients.filter((side) =>
      coveredTargets([side], targets, ingredientAliases).length > 0
    );
    const includedIngredients = [...includedWithoutSides, ...matchedSides];
    return {
      key: `${recipe.id}:${selectedOptional?.id ?? "base"}`,
      recipe,
      selectedIngredientIds: selectedOptional ? [selectedOptional.id] : [],
      extraSideIngredients: matchedSides.map((ingredient) => scaledSideIngredient(ingredient, recipe, peopleCount)),
      category: classifyRecipe(recipe, includedWithoutSides, selectedOptional),
      quick: totalRecipeMinutes(recipe) > 0 && totalRecipeMinutes(recipe) < 30,
      historyCount,
      coveredUseUpIngredients: coveredTargets(includedIngredients, targets, ingredientAliases),
      favorite: recipe.favorite
    };
  });

  return candidates.filter((candidate, index) => {
    const signature = `${candidate.category}:${candidate.selectedIngredientIds.join(",")}:${candidate.coveredUseUpIngredients.join(",")}`;
    return candidates.findIndex((other) =>
      `${other.category}:${other.selectedIngredientIds.join(",")}:${other.coveredUseUpIngredients.join(",")}` === signature
    ) === index;
  });
}

function classifyPlannedMeal(recipe: Recipe, meal: PlannedMeal) {
  const selectedIds = new Set(meal.selectedIngredientIds ?? []);
  const selectedOptional = recipe.ingredients.find(
    (ingredient) => ingredient.role === "optional" && selectedIds.has(ingredient.id)
  );
  const ingredients = [
    ...recipe.ingredients.filter((ingredient) => (ingredient.role ?? "required") === "required"),
    ...(selectedOptional ? [selectedOptional] : []),
    ...(meal.extraSideIngredients ?? [])
  ];
  return classifyRecipe(recipe, ingredients, selectedOptional);
}

function categoryTargets(total: number): Record<TargetDinnerCategory, number> {
  const targets = Object.fromEntries(targetCategories.map((category) => [category, 0])) as Record<TargetDinnerCategory, number>;
  const weighted = targetCategories.map((category, index) => {
    const ideal = total * categoryWeights[category];
    const floor = Math.floor(ideal);
    targets[category] = floor;
    return { category, fraction: ideal - floor, index };
  });
  let remaining = total - Object.values(targets).reduce((sum, count) => sum + count, 0);
  weighted.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) targets[weighted[index].category] += 1;
  return targets;
}

function emptyCategoryCounts(): Record<DinnerCategory, number> {
  return { vegetarian: 0, chicken: 0, fish: 0, "pork-beef": 0, other: 0 };
}

function tieValue(value: string, seed: number) {
  let hash = 2166136261 ^ seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function selectUseUpCandidates(candidates: DinnerCandidate[], targets: UseUpTarget[], seed: number) {
  if (targets.length === 0) return [];
  const matching = candidates.filter((candidate) => candidate.coveredUseUpIngredients.length > 0);
  if (matching.length === 0) return [];

  type Option = { candidates: DinnerCandidate[]; coverage: string[]; score: number[] };
  const options: Option[] = matching.map((candidate) => ({
    candidates: [candidate],
    coverage: candidate.coveredUseUpIngredients,
    score: [candidate.coveredUseUpIngredients.length, -1, -candidate.recipe.ingredients.length, Number(candidate.favorite), tieValue(candidate.key, seed)]
  }));

  for (let firstIndex = 0; firstIndex < matching.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < matching.length; secondIndex += 1) {
      const first = matching[firstIndex];
      const second = matching[secondIndex];
      if (first.recipe.id === second.recipe.id) continue;
      const coverage = Array.from(new Set([...first.coveredUseUpIngredients, ...second.coveredUseUpIngredients]));
      options.push({
        candidates: [first, second],
        coverage,
        score: [
          coverage.length,
          -2,
          -(first.recipe.ingredients.length + second.recipe.ingredients.length),
          Number(first.favorite) + Number(second.favorite),
          tieValue(`${first.key}:${second.key}`, seed)
        ]
      });
    }
  }

  options.sort((a, b) => {
    for (let index = 0; index < a.score.length; index += 1) {
      if (a.score[index] !== b.score[index]) return b.score[index] - a.score[index];
    }
    return 0;
  });

  const bestSingleCoverage = Math.max(...options.filter((option) => option.candidates.length === 1).map((option) => option.coverage.length));
  const best = options.find(
    (option) => option.candidates.length === 1 || option.coverage.length > bestSingleCoverage
  );
  return best?.candidates ?? [];
}

function stateScore(
  state: SearchState,
  fixed: FixedRecipeDinner[],
  targets: Record<TargetDinnerCategory, number>,
  quickTarget: number,
  familiarTarget: number,
  seed: number
) {
  const categoryCounts = emptyCategoryCounts();
  const historyCounts: number[] = [];
  let quickCount = 0;
  let favoriteCount = 0;

  fixed.forEach((dinner) => {
    categoryCounts[dinner.category] += 1;
    quickCount += Number(dinner.quick);
    historyCounts.push(dinner.historyCount);
  });
  state.selections.forEach(({ candidate }) => {
    categoryCounts[candidate.category] += 1;
    quickCount += Number(candidate.quick);
    historyCounts.push(candidate.historyCount);
    favoriteCount += Number(candidate.favorite);
  });

  const categoryDeviation = targetCategories.reduce(
    (sum, category) => sum + Math.abs(targets[category] - categoryCounts[category]),
    0
  ) + categoryCounts.other;
  const positiveHistory = historyCounts.filter((count) => count > 0).sort((a, b) => b - a);
  const familiarCount = Math.min(familiarTarget, positiveHistory.length);
  const familiarQuality = positiveHistory.slice(0, familiarTarget).reduce((sum, count) => sum + count, 0);
  const varietyCost = positiveHistory.slice(familiarTarget).reduce((sum, count) => sum + count, 0);
  const tie = state.selections.reduce(
    (sum, selection) => sum + tieValue(`${selection.date}:${selection.candidate.key}`, seed),
    0
  );

  return [
    state.selections.length,
    -categoryDeviation,
    -Math.max(0, quickTarget - quickCount),
    -Math.max(0, familiarTarget - familiarCount),
    familiarQuality,
    -varietyCost,
    favoriteCount,
    tie
  ];
}

function compareScore(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (right[index] ?? 0) - (left[index] ?? 0);
  }
  return 0;
}

function metricLabel(category: TargetDinnerCategory) {
  return categoryLabels[category].toLowerCase();
}

export function buildAutoDinnerPlan(request: AutoDinnerPlanRequest): AutoDinnerPlanResult {
  const seed = request.variationSeed ?? 0;
  const dates = dateKeysBetween(request.startDate, request.endDate);
  const warnings: string[] = [];
  const emptySummary: AutoDinnerPlanSummary = {
    categoryTargets: categoryTargets(0),
    categoryCounts: emptyCategoryCounts(),
    quickTarget: 0,
    quickCount: 0,
    familiarTarget: 0,
    familiarCount: 0,
    recipeDinnerCount: 0
  };

  if (dates.length === 0) {
    return {
      startDate: request.startDate,
      endDate: request.endDate,
      mode: request.mode,
      entries: [],
      preservedDinners: [],
      summary: emptySummary,
      warnings: ["Choose a valid date range of no more than seven days."]
    };
  }

  const dateSet = new Set(dates);
  const start = dateFromKey(request.startDate)!;
  const previousStart = formatDateKey(addDays(start, -7));
  const previousEnd = formatDateKey(addDays(start, -1));
  const previousRecipeIds = new Set(
    request.plannedMeals
      .filter((meal) => meal.slot === "dinner" && meal.date >= previousStart && meal.date <= previousEnd && meal.recipeId)
      .map((meal) => meal.recipeId as string)
  );
  const historyCounts = request.plannedMeals.reduce<Record<string, number>>((counts, meal) => {
    if (meal.slot === "dinner" && meal.recipeId && meal.date < request.startDate) {
      counts[meal.recipeId] = (counts[meal.recipeId] ?? 0) + 1;
    }
    return counts;
  }, {});
  const recipeById = new Map(request.recipes.map((recipe) => [recipe.id, recipe]));
  const rangeDinners = request.plannedMeals.filter((meal) => meal.slot === "dinner" && dateSet.has(meal.date));
  const preservedMeals = request.mode === "fill" ? rangeDinners : [];
  const occupiedDates = new Set(preservedMeals.map((meal) => meal.date));
  const openDates = dates.filter((date) => !occupiedDates.has(date));
  const existingRecipeIds = new Set(preservedMeals.map((meal) => meal.recipeId).filter((id): id is string => Boolean(id)));
  const fixedRecipeDinners: FixedRecipeDinner[] = preservedMeals.flatMap((meal) => {
    const recipe = meal.recipeId ? recipeById.get(meal.recipeId) : undefined;
    if (!recipe) return [];
    return [{
      key: `fixed:${meal.id}`,
      meal,
      recipe,
      category: classifyPlannedMeal(recipe, meal),
      quick: totalRecipeMinutes(recipe) > 0 && totalRecipeMinutes(recipe) < 30,
      historyCount: historyCounts[recipe.id] ?? 0,
      previousWeekRepeat: previousRecipeIds.has(recipe.id)
    }];
  });

  const targetRecipeDinnerCount = fixedRecipeDinners.length + openDates.length;
  const plannedCategoryTargets = categoryTargets(targetRecipeDinnerCount);
  const quickTarget = Math.min(2, targetRecipeDinnerCount);
  const familiarTarget = targetRecipeDinnerCount === 0 ? 0 : targetRecipeDinnerCount <= 2 ? 1 : 2;
  const targets = useUpTargets(request.useUpIngredients, request.ingredientAliases);
  const eligibleRecipes = request.recipes.filter(
    (recipe) =>
      normalizeMealTypes(recipe.mealTypes).includes("dinner") &&
      !previousRecipeIds.has(recipe.id) &&
      !existingRecipeIds.has(recipe.id)
  );
  const allCandidates = eligibleRecipes.flatMap((recipe) =>
    buildRecipeCandidates(
      recipe,
      targets,
      request.ingredientAliases,
      request.peopleCount,
      historyCounts[recipe.id] ?? 0
    )
  );
  const useUpCandidates = selectUseUpCandidates(allCandidates, targets, seed).slice(0, openDates.length);
  const pinnedSelections = useUpCandidates.map<SelectedCandidate>((candidate, index) => ({
    date: openDates[index],
    candidate,
    useUpChoice: true
  }));
  const pinnedRecipeIds = new Set(useUpCandidates.map((candidate) => candidate.recipe.id));
  const remainingDates = openDates.slice(pinnedSelections.length);
  const regularCandidates = allCandidates
    .filter((candidate) => !pinnedRecipeIds.has(candidate.recipe.id))
    .map((candidate) => ({ ...candidate, extraSideIngredients: [], coveredUseUpIngredients: [] }));

  let beam: SearchState[] = [{
    selections: pinnedSelections,
    usedRecipeIds: new Set(pinnedRecipeIds)
  }];
  for (const date of remainingDates) {
    const expanded: SearchState[] = [];
    beam.forEach((state) => {
      const available = regularCandidates.filter((candidate) => !state.usedRecipeIds.has(candidate.recipe.id));
      if (available.length === 0) {
        expanded.push(state);
        return;
      }
      available.forEach((candidate) => {
        expanded.push({
          selections: [...state.selections, { date, candidate, useUpChoice: false }],
          usedRecipeIds: new Set([...state.usedRecipeIds, candidate.recipe.id])
        });
      });
    });
    beam = expanded
      .map((state) => ({
        state,
        score: stateScore(state, fixedRecipeDinners, plannedCategoryTargets, quickTarget, familiarTarget, seed)
      }))
      .sort((left, right) => compareScore(left.score, right.score))
      .slice(0, 180)
      .map(({ state }) => state);
  }

  const selectedState = beam[0] ?? { selections: pinnedSelections, usedRecipeIds: pinnedRecipeIds };
  const familiarOptions = [
    ...fixedRecipeDinners.map((dinner) => ({ key: dinner.key, historyCount: dinner.historyCount, date: dinner.meal.date })),
    ...selectedState.selections.map((selection) => ({
      key: `generated:${selection.date}:${selection.candidate.key}`,
      historyCount: selection.candidate.historyCount,
      date: selection.date
    }))
  ]
    .filter((item) => item.historyCount > 0)
    .sort((a, b) => b.historyCount - a.historyCount || a.date.localeCompare(b.date));
  const familiarKeys = new Set(familiarOptions.slice(0, familiarTarget).map((item) => item.key));

  const entries = selectedState.selections
    .sort((a, b) => a.date.localeCompare(b.date))
    .map<AutoDinnerPlanEntry>((selection) => {
      const familiar = familiarKeys.has(`generated:${selection.date}:${selection.candidate.key}`);
      const coveredDisplays = selection.candidate.coveredUseUpIngredients.map(
        (canonicalName) => targets.find((target) => target.canonicalName === canonicalName)?.displayName ?? canonicalName
      );
      const reasons = [
        ...coveredDisplays.map((ingredient) => `Uses ${ingredient}`),
        selection.candidate.quick ? "Quick" : "",
        categoryLabels[selection.candidate.category],
        familiar ? "Familiar" : "Less used"
      ].filter(Boolean);
      return {
        date: selection.date,
        recipeId: selection.candidate.recipe.id,
        selectedIngredientIds: selection.candidate.selectedIngredientIds,
        extraSideIngredients: selection.useUpChoice ? selection.candidate.extraSideIngredients : [],
        category: selection.candidate.category,
        quick: selection.candidate.quick,
        familiar,
        lessUsed: !familiar,
        coveredUseUpIngredients: coveredDisplays,
        reasons
      };
    });

  const preservedDinners = preservedMeals.map<AutoDinnerPreservedDinner>((meal) => {
    const fixed = fixedRecipeDinners.find((dinner) => dinner.meal.id === meal.id);
    return {
      meal,
      category: fixed?.category,
      quick: fixed?.quick ?? false,
      familiar: fixed ? familiarKeys.has(fixed.key) : false,
      previousWeekRepeat: fixed?.previousWeekRepeat ?? false
    };
  });
  const categoryCounts = emptyCategoryCounts();
  fixedRecipeDinners.forEach((dinner) => { categoryCounts[dinner.category] += 1; });
  entries.forEach((entry) => { categoryCounts[entry.category] += 1; });
  const quickCount = fixedRecipeDinners.filter((dinner) => dinner.quick).length + entries.filter((entry) => entry.quick).length;
  const familiarCount = Math.min(familiarTarget, familiarOptions.length);
  const recipeDinnerCount = fixedRecipeDinners.length + entries.length;
  const summary: AutoDinnerPlanSummary = {
    categoryTargets: plannedCategoryTargets,
    categoryCounts,
    quickTarget,
    quickCount,
    familiarTarget,
    familiarCount,
    recipeDinnerCount
  };

  if (openDates.length === 0) warnings.push("Every dinner date in this range is already planned.");
  if (entries.length < openDates.length) {
    warnings.push(`Only ${entries.length} of ${openDates.length} open dinner slots could be filled without repeating a recipe.`);
  }
  fixedRecipeDinners.filter((dinner) => dinner.previousWeekRepeat).forEach((dinner) => {
    warnings.push(`${dinner.recipe.title} is preserved but was also planned during the previous seven days.`);
  });
  targetCategories.forEach((category) => {
    if (categoryCounts[category] !== plannedCategoryTargets[category]) {
      warnings.push(
        `Target ${plannedCategoryTargets[category]} ${metricLabel(category)}; this plan has ${categoryCounts[category]}.`
      );
    }
  });
  if (quickCount < quickTarget) warnings.push(`Target ${quickTarget} quick meals; this plan has ${quickCount}.`);
  if (familiarCount < familiarTarget) warnings.push(`Target ${familiarTarget} familiar meals; only ${familiarCount} are available from planning history.`);
  if (categoryCounts.other > 0) warnings.push(`${categoryCounts.other} dinner could not be assigned to the requested meal groups.`);
  const coveredTargetNames = new Set(entries.flatMap((entry) => entry.coveredUseUpIngredients.map((name) =>
    canonicalizeIngredientName(name, request.ingredientAliases).canonicalName
  )));
  const uncoveredTargets = targets.filter((target) => !coveredTargetNames.has(target.canonicalName));
  if (uncoveredTargets.length > 0) {
    warnings.push(`No eligible use-up match for: ${uncoveredTargets.map((target) => target.displayName).join(", ")}.`);
  }

  return {
    startDate: request.startDate,
    endDate: request.endDate,
    mode: request.mode,
    entries,
    preservedDinners,
    summary,
    warnings: Array.from(new Set(warnings))
  };
}
