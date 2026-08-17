"use client";

import {
  CalendarDays,
  Camera,
  Check,
  ChefHat,
  CircleOff,
  Clock,
  Clipboard,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  Heart,
  ImagePlus,
  Link,
  ListChecks,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCw,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  Trash2,
  Users,
  Wand2,
  X
} from "lucide-react";
import {
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  addDays,
  canonicalizeIngredientName,
  cleanOcrRecipeText,
  createId,
  defaultCommonExtraItems,
  draftToRecipe,
  draftFromOcrText,
  formatDateKey,
  generateShoppingList,
  groceryCategories,
  inferCategory,
  inferAutomaticRecipeTags,
  inferRecipeMealTypes,
  isAutomaticRecipeTag,
  labelMealSlot,
  mealSlots,
  mergeAutomaticRecipeTags,
  normalizeIngredientAliasKey,
  normalizeMealTypes,
  normalizeSuppressedAutomaticTags,
  normalizeUnit,
  parseIngredientLine,
  parseRecipeText,
  parseTags,
  recipeToDraft,
  seedState,
  startOfWeek,
  standardIngredientUnits,
  standardizeIngredientQuantity,
  totalRecipeMinutes,
  type AsdaProductSelection,
  type AppState,
  type GroceryCategory,
  type ImportDraft,
  type Ingredient,
  type IngredientRole,
  type MealSlot,
  type Recipe,
  type ShoppingListItem,
  type StoreShoppingStatus
} from "@/lib/domain";
import { getSupabaseClient } from "@/lib/supabase-client";

type View = "planner" | "recipes" | "add" | "shopping" | "settings";
type ImportMode = "manual" | "paste" | "url" | "photo";
type SyncStatus = "local" | "loading" | "saving" | "saved" | "offline" | "error";
type MealPickerGroup = MealSlot | "all";
type RecipeGroupFilter = MealSlot | "all";
type PhotoCropMode = "whole" | "ingredients" | "method";
type ManualItemCategory = GroceryCategory | "Auto";
type AsdaHelperQueueItem = {
  itemId: string;
  shoppingKey: string;
  statusKey: string;
  name: string;
  canonicalName?: string;
  displayQuantity: string;
  quantity?: number;
  unit?: string;
  requiredQuantity?: number;
  requiredUnit?: string;
  category: GroceryCategory;
  sourceMeals: string[];
  sourceIngredients?: string[];
  avoidTerms?: string[];
  savedProductUrl: string;
  savedProductName?: string;
  savedPackSizeText?: string;
  savedPackQuantity?: number;
  savedPackUnit?: string;
  searchUrl: string;
  status?: StoreShoppingStatus;
};
type AsdaHelperQueue = {
  version: 1;
  createdAt: string;
  sourceUrl: string;
  rangeStartDate: string;
  rangeEndDate: string;
  items: AsdaHelperQueueItem[];
};
type AsdaHelperExtensionMessage = {
  source?: string;
  type?: string;
  payload?: {
    itemId?: string;
    shoppingKey?: string;
    statusKey?: string;
    productUrl?: string;
    productName?: string;
    packSizeText?: string;
    packQuantity?: number;
    packUnit?: string;
    status?: StoreShoppingStatus;
  };
};
type AsdaHelperWindow = Window & {
  __WEEKWISE_ASDA_QUEUE__?: AsdaHelperQueue;
};
type UseUpTarget = {
  name: string;
  canonicalName: string;
};
type UseUpSuggestion = {
  recipeIds: string[];
  coveredIngredients: string[];
  missingIngredients: string[];
  extraIngredientCount: number;
  favoriteCount: number;
};

const storageKey = "weekwise-meal-planner-v1";
const backupStorageKey = "weekwise-meal-planner-cloud-backup-v1";
const asdaHelperAppSource = "weekwise-meal-planner";
const asdaHelperExtensionSource = "weekwise-asda-helper-extension";
const asdaHelperQueueElementId = "weekwise-asda-helper-queue";
const recipeImageBucket = "recipe-images";
const recipeImageSignedUrlSeconds = 60 * 60 * 24 * 7;

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short"
});

const legacyBroadShoppingNames: Record<string, string[]> = {
  onion: ["red onion", "white onion"],
  pepper: ["red pepper", "yellow pepper", "green pepper"],
  pasta: ["tortelloni", "spaghetti", "penne", "fusilli", "tagliatelle", "linguine"],
  rice: ["basmati rice", "long grain rice", "jasmine rice", "flat rice noodles", "rice noodles"]
};

function hydrateRecipe(recipe: Recipe): Recipe {
  return {
    ...recipe,
    mealTypes: normalizeMealTypes(recipe.mealTypes, inferRecipeMealTypes(recipe)[0]),
    ingredients: recipe.ingredients.map((ingredient) => {
      const standardized = standardizeIngredientQuantity(ingredient.quantity, ingredient.unit);
      const suggestedShoppingName = canonicalizeIngredientName(ingredient.name).canonicalName;
      const storedShoppingName = normalizeIngredientAliasKey(ingredient.canonicalName ?? "");
      const shouldUpgradeBroadName = legacyBroadShoppingNames[storedShoppingName]?.includes(suggestedShoppingName) ?? false;

      return {
        ...ingredient,
        quantity: standardized.quantity,
        unit: standardized.unit,
        canonicalName: shouldUpgradeBroadName ? suggestedShoppingName : storedShoppingName || suggestedShoppingName,
        needsReview: ingredient.needsReview ?? ingredient.confidence === "low",
        role: ingredient.role === "optional" || ingredient.role === "side" ? ingredient.role : "required"
      };
    }),
    source: recipe.source ?? recipe.sourceUrl,
    suppressedAutoTags: normalizeSuppressedAutomaticTags(recipe.suppressedAutoTags)
  };
}

function hydratePlannedMeal(
  meal: AppState["plannedMeals"][number],
  defaultPeople: number,
  recipes: Recipe[]
): AppState["plannedMeals"][number] {
  const parsedPeopleCount = Number(meal.peopleCount);
  const peopleCount = Number.isFinite(parsedPeopleCount) ? Math.max(0, parsedPeopleCount) : defaultPeople;
  const recipe = meal.recipeId ? recipes.find((item) => item.id === meal.recipeId) : undefined;
  const selectedIngredientIds = Array.isArray(meal.selectedIngredientIds)
    ? meal.selectedIngredientIds.filter((id): id is string => typeof id === "string")
    : [];
  const selectedIdSet = new Set(selectedIngredientIds);
  const selectedOptionalId = recipe?.ingredients.find(
    (ingredient) => ingredient.role === "optional" && selectedIdSet.has(ingredient.id)
  )?.id;
  const migratedRecipeSides = (recipe?.ingredients ?? [])
    .filter((ingredient) => ingredient.role === "side" && selectedIdSet.has(ingredient.id))
    .map((ingredient) => ({
      ...ingredient,
      id: `planned_side_${meal.id}_${ingredient.id}`,
      quantity:
        typeof ingredient.quantity === "number"
          ? ingredient.quantity * (peopleCount / Math.max(1, recipe?.servings ?? 1))
          : undefined,
      role: "side" as const
    }));
  const storedSides = Array.isArray(meal.extraSideIngredients)
    ? meal.extraSideIngredients
        .filter((ingredient) => ingredient && typeof ingredient.name === "string" && ingredient.name.trim())
        .map((ingredient) => ({
          ...ingredient,
          role: "side" as const,
          category: ingredient.category || inferCategory(ingredient.name),
          canonicalName: ingredient.canonicalName || canonicalizeIngredientName(ingredient.name).canonicalName
        }))
    : [];
  const storedSideIds = new Set(storedSides.map((ingredient) => ingredient.id));

  return {
    ...meal,
    peopleCount,
    manualTitle: meal.manualTitle?.trim() || undefined,
    selectedIngredientIds: recipe ? (selectedOptionalId ? [selectedOptionalId] : []) : selectedIngredientIds,
    extraSideIngredients: [
      ...storedSides,
      ...migratedRecipeSides.filter((ingredient) => !storedSideIds.has(ingredient.id))
    ]
  };
}

function hydrateState(value: unknown): AppState {
  const parsed = (value ?? {}) as Partial<AppState>;
  const seeded = seedState();
  const recipes = (parsed.recipes ?? seeded.recipes).map(hydrateRecipe);
  const currentWeekStart = formatDateKey(startOfWeek(new Date()));
  const legacyManualItemRangeKey = shoppingRangeKeyForRange({
    startDate: currentWeekStart,
    endDate: formatDateKey(addDays(new Date(`${currentWeekStart}T12:00:00`), 6))
  });

  return {
    ...seeded,
    ...parsed,
    recipes,
    plannedMeals: (parsed.plannedMeals ?? seeded.plannedMeals)
      .map((meal) => hydratePlannedMeal(meal, parsed.settings?.defaultPeople ?? seeded.settings.defaultPeople, recipes))
      .filter((meal) => meal.recipeId || meal.manualTitle),
    dayNotes: parsed.dayNotes ?? {},
    useUpIngredients: Array.isArray(parsed.useUpIngredients) ? parsed.useUpIngredients.filter((item): item is string => typeof item === "string") : [],
    settings: {
      ...seeded.settings,
      ...parsed.settings,
      ingredientAliases: parsed.settings?.ingredientAliases ?? {},
      shoppingNameVariants: parsed.settings?.shoppingNameVariants ?? {},
      commonExtraItems: Array.isArray(parsed.settings?.commonExtraItems) ? parsed.settings.commonExtraItems : [...defaultCommonExtraItems]
    },
    shoppingChecks: parsed.shoppingChecks ?? {},
    hiddenShoppingItems: parsed.hiddenShoppingItems ?? {},
    manualShoppingItems: (parsed.manualShoppingItems ?? []).map((item) => ({
      ...item,
      shoppingRangeKey: item.shoppingRangeKey ?? legacyManualItemRangeKey,
      category: item.category === "Other" ? inferCategory(item.name) : item.category
    })),
    asdaProductLinks: parsed.asdaProductLinks ?? {},
    asdaProductSelections: parsed.asdaProductSelections ?? {},
    asdaShoppingStatus: parsed.asdaShoppingStatus ?? {}
  };
}

function loadState(): AppState {
  if (typeof window === "undefined") return seedState();
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return seedState();
    return hydrateState(JSON.parse(stored));
  } catch {
    return seedState();
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function emptyDraft(): ImportDraft {
  return {
    id: createId("draft"),
    title: "",
    servings: 4,
    mealTypes: ["dinner"],
    tags: [],
    ingredients: [
      {
        id: createId("ing"),
        name: "",
        quantity: undefined,
        unit: "",
        category: "Other",
        canonicalName: "",
        confidence: "medium",
        role: "required"
      }
    ],
    instructions: [""],
    source: "",
    suppressedAutoTags: [],
    warnings: [],
    importedFrom: "manual"
  };
}

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

function normalizeDateRange(startDate: string, endDate: string) {
  return startDate <= endDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate };
}

function dateRangeDates(startDate: string, dayCount: number) {
  const start = new Date(`${startDate}T12:00:00`);
  return Array.from({ length: dayCount }, (_, index) => addDays(start, index));
}

function shoppingHiddenPrefixForRange(range: ReturnType<typeof normalizeDateRange>) {
  return `${range.startDate}__${range.endDate}__`;
}

function shoppingRangeKeyForRange(range: ReturnType<typeof normalizeDateRange>) {
  return `${range.startDate}__${range.endDate}`;
}

function shoppingHiddenItemKey(range: ReturnType<typeof normalizeDateRange>, itemId: string) {
  return `${shoppingHiddenPrefixForRange(range)}${itemId}`;
}

function storeStatusPrefixForRange(range: ReturnType<typeof normalizeDateRange>) {
  return `asda__${range.startDate}__${range.endDate}__`;
}

function storeStatusItemKey(range: ReturnType<typeof normalizeDateRange>, itemId: string) {
  return `${storeStatusPrefixForRange(range)}${itemId}`;
}

function parseJsonResponse<T>(text: string, fallbackError: string): T | { error: string } {
  if (!text) return { error: fallbackError };

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text || fallbackError };
  }
}

function parseNumberInput(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitManualShoppingLines(value: string) {
  const normalized = value.replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const primaryLines = normalized.split(/\n+/);
  const lines = primaryLines.length === 1 ? primaryLines[0].split(/;|,(?=\s*[A-Za-z])/g) : primaryLines;

  return lines
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]\])\s*/i, "").trim())
    .filter(Boolean);
}

function formatManualQuantity(ingredient: Ingredient) {
  const quantity =
    typeof ingredient.quantity === "number"
      ? Number.isInteger(ingredient.quantity)
        ? ingredient.quantity.toString()
        : ingredient.quantity.toFixed(2).replace(/\.?0+$/, "")
      : "";

  return [quantity, ingredient.unit].filter(Boolean).join(" ");
}

function createManualShoppingItemFromLine(line: string, shoppingRangeKey: string): ShoppingListItem | null {
  const cleanedLine = line.trim();
  if (!cleanedLine) return null;

  const parsed = parseIngredientLine(cleanedLine, { strict: false });
  const name = parsed.name.trim() || cleanedLine;

  return {
    id: createId("manual"),
    shoppingRangeKey,
    name,
    canonicalName: canonicalizeIngredientName(name).canonicalName,
    displayQuantity: formatManualQuantity(parsed),
    category: parsed.category || inferCategory(name),
    sourceMeals: ["Manual"],
    checked: false,
    manual: true
  };
}

function shoppingPreferenceKey(item: Pick<ShoppingListItem, "name">) {
  return item.name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function asdaSearchUrl(item: ShoppingListItem) {
  return `https://groceries.asda.com/search/${encodeURIComponent(item.name.trim())}`;
}

function asdaAvoidTerms(item: Pick<ShoppingListItem, "canonicalName" | "name">) {
  const canonicalName = canonicalizeIngredientName(item.canonicalName || item.name).canonicalName;
  const avoidTermsByName: Record<string, string[]> = {
    "tomato puree": ["cherry tomato", "cherry tomatoes", "chopped tomato", "chopped tomatoes", "tinned tomato", "passata", "ketchup"],
    "chopped tomatoes": ["cherry tomato", "cherry tomatoes", "tomato puree", "tomato paste", "ketchup"],
    "cherry tomatoes": ["chopped tomato", "chopped tomatoes", "tomato puree", "tomato paste", "tinned tomato", "canned tomato"],
    onion: ["spring onion", "spring onions", "pickled onion", "onion rings"],
    "red onion": ["spring onion", "white onion", "pickled onion", "onion rings"],
    "white onion": ["spring onion", "red onion", "pickled onion", "onion rings"],
    "spring onion": ["red onion", "white onion", "brown onion", "yellow onion", "pickled onion"],
    potato: ["sweet potato", "sweet potatoes", "crisps", "chips", "waffles"],
    "sweet potato": ["white potato", "new potato", "baby potato", "crisps", "chips"],
    milk: ["milk chocolate", "milkshake"],
    pasta: ["pasta sauce", "ready meal"],
    tortelloni: ["dried pasta", "pasta sauce", "ready meal"],
    spaghetti: ["pasta sauce", "ready meal"],
    penne: ["pasta sauce", "ready meal"],
    fusilli: ["pasta sauce", "ready meal"],
    rice: ["rice pudding", "rice cakes"],
    stock: ["gravy", "soup"]
  };

  return avoidTermsByName[canonicalName] ?? [];
}

const approximateProduceWeightGrams: Record<string, number> = {
  apple: 150,
  banana: 120,
  broccoli: 350,
  carrot: 80,
  courgette: 200,
  cucumber: 300,
  lemon: 100,
  lime: 70,
  onion: 150,
  "red onion": 150,
  "white onion": 150,
  pepper: 160,
  potato: 175,
  "sweet potato": 250
};

type PurchaseQuantity = { quantity: number; family: "mass" | "volume" | "count"; unit: "g" | "ml" | "item" };

function comparablePurchaseQuantity(quantity?: number, unit?: string): PurchaseQuantity | null {
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) return null;
  const normalizedUnit = normalizeUnit(unit);

  if (normalizedUnit === "kg") return { quantity: quantity * 1000, family: "mass", unit: "g" };
  if (normalizedUnit === "g") return { quantity, family: "mass", unit: "g" };
  if (normalizedUnit === "l") return { quantity: quantity * 1000, family: "volume", unit: "ml" };
  if (normalizedUnit === "ml") return { quantity, family: "volume", unit: "ml" };
  if (!normalizedUnit || ["item", "pack", "can", "jar", "bottle", "bunch", "head"].includes(normalizedUnit)) {
    return { quantity, family: "count", unit: "item" };
  }

  return null;
}

function formatPackQuantity(quantity: number, unit: string) {
  if (unit === "g" && quantity >= 1000) return `${Number((quantity / 1000).toFixed(2))} kg`;
  if (unit === "ml" && quantity >= 1000) return `${Number((quantity / 1000).toFixed(2))} l`;
  return `${Number(quantity.toFixed(2))} ${unit}`;
}

function asdaPurchaseSummary(item: ShoppingListItem, selection?: AsdaProductSelection) {
  if (!selection) return null;
  const required = comparablePurchaseQuantity(item.quantity, item.unit);
  const offered = comparablePurchaseQuantity(selection.packQuantity, selection.packUnit);
  if (!required || !offered) return null;

  let comparableRequired = required;
  let estimated = false;
  if (required.family !== offered.family) {
    const canonicalName = canonicalizeIngredientName(item.canonicalName || item.name).canonicalName;
    const approximateWeight = approximateProduceWeightGrams[canonicalName];
    if (required.family !== "count" || offered.family !== "mass" || !approximateWeight) return null;
    comparableRequired = { quantity: required.quantity * approximateWeight, family: "mass", unit: "g" };
    estimated = true;
  }

  const packCount = Math.max(1, Math.ceil(comparableRequired.quantity / offered.quantity));
  const packSize = selection.packSizeText?.trim() || formatPackQuantity(offered.quantity, offered.unit);
  return {
    packCount,
    display: `${packCount} x ${packSize}`,
    estimated
  };
}

const builtInShoppingNameVariantGroups: Record<string, string[]> = {
  onion: ["onion", "red onion", "white onion", "spring onion"],
  potato: ["potato", "new potato", "baby potato", "sweet potato"],
  tomato: ["tomato", "cherry tomatoes", "chopped tomatoes", "tomato puree", "passata"],
  pepper: ["pepper", "red pepper", "yellow pepper", "green pepper"],
  chicken: ["chicken", "chicken breast", "chicken thigh"],
  mince: ["beef mince", "pork mince", "turkey mince"],
  milk: ["milk", "semi skimmed milk", "whole milk", "skimmed milk"],
  pasta: ["pasta", "tortelloni", "spaghetti", "penne", "fusilli", "tagliatelle", "linguine"],
  noodles: ["noodles", "flat rice noodles", "rice noodles", "egg noodles", "udon noodles"],
  rice: ["rice", "basmati rice", "long grain rice", "jasmine rice"]
};

function shoppingNameVariantGroupKey(...names: string[]) {
  const normalizedNames = names.map(normalizeIngredientAliasKey).filter(Boolean);
  const matchingGroup = Object.entries(builtInShoppingNameVariantGroups).find(([, variants]) =>
    normalizedNames.some((name) => variants.includes(name))
  );
  return matchingGroup?.[0] ?? normalizedNames[0] ?? "other";
}

function shoppingNameVariants(
  name: string,
  ingredientAliases: Record<string, string>,
  savedVariantGroups: Record<string, string[]>
) {
  const canonicalName = canonicalizeIngredientName(name, ingredientAliases).canonicalName;
  const groupKey = shoppingNameVariantGroupKey(name, canonicalName);
  const variants = [canonicalName, ...(builtInShoppingNameVariantGroups[groupKey] ?? []), ...(savedVariantGroups[groupKey] ?? [])]
    .map(normalizeIngredientAliasKey)
    .filter(Boolean);

  return Array.from(new Set(variants));
}

function aliasKeysForIngredientName(name: string) {
  const normalizedName = normalizeIngredientAliasKey(name);
  const simpleSingular = normalizedName.replace(/\b([a-z]{4,})s\b/g, "$1");
  return Array.from(new Set([normalizedName, simpleSingular].filter(Boolean)));
}

function useUpTargets(values: string[], ingredientAliases: Record<string, string>): UseUpTarget[] {
  const targets = values
    .flatMap((value) => value.split(/[,;\n]+/))
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      canonicalName: canonicalizeIngredientName(name, ingredientAliases).canonicalName
    }))
    .filter((target) => target.canonicalName && target.canonicalName !== "other");

  return targets.filter(
    (target, index) => targets.findIndex((candidate) => candidate.canonicalName === target.canonicalName) === index
  );
}

function useUpNamesMatch(targetName: string, recipeIngredientName: string) {
  if (targetName === recipeIngredientName) return true;

  const interchangeableGroups = [
    new Set(["onion", "red onion", "white onion"]),
    new Set(["pepper", "red pepper", "yellow pepper", "green pepper"])
  ];

  return interchangeableGroups.some((group) => group.has(targetName) && group.has(recipeIngredientName));
}

function suggestUseUpRecipes(
  recipes: Recipe[],
  values: string[],
  ingredientAliases: Record<string, string>
): { targets: UseUpTarget[]; suggestions: UseUpSuggestion[] } {
  const targets = useUpTargets(values, ingredientAliases);
  if (targets.length === 0) return { targets, suggestions: [] };

  const recipeMatches = recipes
    .map((recipe) => {
      const ingredientNames = recipe.ingredients.map((ingredient) =>
        canonicalizeIngredientName(ingredient.canonicalName || ingredient.name, ingredientAliases).canonicalName
      );
      const coveredIngredients = targets
        .filter((target) => ingredientNames.some((ingredientName) => useUpNamesMatch(target.canonicalName, ingredientName)))
        .map((target) => target.canonicalName);

      return {
        recipe,
        coveredIngredients,
        extraIngredientCount: Math.max(0, recipe.ingredients.length - coveredIngredients.length)
      };
    })
    .filter((match) => match.coveredIngredients.length > 0)
    .sort(
      (a, b) =>
        b.coveredIngredients.length - a.coveredIngredients.length ||
        a.extraIngredientCount - b.extraIngredientCount ||
        Number(b.recipe.favorite) - Number(a.recipe.favorite)
    )
    .slice(0, 80);

  const plans: UseUpSuggestion[] = recipeMatches.map((match) => ({
    recipeIds: [match.recipe.id],
    coveredIngredients: match.coveredIngredients,
    missingIngredients: targets
      .filter((target) => !match.coveredIngredients.includes(target.canonicalName))
      .map((target) => target.canonicalName),
    extraIngredientCount: match.extraIngredientCount,
    favoriteCount: Number(match.recipe.favorite)
  }));

  for (let firstIndex = 0; firstIndex < recipeMatches.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < recipeMatches.length; secondIndex += 1) {
      const first = recipeMatches[firstIndex];
      const second = recipeMatches[secondIndex];
      const coveredIngredients = Array.from(new Set([...first.coveredIngredients, ...second.coveredIngredients]));

      if (coveredIngredients.length <= Math.max(first.coveredIngredients.length, second.coveredIngredients.length)) continue;

      plans.push({
        recipeIds: [first.recipe.id, second.recipe.id],
        coveredIngredients,
        missingIngredients: targets
          .filter((target) => !coveredIngredients.includes(target.canonicalName))
          .map((target) => target.canonicalName),
        extraIngredientCount: first.extraIngredientCount + second.extraIngredientCount,
        favoriteCount: Number(first.recipe.favorite) + Number(second.recipe.favorite)
      });
    }
  }

  plans.sort((a, b) => {
    const aComplete = Number(a.missingIngredients.length === 0);
    const bComplete = Number(b.missingIngredients.length === 0);
    return (
      bComplete - aComplete ||
      b.coveredIngredients.length - a.coveredIngredients.length ||
      a.recipeIds.length - b.recipeIds.length ||
      a.extraIngredientCount - b.extraIngredientCount ||
      b.favoriteCount - a.favoriteCount
    );
  });

  const uniquePlans = plans.filter((plan, index) => {
    const key = plan.recipeIds.slice().sort().join("|");
    return plans.findIndex((candidate) => candidate.recipeIds.slice().sort().join("|") === key) === index;
  });

  return { targets, suggestions: uniquePlans.slice(0, 3) };
}

function normalizeStoreUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function publishAsdaHelperQueue(queue: AsdaHelperQueue) {
  if (typeof window === "undefined") return;

  (window as AsdaHelperWindow).__WEEKWISE_ASDA_QUEUE__ = queue;

  let queueElement = document.getElementById(asdaHelperQueueElementId) as HTMLScriptElement | null;
  if (!queueElement) {
    queueElement = document.createElement("script");
    queueElement.id = asdaHelperQueueElementId;
    queueElement.type = "application/json";
    queueElement.hidden = true;
    document.body.append(queueElement);
  }

  queueElement.textContent = JSON.stringify(queue);
}

function syncAsdaHelperItemStatus(itemId: string, statusKey: string, status?: StoreShoppingStatus) {
  if (typeof window === "undefined") return;
  window.postMessage(
    {
      source: asdaHelperAppSource,
      type: "ASDA_HELPER_SYNC_ITEM",
      payload: { itemId, statusKey, status }
    },
    window.location.origin
  );
}

function mergeManualShoppingItems(items: ShoppingListItem[]) {
  const merged = new Map<string, ShoppingListItem>();

  items.forEach((item) => {
    const canonicalName = canonicalizeIngredientName(item.canonicalName || item.name).canonicalName;
    const key = [item.shoppingRangeKey ?? "legacy", canonicalName, item.category, item.displayQuantity.trim().toLowerCase()].join("::");
    const existing = merged.get(key);

    if (existing) {
      merged.set(key, {
        ...existing,
        checked: existing.checked || item.checked
      });
    } else {
      merged.set(key, {
        ...item,
        canonicalName,
        manual: true,
        sourceMeals: ["Manual"]
      });
    }
  });

  return Array.from(merged.values());
}

function likelyHeicPhoto(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif") || file.type.includes("heic") || file.type.includes("heif");
}

function formatFileSize(bytes: number) {
  if (bytes >= 1_000_000) return `${Math.round((bytes / 1_000_000) * 10) / 10} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} bytes`;
}

function isHttpUrl(value?: string) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded. Try exporting the recipe photo as a standard JPEG or PNG."));
    image.src = src;
  });
}

async function loadImageSource(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      };
    } catch {
      // Fall back to data URL loading below. Some browsers reject certain JPEG encodings here.
    }
  }

  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("Image could not be loaded. Try exporting the recipe photo as a standard JPEG or PNG.");
  }

  return {
    source: image as CanvasImageSource,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: undefined
  };
}

function cropForMode(width: number, height: number, cropMode: PhotoCropMode) {
  if (cropMode === "ingredients") {
    return { x: 0, y: 0, width: Math.round(width * 0.52), height };
  }

  if (cropMode === "method") {
    return { x: Math.round(width * 0.4), y: 0, width: Math.round(width * 0.6), height };
  }

  return { x: 0, y: 0, width, height };
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

async function prepareRecipePhoto(file: File, cropMode: PhotoCropMode = "whole", rotation = 0, maxSide = 1500, quality = 0.72) {
  const loaded = await loadImageSource(file);

  try {
    const crop = cropForMode(loaded.width, loaded.height, cropMode);
    const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height));
    const cropWidth = Math.max(1, Math.round(crop.width * scale));
    const cropHeight = Math.max(1, Math.round(crop.height * scale));
    const normalizedRotation = normalizeRotation(rotation);
    const rotatedSideways = normalizedRotation === 90 || normalizedRotation === 270;
    const width = rotatedSideways ? cropHeight : cropWidth;
    const height = rotatedSideways ? cropWidth : cropHeight;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) throw new Error("Image processing is not available in this browser.");

    canvas.width = width;
    canvas.height = height;
    context.save();

    if (normalizedRotation === 90) {
      context.translate(width, 0);
      context.rotate(Math.PI / 2);
    } else if (normalizedRotation === 180) {
      context.translate(width, height);
      context.rotate(Math.PI);
    } else if (normalizedRotation === 270) {
      context.translate(0, height);
      context.rotate((Math.PI * 3) / 2);
    }

    context.drawImage(loaded.source, crop.x, crop.y, crop.width, crop.height, 0, 0, cropWidth, cropHeight);
    context.restore();

    const imageData = context.getImageData(0, 0, width, height);
    const contrast = 1.18;
    const midpoint = 128;

    for (let index = 0; index < imageData.data.length; index += 4) {
      const gray = imageData.data[index] * 0.299 + imageData.data[index + 1] * 0.587 + imageData.data[index + 2] * 0.114;
      const enhanced = Math.max(0, Math.min(255, (gray - midpoint) * contrast + midpoint));
      imageData.data[index] = enhanced;
      imageData.data[index + 1] = enhanced;
      imageData.data[index + 2] = enhanced;
    }

    context.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error("Photo compression failed."))), "image/jpeg", quality);
    });
    const suffix = cropMode === "whole" ? "recipe" : cropMode;
    const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, `-${suffix}.jpg`), { type: "image/jpeg" });

    return {
      file: compressedFile,
      dataUrl: await fileToDataUrl(compressedFile),
      cropMode,
      rotation: normalizedRotation
    };
  } finally {
    loaded.close?.();
  }
}

async function prepareMealImage(file: File) {
  if (!file.type.startsWith("image/") && !likelyHeicPhoto(file)) {
    throw new Error("Choose an image file.");
  }

  const loaded = await loadImageSource(file);

  try {
    const sizeSteps = [1200, 1000, 800];
    const qualitySteps = [0.82, 0.72, 0.62, 0.52];
    const targetBytes = 190_000;
    let smallestBlob: Blob | null = null;

    for (const maxSide of sizeSteps) {
      const scale = Math.min(1, maxSide / Math.max(loaded.width, loaded.height));
      const width = Math.max(1, Math.round(loaded.width * scale));
      const height = Math.max(1, Math.round(loaded.height * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) throw new Error("Image processing is not available in this browser.");

      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(loaded.source, 0, 0, loaded.width, loaded.height, 0, 0, width, height);

      for (const quality of qualitySteps) {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error("Meal picture compression failed."))),
            "image/jpeg",
            quality
          );
        });
        if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
        if (blob.size <= targetBytes) return fileToDataUrl(blob);
      }
    }

    if (!smallestBlob) throw new Error("Meal picture compression failed.");
    return fileToDataUrl(smallestBlob);
  } finally {
    loaded.close?.();
  }
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("The saved meal picture could not be prepared for upload.");
  return response.blob();
}

async function recognizeRecipePhoto(
  prepared: { file: File; dataUrl: string },
  originalFile: File,
  onProgress: (message: string) => void
) {
  const { recognize } = await import("tesseract.js");
  const candidates: Array<{ label: string; image: string | File }> = [
    { label: "processed image", image: prepared.dataUrl },
    { label: "processed file", image: prepared.file }
  ];

  if (prepared.file !== originalFile) {
    candidates.push({ label: "original file", image: originalFile });
  }

  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      onProgress(`Reading ${candidate.label} privately...`);
      const result = await recognize(candidate.image, "eng", {
        logger: (message: { status?: string; progress?: number }) => {
          if (message.status && typeof message.progress === "number") {
            onProgress(`${message.status} ${Math.round(message.progress * 100)}%`);
          }
        }
      });
      const text = result.data.text.trim();

      if (text) {
        return {
          text,
          warning: candidate.label === "processed image" ? "" : `Private OCR worked using the ${candidate.label}.`
        };
      }

      lastError = new Error(`Private OCR did not find text in the ${candidate.label}.`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Browser OCR could not read this photo.");
}

function syncStatusCopy(status: SyncStatus) {
  const labels: Record<SyncStatus, string> = {
    local: "Local only",
    loading: "Loading",
    saving: "Saving",
    saved: "Saved",
    offline: "Offline",
    error: "Sync error"
  };

  return labels[status];
}

export default function Home() {
  const [state, setState] = useState<AppState>(() => seedState());
  const [hasHydratedLocalState, setHasHydratedLocalState] = useState(false);
  const [activeView, setActiveView] = useState<View>("planner");
  const [weekStart, setWeekStart] = useState(() => formatDateKey(startOfWeek(new Date())));
  const [plannerDayCount, setPlannerDayCount] = useState<7 | 14>(7);
  const [shoppingStartDate, setShoppingStartDate] = useState(() => formatDateKey(startOfWeek(new Date())));
  const [shoppingEndDate, setShoppingEndDate] = useState(() => formatDateKey(addDays(startOfWeek(new Date()), 6)));
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeGroupFilter, setRecipeGroupFilter] = useState<RecipeGroupFilter>("all");
  const [mealPicker, setMealPicker] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [mealPickerQuery, setMealPickerQuery] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("manual");
  const [importText, setImportText] = useState(samplePasteText);
  const [importUrl, setImportUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [compressedPhotoFile, setCompressedPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [photoCropMode, setPhotoCropMode] = useState<PhotoCropMode>("whole");
  const [photoRotation, setPhotoRotation] = useState(0);
  const [photoRawText, setPhotoRawText] = useState("");
  const [draft, setDraft] = useState<ImportDraft>(() => emptyDraft());
  const [tagInput, setTagInput] = useState("");
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const [manualItemName, setManualItemName] = useState("");
  const [manualItemQuantity, setManualItemQuantity] = useState("");
  const [manualItemCategory, setManualItemCategory] = useState<ManualItemCategory>("Auto");
  const [manualBulkItems, setManualBulkItems] = useState("");
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudUser, setCloudUser] = useState<string | null>(null);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [cloudMessage, setCloudMessage] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [recipeImageUrls, setRecipeImageUrls] = useState<Record<string, string>>({});
  const stateRef = useRef(state);
  const cloudUserIdRef = useRef<string | null>(null);
  const cloudLoadedRef = useRef(false);
  const suppressNextCloudSaveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedJsonRef = useRef("");
  const migratingRecipeImagesRef = useRef(false);

  useEffect(() => {
    const hydratedState = loadState();
    stateRef.current = hydratedState;
    setState(hydratedState);
    setHasHydratedLocalState(true);
  }, []);

  const visibleSlots = useMemo(
    () => mealSlots.filter((slot) => !state.settings.hiddenSlots.includes(slot)),
    [state.settings.hiddenSlots]
  );
  const days = useMemo(() => dateRangeDates(weekStart, plannerDayCount), [plannerDayCount, weekStart]);
  const shoppingDateRange = useMemo(() => normalizeDateRange(shoppingStartDate, shoppingEndDate), [shoppingStartDate, shoppingEndDate]);
  const shoppingRangeKey = useMemo(() => shoppingRangeKeyForRange(shoppingDateRange), [shoppingDateRange]);
  const shoppingHiddenPrefix = useMemo(
    () => shoppingHiddenPrefixForRange(shoppingDateRange),
    [shoppingDateRange.startDate, shoppingDateRange.endDate]
  );
  const asdaStatusPrefix = useMemo(
    () => storeStatusPrefixForRange(shoppingDateRange),
    [shoppingDateRange.startDate, shoppingDateRange.endDate]
  );
  const rangeHiddenShoppingItems = useMemo(() => {
    const scopedHiddenItems: Record<string, boolean> = {};

    Object.entries(state.hiddenShoppingItems).forEach(([key, hidden]) => {
      if (hidden && key.startsWith(shoppingHiddenPrefix)) {
        scopedHiddenItems[key.slice(shoppingHiddenPrefix.length)] = true;
      }
    });

    return scopedHiddenItems;
  }, [shoppingHiddenPrefix, state.hiddenShoppingItems]);
  const rangeAsdaShoppingStatus = useMemo(() => {
    const scopedStatus: Record<string, StoreShoppingStatus> = {};

    Object.entries(state.asdaShoppingStatus).forEach(([key, status]) => {
      if (key.startsWith(asdaStatusPrefix)) {
        scopedStatus[key.slice(asdaStatusPrefix.length)] = status;
      }
    });

    return scopedStatus;
  }, [asdaStatusPrefix, state.asdaShoppingStatus]);
  const shoppingList = useMemo(
    () =>
      generateShoppingList(
        state.recipes,
        state.plannedMeals.filter((meal) => meal.date >= shoppingDateRange.startDate && meal.date <= shoppingDateRange.endDate),
        state.settings,
        state.shoppingChecks,
        rangeHiddenShoppingItems,
        state.manualShoppingItems.filter((item) => item.shoppingRangeKey === shoppingRangeKey)
      ),
    [rangeHiddenShoppingItems, shoppingDateRange, shoppingRangeKey, state]
  );
  const filteredRecipes = useMemo(() => {
    const query = recipeSearch.toLowerCase().trim();
    return state.recipes
      .filter((recipe) => {
        if (recipeGroupFilter !== "all" && !recipe.mealTypes.includes(recipeGroupFilter)) return false;
        if (!query) return true;
        return (
          recipe.title.toLowerCase().includes(query) ||
          (recipe.source ?? recipe.sourceUrl ?? "").toLowerCase().includes(query) ||
          recipe.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          recipe.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title));
  }, [recipeGroupFilter, recipeSearch, state.recipes]);
  const recipeFrequencies = useMemo(() => {
    return state.plannedMeals.reduce<Record<string, number>>((counts, meal) => {
      if (meal.recipeId) counts[meal.recipeId] = (counts[meal.recipeId] ?? 0) + 1;
      return counts;
    }, {});
  }, [state.plannedMeals]);
  const mealPickerRecipes = useMemo(() => {
    const query = mealPickerQuery.toLowerCase().trim();
    return state.recipes
      .filter((recipe) => {
        if (!query) return true;
        return (
          recipe.title.toLowerCase().includes(query) ||
          recipe.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          recipe.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => {
        const frequencySort = (recipeFrequencies[b.id] ?? 0) - (recipeFrequencies[a.id] ?? 0);
        return frequencySort || Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title);
      });
  }, [mealPickerQuery, recipeFrequencies, state.recipes]);
  const selectedRecipe = selectedRecipeId ? state.recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null : null;
  const plannedRecipeIds = new Set(state.plannedMeals.map((meal) => meal.recipeId).filter((recipeId): recipeId is string => Boolean(recipeId)));
  const weekMeals = state.plannedMeals.filter((meal) => days.some((date) => formatDateKey(date) === meal.date));
  const generatedCount = shoppingList.filter((item) => !item.manual).length;
  const checkedCount = shoppingList.filter((item) => item.checked).length;
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  useEffect(() => {
    stateRef.current = state;
    if (!hasHydratedLocalState) return;
    const saved = writeLocalStorage(storageKey, JSON.stringify(state));
    if (!saved) {
      setCloudMessage("The browser backup is full. Recipe data will continue syncing to Supabase, but embedded photos need cloud image storage.");
    }
  }, [hasHydratedLocalState, state]);

  useEffect(() => {
    if (!hasHydratedLocalState) return;
    const client = getSupabaseClient();
    if (!client) {
      setSyncStatus("local");
      return;
    }

    let active = true;

    client.auth.getUser().then(({ data }) => {
      if (!active) return;
      void connectCloudUser(data.user);
    });

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void connectCloudUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hasHydratedLocalState]);

  useEffect(() => {
    if (!hasHydratedLocalState) return;
    if (!supabaseConfigured || !cloudUserIdRef.current) {
      setSyncStatus("local");
      return;
    }

    if (!cloudLoadedRef.current) return;

    if (suppressNextCloudSaveRef.current) {
      suppressNextCloudSaveRef.current = false;
      return;
    }

    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }

    const json = JSON.stringify(state);
    if (json === lastSavedJsonRef.current) {
      setSyncStatus("saved");
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncStatus("saving");
    saveTimerRef.current = setTimeout(() => {
      void saveCloudSnapshotForUser(cloudUserIdRef.current!, stateRef.current);
    }, 900);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [hasHydratedLocalState, state, supabaseConfigured]);

  useEffect(() => {
    if (!hasHydratedLocalState || !cloudUser || !cloudLoaded) return;

    const recipesWithStoredImages = state.recipes.filter((recipe) => recipe.mealImagePath);
    if (recipesWithStoredImages.length > 0) {
      void refreshRecipeImageUrls(recipesWithStoredImages);
    }

    const recipesWithEmbeddedImages = state.recipes.filter(
      (recipe) => !recipe.mealImagePath && recipe.mealImageUrl?.startsWith("data:image/")
    );
    if (recipesWithEmbeddedImages.length > 0 && !migratingRecipeImagesRef.current) {
      void migrateEmbeddedRecipeImages(recipesWithEmbeddedImages);
    }
  }, [cloudLoaded, cloudUser, hasHydratedLocalState, state.recipes]);

  function updateState(updater: (current: AppState) => AppState) {
    setState((current) => updater(current));
  }

  async function createRecipeImageSignedUrl(path: string) {
    const client = getSupabaseClient();
    if (!client) throw new Error("Cloud image storage is not configured.");

    const { data, error } = await client.storage.from(recipeImageBucket).createSignedUrl(path, recipeImageSignedUrlSeconds);
    if (error || !data?.signedUrl) throw new Error(error?.message || "The meal picture could not be opened.");
    return data.signedUrl;
  }

  async function refreshRecipeImageUrls(recipes: Recipe[]) {
    const client = getSupabaseClient();
    const recipesWithPaths = recipes.filter((recipe): recipe is Recipe & { mealImagePath: string } => Boolean(recipe.mealImagePath));
    if (!client || recipesWithPaths.length === 0) return;

    const paths = Array.from(new Set(recipesWithPaths.map((recipe) => recipe.mealImagePath)));
    const { data, error } = await client.storage.from(recipeImageBucket).createSignedUrls(paths, recipeImageSignedUrlSeconds);
    if (error || !data) return;

    const signedUrlByPath = Object.fromEntries(
      data.filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl as string])
    );
    const nextUrls = Object.fromEntries(
      recipesWithPaths
        .map((recipe) => [recipe.id, signedUrlByPath[recipe.mealImagePath]] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    );

    setRecipeImageUrls((current) => ({ ...current, ...nextUrls }));
  }

  async function uploadRecipeImage(recipeId: string, dataUrl: string) {
    const client = getSupabaseClient();
    const snapshotOwnerId = cloudUserIdRef.current;
    if (!client || !snapshotOwnerId) {
      throw new Error("Sign in to Cloud Sync before saving an uploaded meal picture.");
    }

    let blob = await dataUrlToBlob(dataUrl);
    if (blob.size > 900_000) {
      const compressedDataUrl = await prepareMealImage(
        new File([blob], `${recipeId}-meal-image`, { type: blob.type || "image/jpeg" })
      );
      blob = await dataUrlToBlob(compressedDataUrl);
    }

    const path = `${snapshotOwnerId}/${recipeId}.jpg`;
    const { error } = await client.storage.from(recipeImageBucket).upload(path, blob, {
      cacheControl: "3600",
      contentType: blob.type || "image/jpeg",
      upsert: true
    });

    if (error) {
      const setupHint = /bucket|not found|row-level|policy|permission/i.test(error.message)
        ? " Run supabase/recipe-images.sql in the Supabase SQL editor."
        : "";
      throw new Error(`The meal picture could not be saved: ${error.message}.${setupHint}`);
    }

    const signedUrl = await createRecipeImageSignedUrl(path);
    setRecipeImageUrls((current) => ({ ...current, [recipeId]: signedUrl }));
    return path;
  }

  async function migrateEmbeddedRecipeImages(recipes: Recipe[]) {
    migratingRecipeImagesRef.current = true;
    const migratedPaths = new Map<string, string>();

    try {
      for (const recipe of recipes) {
        if (!recipe.mealImageUrl?.startsWith("data:image/")) continue;
        const path = await uploadRecipeImage(recipe.id, recipe.mealImageUrl);
        migratedPaths.set(recipe.id, path);
      }

      if (migratedPaths.size > 0) {
        updateState((current) => ({
          ...current,
          recipes: current.recipes.map((recipe) => {
            const mealImagePath = migratedPaths.get(recipe.id);
            return mealImagePath ? { ...recipe, mealImagePath, mealImageUrl: undefined } : recipe;
          })
        }));
        setCloudMessage(`Moved ${migratedPaths.size} saved recipe photo${migratedPaths.size === 1 ? "" : "s"} into private cloud image storage.`);
      }
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : "Existing recipe photos could not be moved into cloud image storage.");
    } finally {
      migratingRecipeImagesRef.current = false;
    }
  }

  useEffect(() => {
    if (!hasHydratedLocalState) return;

    function handleAsdaHelperMessage(event: MessageEvent<AsdaHelperExtensionMessage>) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.source !== asdaHelperExtensionSource || message.type !== "ASDA_HELPER_UPDATE_ITEM") return;

      const payload = message.payload ?? {};
      const status = payload.status;
      const validStatus = status === "opened" || status === "added" || status === "unavailable" ? status : undefined;
      const normalizedUrl = typeof payload.productUrl === "string" ? normalizeStoreUrl(payload.productUrl) : "";
      const shoppingKey = typeof payload.shoppingKey === "string" ? payload.shoppingKey : "";
      const statusKey = typeof payload.statusKey === "string" ? payload.statusKey : "";
      const itemId = typeof payload.itemId === "string" ? payload.itemId : "";
      const productName = typeof payload.productName === "string" ? payload.productName.trim() : "";
      const packSizeText = typeof payload.packSizeText === "string" ? payload.packSizeText.trim() : "";
      const packQuantity = typeof payload.packQuantity === "number" && Number.isFinite(payload.packQuantity) ? payload.packQuantity : undefined;
      const packUnit = typeof payload.packUnit === "string" ? normalizeUnit(payload.packUnit) : "";

      if (!shoppingKey && !statusKey && !itemId) return;

      updateState((current) => {
        const asdaProductLinks = { ...current.asdaProductLinks };
        const asdaProductSelections = { ...current.asdaProductSelections };
        const asdaShoppingStatus = { ...current.asdaShoppingStatus };
        const shoppingChecks = { ...current.shoppingChecks };

        if (shoppingKey && normalizedUrl) {
          asdaProductLinks[shoppingKey] = normalizedUrl;
          if (productName) {
            asdaProductSelections[shoppingKey] = {
              productUrl: normalizedUrl,
              productName,
              packSizeText: packSizeText || undefined,
              packQuantity,
              packUnit: packUnit || undefined,
              lastSeenAt: new Date().toISOString()
            };
          }
        }

        if (statusKey && validStatus) {
          asdaShoppingStatus[statusKey] = validStatus;
        }

        if (itemId && validStatus === "added") {
          shoppingChecks[itemId] = true;
        }

        return {
          ...current,
          asdaProductLinks,
          asdaProductSelections,
          asdaShoppingStatus,
          shoppingChecks,
          manualShoppingItems:
            itemId && validStatus === "added"
              ? current.manualShoppingItems.map((item) => (item.id === itemId ? { ...item, checked: true } : item))
              : current.manualShoppingItems
        };
      });
    }

    window.addEventListener("message", handleAsdaHelperMessage);
    return () => window.removeEventListener("message", handleAsdaHelperMessage);
  }, [hasHydratedLocalState]);

  function applyDraft(nextDraft: ImportDraft) {
    const hydratedDraft = {
      ...nextDraft,
      mealTypes: normalizeMealTypes(nextDraft.mealTypes, inferRecipeMealTypes(nextDraft)[0]),
      source: nextDraft.source ?? nextDraft.sourceUrl ?? "",
      ingredients: nextDraft.ingredients.map((ingredient) => {
        const standardized = standardizeIngredientQuantity(ingredient.quantity, ingredient.unit);
        return {
          ...ingredient,
          quantity: standardized.quantity,
          unit: standardized.unit,
          canonicalName:
            normalizeIngredientAliasKey(ingredient.canonicalName ?? "") ||
            canonicalizeIngredientName(ingredient.name, state.settings.ingredientAliases).canonicalName,
          role: ingredient.role ?? "required"
        };
      }),
      suppressedAutoTags: normalizeSuppressedAutomaticTags(nextDraft.suppressedAutoTags)
    };
    setDraft(hydratedDraft);
    setTagInput(hydratedDraft.tags.filter((tag) => !isAutomaticRecipeTag(tag)).join(", "));
  }

  function addPlannedMeal(date: string, slot: MealSlot, recipeId: string) {
    if (!recipeId) return;

    updateState((current) => {
      return {
        ...current,
        plannedMeals: [
          ...current.plannedMeals,
          {
            id: createId("meal"),
            date,
            slot,
            recipeId,
            peopleCount: current.settings.defaultPeople,
            selectedIngredientIds: [],
            extraSideIngredients: []
          }
        ]
      };
    });
    setMealPicker(null);
    setMealPickerQuery("");
  }

  function planSuggestedRecipes(recipeIds: string[]) {
    const displayedDates = days.map(formatDateKey);
    const displayedDateSet = new Set(displayedDates);

    updateState((current) => {
      const plannedMeals = [...current.plannedMeals];
      const occupiedSlots = new Set(plannedMeals.map((meal) => `${meal.date}:${meal.slot}`));
      const alreadyPlannedRecipeIds = new Set(
        plannedMeals
          .filter((meal) => displayedDateSet.has(meal.date) && meal.recipeId)
          .map((meal) => meal.recipeId as string)
      );

      recipeIds.forEach((recipeId) => {
        if (alreadyPlannedRecipeIds.has(recipeId)) return;
        const recipe = current.recipes.find((item) => item.id === recipeId);
        if (!recipe) return;

        const recipeSlots = normalizeMealTypes(recipe.mealTypes).filter((slot) => !current.settings.hiddenSlots.includes(slot));
        const candidateSlots = recipeSlots.length > 0 ? recipeSlots : visibleSlots.length > 0 ? visibleSlots : ["dinner" as MealSlot];
        let target: { date: string; slot: MealSlot } | null = null;

        for (const date of displayedDates) {
          const availableSlot = candidateSlots.find((slot) => !occupiedSlots.has(`${date}:${slot}`));
          if (availableSlot) {
            target = { date, slot: availableSlot };
            break;
          }
        }

        const fallbackDate = displayedDates[plannedMeals.length % Math.max(1, displayedDates.length)] ?? formatDateKey(new Date());
        const selectedTarget = target ?? { date: fallbackDate, slot: candidateSlots[0] };
        plannedMeals.push({
          id: createId("meal"),
          date: selectedTarget.date,
          slot: selectedTarget.slot,
          recipeId,
          peopleCount: current.settings.defaultPeople,
          notes: "Uses food already at home"
        });
        occupiedSlots.add(`${selectedTarget.date}:${selectedTarget.slot}`);
        alreadyPlannedRecipeIds.add(recipeId);
      });

      return { ...current, plannedMeals };
    });
  }

  function addManualPlannedMeal(date: string, slot: MealSlot, title: string) {
    const manualTitle = title.trim();
    if (!manualTitle) return;

    updateState((current) => ({
      ...current,
      plannedMeals: [
        ...current.plannedMeals,
        {
          id: createId("meal"),
          date,
          slot,
          manualTitle,
          peopleCount: current.settings.defaultPeople
        }
      ]
    }));
    setMealPicker(null);
    setMealPickerQuery("");
  }

  function movePlannedMeal(id: string, date: string, slot: MealSlot) {
    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.map((meal) => (meal.id === id ? { ...meal, date, slot } : meal))
    }));
  }

  function updatePlannedMeal(id: string, patch: Partial<AppState["plannedMeals"][number]>) {
    const normalizedPatch =
      typeof patch.peopleCount === "number" ? { ...patch, peopleCount: Math.max(0, patch.peopleCount) } : patch;

    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.map((meal) => (meal.id === id ? { ...meal, ...normalizedPatch } : meal))
    }));
  }

  function removePlannedMeal(id: string) {
    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.filter((meal) => meal.id !== id)
    }));
  }

  function addLeftoverLunch(meal: (typeof state.plannedMeals)[number]) {
    const nextDay = formatDateKey(addDays(new Date(`${meal.date}T12:00:00`), 1));
    updateState((current) => ({
      ...current,
      plannedMeals: [
        ...current.plannedMeals,
        {
          id: createId("meal"),
          date: nextDay,
          slot: "lunch",
          recipeId: meal.recipeId,
          manualTitle: meal.recipeId ? undefined : meal.manualTitle,
          peopleCount: 0,
          notes: "Leftovers",
          selectedIngredientIds: meal.selectedIngredientIds,
          extraSideIngredients: meal.extraSideIngredients?.map((ingredient) => ({ ...ingredient }))
        }
      ]
    }));
  }

  function moveWeek(direction: -1 | 1) {
    setWeekStart((current) => formatDateKey(addDays(new Date(`${current}T12:00:00`), direction * plannerDayCount)));
  }

  function updateDayNote(date: string, note: string) {
    updateState((current) => {
      const dayNotes = { ...current.dayNotes };
      if (note.trim()) {
        dayNotes[date] = note;
      } else {
        delete dayNotes[date];
      }

      return { ...current, dayNotes };
    });
  }

  function duplicateWeekToNext() {
    const nextWeek = addDays(new Date(`${weekStart}T12:00:00`), plannerDayCount);
    const newMeals = weekMeals.map((meal) => ({
      ...meal,
      id: createId("meal"),
      date: formatDateKey(addDays(nextWeek, days.findIndex((day) => formatDateKey(day) === meal.date)))
    }));
    const newDayNotes = days.reduce<Record<string, string>>((notes, day, index) => {
      const sourceDate = formatDateKey(day);
      const note = state.dayNotes[sourceDate];
      if (note) notes[formatDateKey(addDays(nextWeek, index))] = note;
      return notes;
    }, {});

    updateState((current) => ({
      ...current,
      plannedMeals: [...current.plannedMeals, ...newMeals],
      dayNotes: { ...current.dayNotes, ...newDayNotes }
    }));
    setWeekStart(formatDateKey(nextWeek));
  }

  function clearWeek() {
    const dayKeys = new Set(days.map(formatDateKey));
    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.filter((meal) => !dayKeys.has(meal.date)),
      dayNotes: Object.fromEntries(Object.entries(current.dayNotes).filter(([date]) => !dayKeys.has(date))),
      shoppingChecks: {}
    }));
  }

  async function saveDraft() {
    setImportStatus("Saving recipe...");

    try {
      const recipeId = editingRecipeId ?? createId("recipe");
      let mealImagePath = draft.mealImagePath;
      let mealImageUrl = draft.mealImageUrl;

      if (mealImageUrl?.startsWith("data:image/")) {
        mealImagePath = await uploadRecipeImage(recipeId, mealImageUrl);
        mealImageUrl = undefined;
      }

      const cleanedDraft: ImportDraft = {
        ...draft,
        mealImagePath,
        mealImageUrl,
        title: draft.title.trim() || "Untitled recipe",
        servings: Math.max(1, Number(draft.servings) || 4),
        mealTypes: normalizeMealTypes(draft.mealTypes),
        source: draft.source?.trim(),
        suppressedAutoTags: normalizeSuppressedAutomaticTags(draft.suppressedAutoTags),
        tags: parseTags(tagInput),
        ingredients: draft.ingredients
          .filter((ingredient) => ingredient.name.trim())
          .map((ingredient) => {
            const standardized = standardizeIngredientQuantity(ingredient.quantity, ingredient.unit);
            return {
              ...ingredient,
              id: ingredient.id || createId("ing"),
              quantity: standardized.quantity,
              unit: standardized.unit,
              category: ingredient.category || inferCategory(ingredient.name),
              canonicalName:
                normalizeIngredientAliasKey(ingredient.canonicalName ?? "") ||
                canonicalizeIngredientName(ingredient.name, state.settings.ingredientAliases).canonicalName,
              needsReview: ingredient.needsReview ?? ingredient.confidence === "low",
              role: ingredient.role ?? "required"
            };
          }),
        instructions: draft.instructions.map((step) => step.trim()).filter(Boolean)
      };
      cleanedDraft.tags = mergeAutomaticRecipeTags(cleanedDraft.tags, cleanedDraft, cleanedDraft.suppressedAutoTags);
      const recipe = { ...draftToRecipe(cleanedDraft), id: recipeId };

      updateState((current) => {
        if (editingRecipeId) {
          const existing = current.recipes.find((item) => item.id === editingRecipeId);
          return {
            ...current,
            recipes: current.recipes.map((item) =>
              item.id === editingRecipeId
                ? {
                    ...recipe,
                    favorite: existing?.favorite ?? false,
                    createdAt: existing?.createdAt ?? recipe.createdAt,
                    updatedAt: new Date().toISOString()
                  }
                : item
            )
          };
        }

        return {
          ...current,
          recipes: [{ ...recipe, favorite: cleanedDraft.tags.includes("favorite") }, ...current.recipes]
        };
      });

      applyDraft(emptyDraft());
      setEditingRecipeId(null);
      setImportMode("manual");
      setActiveView("recipes");
    } catch (error) {
      const warning = error instanceof Error ? error.message : "The recipe could not be saved.";
      setDraft((current) => ({ ...current, warnings: Array.from(new Set([...current.warnings, warning])) }));
    } finally {
      setImportStatus("");
    }
  }

  function editRecipe(recipe: Recipe) {
    applyDraft(recipeToDraft(recipe));
    setEditingRecipeId(recipe.id);
    setImportMode("manual");
    setActiveView("add");
  }

  function duplicateRecipe(recipe: Recipe) {
    const copy = draftToRecipe({
      ...recipeToDraft(recipe),
      title: `${recipe.title} copy`,
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, id: createId("ing") })),
      importedFrom: "manual"
    });
    updateState((current) => ({ ...current, recipes: [{ ...copy, favorite: false }, ...current.recipes] }));
  }

  function deleteRecipe(recipeId: string) {
    updateState((current) => ({
      ...current,
      recipes: current.recipes.filter((recipe) => recipe.id !== recipeId),
      plannedMeals: current.plannedMeals.filter((meal) => meal.recipeId !== recipeId)
    }));
  }

  function toggleFavorite(recipeId: string) {
    updateState((current) => ({
      ...current,
      recipes: current.recipes.map((recipe) =>
        recipe.id === recipeId ? { ...recipe, favorite: !recipe.favorite, updatedAt: new Date().toISOString() } : recipe
      )
    }));
  }

  function updateDraftIngredient(id: string, patch: Partial<Ingredient>) {
    const hasCanonicalNamePatch = Object.prototype.hasOwnProperty.call(patch, "canonicalName");

    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient) =>
        ingredient.id === id
          ? {
              ...ingredient,
              ...patch,
              category: patch.name && !patch.category ? inferCategory(patch.name) : patch.category ?? ingredient.category,
              canonicalName: hasCanonicalNamePatch
                ? patch.canonicalName
                : patch.name
                  ? canonicalizeIngredientName(patch.name, state.settings.ingredientAliases).canonicalName
                  : ingredient.canonicalName,
              needsReview: patch.name ? false : patch.needsReview ?? ingredient.needsReview
            }
          : ingredient
      )
    }));
  }

  function addDraftIngredient() {
    setDraft((current) => ({
      ...current,
      ingredients: [
        ...current.ingredients,
        { id: createId("ing"), name: "", unit: "", category: "Other", canonicalName: "", confidence: "medium", role: "required" }
      ]
    }));
  }

  function rememberShoppingNameVariant(ingredientName: string, shoppingName: string) {
    const cleanShoppingName = normalizeIngredientAliasKey(shoppingName);
    if (!ingredientName.trim() || !cleanShoppingName) return;

    const aliasEntries = aliasKeysForIngredientName(ingredientName).map((aliasKey) => [aliasKey, cleanShoppingName] as const);
    const variantGroupKey = shoppingNameVariantGroupKey(ingredientName, cleanShoppingName);
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ingredientAliases: {
          ...current.settings.ingredientAliases,
          ...Object.fromEntries(aliasEntries)
        },
        shoppingNameVariants: {
          ...current.settings.shoppingNameVariants,
          [variantGroupKey]: Array.from(
            new Set([...(current.settings.shoppingNameVariants[variantGroupKey] ?? []), cleanShoppingName])
          )
        }
      }
    }));
  }

  function removeDraftIngredient(id: string) {
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.filter((ingredient) => ingredient.id !== id)
    }));
  }

  function updateInstruction(index: number, value: string) {
    setDraft((current) => ({
      ...current,
      instructions: current.instructions.map((step, stepIndex) => (stepIndex === index ? value : step))
    }));
  }

  function addInstruction() {
    setDraft((current) => ({ ...current, instructions: [...current.instructions, ""] }));
  }

  function removeInstruction(index: number) {
    setDraft((current) => ({
      ...current,
      instructions: current.instructions.filter((_step, stepIndex) => stepIndex !== index)
    }));
  }

  async function extractFromText(event: FormEvent) {
    event.preventDefault();
    setImportStatus("Extracting recipe text...");

    try {
      const response = await fetch("/api/import/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: importText })
      });
      if (!response.ok) throw new Error("Import failed");
      applyDraft((await response.json()) as ImportDraft);
    } catch {
      applyDraft(parseRecipeText(importText, "paste"));
    } finally {
      setImportStatus("");
    }
  }

  async function extractFromUrl(event: FormEvent) {
    event.preventDefault();
    setImportStatus("Reading recipe page...");

    try {
      const response = await fetch("/api/import/url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: importUrl })
      });
      const payload = (await response.json()) as ImportDraft | { error?: string };
      if (!response.ok || ("error" in payload && payload.error)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Import failed");
      }
      applyDraft(payload as ImportDraft);
    } catch (error) {
      applyDraft({
        ...emptyDraft(),
        title: "URL import draft",
        source: importUrl,
        sourceUrl: importUrl,
        importedFrom: "url",
        warnings: [
          error instanceof Error ? error.message : "The page could not be imported automatically.",
          "Paste the recipe text into the text importer or fill the review fields manually."
        ]
      });
    } finally {
      setImportStatus("");
    }
  }

  async function extractFromPhoto(event: FormEvent) {
    event.preventDefault();
    if (!photoFile) return;
    setImportStatus("Preparing photo...");

    try {
      let prepared: Awaited<ReturnType<typeof prepareRecipePhoto>>;
      let preprocessingWarning = "";

      try {
        prepared = await prepareRecipePhoto(photoFile, photoCropMode, photoRotation);
      } catch (error) {
        preprocessingWarning =
          error instanceof Error
            ? `${error.message} Private OCR is trying the original file instead.`
            : "Photo preprocessing failed. Private OCR is trying the original file instead.";
	        prepared = {
	          file: photoFile,
	          dataUrl: photoPreview || (await fileToDataUrl(photoFile)),
	          cropMode: photoCropMode,
	          rotation: normalizeRotation(photoRotation)
	        };
      }

      setCompressedPhotoFile(prepared.file);
      setPhotoPreview(prepared.dataUrl);
      setImportStatus("Reading photo privately on this device...");

      const { text, warning } = await recognizeRecipePhoto(prepared, photoFile, setImportStatus);
      setPhotoRawText(cleanOcrRecipeText(text));
      const payload = draftFromOcrText(text, photoFile.name);
      applyDraft({
        ...payload,
        source: payload.source ?? photoFile.name,
        photoDataUrl: prepared.dataUrl,
        warnings: Array.from(
          new Set([
            "Browser OCR was used for this draft. Review carefully before saving.",
            `OCR crop mode: ${photoCropMode === "whole" ? "whole recipe" : `${photoCropMode} only`}.`,
            ...(preprocessingWarning ? [preprocessingWarning] : []),
            ...(warning ? [warning] : []),
            ...payload.warnings
          ])
        )
      });
    } catch (error) {
      const heicAdvice = likelyHeicPhoto(photoFile)
        ? "This looks like an iPhone HEIC photo. Export/share it as JPEG, or use iPhone Photos > Share > Options > Most Compatible."
        : "";
      applyDraft({
        ...emptyDraft(),
        title: photoFile.name.replace(/\.[^.]+$/, ""),
        importedFrom: "photo",
        photoDataUrl: photoPreview,
        warnings: [
          error instanceof Error ? error.message : "Browser OCR could not read this photo.",
          `Selected file: ${photoFile.name || "photo"} (${formatFileSize(photoFile.size)}${photoFile.type ? `, ${photoFile.type}` : ""}).`,
          ...(heicAdvice ? [heicAdvice] : []),
          "Try the free online OCR fallback or type/paste the recipe text into the review fields."
        ]
      });
    } finally {
      setImportStatus("");
    }
  }

  async function extractFromPhotoFallback() {
    if (!photoFile) return;
    setImportStatus("Preparing photo for free online OCR...");

    try {
      let prepared: Awaited<ReturnType<typeof prepareRecipePhoto>>;
      let preprocessingWarning = "";

      try {
        prepared = await prepareRecipePhoto(photoFile, photoCropMode, photoRotation, 1800, 0.8);
      } catch (error) {
        preprocessingWarning =
          error instanceof Error
            ? `${error.message} Online OCR is trying the original file instead.`
            : "Photo preprocessing failed. Online OCR is trying the original file instead.";
        prepared = {
          file: photoFile,
          dataUrl: photoPreview || (await fileToDataUrl(photoFile)),
          cropMode: photoCropMode,
          rotation: normalizeRotation(photoRotation)
        };
      }

      setCompressedPhotoFile(prepared.file);
      setPhotoPreview(prepared.dataUrl);
      setImportStatus("Sending selected crop to free online OCR...");

      const formData = new FormData();
      formData.append("source", "ocr-space");
      formData.append("cropMode", photoCropMode);
      formData.append("photo", prepared.file);

      const response = await fetch("/api/import/photo", { method: "POST", body: formData });
      const responseText = await response.text();
      const payload = parseJsonResponse<ImportDraft | { error?: string }>(responseText, "Online OCR failed.");

      if (!response.ok || ("error" in payload && payload.error)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Online OCR failed.");
      }

      const nextDraft = payload as ImportDraft;
      setPhotoRawText(cleanOcrRecipeText(nextDraft.rawText || [...nextDraft.ingredients.map((ingredient) => ingredient.originalLine || ingredient.name), ...nextDraft.instructions].join("\n")));
      applyDraft({
        ...nextDraft,
        photoDataUrl: prepared.dataUrl,
	        warnings: Array.from(
	          new Set([
	            `Online OCR crop mode: ${photoCropMode === "whole" ? "whole recipe" : `${photoCropMode} only`}.`,
	            ...(preprocessingWarning ? [preprocessingWarning] : []),
	            ...nextDraft.warnings
	          ])
	        )
      });
    } catch (error) {
      setImportStatus("");
      applyDraft({
        ...draft,
        photoDataUrl: photoPreview,
        warnings: Array.from(
          new Set([
            ...draft.warnings,
            error instanceof Error ? error.message : "The free online OCR fallback could not read the photo."
          ])
        )
      });
      return;
    }

    setImportStatus("");
  }

  function handlePhotoChange(file: File | null) {
    setPhotoFile(file);
    setCompressedPhotoFile(null);
    setPhotoPreview("");
    setPhotoRawText("");
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function reparsePhotoRawText() {
    const text = cleanOcrRecipeText(photoRawText);
    if (!text.trim()) return;
    const payload = draftFromOcrText(text, photoFile?.name || "Photo import");
    applyDraft({
      ...payload,
      source: payload.source ?? photoFile?.name ?? draft.source,
      photoDataUrl: photoPreview || draft.photoDataUrl,
      warnings: Array.from(new Set(["Raw OCR text was re-parsed. Review before saving.", ...payload.warnings]))
    });
    setPhotoRawText(text);
  }

  function moveOcrLineToIngredients(line: string) {
    const cleanedLine = line.trim();
    if (!cleanedLine) return;
    const parsed = parseIngredientLine(cleanedLine, { strict: false });
    setDraft((current) => ({
      ...current,
      ingredients: [
        ...current.ingredients,
        {
          ...parsed,
          originalLine: cleanedLine,
          confidence: parsed.confidence === "high" ? "medium" : parsed.confidence,
          needsReview: true
        }
      ],
      warnings: Array.from(new Set([...current.warnings, "A raw OCR line was moved into ingredients. Check the quantity and unit."]))
    }));
  }

  function moveOcrLineToMethod(line: string) {
    const cleanedLine = line.trim();
    if (!cleanedLine) return;
    setDraft((current) => ({
      ...current,
      instructions: [...current.instructions.filter((step) => step.trim() !== "Add cooking instructions."), cleanedLine],
      warnings: Array.from(new Set([...current.warnings, "A raw OCR line was moved into the method."]))
    }));
  }

  function addManualShoppingItem(event: FormEvent) {
    event.preventDefault();
    if (!manualItemName.trim()) return;

    const item: ShoppingListItem = {
      id: createId("manual"),
      shoppingRangeKey,
      name: manualItemName.trim(),
      canonicalName: canonicalizeIngredientName(manualItemName).canonicalName,
      displayQuantity: manualItemQuantity.trim(),
      category: manualItemCategory === "Auto" ? inferCategory(manualItemName) : manualItemCategory,
      sourceMeals: ["Manual"],
      checked: false,
      manual: true
    };

    updateState((current) => ({
      ...current,
      manualShoppingItems: mergeManualShoppingItems([...current.manualShoppingItems, item])
    }));
    setManualItemName("");
    setManualItemQuantity("");
    setManualItemCategory("Auto");
  }

  function addBulkManualShoppingItems(event: FormEvent) {
    event.preventDefault();
    const newItems = splitManualShoppingLines(manualBulkItems)
      .map((line) => createManualShoppingItemFromLine(line, shoppingRangeKey))
      .filter((item): item is ShoppingListItem => Boolean(item));

    if (!newItems.length) return;

    updateState((current) => ({
      ...current,
      manualShoppingItems: mergeManualShoppingItems([...current.manualShoppingItems, ...newItems])
    }));
    setManualBulkItems("");
  }

  function addCommonManualShoppingItem(itemName: string) {
    const item = createManualShoppingItemFromLine(itemName, shoppingRangeKey);
    if (!item) return;

    updateState((current) => ({
      ...current,
      manualShoppingItems: mergeManualShoppingItems([...current.manualShoppingItems, item])
    }));
  }

  function updateCommonExtraItems(items: string[]) {
    const normalizedItems = items
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, allItems) => allItems.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);
    updateSettings({ commonExtraItems: normalizedItems });
  }

  function clearManualShoppingItemsForRange() {
    updateState((current) => {
      const removedIds = new Set(
        current.manualShoppingItems.filter((item) => item.shoppingRangeKey === shoppingRangeKey).map((item) => item.id)
      );
      if (!removedIds.size) return current;
      const removedStatusKeys = new Set(Array.from(removedIds, (itemId) => storeStatusItemKey(shoppingDateRange, itemId)));

      return {
        ...current,
        manualShoppingItems: current.manualShoppingItems.filter((item) => item.shoppingRangeKey !== shoppingRangeKey),
        shoppingChecks: Object.fromEntries(Object.entries(current.shoppingChecks).filter(([itemId]) => !removedIds.has(itemId))),
        asdaShoppingStatus: Object.fromEntries(
          Object.entries(current.asdaShoppingStatus).filter(([statusKey]) => !removedStatusKeys.has(statusKey))
        )
      };
    });
  }

  function toggleShoppingItem(id: string, checked: boolean) {
    const statusKey = storeStatusItemKey(shoppingDateRange, id);
    updateState((current) => {
      const asdaShoppingStatus = { ...current.asdaShoppingStatus };
      if (checked) {
        asdaShoppingStatus[statusKey] = "added";
      } else if (asdaShoppingStatus[statusKey] === "added") {
        delete asdaShoppingStatus[statusKey];
      }

      return {
        ...current,
        shoppingChecks: { ...current.shoppingChecks, [id]: checked },
        manualShoppingItems: current.manualShoppingItems.map((item) => (item.id === id ? { ...item, checked } : item)),
        asdaShoppingStatus
      };
    });
    syncAsdaHelperItemStatus(id, statusKey, checked ? "added" : undefined);
  }

  function updateManualShoppingItem(id: string, patch: Partial<ShoppingListItem>) {
    updateState((current) => {
      const existingItem = current.manualShoppingItems.find((item) => item.id === id);
      const asdaProductLinks = { ...current.asdaProductLinks };
      const asdaProductSelections = { ...current.asdaProductSelections };

      if (existingItem && patch.name?.trim()) {
        const previousKey = shoppingPreferenceKey(existingItem);
        const nextKey = shoppingPreferenceKey({ name: patch.name.trim() });
        const rememberedProductUrl = asdaProductLinks[previousKey];

        if (nextKey && previousKey !== nextKey && rememberedProductUrl && !asdaProductLinks[nextKey]) {
          asdaProductLinks[nextKey] = rememberedProductUrl;
        }
        if (nextKey && previousKey !== nextKey && asdaProductSelections[previousKey] && !asdaProductSelections[nextKey]) {
          asdaProductSelections[nextKey] = asdaProductSelections[previousKey];
        }
      }

      return {
        ...current,
        asdaProductLinks,
        asdaProductSelections,
        manualShoppingItems: mergeManualShoppingItems(
          current.manualShoppingItems.map((item) =>
            item.id === id ? { ...item, ...patch, manual: true } : item
          )
        )
      };
    });
  }

  function deleteShoppingItem(item: ShoppingListItem) {
    const hiddenItemKey = shoppingHiddenItemKey(shoppingDateRange, item.id);

    updateState((current) => {
      if (item.manual) {
        return {
          ...current,
          manualShoppingItems: current.manualShoppingItems.filter((manual) => manual.id !== item.id)
        };
      }

      return {
        ...current,
        hiddenShoppingItems: { ...current.hiddenShoppingItems, [hiddenItemKey]: true }
      };
    });
  }

  function forgetHiddenShoppingItems() {
    updateState((current) => (Object.keys(current.hiddenShoppingItems).length ? { ...current, hiddenShoppingItems: {} } : current));
  }

  function updateShoppingStartDate(value: string) {
    setShoppingStartDate(value);
    forgetHiddenShoppingItems();
  }

  function updateShoppingEndDate(value: string) {
    setShoppingEndDate(value);
    forgetHiddenShoppingItems();
  }

  function restoreHiddenGeneratedShoppingItems() {
    updateState((current) => ({
      ...current,
      hiddenShoppingItems: Object.fromEntries(
        Object.entries(current.hiddenShoppingItems).filter(([key]) => !key.startsWith(shoppingHiddenPrefix))
      )
    }));
  }

  function updateAsdaProductLink(itemKey: string, value: string) {
    const normalizedUrl = normalizeStoreUrl(value);

    updateState((current) => {
      const asdaProductLinks = { ...current.asdaProductLinks };
      const asdaProductSelections = { ...current.asdaProductSelections };
      const previousSelection = asdaProductSelections[itemKey];

      if (normalizedUrl) {
        asdaProductLinks[itemKey] = normalizedUrl;
        if (previousSelection && normalizeStoreUrl(previousSelection.productUrl) !== normalizedUrl) {
          delete asdaProductSelections[itemKey];
        }
      } else {
        delete asdaProductLinks[itemKey];
        delete asdaProductSelections[itemKey];
      }

      return { ...current, asdaProductLinks, asdaProductSelections };
    });
  }

  function updateAsdaShoppingStatus(itemId: string, status?: StoreShoppingStatus) {
    const statusKey = storeStatusItemKey(shoppingDateRange, itemId);

    updateState((current) => {
      const asdaShoppingStatus = { ...current.asdaShoppingStatus };

      if (status) {
        asdaShoppingStatus[statusKey] = status;
      } else {
        delete asdaShoppingStatus[statusKey];
      }

      return { ...current, asdaShoppingStatus };
    });
  }

  function resetCurrentAsdaRun() {
    updateState((current) => ({
      ...current,
      asdaShoppingStatus: Object.fromEntries(
        Object.entries(current.asdaShoppingStatus).filter(([key]) => !key.startsWith(asdaStatusPrefix))
      )
    }));
  }

  async function copyShoppingList() {
    const text = shoppingList
      .map((item) => {
        const conversion = item.conversionNotes?.length ? ` (${item.conversionNotes.join("; ")})` : "";
        return `${item.checked ? "[x]" : "[ ]"} ${item.displayQuantity ? `${item.displayQuantity} ` : ""}${item.name}${conversion}`;
      })
      .join("\n");
    await navigator.clipboard.writeText(text);
  }

  function updateSettings(patch: Partial<AppState["settings"]>) {
    updateState((current) => ({
      ...current,
      settings: { ...current.settings, ...patch }
    }));
  }

  async function resolveSnapshotOwnerForUser(userId: string, email?: string | null) {
    const client = getSupabaseClient();
    const normalizedEmail = email?.trim().toLowerCase();

    if (!client || !normalizedEmail) return userId;

    const { data, error } = await client
      .from("household_snapshot_members")
      .select("owner_user_id")
      .eq("member_email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (error) {
      setCloudMessage(`Shared household lookup failed: ${error.message}. Using your own household.`);
      return userId;
    }

    const ownerUserId = typeof data?.owner_user_id === "string" ? data.owner_user_id : userId;

    if (ownerUserId !== userId) {
      setCloudMessage(`Using shared household for ${normalizedEmail}.`);
    }

    return ownerUserId;
  }

  async function connectCloudUser(user: { id: string; email?: string | null } | null) {
    setCloudUser(user?.email ?? null);

    if (!user) {
      cloudUserIdRef.current = null;
      cloudLoadedRef.current = false;
      setCloudLoaded(false);
      setSyncStatus("local");
      return;
    }

    setCloudLoaded(false);
    setSyncStatus("loading");
    const snapshotOwnerId = await resolveSnapshotOwnerForUser(user.id, user.email);
    cloudUserIdRef.current = snapshotOwnerId;
    await loadCloudSnapshotForUser(snapshotOwnerId);
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client) {
      setCloudMessage("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable cloud login.");
      return;
    }

    setCloudBusy(true);
    const { error } = await client.auth.signInWithOtp({
      email: cloudEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    setCloudBusy(false);
    setCloudMessage(error ? error.message : "Check your email for the sign-in link.");
  }

  async function saveCloudSnapshotForUser(userId: string, snapshot: AppState, message?: string) {
    const client = getSupabaseClient();
    if (!client) {
      setSyncStatus("local");
      return setCloudMessage("Cloud sync is not configured yet.");
    }

    if (!navigator.onLine) {
      setSyncStatus("offline");
      return setCloudMessage("You are offline. Changes are saved locally and will sync when you reconnect.");
    }

    setSyncStatus("saving");
    const { error } = await client.from("household_snapshots").upsert({
      user_id: userId,
      app_state: snapshot,
      updated_at: new Date().toISOString()
    });

    if (error) {
      setSyncStatus("error");
      setCloudMessage(error.message);
      return;
    }

    lastSavedJsonRef.current = JSON.stringify(snapshot);
    setSyncStatus("saved");
    if (message) setCloudMessage(message);
  }

  async function loadCloudSnapshotForUser(userId: string, manual = false) {
    const client = getSupabaseClient();
    if (!client) return setCloudMessage("Cloud sync is not configured yet.");

    setCloudBusy(manual);
    setSyncStatus("loading");

    const { data, error } = await client
      .from("household_snapshots")
      .select("app_state, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    setCloudBusy(false);

    if (error) {
      setSyncStatus("error");
      return setCloudMessage(error.message);
    }

    if (!data?.app_state) {
      cloudLoadedRef.current = true;
      setCloudLoaded(true);
      setCloudMessage("No cloud snapshot yet. This device will create one automatically.");
      await saveCloudSnapshotForUser(userId, stateRef.current, "Created your cloud snapshot.");
      return;
    }

    const hydratedState = hydrateState(data.app_state);
    writeLocalStorage(
      backupStorageKey,
      JSON.stringify({
        backedUpAt: new Date().toISOString(),
        reason: "before-cloud-load",
        appState: stateRef.current
      })
    );
    suppressNextCloudSaveRef.current = true;
    cloudLoadedRef.current = true;
    setCloudLoaded(true);
    lastSavedJsonRef.current = JSON.stringify(hydratedState);
    setState(hydratedState);
    setSyncStatus("saved");
    setCloudMessage(`Loaded cloud snapshot${data.updated_at ? ` from ${new Date(data.updated_at).toLocaleString()}` : ""}.`);
  }

  async function saveCloudSnapshot() {
    const userId = cloudUserIdRef.current;
    if (!userId) return setCloudMessage("Sign in before syncing to cloud.");
    setCloudBusy(true);
    await saveCloudSnapshotForUser(userId, stateRef.current, "Saved this household plan to Supabase.");
    setCloudBusy(false);
  }

  async function loadCloudSnapshot() {
    const userId = cloudUserIdRef.current;
    if (!userId) return setCloudMessage("Sign in before loading cloud data.");
    await loadCloudSnapshotForUser(userId, true);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ChefHat size={24} />
          </div>
          <div>
            <strong>Weekwise</strong>
            <span>Meal planning</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          <NavButton view="planner" activeView={activeView} setActiveView={setActiveView} icon={<CalendarDays />} label="Planner" />
          <NavButton view="recipes" activeView={activeView} setActiveView={setActiveView} icon={<ChefHat />} label="Recipes" />
          <NavButton view="add" activeView={activeView} setActiveView={setActiveView} icon={<Plus />} label="Add recipe" />
          <NavButton view="shopping" activeView={activeView} setActiveView={setActiveView} icon={<ShoppingCart />} label="Shopping" />
          <NavButton view="settings" activeView={activeView} setActiveView={setActiveView} icon={<Settings />} label="Settings" />
        </nav>

        <div className="sidebar-summary">
          <span>{weekMeals.length} meals planned</span>
          <strong>{checkedCount}/{shoppingList.length}</strong>
          <span>shopping items done</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{state.settings.householdName}</p>
            <h1>{viewTitle[activeView]}</h1>
          </div>
          <div className="topbar-actions">
            <span className={classNames("sync-badge", `sync-${syncStatus}`)}>{syncStatusCopy(syncStatus)}</span>
            <button className="icon-text-button" onClick={() => setActiveView("shopping")}>
              <ListChecks size={18} />
              {generatedCount} generated
            </button>
          </div>
        </header>

        {activeView === "planner" && (
          <PlannerView
            days={days}
            weekStart={weekStart}
            plannerDayCount={plannerDayCount}
            dayNotes={state.dayNotes}
            recipes={state.recipes}
            plannedMeals={state.plannedMeals}
            visibleSlots={visibleSlots}
            recipeFrequencies={recipeFrequencies}
            useUpIngredients={state.useUpIngredients}
            ingredientAliases={state.settings.ingredientAliases}
            onPlanSuggestedRecipes={planSuggestedRecipes}
            onMoveMeal={movePlannedMeal}
            onRemoveMeal={removePlannedMeal}
            onUpdateMeal={updatePlannedMeal}
            onAddLeftovers={addLeftoverLunch}
            onOpenMealPicker={(date, slot) => {
              setMealPicker({ date, slot });
              setMealPickerQuery("");
            }}
            onOpenRecipe={setSelectedRecipeId}
            onMoveWeek={moveWeek}
            onSetPlannerStart={setWeekStart}
            onSetPlannerDayCount={setPlannerDayCount}
            onUpdateDayNote={updateDayNote}
            onUpdateUseUpIngredients={(value) =>
              updateState((current) => ({ ...current, useUpIngredients: value.split(/\r?\n/) }))
            }
            onThisWeek={() => setWeekStart(formatDateKey(startOfWeek(new Date())))}
            onDuplicateWeek={duplicateWeekToNext}
            onClearWeek={clearWeek}
          />
        )}

        {activeView === "recipes" && (
          <RecipeLibrary
            recipes={filteredRecipes}
            recipeImageUrls={recipeImageUrls}
            recipeSearch={recipeSearch}
            setRecipeSearch={setRecipeSearch}
            recipeGroupFilter={recipeGroupFilter}
            setRecipeGroupFilter={setRecipeGroupFilter}
            plannedRecipeIds={plannedRecipeIds}
            onAddRecipe={() => {
              applyDraft(emptyDraft());
              setEditingRecipeId(null);
              setImportMode("manual");
              setActiveView("add");
            }}
            onEditRecipe={editRecipe}
            onDuplicateRecipe={duplicateRecipe}
            onDeleteRecipe={deleteRecipe}
            onToggleFavorite={toggleFavorite}
            onOpenRecipe={setSelectedRecipeId}
          />
        )}

        {activeView === "add" && (
          <AddRecipeView
            importMode={importMode}
            setImportMode={setImportMode}
            importText={importText}
            setImportText={setImportText}
            importUrl={importUrl}
            setImportUrl={setImportUrl}
	            photoFile={photoFile}
	            photoPreview={photoPreview}
	            photoCropMode={photoCropMode}
	            setPhotoCropMode={setPhotoCropMode}
	            photoRotation={photoRotation}
	            setPhotoRotation={setPhotoRotation}
	            photoRawText={photoRawText}
	            setPhotoRawText={setPhotoRawText}
	            onPhotoChange={handlePhotoChange}
            draft={draft}
            setDraft={setDraft}
            storedMealImageUrl={editingRecipeId ? recipeImageUrls[editingRecipeId] : undefined}
            ingredientAliases={state.settings.ingredientAliases}
            savedShoppingNameVariants={state.settings.shoppingNameVariants}
            tagInput={tagInput}
            setTagInput={setTagInput}
            editingRecipeId={editingRecipeId}
            importStatus={importStatus}
            onExtractText={extractFromText}
            onExtractUrl={extractFromUrl}
	            onExtractPhoto={extractFromPhoto}
	            onExtractPhotoFallback={extractFromPhotoFallback}
	            onReparsePhotoRawText={reparsePhotoRawText}
	            onMoveOcrLineToIngredients={moveOcrLineToIngredients}
	            onMoveOcrLineToMethod={moveOcrLineToMethod}
            onNewManual={() => {
              applyDraft(emptyDraft());
              setEditingRecipeId(null);
              setImportMode("manual");
            }}
            onSaveDraft={saveDraft}
            onUpdateIngredient={updateDraftIngredient}
            onRememberShoppingName={rememberShoppingNameVariant}
            onAddIngredient={addDraftIngredient}
            onRemoveIngredient={removeDraftIngredient}
            onUpdateInstruction={updateInstruction}
            onAddInstruction={addInstruction}
            onRemoveInstruction={removeInstruction}
          />
        )}

        {activeView === "shopping" && (
          <ShoppingView
            items={shoppingList}
            settings={state.settings}
            startDate={shoppingStartDate}
            endDate={shoppingEndDate}
            rangeStartDate={shoppingDateRange.startDate}
            rangeEndDate={shoppingDateRange.endDate}
            manualItemName={manualItemName}
            manualItemQuantity={manualItemQuantity}
            manualItemCategory={manualItemCategory}
            manualBulkItems={manualBulkItems}
            asdaProductLinks={state.asdaProductLinks}
            asdaProductSelections={state.asdaProductSelections}
            asdaShoppingStatus={rangeAsdaShoppingStatus}
            setStartDate={updateShoppingStartDate}
            setEndDate={updateShoppingEndDate}
            setManualItemName={setManualItemName}
            setManualItemQuantity={setManualItemQuantity}
            setManualItemCategory={setManualItemCategory}
            setManualBulkItems={setManualBulkItems}
            onResetDateRange={() => {
              const currentWeekStart = startOfWeek(new Date());
              setShoppingStartDate(formatDateKey(currentWeekStart));
              setShoppingEndDate(formatDateKey(addDays(currentWeekStart, 6)));
              forgetHiddenShoppingItems();
            }}
            onToggleIncludeStaples={(includeStaples) => updateSettings({ includeStaples })}
            onAddManualItem={addManualShoppingItem}
            onAddBulkManualItems={addBulkManualShoppingItems}
            onAddCommonManualItem={addCommonManualShoppingItem}
            onClearManualItems={clearManualShoppingItemsForRange}
            onUpdateCommonExtras={updateCommonExtraItems}
            onToggleItem={toggleShoppingItem}
            onUpdateManualItem={updateManualShoppingItem}
            onDeleteItem={deleteShoppingItem}
            onOpenRecipe={setSelectedRecipeId}
            onUpdateAsdaProductLink={updateAsdaProductLink}
            onUpdateAsdaShoppingStatus={updateAsdaShoppingStatus}
            onResetAsdaRun={resetCurrentAsdaRun}
            onCopy={copyShoppingList}
            onPrint={() => window.print()}
            onRestoreGenerated={restoreHiddenGeneratedShoppingItems}
          />
        )}

        {activeView === "settings" && (
          <SettingsView
            settings={state.settings}
            updateSettings={updateSettings}
            supabaseConfigured={supabaseConfigured}
            cloudEmail={cloudEmail}
            setCloudEmail={setCloudEmail}
            cloudUser={cloudUser}
            cloudMessage={cloudMessage}
            cloudBusy={cloudBusy}
            syncStatus={syncStatus}
            onSendMagicLink={sendMagicLink}
            onSaveCloud={saveCloudSnapshot}
            onLoadCloud={loadCloudSnapshot}
            onResetDemo={() => setState(seedState())}
          />
        )}

        {mealPicker && (
          <MealPickerModal
            target={mealPicker}
            recipes={mealPickerRecipes}
            recipeFrequencies={recipeFrequencies}
            query={mealPickerQuery}
            setQuery={setMealPickerQuery}
            onAdd={(recipeId) => addPlannedMeal(mealPicker.date, mealPicker.slot, recipeId)}
            onAddManual={(title) => addManualPlannedMeal(mealPicker.date, mealPicker.slot, title)}
            onClose={() => setMealPicker(null)}
          />
        )}

        {selectedRecipe && (
          <RecipeDetailModal
            recipe={selectedRecipe}
            imageUrl={recipeImageUrls[selectedRecipe.id] ?? selectedRecipe.mealImageUrl}
            onClose={() => setSelectedRecipeId(null)}
            onEditRecipe={(recipe) => {
              setSelectedRecipeId(null);
              editRecipe(recipe);
            }}
          />
        )}
      </section>
    </main>
  );
}

function NavButton({
  view,
  activeView,
  setActiveView,
  icon,
  label
}: {
  view: View;
  activeView: View;
  setActiveView: (view: View) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button className={classNames("nav-button", activeView === view && "active")} onClick={() => setActiveView(view)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PlannerView({
  days,
  weekStart,
  plannerDayCount,
  dayNotes,
  recipes,
  plannedMeals,
  visibleSlots,
  recipeFrequencies,
  useUpIngredients,
  ingredientAliases,
  onPlanSuggestedRecipes,
  onMoveMeal,
  onRemoveMeal,
  onUpdateMeal,
  onAddLeftovers,
  onOpenMealPicker,
  onOpenRecipe,
  onMoveWeek,
  onSetPlannerStart,
  onSetPlannerDayCount,
  onUpdateDayNote,
  onUpdateUseUpIngredients,
  onThisWeek,
  onDuplicateWeek,
  onClearWeek
}: {
  days: Date[];
  weekStart: string;
  plannerDayCount: 7 | 14;
  dayNotes: Record<string, string>;
  recipes: Recipe[];
  plannedMeals: AppState["plannedMeals"];
  visibleSlots: MealSlot[];
  recipeFrequencies: Record<string, number>;
  useUpIngredients: string[];
  ingredientAliases: Record<string, string>;
  onPlanSuggestedRecipes: (recipeIds: string[]) => void;
  onMoveMeal: (id: string, date: string, slot: MealSlot) => void;
  onRemoveMeal: (id: string) => void;
  onUpdateMeal: (id: string, patch: Partial<AppState["plannedMeals"][number]>) => void;
  onAddLeftovers: (meal: AppState["plannedMeals"][number]) => void;
  onOpenMealPicker: (date: string, slot: MealSlot) => void;
  onOpenRecipe: (recipeId: string) => void;
  onMoveWeek: (direction: -1 | 1) => void;
  onSetPlannerStart: (date: string) => void;
  onSetPlannerDayCount: (dayCount: 7 | 14) => void;
  onUpdateDayNote: (date: string, note: string) => void;
  onUpdateUseUpIngredients: (value: string) => void;
  onThisWeek: () => void;
  onDuplicateWeek: () => void;
  onClearWeek: () => void;
}) {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const endDate = formatDateKey(addDays(new Date(`${weekStart}T12:00:00`), plannerDayCount - 1));
  const useUpText = useUpIngredients.join("\n");
  const useUpRecommendations = useMemo(
    () => suggestUseUpRecipes(recipes, useUpIngredients, ingredientAliases),
    [ingredientAliases, recipes, useUpIngredients]
  );
  const displayedDateKeys = new Set(days.map(formatDateKey));

  function handleDrop(event: DragEvent<HTMLDivElement>, date: string, slot: MealSlot) {
    event.preventDefault();
    const mealId = event.dataTransfer.getData("text/plain");
    setDragOverSlot(null);
    if (mealId) onMoveMeal(mealId, date, slot);
  }

  return (
    <div className="view-stack">
      <section className="toolbar-band">
        <div>
          <p className="eyebrow">Planner range</p>
          <h2>
            {dateFormatter.format(new Date(`${weekStart}T12:00:00`))} to {dateFormatter.format(new Date(`${endDate}T12:00:00`))}
          </h2>
        </div>
        <div className="button-row">
          <label className="compact-date-control">
            Start
            <input type="date" value={weekStart} onChange={(event) => onSetPlannerStart(event.target.value)} />
          </label>
          <div className="segmented-control" aria-label="Planner days shown">
            <button className={classNames(plannerDayCount === 7 && "active")} type="button" onClick={() => onSetPlannerDayCount(7)}>
              7 days
            </button>
            <button className={classNames(plannerDayCount === 14 && "active")} type="button" onClick={() => onSetPlannerDayCount(14)}>
              14 days
            </button>
          </div>
          <button className="icon-button" title="Previous range" onClick={() => onMoveWeek(-1)}>
            <Minus size={18} />
          </button>
          <button className="text-button" onClick={onThisWeek}>This week</button>
          <button className="icon-button" title="Next range" onClick={() => onMoveWeek(1)}>
            <Plus size={18} />
          </button>
          <button className="icon-text-button" onClick={onDuplicateWeek}>
            <Copy size={18} />
            Repeat
          </button>
          <button className="ghost-danger" onClick={onClearWeek}>
            <CircleOff size={18} />
            Clear
          </button>
        </div>
      </section>

      <section className="use-up-planner">
        <div className="use-up-heading">
          <div>
            <p className="eyebrow">Use what is already at home</p>
            <h2>Plan meals around food to use up</h2>
          </div>
          {useUpText.trim() ? (
            <button className="ghost-danger" type="button" onClick={() => onUpdateUseUpIngredients("")}>
              <Trash2 size={17} />
              Clear list
            </button>
          ) : null}
        </div>

        <div className="use-up-layout">
          <label className="use-up-input">
            Food to use up
            <textarea
              value={useUpText}
              onChange={(event) => onUpdateUseUpIngredients(event.target.value)}
              placeholder={"Spinach\n2 carrots\nHalf a bunch of coriander"}
              rows={5}
            />
          </label>

          <div className="use-up-results">
            {!useUpText.trim() ? (
              <div className="use-up-empty">
                <Sparkles size={22} />
                <span>Add ingredients to see the best one- or two-meal match.</span>
              </div>
            ) : useUpRecommendations.suggestions.length === 0 ? (
              <div className="use-up-empty">
                <Search size={22} />
                <span>No saved recipe currently matches these ingredients.</span>
              </div>
            ) : (
              useUpRecommendations.suggestions.map((suggestion, index) => {
                const suggestionRecipes = suggestion.recipeIds
                  .map((recipeId) => recipes.find((recipe) => recipe.id === recipeId))
                  .filter((recipe): recipe is Recipe => Boolean(recipe));
                const plannedRecipeIds = new Set(
                  plannedMeals
                    .filter((meal) => meal.recipeId && displayedDateKeys.has(meal.date))
                    .map((meal) => meal.recipeId as string)
                );
                const allPlanned = suggestion.recipeIds.every((recipeId) => plannedRecipeIds.has(recipeId));
                const somePlanned = suggestion.recipeIds.some((recipeId) => plannedRecipeIds.has(recipeId));

                return (
                  <article className={classNames("use-up-suggestion", index === 0 && "best-match")} key={suggestion.recipeIds.join("|")}>
                    <div className="use-up-suggestion-heading">
                      <span>{index === 0 ? "Best match" : "Alternative"}</span>
                      <strong>
                        {suggestion.missingIngredients.length === 0
                          ? `Uses all ${suggestion.coveredIngredients.length}`
                          : `Uses ${suggestion.coveredIngredients.length} of ${useUpRecommendations.targets.length}`}
                      </strong>
                    </div>
                    <div className="use-up-recipe-links">
                      {suggestionRecipes.map((recipe) => (
                        <button type="button" key={recipe.id} onClick={() => onOpenRecipe(recipe.id)}>
                          {recipe.title}
                        </button>
                      ))}
                    </div>
                    <div className="use-up-coverage">
                      {suggestion.coveredIngredients.map((ingredient) => (
                        <span key={ingredient}>
                          <Check size={13} />
                          {ingredient}
                        </span>
                      ))}
                    </div>
                    {suggestion.missingIngredients.length > 0 ? (
                      <small>Still to use: {suggestion.missingIngredients.join(", ")}</small>
                    ) : null}
                    <button
                      className="primary-button"
                      type="button"
                      disabled={allPlanned}
                      onClick={() => onPlanSuggestedRecipes(suggestion.recipeIds)}
                    >
                      <CalendarDays size={17} />
                      {allPlanned ? "Added to planner" : somePlanned ? "Add remaining meal" : `Add ${suggestion.recipeIds.length === 1 ? "meal" : "both meals"}`}
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="planner-grid">
        {days.map((date) => {
          const dateKey = formatDateKey(date);

          return (
            <div className="day-column" key={dateKey}>
              <div className="day-heading">
                <strong>{dateFormatter.format(date)}</strong>
              </div>
              <textarea
                className="day-note-input"
                value={dayNotes[dateKey] ?? ""}
                onChange={(event) => onUpdateDayNote(dateKey, event.target.value)}
                placeholder="Day note"
                rows={2}
              />

              {visibleSlots.map((slot) => {
                const slotMeals = plannedMeals.filter((meal) => meal.date === dateKey && meal.slot === slot);
                const slotKey = `${dateKey}-${slot}`;

                return (
                  <div
                    className={classNames("meal-slot", dragOverSlot === slotKey && "drop-target")}
                    key={slot}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverSlot(slotKey);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverSlot(null);
                    }}
                    onDrop={(event) => handleDrop(event, dateKey, slot)}
                  >
                    <div className="slot-heading">
                      <span>{labelMealSlot(slot)}</span>
                    </div>

                    <div className="meal-list">
                      {slotMeals.map((meal) => {
                        const recipe = meal.recipeId ? recipes.find((item) => item.id === meal.recipeId) : null;
                        const title = recipe?.title ?? meal.manualTitle;
                        if (!title) return null;
                        const optionalIngredients = recipe?.ingredients.filter((ingredient) => ingredient.role === "optional") ?? [];
                        const recipeSideSuggestions = recipe?.ingredients.filter((ingredient) => ingredient.role === "side") ?? [];
                        const selectedOptionalId = optionalIngredients.find((ingredient) =>
                          meal.selectedIngredientIds?.includes(ingredient.id)
                        )?.id ?? "";
                        const plannedSides = meal.extraSideIngredients ?? [];
                        const plannedSideNames = new Set(
                          plannedSides.map((ingredient) => canonicalizeIngredientName(ingredient.name, ingredientAliases).canonicalName)
                        );
                        const availableRecipeSideSuggestions = recipeSideSuggestions.filter(
                          (ingredient) => !plannedSideNames.has(canonicalizeIngredientName(ingredient.name, ingredientAliases).canonicalName)
                        );
                        const selectedOptionNames = recipe
                          ? recipe.ingredients
                              .filter((ingredient) => ingredient.role === "optional" && meal.selectedIngredientIds?.includes(ingredient.id))
                              .map((ingredient) => ingredient.name)
                          : [];
                        const extraSideNames = plannedSides.map((ingredient) => ingredient.name).filter(Boolean);
                        const mealAdditions = [...selectedOptionNames, ...extraSideNames];
                        const mealMeta = recipe
                          ? `${recipe.tags.slice(0, 2).join(" · ") || "Saved recipe"}${
                              (recipeFrequencies[recipe.id] ?? 0) > 1 ? ` · planned ${recipeFrequencies[recipe.id]}x` : ""
                            }${mealAdditions.length ? ` · with ${mealAdditions.join(", ")}` : ""}`
                          : meal.notes || "Manual plan";

                        function updatePlannedSide(sideId: string, patch: Partial<Ingredient>) {
                          const extraSideIngredients = plannedSides.map((ingredient) => {
                            if (ingredient.id !== sideId) return ingredient;
                            const nextIngredient = { ...ingredient, ...patch };
                            if (typeof patch.name === "string") {
                              nextIngredient.category = inferCategory(patch.name);
                              nextIngredient.canonicalName = canonicalizeIngredientName(patch.name, ingredientAliases).canonicalName;
                            }
                            return nextIngredient;
                          });
                          onUpdateMeal(meal.id, { extraSideIngredients });
                        }

                        function addPlannedSide(source?: Ingredient) {
                          const factor = recipe ? meal.peopleCount / Math.max(1, recipe.servings) : 1;
                          const name = source?.name ?? "";
                          const extraSideIngredients: Ingredient[] = [
                            ...plannedSides,
                            {
                              ...(source ?? {}),
                              id: createId("planned_side"),
                              name,
                              quantity:
                                typeof source?.quantity === "number" ? source.quantity * factor : 1,
                              unit: source?.unit || "item",
                              role: "side",
                              category: source?.category ?? inferCategory(name),
                              canonicalName: canonicalizeIngredientName(name, ingredientAliases).canonicalName,
                              needsReview: false
                            }
                          ];
                          onUpdateMeal(meal.id, { extraSideIngredients });
                        }

                        return (
                          <article
                            className="meal-card"
                            key={meal.id}
                            draggable
                            onDragStart={(event) => {
                              if ((event.target as HTMLElement).closest("button, input, select, textarea")) {
                                event.preventDefault();
                                return;
                              }
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", meal.id);
                            }}
                          >
                            {recipe ? (
                              <button className="meal-card-main" onClick={() => onOpenRecipe(recipe.id)}>
                                <strong>{title}</strong>
                                <span>{mealMeta}</span>
                              </button>
                            ) : (
                              <div className="meal-card-main manual-meal-main">
                                <strong>{title}</strong>
                                <span>{mealMeta}</span>
                              </div>
                            )}
                            {recipe ? (
                              <div className="meal-card-controls">
                                {optionalIngredients.length > 0 ? (
                                  <label className="meal-choice-control">
                                    <span>Meal choice</span>
                                    <select
                                      aria-label={`Ingredient choice for ${title}`}
                                      value={selectedOptionalId}
                                      onChange={(event) =>
                                        onUpdateMeal(meal.id, {
                                          selectedIngredientIds: event.target.value ? [event.target.value] : []
                                        })
                                      }
                                    >
                                      <option value="">Choose when cooking</option>
                                      {optionalIngredients.map((ingredient) => (
                                        <option value={ingredient.id} key={ingredient.id}>
                                          {ingredient.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ) : null}

                                <div className="meal-side-editor">
                                  <div className="meal-side-heading">
                                    <span>Sides</span>
                                    <button className="icon-button" type="button" title="Add custom side" onClick={() => addPlannedSide()}>
                                      <Plus size={15} />
                                    </button>
                                  </div>

                                  {availableRecipeSideSuggestions.length > 0 ? (
                                    <select
                                      aria-label={`Add a saved side to ${title}`}
                                      value=""
                                      onChange={(event) => {
                                        const suggestion = availableRecipeSideSuggestions.find((ingredient) => ingredient.id === event.target.value);
                                        if (suggestion) addPlannedSide(suggestion);
                                      }}
                                    >
                                      <option value="">Add saved side...</option>
                                      {availableRecipeSideSuggestions.map((ingredient) => (
                                        <option value={ingredient.id} key={ingredient.id}>
                                          {ingredient.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : null}

                                  {plannedSides.map((ingredient) => (
                                    <div className="meal-side-row" key={ingredient.id}>
                                      <label>
                                        <span>Quantity</span>
                                        <input
                                          aria-label={`Quantity for ${ingredient.name || "side"}`}
                                          type="number"
                                          min={0}
                                          step="any"
                                          value={ingredient.quantity ?? ""}
                                          onChange={(event) =>
                                            updatePlannedSide(ingredient.id, {
                                              quantity: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value))
                                            })
                                          }
                                        />
                                      </label>
                                      <label>
                                        <span>Unit</span>
                                        <select
                                          aria-label={`Unit for ${ingredient.name || "side"}`}
                                          value={ingredient.unit ?? ""}
                                          onChange={(event) => updatePlannedSide(ingredient.id, { unit: event.target.value || undefined })}
                                        >
                                          <option value="">No unit</option>
                                          {standardIngredientUnits.map((unit) => (
                                            <option value={unit} key={unit}>{unit}</option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="meal-side-name">
                                        <span>Side</span>
                                        <input
                                          aria-label="Side name"
                                          value={ingredient.name}
                                          onChange={(event) => updatePlannedSide(ingredient.id, { name: event.target.value })}
                                          placeholder="e.g. broccoli"
                                        />
                                      </label>
                                      <button
                                        className="icon-button danger meal-side-remove"
                                        type="button"
                                        title="Remove side"
                                        onClick={() =>
                                          onUpdateMeal(meal.id, {
                                            extraSideIngredients: plannedSides.filter((side) => side.id !== ingredient.id)
                                          })
                                        }
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            <div className="meal-actions">
                              <label className="mini-input">
                                <Users size={15} />
                                <input
                                  aria-label="People eating"
                                  type="number"
                                  min={0}
                                  value={meal.peopleCount}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => {
                                    const peopleCount = Number(event.target.value);
                                    onUpdateMeal(meal.id, { peopleCount: Number.isFinite(peopleCount) ? Math.max(0, peopleCount) : 0 });
                                  }}
                                />
                              </label>
                              {recipe ? (
                                <button className="icon-button" title="Add leftovers to tomorrow lunch" onClick={() => onAddLeftovers(meal)}>
                                  <RefreshCw size={16} />
                                </button>
                              ) : null}
                              <button className="icon-button danger" title="Remove meal" onClick={() => onRemoveMeal(meal.id)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="quick-add">
                      <button className="add-meal-button" onClick={() => onOpenMealPicker(dateKey, slot)}>
                        <Plus size={16} />
                        Add meal
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function RecipeLibrary({
  recipes,
  recipeImageUrls,
  recipeSearch,
  setRecipeSearch,
  recipeGroupFilter,
  setRecipeGroupFilter,
  plannedRecipeIds,
  onAddRecipe,
  onEditRecipe,
  onDuplicateRecipe,
  onDeleteRecipe,
  onToggleFavorite,
  onOpenRecipe
}: {
  recipes: Recipe[];
  recipeImageUrls: Record<string, string>;
  recipeSearch: string;
  setRecipeSearch: (value: string) => void;
  recipeGroupFilter: RecipeGroupFilter;
  setRecipeGroupFilter: (value: RecipeGroupFilter) => void;
  plannedRecipeIds: Set<string>;
  onAddRecipe: () => void;
  onEditRecipe: (recipe: Recipe) => void;
  onDuplicateRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (recipeId: string) => void;
  onToggleFavorite: (recipeId: string) => void;
  onOpenRecipe: (recipeId: string) => void;
}) {
  return (
    <div className="view-stack">
      <section className="toolbar-band">
        <label className="search-box">
          <Search size={18} />
          <input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder="Search meals, tags, sources, ingredients" />
        </label>
        <button className="primary-button" onClick={onAddRecipe}>
          <Plus size={18} />
          New recipe
        </button>
      </section>

      <div className="meal-group-tabs recipe-filter-tabs" aria-label="Recipe meal group filter">
        <button className={classNames(recipeGroupFilter === "all" && "active")} type="button" onClick={() => setRecipeGroupFilter("all")}>
          All
        </button>
        {mealSlots.map((slot) => (
          <button
            className={classNames(recipeGroupFilter === slot && "active")}
            key={slot}
            type="button"
            onClick={() => setRecipeGroupFilter(slot)}
          >
            {labelMealSlot(slot)}
          </button>
        ))}
      </div>

      <section className="recipe-grid">
        {recipes.map((recipe, index) => (
          <article className="recipe-card" key={recipe.id}>
            <button
              className={`recipe-visual visual-${index % 6}`}
              type="button"
              title={`View ${recipe.title}`}
              onClick={() => onOpenRecipe(recipe.id)}
            >
              {recipeImageUrls[recipe.id] || recipe.mealImageUrl ? (
                <img src={recipeImageUrls[recipe.id] ?? recipe.mealImageUrl} alt="" />
              ) : null}
              {recipe.favorite && <Star size={20} fill="currentColor" />}
            </button>
            <div className="recipe-body">
              <div className="recipe-title-row">
                <h2>
                  <button className="recipe-title-button" type="button" onClick={() => onOpenRecipe(recipe.id)}>
                    {recipe.title}
                  </button>
                </h2>
                <button className="icon-button" title={recipe.favorite ? "Remove favorite" : "Favorite"} onClick={() => onToggleFavorite(recipe.id)}>
                  <Heart size={18} fill={recipe.favorite ? "currentColor" : "none"} />
                </button>
              </div>
              <p>{recipe.mealTypes.map(labelMealSlot).join(", ")} · {recipe.ingredients.length} ingredients · serves {recipe.servings}</p>
              <div className="tag-row">
                {recipe.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
                {plannedRecipeIds.has(recipe.id) && <span>planned</span>}
              </div>
              <div className="card-actions">
                <button className="text-button" onClick={() => onEditRecipe(recipe)}>Edit</button>
                <button className="icon-button" title="Duplicate" onClick={() => onDuplicateRecipe(recipe)}>
                  <Copy size={17} />
                </button>
                <button className="icon-button danger" title="Delete" onClick={() => onDeleteRecipe(recipe.id)}>
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function MealPickerModal({
  target,
  recipes,
  recipeFrequencies,
  query,
  setQuery,
  onAdd,
  onAddManual,
  onClose
}: {
  target: { date: string; slot: MealSlot };
  recipes: Recipe[];
  recipeFrequencies: Record<string, number>;
  query: string;
  setQuery: (value: string) => void;
  onAdd: (recipeId: string) => void;
  onAddManual: (title: string) => void;
  onClose: () => void;
}) {
  const [selectedGroup, setSelectedGroup] = useState<MealPickerGroup>(target.slot);
  const [manualMealTitle, setManualMealTitle] = useState("");
  const groupedRecipes = recipes.filter((recipe) => selectedGroup === "all" || recipe.mealTypes.includes(selectedGroup));
  const frequentRecipes = groupedRecipes.filter((recipe) => (recipeFrequencies[recipe.id] ?? 0) > 0).slice(0, 5);
  const mainRecipes = query.trim()
    ? groupedRecipes
    : frequentRecipes.length > 0
      ? groupedRecipes.filter((recipe) => !frequentRecipes.some((frequent) => frequent.id === recipe.id)).slice(0, 10)
      : groupedRecipes.slice(0, 10);
  const selectedGroupLabel = selectedGroup === "all" ? "All meals" : labelMealSlot(selectedGroup);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel meal-picker-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">
              {dateFormatter.format(new Date(`${target.date}T12:00:00`))} · {labelMealSlot(target.slot)}
            </p>
            <h2>Add meal</h2>
          </div>
          <button className="icon-button" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label className="search-box">
          <Search size={18} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search meals, tags, ingredients" />
        </label>

        <div className="meal-group-tabs" aria-label="Recipe meal group">
          {mealSlots.map((slot) => (
            <button
              className={classNames(selectedGroup === slot && "active")}
              key={slot}
              type="button"
              onClick={() => setSelectedGroup(slot)}
            >
              {labelMealSlot(slot)}
            </button>
          ))}
          <button className={classNames(selectedGroup === "all" && "active")} type="button" onClick={() => setSelectedGroup("all")}>
            All
          </button>
        </div>

        <form
          className="manual-meal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAddManual(manualMealTitle);
          }}
        >
          <input value={manualMealTitle} onChange={(event) => setManualMealTitle(event.target.value)} placeholder="Type a meal, e.g. takeaway" />
          <button className="icon-text-button" type="submit" disabled={!manualMealTitle.trim()}>
            <Plus size={18} />
            Add typed meal
          </button>
        </form>

        <div className="picker-list">
          {!query.trim() && frequentRecipes.length > 0 && (
            <>
              <span className="picker-section-label">Most chosen {selectedGroupLabel.toLowerCase()}</span>
              {frequentRecipes.map((recipe) => (
                <RecipePickerButton
                  key={recipe.id}
                  recipe={recipe}
                  recipeFrequencies={recipeFrequencies}
                  onSelect={onAdd}
                />
              ))}
            </>
          )}

          {(mainRecipes.length > 0 || groupedRecipes.length === 0) && (
            <span className="picker-section-label">{query.trim() ? `Matching ${selectedGroupLabel.toLowerCase()}` : `${selectedGroupLabel} recipes`}</span>
          )}
          {mainRecipes.map((recipe) => (
            <RecipePickerButton
              key={recipe.id}
              recipe={recipe}
              recipeFrequencies={recipeFrequencies}
              onSelect={onAdd}
            />
          ))}
          {groupedRecipes.length === 0 && <p className="muted">No matching meals in this group yet.</p>}
        </div>
      </section>
    </div>
  );
}

function RecipePickerButton({
  recipe,
  recipeFrequencies,
  onSelect
}: {
  recipe: Recipe;
  recipeFrequencies: Record<string, number>;
  onSelect: (recipeId: string) => void;
}) {
  return (
    <button className="picker-recipe" type="button" onClick={() => onSelect(recipe.id)}>
      <span>
        <strong>{recipe.title}</strong>
        <small>
          {recipe.mealTypes.map(labelMealSlot).join(" · ")}
          {recipe.tags.slice(0, 2).length ? ` · ${recipe.tags.slice(0, 2).join(" · ")}` : ""}
          {(recipeFrequencies[recipe.id] ?? 0) > 0 ? ` · chosen ${recipeFrequencies[recipe.id]}x` : ""}
        </small>
      </span>
      <Plus size={18} />
    </button>
  );
}

function RecipeDetailModal({
  recipe,
  imageUrl,
  onClose,
  onEditRecipe
}: {
  recipe: Recipe;
  imageUrl?: string;
  onClose: () => void;
  onEditRecipe: (recipe: Recipe) => void;
}) {
  const totalMinutes = totalRecipeMinutes(recipe);
  const source = recipe.source ?? recipe.sourceUrl;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel recipe-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Recipe</p>
            <h2>{recipe.title}</h2>
          </div>
          <div className="button-row">
            <button className="icon-text-button" type="button" onClick={() => onEditRecipe(recipe)}>
              <Wand2 size={18} />
              Edit
            </button>
            <button className="icon-button" title="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {imageUrl ? <img className="recipe-detail-image" src={imageUrl} alt={recipe.title} /> : null}

        <div className="recipe-meta-row">
          <span>
            <Users size={16} />
            Serves {recipe.servings}
          </span>
          <span>{recipe.mealTypes.map(labelMealSlot).join(", ")}</span>
          <span>
            <Clock size={16} />
            {totalMinutes ? `${totalMinutes} mins total` : "Time not set"}
          </span>
          {recipe.prepMinutes ? <span>{recipe.prepMinutes} mins prep</span> : null}
          {recipe.cookMinutes ? <span>{recipe.cookMinutes} mins cook</span> : null}
          {source ? (
            <span>
              Source:{" "}
              {isHttpUrl(source) ? (
                <a href={source} target="_blank" rel="noreferrer">
                  link
                </a>
              ) : (
                source
              )}
            </span>
          ) : null}
        </div>

        <div className="tag-row">
          {recipe.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <div className="recipe-detail-grid">
          <section>
            <h3>Ingredients</h3>
            <ul className="ingredient-list">
              {recipe.ingredients.map((ingredient) => (
                <li key={ingredient.id}>
                  <span>{ingredient.quantity ? `${ingredient.quantity} ` : ""}{ingredient.unit ? `${ingredient.unit} ` : ""}</span>
                  {ingredient.name}
                  {(ingredient.role ?? "required") !== "required" ? (
                    <small className="ingredient-role-badge">{ingredient.role === "side" ? "side" : "choose in planner"}</small>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Method</h3>
            <ol className="method-list">
              {recipe.instructions.map((step, index) => (
                <li key={`${index}-${step.slice(0, 12)}`}>{step}</li>
              ))}
            </ol>
          </section>
        </div>
      </section>
    </div>
  );
}

function AddRecipeView({
  importMode,
  setImportMode,
  importText,
  setImportText,
  importUrl,
  setImportUrl,
  photoFile,
  photoPreview,
  photoCropMode,
  setPhotoCropMode,
  photoRotation,
  setPhotoRotation,
  photoRawText,
  setPhotoRawText,
  onPhotoChange,
  draft,
  setDraft,
  storedMealImageUrl,
  ingredientAliases,
  savedShoppingNameVariants,
  tagInput,
  setTagInput,
  editingRecipeId,
  importStatus,
  onExtractText,
  onExtractUrl,
  onExtractPhoto,
  onExtractPhotoFallback,
  onReparsePhotoRawText,
  onMoveOcrLineToIngredients,
  onMoveOcrLineToMethod,
  onNewManual,
  onSaveDraft,
  onUpdateIngredient,
  onRememberShoppingName,
  onAddIngredient,
  onRemoveIngredient,
  onUpdateInstruction,
  onAddInstruction,
  onRemoveInstruction
}: {
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  importText: string;
  setImportText: (value: string) => void;
  importUrl: string;
  setImportUrl: (value: string) => void;
  photoFile: File | null;
  photoPreview: string;
  photoCropMode: PhotoCropMode;
  setPhotoCropMode: (mode: PhotoCropMode) => void;
  photoRotation: number;
  setPhotoRotation: (value: number | ((current: number) => number)) => void;
  photoRawText: string;
  setPhotoRawText: (value: string) => void;
  onPhotoChange: (file: File | null) => void;
  draft: ImportDraft;
  setDraft: (draft: ImportDraft | ((current: ImportDraft) => ImportDraft)) => void;
  storedMealImageUrl?: string;
  ingredientAliases: Record<string, string>;
  savedShoppingNameVariants: Record<string, string[]>;
  tagInput: string;
  setTagInput: (value: string) => void;
  editingRecipeId: string | null;
  importStatus: string;
  onExtractText: (event: FormEvent) => void;
  onExtractUrl: (event: FormEvent) => void;
  onExtractPhoto: (event: FormEvent) => void;
  onExtractPhotoFallback: () => void;
  onReparsePhotoRawText: () => void;
  onMoveOcrLineToIngredients: (line: string) => void;
  onMoveOcrLineToMethod: (line: string) => void;
  onNewManual: () => void;
  onSaveDraft: () => void | Promise<void>;
  onUpdateIngredient: (id: string, patch: Partial<Ingredient>) => void;
  onRememberShoppingName: (ingredientName: string, shoppingName: string) => void;
  onAddIngredient: () => void;
  onRemoveIngredient: (id: string) => void;
  onUpdateInstruction: (index: number, value: string) => void;
  onAddInstruction: () => void;
  onRemoveInstruction: (index: number) => void;
}) {
  const [mealImageStatus, setMealImageStatus] = useState("");
  const mealImagePreview = draft.mealImageUrl ?? (draft.mealImagePath ? storedMealImageUrl : undefined);
  const suppressedAutoTags = normalizeSuppressedAutomaticTags(draft.suppressedAutoTags);
  const automaticTags = inferAutomaticRecipeTags(draft).filter((tag) => !suppressedAutoTags.includes(tag));
  const removedAutomaticTags = suppressedAutoTags.filter((tag) => inferAutomaticRecipeTags(draft).includes(tag));
  const ocrLines = photoRawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);

  async function useMealImage(file: File) {
    setMealImageStatus("Preparing picture...");
    try {
      const mealImageUrl = await prepareMealImage(file);
      setDraft((current) => ({ ...current, mealImageUrl, mealImagePath: undefined }));
      setMealImageStatus("Picture ready");
    } catch (error) {
      setMealImageStatus(error instanceof Error ? error.message : "The picture could not be added.");
    }
  }

  async function pasteMealImage() {
    setMealImageStatus("Reading clipboard...");
    try {
      if (!navigator.clipboard?.read) throw new Error("Clipboard images are not available here. Choose the screenshot instead.");
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        const imageType = clipboardItem.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await clipboardItem.getType(imageType);
        await useMealImage(new File([blob], "meal-screenshot", { type: imageType }));
        return;
      }
      setMealImageStatus("No picture was found on the clipboard.");
    } catch (error) {
      setMealImageStatus(error instanceof Error ? error.message : "The clipboard picture could not be added.");
    }
  }

  async function handleMealImagePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    const imageFile = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();
    if (!imageFile) return;
    event.preventDefault();
    await useMealImage(imageFile);
  }

  return (
    <div className="split-view">
      <section className="import-panel">
        <div className="segmented-control" role="tablist" aria-label="Recipe import method">
          <button className={classNames(importMode === "manual" && "active")} onClick={() => setImportMode("manual")}>
            <ChefHat size={17} />
            Manual
          </button>
          <button className={classNames(importMode === "paste" && "active")} onClick={() => setImportMode("paste")}>
            <Clipboard size={17} />
            Paste
          </button>
          <button className={classNames(importMode === "url" && "active")} onClick={() => setImportMode("url")}>
            <Link size={17} />
            URL
          </button>
          <button className={classNames(importMode === "photo" && "active")} onClick={() => setImportMode("photo")}>
            <Camera size={17} />
            Photo
          </button>
        </div>

        {importMode === "manual" && (
          <div className="import-box">
            <ImagePlus size={32} />
            <h2>{editingRecipeId ? "Editing saved recipe" : "Start from a blank recipe"}</h2>
            <p>Create a clean review draft, then save it to the recipe library.</p>
            <button className="primary-button" onClick={onNewManual}>
              <Plus size={18} />
              Blank recipe
            </button>
          </div>
        )}

        {importMode === "paste" && (
          <form className="import-box" onSubmit={onExtractText}>
            <label>
              Recipe text
              <textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={12} />
            </label>
            <button className="primary-button" type="submit" disabled={!importText.trim() || Boolean(importStatus)}>
              {importStatus ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
              Extract to review
            </button>
          </form>
        )}

        {importMode === "url" && (
          <form className="import-box" onSubmit={onExtractUrl}>
            <label>
              Public recipe URL
              <input value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="https://example.com/recipe" />
            </label>
            <button className="primary-button" type="submit" disabled={!importUrl.trim() || Boolean(importStatus)}>
              {importStatus ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              Import URL
            </button>
          </form>
        )}

        {importMode === "photo" && (
          <form className="import-box" onSubmit={onExtractPhoto}>
            <div className="photo-actions">
              <label className="photo-choice">
                <Camera size={22} />
                <span>Take photo</span>
                <input type="file" accept="image/*,.heic,.heif" capture="environment" onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)} />
              </label>
              <label className="photo-choice">
                <ImagePlus size={22} />
                <span>Choose photo</span>
                <input type="file" accept="image/*,.heic,.heif" onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div className="photo-controls">
              <label>
                <Crop size={16} />
                Crop
                <select value={photoCropMode} onChange={(event) => setPhotoCropMode(event.target.value as PhotoCropMode)}>
                  <option value="whole">Whole recipe</option>
                  <option value="ingredients">Ingredients only</option>
                  <option value="method">Method only</option>
                </select>
              </label>
              <button className="icon-text-button" type="button" onClick={() => setPhotoRotation((current) => normalizeRotation(current + 90))}>
                <RotateCw size={18} />
                Rotate {photoRotation ? `${photoRotation}°` : ""}
              </button>
            </div>
            {photoFile && <span className="selected-photo-name">{photoFile.name}</span>}
            {photoPreview && <img className="photo-preview" src={photoPreview} alt="Recipe import preview" />}
            {importStatus && <span className="ocr-status">{importStatus}</span>}
            <button className="primary-button" type="submit" disabled={!photoFile || Boolean(importStatus)}>
              {importStatus ? <Loader2 className="spin" size={18} /> : <Eye size={18} />}
              Read photo privately
            </button>
            <button className="icon-text-button" type="button" onClick={onExtractPhotoFallback} disabled={!photoFile || Boolean(importStatus)}>
              <Sparkles size={18} />
              Try free online OCR
            </button>
            {photoRawText && (
              <div className="ocr-review-tools">
                <label>
                  Raw OCR text
                  <textarea value={photoRawText} onChange={(event) => setPhotoRawText(event.target.value)} rows={7} />
                </label>
                <button className="icon-text-button" type="button" onClick={onReparsePhotoRawText}>
                  <RefreshCw size={17} />
                  Re-parse text
                </button>
                <div className="ocr-line-list">
                  {ocrLines.map((line, index) => (
                    <div className="ocr-line" key={`${index}-${line}`}>
                      <span>{line}</span>
                      <button type="button" title="Move to ingredients" onClick={() => onMoveOcrLineToIngredients(line)}>
                        <Plus size={15} />
                        Ingredient
                      </button>
                      <button type="button" title="Move to method" onClick={() => onMoveOcrLineToMethod(line)}>
                        <Plus size={15} />
                        Method
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}
      </section>

      <section className="review-panel">
        <div className="review-heading">
          <div>
            <p className="eyebrow">Review before save</p>
            <h2>{draft.title || "Untitled recipe"}</h2>
          </div>
          <button
            className="primary-button"
            onClick={() => void onSaveDraft()}
            disabled={Boolean(importStatus) || !draft.title.trim() || draft.ingredients.every((ingredient) => !ingredient.name.trim())}
          >
            {importStatus === "Saving recipe..." ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            {importStatus === "Saving recipe..." ? "Saving..." : editingRecipeId ? "Update recipe" : "Save recipe"}
          </button>
        </div>

        {draft.warnings.length > 0 && (
          <div className="warning-list">
            {draft.warnings.map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </div>
        )}

        <div className="form-grid">
          <label>
            Recipe name
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            Serves
            <input
              type="number"
              min={1}
              value={draft.servings}
              onChange={(event) => setDraft((current) => ({ ...current, servings: Number(event.target.value) || 1 }))}
            />
          </label>
          <label>
            Prep mins
            <input
              type="number"
              min={0}
              value={draft.prepMinutes ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, prepMinutes: parseNumberInput(event.target.value) }))}
            />
          </label>
          <label>
            Cook mins
            <input
              type="number"
              min={0}
              value={draft.cookMinutes ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, cookMinutes: parseNumberInput(event.target.value) }))}
            />
          </label>
        </div>

        <label>
          Recipe source
          <input
            value={draft.source ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
            placeholder="URL, cookbook page, magazine, family recipe"
          />
        </label>

        <div className="editor-section">
          <div className="section-heading">
            <h3>Meal picture</h3>
            {mealImagePreview ? (
              <button
                className="icon-text-button danger"
                type="button"
                onClick={() => {
                  setDraft((current) => ({ ...current, mealImageUrl: undefined, mealImagePath: undefined }));
                  setMealImageStatus("");
                }}
              >
                <Trash2 size={17} />
                Remove
              </button>
            ) : null}
          </div>
          <div className="meal-image-editor" tabIndex={0} onPaste={handleMealImagePaste}>
            {mealImagePreview ? (
              <img src={mealImagePreview} alt="Meal preview" />
            ) : (
              <div className="meal-image-empty">
                <ImagePlus size={30} />
                <span>No meal picture</span>
              </div>
            )}
            <div className="meal-image-actions">
              <label className="icon-text-button">
                <ImagePlus size={17} />
                Choose image
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void useMealImage(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <button className="icon-text-button" type="button" onClick={() => void pasteMealImage()}>
                <Clipboard size={17} />
                Paste screenshot
              </button>
            </div>
            {mealImageStatus ? <span className="meal-image-status">{mealImageStatus}</span> : null}
          </div>
        </div>

        <div className="editor-section">
          <div className="section-heading">
            <h3>Meal group</h3>
          </div>
          <div className="toggle-grid meal-type-grid">
            {mealSlots.map((slot) => {
              const active = draft.mealTypes.includes(slot);
              return (
                <button
                  className={classNames("toggle-tile", active && "active")}
                  key={slot}
                  type="button"
                  onClick={() =>
                    setDraft((current) => {
                      const currentlyActive = current.mealTypes.includes(slot);
                      const mealTypes = currentlyActive
                        ? current.mealTypes.filter((mealType) => mealType !== slot)
                        : [...current.mealTypes, slot];

                      return { ...current, mealTypes: mealTypes.length ? mealTypes : [slot] };
                    })
                  }
                >
                  {labelMealSlot(slot)}
                </button>
              );
            })}
          </div>
        </div>

        <label>
          Tags
          <input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="family, cosy, lunch prep"
          />
        </label>
        <div className="tag-helper">
          {automaticTags.length > 0 ? (
            <>
              <span>Auto tags on save</span>
              {automaticTags.map((tag) => (
                <button
                  className="tag-chip-button"
                  key={tag}
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      suppressedAutoTags: normalizeSuppressedAutomaticTags([...(current.suppressedAutoTags ?? []), tag])
                    }))
                  }
                >
                  {tag}
                  <X size={14} />
                </button>
              ))}
            </>
          ) : (
            <span>Automatic meal-type and time tags are kept up to date when saved.</span>
          )}
          {removedAutomaticTags.length > 0 && (
            <>
              <span>Removed auto tags</span>
              {removedAutomaticTags.map((tag) => (
                <button
                  className="tag-chip-button muted-chip"
                  key={tag}
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      suppressedAutoTags: normalizeSuppressedAutomaticTags(current.suppressedAutoTags).filter((item) => item !== tag)
                    }))
                  }
                >
                  {tag}
                  <Plus size={14} />
                </button>
              ))}
            </>
          )}
        </div>

        <div className="editor-section">
          <div className="section-heading">
            <h3>Ingredients</h3>
            <button className="icon-text-button" onClick={onAddIngredient}>
              <Plus size={17} />
              Add row
            </button>
          </div>
          <div className="ingredient-editor">
	            {draft.ingredients.map((ingredient) => {
                  const suggestedShoppingName = ingredient.name.trim() ? canonicalizeIngredientName(ingredient.name, ingredientAliases).canonicalName : "";
                  const shoppingName = ingredient.canonicalName ?? "";
                  const variantOptions = ingredient.name.trim()
                    ? shoppingNameVariants(ingredient.name, ingredientAliases, savedShoppingNameVariants)
                    : [];
                  const selectedVariant = variantOptions.includes(normalizeIngredientAliasKey(shoppingName)) ? normalizeIngredientAliasKey(shoppingName) : "";

                  return (
	              <div
	                className={classNames("ingredient-row", (ingredient.confidence === "low" || ingredient.needsReview) && "needs-review")}
	                key={ingredient.id}
	              >
	                <input
	                  aria-label="Quantity"
	                  className="qty-input"
	                  type="number"
	                  min={0}
	                  step="0.25"
	                  value={ingredient.quantity ?? ""}
	                  onChange={(event) => onUpdateIngredient(ingredient.id, { quantity: parseNumberInput(event.target.value), needsReview: false })}
	                />
	                <select
	                  aria-label="Unit"
	                  className="unit-input"
	                  value={normalizeUnit(ingredient.unit)}
	                  onChange={(event) => onUpdateIngredient(ingredient.id, { unit: event.target.value, needsReview: false })}
	                >
                      <option value="">No unit</option>
                      {standardIngredientUnits.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
	                </select>
	                <input
	                  aria-label="Ingredient"
	                  value={ingredient.name}
	                  onChange={(event) => onUpdateIngredient(ingredient.id, { name: event.target.value })}
	                  onBlur={(event) => {
	                    if (!ingredient.quantity && !ingredient.unit && event.target.value.trim()) {
	                      const parsed = parseIngredientLine(event.target.value);
	                      if (parsed.name !== event.target.value) onUpdateIngredient(ingredient.id, { ...parsed, id: ingredient.id, needsReview: false });
	                    }
	                  }}
	                  placeholder="ingredient"
	                />
	                <select
	                  aria-label="Category"
	                  value={ingredient.category}
	                  onChange={(event) => onUpdateIngredient(ingredient.id, { category: event.target.value as GroceryCategory, needsReview: false })}
	                >
	                  {groceryCategories.map((category) => (
	                    <option key={category} value={category}>
	                      {category}
	                    </option>
	                  ))}
                  </select>
	                <button className="icon-button danger" type="button" title="Remove ingredient" onClick={() => onRemoveIngredient(ingredient.id)}>
	                  <Trash2 size={16} />
	                </button>
                  <div className="ingredient-standard-row">
                    <label className="ingredient-role-control">
                      Planner use
                      <select
                        aria-label="Planner use"
                        value={ingredient.role ?? "required"}
                        onChange={(event) => onUpdateIngredient(ingredient.id, { role: event.target.value as IngredientRole })}
                      >
                        <option value="required">Always include</option>
                        <option value="optional">Choose in planner</option>
                        <option value="side">Optional side</option>
                      </select>
                    </label>
                    <label>
                      Shopping name
                      <div className="shopping-name-controls">
                        <input
                          aria-label="Shopping name"
                          value={shoppingName}
                          onChange={(event) => onUpdateIngredient(ingredient.id, { canonicalName: event.target.value, needsReview: false })}
                          placeholder={suggestedShoppingName || "shopping name"}
                        />
                        <select
                          aria-label="Shopping name variants"
                          value={selectedVariant}
                          onChange={(event) => {
                            if (!event.target.value) return;
                            onUpdateIngredient(ingredient.id, { canonicalName: event.target.value, needsReview: false });
                          }}
                        >
                          <option value="">Variants</option>
                          {variantOptions.map((variant) => (
                            <option key={variant} value={variant}>
                              {variant}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <button
                      className="text-button"
                      type="button"
                      disabled={!ingredient.name.trim() || !shoppingName.trim()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRememberShoppingName(ingredient.name, shoppingName);
                      }}
                    >
                      Save name & variant
                    </button>
                    <small>
                      Suggested for Asda: <strong>{suggestedShoppingName || "enter an ingredient"}</strong>. This name standardises matching items across recipes.
                    </small>
                  </div>
	                {(ingredient.needsReview || ingredient.originalLine) && (
	                  <small className="ingredient-review-note">
	                    {ingredient.needsReview ? "Check this line" : "Imported line"}{ingredient.originalLine ? `: ${ingredient.originalLine}` : ""}
	                  </small>
	                )}
	              </div>
                  );
                })}
          </div>
        </div>

        <div className="editor-section">
          <div className="section-heading">
            <h3>Method</h3>
            <button className="icon-text-button" onClick={onAddInstruction}>
              <Plus size={17} />
              Add step
            </button>
          </div>
          <div className="method-editor">
            {draft.instructions.map((step, index) => (
              <div className="method-row" key={`${index}-${step.slice(0, 8)}`}>
                <span>{index + 1}</span>
                <textarea value={step} onChange={(event) => onUpdateInstruction(index, event.target.value)} rows={2} />
                <button className="icon-button danger" title="Remove step" onClick={() => onRemoveInstruction(index)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ShoppingView({
  items,
  settings,
  startDate,
  endDate,
  rangeStartDate,
  rangeEndDate,
  manualItemName,
  manualItemQuantity,
  manualItemCategory,
  manualBulkItems,
  asdaProductLinks,
  asdaProductSelections,
  asdaShoppingStatus,
  setStartDate,
  setEndDate,
  setManualItemName,
  setManualItemQuantity,
  setManualItemCategory,
  setManualBulkItems,
  onResetDateRange,
  onToggleIncludeStaples,
  onAddManualItem,
  onAddBulkManualItems,
  onAddCommonManualItem,
  onClearManualItems,
  onUpdateCommonExtras,
  onToggleItem,
  onUpdateManualItem,
  onDeleteItem,
  onOpenRecipe,
  onUpdateAsdaProductLink,
  onUpdateAsdaShoppingStatus,
  onResetAsdaRun,
  onCopy,
  onPrint,
  onRestoreGenerated
}: {
  items: ShoppingListItem[];
  settings: AppState["settings"];
  startDate: string;
  endDate: string;
  rangeStartDate: string;
  rangeEndDate: string;
  manualItemName: string;
  manualItemQuantity: string;
  manualItemCategory: ManualItemCategory;
  manualBulkItems: string;
  asdaProductLinks: Record<string, string>;
  asdaProductSelections: Record<string, AsdaProductSelection>;
  asdaShoppingStatus: Record<string, StoreShoppingStatus>;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  setManualItemName: (value: string) => void;
  setManualItemQuantity: (value: string) => void;
  setManualItemCategory: (value: ManualItemCategory) => void;
  setManualBulkItems: (value: string) => void;
  onResetDateRange: () => void;
  onToggleIncludeStaples: (value: boolean) => void;
  onAddManualItem: (event: FormEvent) => void;
  onAddBulkManualItems: (event: FormEvent) => void;
  onAddCommonManualItem: (itemName: string) => void;
  onClearManualItems: () => void;
  onUpdateCommonExtras: (items: string[]) => void;
  onToggleItem: (id: string, checked: boolean) => void;
  onUpdateManualItem: (id: string, patch: Partial<ShoppingListItem>) => void;
  onDeleteItem: (item: ShoppingListItem) => void;
  onOpenRecipe: (recipeId: string) => void;
  onUpdateAsdaProductLink: (itemKey: string, value: string) => void;
  onUpdateAsdaShoppingStatus: (itemId: string, status?: StoreShoppingStatus) => void;
  onResetAsdaRun: () => void;
  onCopy: () => void;
  onPrint: () => void;
  onRestoreGenerated: () => void;
}) {
  const [editingManualItemId, setEditingManualItemId] = useState<string | null>(null);
  const [editingCommonExtras, setEditingCommonExtras] = useState(false);
  const [commonExtrasDraft, setCommonExtrasDraft] = useState<string[]>(settings.commonExtraItems);
  const [asdaHelperMessage, setAsdaHelperMessage] = useState("");
  const asdaHelperTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingManualItem = items.find((item) => item.manual && item.id === editingManualItemId) ?? null;
  const manualItems = items
    .filter((item) => item.manual)
    .sort((first, second) => {
      const categoryDifference = groceryCategories.indexOf(first.category) - groceryCategories.indexOf(second.category);
      return categoryDifference || first.name.localeCompare(second.name);
    });
  const manualItemKeys = new Set(manualItems.map((item) => shoppingPreferenceKey(item)));
  const manualItemCount = manualItems.length;
  const asdaAddedCount = items.filter((item) => asdaShoppingStatus[item.id] === "added").length;
  const grouped = groceryCategories
    .map((category) => ({
      category,
      items: items.filter((item) => item.category === category)
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    if (!editingCommonExtras) setCommonExtrasDraft(settings.commonExtraItems);
  }, [editingCommonExtras, settings.commonExtraItems]);

  function buildAsdaHelperQueue(): AsdaHelperQueue {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      sourceUrl: window.location.href,
      rangeStartDate,
      rangeEndDate,
      items: items.map((item) => {
        const shoppingKey = shoppingPreferenceKey(item);
        const canonicalName = item.canonicalName || shoppingKey;
        const savedProductSelection = asdaProductSelections[shoppingKey];

        return {
          itemId: item.id,
          shoppingKey,
          statusKey: storeStatusItemKey({ startDate: rangeStartDate, endDate: rangeEndDate }, item.id),
          name: item.name,
          canonicalName,
          displayQuantity: item.displayQuantity,
          quantity: item.quantity,
          unit: item.unit,
          requiredQuantity: item.quantity,
          requiredUnit: item.unit,
          category: item.category,
          sourceMeals: item.sourceMeals,
          sourceIngredients: item.sourceIngredients,
          avoidTerms: asdaAvoidTerms(item),
          savedProductUrl: asdaProductLinks[shoppingKey] ?? "",
          savedProductName: savedProductSelection?.productName,
          savedPackSizeText: savedProductSelection?.packSizeText,
          savedPackQuantity: savedProductSelection?.packQuantity,
          savedPackUnit: savedProductSelection?.packUnit,
          searchUrl: asdaSearchUrl(item),
          status: asdaShoppingStatus[item.id]
        };
      })
    };
  }

  useEffect(() => {
    publishAsdaHelperQueue(buildAsdaHelperQueue());
  });

  useEffect(() => {
    function handleAsdaHelperResult(event: MessageEvent<{ source?: string; type?: string; payload?: { itemCount?: number; error?: string } }>) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.source !== asdaHelperExtensionSource || message.type !== "ASDA_HELPER_IMPORT_RESULT") return;

      if (asdaHelperTimerRef.current) clearTimeout(asdaHelperTimerRef.current);

      if (message.payload?.error) {
        setAsdaHelperMessage(message.payload.error);
      } else {
        setAsdaHelperMessage(`Asda Helper imported ${message.payload?.itemCount ?? items.length} items.`);
      }
    }

    window.addEventListener("message", handleAsdaHelperResult);
    return () => {
      window.removeEventListener("message", handleAsdaHelperResult);
      if (asdaHelperTimerRef.current) clearTimeout(asdaHelperTimerRef.current);
    };
  }, [items.length]);

  function sendToAsdaHelper() {
    const queue = buildAsdaHelperQueue();

    publishAsdaHelperQueue(queue);
    window.postMessage({ source: asdaHelperAppSource, type: "ASDA_HELPER_IMPORT_QUEUE", payload: queue }, window.location.origin);
    setAsdaHelperMessage("Sending shopping queue to Asda Helper...");
    if (asdaHelperTimerRef.current) clearTimeout(asdaHelperTimerRef.current);
    asdaHelperTimerRef.current = setTimeout(() => {
      setAsdaHelperMessage("Asda Helper did not respond. Reload the extension and this Weekwise tab, or open the extension and click Import from Weekwise.");
    }, 1500);
  }

  return (
    <div className="view-stack">
      <section className="toolbar-band">
        <div>
          <p className="eyebrow">Generated from selected dates</p>
          <h2>{items.length} shopping items</h2>
          <p className="muted">
            {dateFormatter.format(new Date(`${rangeStartDate}T12:00:00`))} to {dateFormatter.format(new Date(`${rangeEndDate}T12:00:00`))}
          </p>
        </div>
        <div className="button-row">
          <div className="date-range-controls">
            <label>
              From
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <button className="text-button" onClick={onResetDateRange}>This week</button>
          <label className="toggle-line">
            <input type="checkbox" checked={settings.includeStaples} onChange={(event) => onToggleIncludeStaples(event.target.checked)} />
            Include staples
          </label>
          <button className="icon-text-button" onClick={onCopy}>
            <Download size={18} />
            Copy
          </button>
          <button className="icon-button" title="Print" onClick={onPrint}>
            <Printer size={18} />
          </button>
          <button className="icon-button" title="Restore hidden generated items" onClick={onRestoreGenerated}>
            <RefreshCw size={18} />
          </button>
        </div>
      </section>

      <div className="manual-items-heading">
        <div>
          <p className="eyebrow">Extra items</p>
          <h3>{manualItemCount} added for this shop</h3>
        </div>
        <button className="icon-text-button danger" type="button" disabled={!manualItemCount} onClick={onClearManualItems}>
          <Trash2 size={16} />
          Clear added items
        </button>
      </div>

      <div className="extra-items-layout">
        <div className="extra-items-entry">
          <form className="manual-add single-manual-add" onSubmit={onAddManualItem}>
            <input value={manualItemName} onChange={(event) => setManualItemName(event.target.value)} placeholder="Add extra item" />
            <input value={manualItemQuantity} onChange={(event) => setManualItemQuantity(event.target.value)} placeholder="Quantity" />
            <select value={manualItemCategory} onChange={(event) => setManualItemCategory(event.target.value as ManualItemCategory)}>
              <option value="Auto">Auto category</option>
              {groceryCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <button className="primary-button" type="submit">
              <Plus size={18} />
              Add
            </button>
          </form>

          <form className="manual-add bulk-manual-add" onSubmit={onAddBulkManualItems}>
            <textarea
              value={manualBulkItems}
              onChange={(event) => setManualBulkItems(event.target.value)}
              placeholder={"Milk\n2 onions\nBread"}
              rows={3}
            />
            <button className="primary-button" type="submit">
              <Plus size={18} />
              Add list
            </button>
          </form>

          <section className="common-extra-panel">
            <div className="section-heading">
              <h3>Common extras</h3>
              {editingCommonExtras ? (
                <div className="button-row">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setCommonExtrasDraft(settings.commonExtraItems);
                      setEditingCommonExtras(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button compact-button"
                    type="button"
                    onClick={() => {
                      onUpdateCommonExtras(commonExtrasDraft);
                      setEditingCommonExtras(false);
                    }}
                  >
                    <Check size={16} />
                    Save
                  </button>
                </div>
              ) : (
                <button
                  className="icon-text-button"
                  type="button"
                  onClick={() => {
                    setCommonExtrasDraft(settings.commonExtraItems);
                    setEditingCommonExtras(true);
                  }}
                >
                  <Settings size={16} />
                  Manage
                </button>
              )}
            </div>
            {editingCommonExtras ? (
              <div className="common-extra-editor">
                {commonExtrasDraft.map((itemName, index) => (
                  <div className="common-extra-editor-row" key={index}>
                    <input
                      aria-label={`Common extra ${index + 1}`}
                      value={itemName}
                      onChange={(event) =>
                        setCommonExtrasDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                      }
                      placeholder="Extra item"
                    />
                    <button
                      className="icon-button danger"
                      type="button"
                      title="Remove common extra"
                      onClick={() => setCommonExtrasDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button className="icon-text-button common-extra-add" type="button" onClick={() => setCommonExtrasDraft((current) => [...current, ""])}>
                  <Plus size={16} />
                  Add button
                </button>
              </div>
            ) : (
              <div className="common-extra-list">
                {settings.commonExtraItems.map((itemName) => {
                  const alreadyAdded = manualItemKeys.has(shoppingPreferenceKey({ name: itemName }));

                  return (
                    <button
                      className={classNames("text-button", alreadyAdded && "active")}
                      type="button"
                      key={itemName}
                      onClick={() => onAddCommonManualItem(itemName)}
                    >
                      {alreadyAdded ? <Check size={15} /> : <Plus size={15} />}
                      {itemName}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section className="added-extra-panel" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Already added</p>
              <h3>{manualItemCount} extras</h3>
            </div>
          </div>
          {manualItems.length ? (
            <div className="added-extra-list">
              {manualItems.map((item) => {
                const hasSavedProduct = Boolean(asdaProductLinks[shoppingPreferenceKey(item)]);

                return (
                  <div className={classNames("added-extra-row", item.checked && "checked")} key={item.id}>
                    <div className="added-extra-copy">
                      <strong>{[item.displayQuantity, item.name].filter(Boolean).join(" ")}</strong>
                      <div className="added-extra-meta">
                        <span>{item.category}</span>
                        {hasSavedProduct ? (
                          <span className="saved-product-indicator">
                            <Link size={13} />
                            Asda product saved
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <button className="icon-button" type="button" title={`Edit ${item.name}`} onClick={() => setEditingManualItemId(item.id)}>
                      <Pencil size={16} />
                    </button>
                    <button className="icon-button danger" type="button" title={`Delete ${item.name}`} onClick={() => onDeleteItem(item)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted added-extra-empty">Items added individually, as a list, or with the common buttons will appear here.</p>
          )}
        </section>
      </div>

      <section className="asda-shop-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Asda shop</p>
            <h3>
              {asdaAddedCount}/{items.length} added
            </h3>
          </div>
          <div className="asda-shop-header-actions">
            <button className="icon-text-button" type="button" onClick={sendToAsdaHelper} disabled={!items.length}>
              <ShoppingCart size={18} />
              Send to Asda Helper
            </button>
            <button className="text-button" type="button" onClick={onResetAsdaRun}>
              Reset run
            </button>
          </div>
        </div>
        {asdaHelperMessage ? <p className="helper-message">{asdaHelperMessage}</p> : null}

        <div className="asda-shop-list">
          {items.map((item) => {
            const itemKey = shoppingPreferenceKey(item);
            const savedProductUrl = asdaProductLinks[itemKey] ?? "";
            const savedProductSelection = asdaProductSelections[itemKey];
            const purchaseSummary = asdaPurchaseSummary(item, savedProductSelection);
            const openUrl = savedProductUrl || asdaSearchUrl(item);
            const status = asdaShoppingStatus[item.id];

            return (
              <div className={classNames("asda-shop-row", status && `status-${status}`)} key={item.id}>
                <div className="asda-shop-item">
                  <strong>
                    {purchaseSummary ? <span>{purchaseSummary.display}</span> : item.displayQuantity ? <span>{item.displayQuantity}</span> : null} {item.name}
                  </strong>
                  <small>
                    {savedProductSelection?.productName ?? (savedProductUrl ? "Saved product" : "Search Asda")}
                    {purchaseSummary ? ` · recipe needs ${item.displayQuantity ? `${item.displayQuantity} ${item.name}` : item.name}${purchaseSummary.estimated ? " (estimated pack conversion)" : ""}` : ""}
                  </small>
                </div>

                <input
                  aria-label={`Asda product link for ${item.name}`}
                  value={savedProductUrl}
                  onChange={(event) => onUpdateAsdaProductLink(itemKey, event.target.value)}
                  placeholder="Asda product link"
                />

                <div className="asda-shop-actions">
                  <a
                    className="text-button"
                    href={openUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (!status) onUpdateAsdaShoppingStatus(item.id, "opened");
                    }}
                  >
                    <Link size={15} />
                    Open
                  </a>
                  <button
                    className={classNames("status-button", status === "added" && "active")}
                    type="button"
                    onClick={() => {
                      onUpdateAsdaShoppingStatus(item.id, "added");
                      onToggleItem(item.id, true);
                    }}
                  >
                    Added
                  </button>
                  <button
                    className={classNames("status-button", status === "unavailable" && "active")}
                    type="button"
                    onClick={() => onUpdateAsdaShoppingStatus(item.id, "unavailable")}
                  >
                    Unavailable
                  </button>
                  {status ? (
                    <button className="icon-button" type="button" title="Clear Asda status" onClick={() => onUpdateAsdaShoppingStatus(item.id)}>
                      <X size={15} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="shopping-groups">
        {grouped.map((group) => (
          <div className="shopping-group" key={group.category}>
            <h2>{group.category}</h2>
            <div className="shopping-list">
              {group.items.map((item) => {
                const sourceRecipeId = item.sourceRecipeIds?.[0];
                const itemIsClickable = item.manual || Boolean(sourceRecipeId);
                const productSelection = asdaProductSelections[shoppingPreferenceKey(item)];
                const purchaseSummary = asdaPurchaseSummary(item, productSelection);
                const openItem = () => {
                  if (item.manual) {
                    setEditingManualItemId(item.id);
                  } else if (sourceRecipeId) {
                    onOpenRecipe(sourceRecipeId);
                  }
                };

                return (
                  <article className={classNames("shopping-item", item.checked && "checked")} key={item.id}>
                    <label className="check-control">
                      <input type="checkbox" checked={item.checked} onChange={(event) => onToggleItem(item.id, event.target.checked)} />
                      <Check size={16} />
                    </label>

                    <div
                      className={classNames("shopping-text", itemIsClickable && "clickable")}
                      role={itemIsClickable ? "button" : undefined}
                      tabIndex={itemIsClickable ? 0 : undefined}
                      onClick={itemIsClickable ? openItem : undefined}
                      onKeyDown={(event) => {
                        if (!itemIsClickable || (event.key !== "Enter" && event.key !== " ")) return;
                        event.preventDefault();
                        openItem();
                      }}
                    >
                      <strong>
                        {purchaseSummary ? <span>{purchaseSummary.display}</span> : item.displayQuantity ? <span>{item.displayQuantity}</span> : null} {item.name}
                      </strong>
                      <small>
                        {item.manual ? "Added item" : item.sourceMeals.join(", ")}
                        {item.incompatible ? " · check unit" : ""}
                        {item.staple ? " · staple" : ""}
                      </small>
                      {purchaseSummary ? (
                        <small className="shopping-required-amount">
                          Recipe need: {item.displayQuantity ? `${item.displayQuantity} ${item.name}` : `${item.name} (quantity not specified)`}
                          {purchaseSummary.estimated ? " · pack count estimated from typical item weight" : ""}
                        </small>
                      ) : null}
                      {item.conversionNotes?.length ? <small className="shopping-note">Metric conversion: {item.conversionNotes.join("; ")}</small> : null}
                      {item.mergeWarnings?.length ? <small className="shopping-note">{item.mergeWarnings.join(" ")}</small> : null}
                    </div>

                    <button className="icon-button danger" title={item.manual ? "Delete item" : "Hide generated item"} onClick={() => onDeleteItem(item)}>
                      <Trash2 size={16} />
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {editingManualItem && (
        <ManualShoppingItemModal
          key={editingManualItem.id}
          item={editingManualItem}
          onClose={() => setEditingManualItemId(null)}
          onSave={(patch) => {
            onUpdateManualItem(editingManualItem.id, patch);
            setEditingManualItemId(null);
          }}
          onDelete={() => {
            onDeleteItem(editingManualItem);
            setEditingManualItemId(null);
          }}
        />
      )}
    </div>
  );
}

function ManualShoppingItemModal({
  item,
  onClose,
  onSave,
  onDelete
}: {
  item: ShoppingListItem;
  onClose: () => void;
  onSave: (patch: Partial<ShoppingListItem>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.displayQuantity);
  const [category, setCategory] = useState<GroceryCategory>(item.category);

  function saveItem(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    onSave({
      name: cleanName,
      canonicalName: canonicalizeIngredientName(cleanName).canonicalName,
      displayQuantity: quantity.trim(),
      category
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal-panel manual-item-modal" role="dialog" aria-modal="true" onSubmit={saveItem} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Added item</p>
            <h2>Edit shopping item</h2>
          </div>
          <button className="icon-button" type="button" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <label>
            Item
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Quantity
            <input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value as GroceryCategory)}>
              {groceryCategories.map((groceryCategory) => (
                <option key={groceryCategory} value={groceryCategory}>
                  {groceryCategory}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="button-row">
          <button className="primary-button" type="submit">
            <Check size={18} />
            Save
          </button>
          <button className="ghost-danger" type="button" onClick={onDelete}>
            <Trash2 size={18} />
            Delete
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsView({
  settings,
  updateSettings,
  supabaseConfigured,
  cloudEmail,
  setCloudEmail,
  cloudUser,
  cloudMessage,
  cloudBusy,
  syncStatus,
  onSendMagicLink,
  onSaveCloud,
  onLoadCloud,
  onResetDemo
}: {
  settings: AppState["settings"];
  updateSettings: (patch: Partial<AppState["settings"]>) => void;
  supabaseConfigured: boolean;
  cloudEmail: string;
  setCloudEmail: (value: string) => void;
  cloudUser: string | null;
  cloudMessage: string;
  cloudBusy: boolean;
  syncStatus: SyncStatus;
  onSendMagicLink: (event: FormEvent) => void;
  onSaveCloud: () => void;
  onLoadCloud: () => void;
  onResetDemo: () => void;
}) {
  return (
    <div className="settings-layout">
      <section className="settings-section">
        <h2>Household</h2>
        <div className="form-grid">
          <label>
            Household name
            <input value={settings.householdName} onChange={(event) => updateSettings({ householdName: event.target.value })} />
          </label>
          <label>
            Default people
            <input
              type="number"
              min={1}
              value={settings.defaultPeople}
              onChange={(event) => updateSettings({ defaultPeople: Number(event.target.value) || 1 })}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2>Meal slots</h2>
        <div className="toggle-grid">
          {mealSlots.map((slot) => {
            const hidden = settings.hiddenSlots.includes(slot);
            return (
              <button
                className={classNames("toggle-tile", !hidden && "active")}
                key={slot}
                onClick={() =>
                  updateSettings({
                    hiddenSlots: hidden ? settings.hiddenSlots.filter((item) => item !== slot) : [...settings.hiddenSlots, slot]
                  })
                }
              >
                {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
                {labelMealSlot(slot)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section">
        <h2>Staples</h2>
        <label>
          Usually at home
          <textarea
            value={settings.stapleIngredients.join(", ")}
            onChange={(event) =>
              updateSettings({
                stapleIngredients: event.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
              })
            }
            rows={4}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2>Cloud sync</h2>
        <span className={classNames("sync-badge", `sync-${syncStatus}`)}>{syncStatusCopy(syncStatus)}</span>
        <p className="muted">
          {supabaseConfigured
            ? cloudUser
              ? `Signed in as ${cloudUser}. Changes save automatically after a short pause.`
              : "Supabase is configured. Sign in to sync this household across devices."
            : "Supabase credentials are not configured yet. Local saving still works on this device."}
        </p>
        <form className="cloud-form" onSubmit={onSendMagicLink}>
          <input type="email" value={cloudEmail} onChange={(event) => setCloudEmail(event.target.value)} placeholder="you@example.com" />
          <button className="primary-button" disabled={cloudBusy || !cloudEmail.trim()} type="submit">
            {cloudBusy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            Sign in
          </button>
        </form>
        <div className="button-row">
          <button className="icon-text-button" onClick={onSaveCloud} disabled={cloudBusy}>
            <Download size={18} />
            Sync now
          </button>
          <button className="icon-text-button" onClick={onLoadCloud} disabled={cloudBusy}>
            <RefreshCw size={18} />
            Reload cloud
          </button>
        </div>
        {cloudMessage && <span className="status-line">{cloudMessage}</span>}
      </section>

      <section className="settings-section">
        <h2>Demo data</h2>
        <button className="ghost-danger" onClick={onResetDemo}>
          <Trash2 size={18} />
          Reset sample data
        </button>
      </section>
    </div>
  );
}

const viewTitle: Record<View, string> = {
  planner: "Weekly planner",
  recipes: "Recipe library",
  add: "Add recipe",
  shopping: "Shopping list",
  settings: "Settings"
};

const samplePasteText = `Black bean tacos
Serves 4

Ingredients
1 tbsp olive oil
1 red onion
2 cans black beans
1 tsp cumin
8 tortillas
150 g cheddar
1 lime

Method
Soften the onion in olive oil.
Add beans and cumin, then warm through.
Serve in tortillas with cheddar and lime.`;
