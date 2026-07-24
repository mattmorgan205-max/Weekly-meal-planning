export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type GroceryCategory =
  | "Produce"
  | "Meat & Fish"
  | "Dairy & Eggs"
  | "Bakery"
  | "Pantry"
  | "Frozen"
  | "Spices"
  | "Other";

export type Ingredient = {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  category: GroceryCategory;
  note?: string;
  canonicalName?: string;
  originalLine?: string;
  confidence?: "high" | "medium" | "low";
  needsReview?: boolean;
};

export type Recipe = {
  id: string;
  title: string;
  servings: number;
  mealTypes: MealSlot[];
  prepMinutes?: number;
  cookMinutes?: number;
  tags: string[];
  favorite: boolean;
  ingredients: Ingredient[];
  instructions: string[];
  source?: string;
  sourceUrl?: string;
  photoDataUrl?: string;
  mealImageUrl?: string;
  notes?: string;
  suppressedAutoTags?: string[];
  importedFrom?: "manual" | "paste" | "url" | "photo";
  createdAt: string;
  updatedAt: string;
};

export type PlannedMeal = {
  id: string;
  date: string;
  slot: MealSlot;
  recipeId?: string;
  manualTitle?: string;
  peopleCount: number;
  notes?: string;
  producesLeftovers?: boolean;
  leftoverTargetDate?: string;
};

export type ShoppingListItem = {
  id: string;
  shoppingRangeKey?: string;
  mergeKey?: string;
  splitGroupKey?: string;
  name: string;
  canonicalName?: string;
  quantity?: number;
  unit?: string;
  displayQuantity: string;
  category: GroceryCategory;
  sourceMeals: string[];
  sourceRecipeIds?: string[];
  sourceIngredients?: string[];
  conversionNotes?: string[];
  mergeWarnings?: string[];
  mergeSuggestion?: {
    aliasName: string;
    canonicalName: string;
    label: string;
  };
  canSplitMerge?: boolean;
  splitFromConsolidation?: boolean;
  canRestoreMerge?: boolean;
  checked: boolean;
  manual?: boolean;
  staple?: boolean;
  incompatible?: boolean;
};

export type StoreShoppingStatus = "opened" | "added" | "unavailable";

export type AppSettings = {
  householdName: string;
  defaultPeople: number;
  hiddenSlots: MealSlot[];
  stapleIngredients: string[];
  includeStaples: boolean;
  ingredientAliases: Record<string, string>;
  shoppingNameVariants: Record<string, string[]>;
  commonExtraItems: string[];
  splitShoppingItems: Record<string, boolean>;
};

export type ImportDraft = {
  id: string;
  title: string;
  servings: number;
  mealTypes: MealSlot[];
  prepMinutes?: number;
  cookMinutes?: number;
  tags: string[];
  ingredients: Ingredient[];
  instructions: string[];
  source?: string;
  sourceUrl?: string;
  photoDataUrl?: string;
  mealImageUrl?: string;
  rawText?: string;
  suppressedAutoTags?: string[];
  warnings: string[];
  importedFrom: "manual" | "paste" | "url" | "photo";
};

export type AppState = {
  recipes: Recipe[];
  plannedMeals: PlannedMeal[];
  dayNotes: Record<string, string>;
  shoppingChecks: Record<string, boolean>;
  hiddenShoppingItems: Record<string, boolean>;
  manualShoppingItems: ShoppingListItem[];
  asdaProductLinks: Record<string, string>;
  asdaShoppingStatus: Record<string, StoreShoppingStatus>;
  settings: AppSettings;
};

export const mealSlots: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const mealSlotSet = new Set<MealSlot>(mealSlots);

export const groceryCategories: GroceryCategory[] = [
  "Produce",
  "Meat & Fish",
  "Dairy & Eggs",
  "Bakery",
  "Pantry",
  "Frozen",
  "Spices",
  "Other"
];

export const defaultCommonExtraItems = [
  "Milk",
  "Bread",
  "Eggs",
  "Bananas",
  "Apples",
  "Onions",
  "Potatoes",
  "Cheese",
  "Yogurt",
  "Cereal",
  "Pasta",
  "Rice",
  "Coffee",
  "Tea bags",
  "Toilet roll"
];

export const standardIngredientUnits = [
  "g",
  "kg",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "item",
  "can",
  "jar",
  "bottle",
  "pack",
  "clove",
  "slice",
  "bunch",
  "sprig",
  "pinch",
  "handful",
  "head",
  "stalk",
  "sheet"
];

const autoMealTypeTags = ["vegetarian", "chicken", "duck", "pork", "beef", "fish"];
const autoTimeTags = ["under 30 mins", "30-60 mins", "over 60 mins"];
const automaticTagSet = new Set([...autoMealTypeTags, ...autoTimeTags]);

const slotLabels: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack"
};

const unitAliases: Record<string, string> = {
  grams: "g",
  gram: "g",
  g: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "l",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  floz: "fl oz",
  "fl oz": "fl oz",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  pt: "pt",
  pts: "pt",
  pint: "pt",
  pints: "pt",
  qt: "qt",
  qts: "qt",
  quart: "qt",
  quarts: "qt",
  gal: "gal",
  gals: "gal",
  gallon: "gal",
  gallons: "gal",
  cup: "cup",
  cups: "cup",
  can: "can",
  cans: "can",
  tin: "can",
  tins: "can",
  pack: "pack",
  packs: "pack",
  packet: "pack",
  packets: "pack",
  clove: "clove",
  cloves: "clove",
  slice: "slice",
  slices: "slice",
  item: "item",
  items: "item",
  whole: "item",
  each: "item",
  ea: "item",
  piece: "item",
  pieces: "item",
  pc: "item",
  pcs: "item",
  jar: "jar",
  jars: "jar",
  bottle: "bottle",
  bottles: "bottle",
  bunch: "bunch",
  bunches: "bunch",
  sprig: "sprig",
  sprigs: "sprig",
  pinch: "pinch",
  pinches: "pinch",
  handful: "handful",
  handfuls: "handful",
  head: "head",
  heads: "head",
  stalk: "stalk",
  stalks: "stalk",
  sheet: "sheet",
  sheets: "sheet",
  fillet: "item",
  fillets: "item",
  bulb: "item",
  bulbs: "item"
};

const unitConversions: Record<string, { family: string; base: string; factor: number }> = {
  g: { family: "mass", base: "g", factor: 1 },
  kg: { family: "mass", base: "g", factor: 1000 },
  ml: { family: "volume", base: "ml", factor: 1 },
  l: { family: "volume", base: "ml", factor: 1000 },
  tsp: { family: "spoon", base: "tsp", factor: 1 },
  tbsp: { family: "spoon", base: "tsp", factor: 3 },
  oz: { family: "mass", base: "g", factor: 28.3495 },
  lb: { family: "mass", base: "g", factor: 453.592 },
  "fl oz": { family: "volume", base: "ml", factor: 28.4131 },
  pt: { family: "volume", base: "ml", factor: 568.261 },
  qt: { family: "volume", base: "ml", factor: 1136.52 },
  gal: { family: "volume", base: "ml", factor: 4546.09 },
  cup: { family: "volume", base: "ml", factor: 240 },
  can: { family: "count-can", base: "can", factor: 1 },
  jar: { family: "count-jar", base: "jar", factor: 1 },
  bottle: { family: "count-bottle", base: "bottle", factor: 1 },
  pack: { family: "count-pack", base: "pack", factor: 1 },
  clove: { family: "count-clove", base: "clove", factor: 1 },
  slice: { family: "count-slice", base: "slice", factor: 1 },
  bunch: { family: "count-bunch", base: "bunch", factor: 1 },
  sprig: { family: "count-sprig", base: "sprig", factor: 1 },
  pinch: { family: "count-pinch", base: "pinch", factor: 1 },
  handful: { family: "count-handful", base: "handful", factor: 1 },
  head: { family: "count-head", base: "head", factor: 1 },
  stalk: { family: "count-stalk", base: "stalk", factor: 1 },
  sheet: { family: "count-sheet", base: "sheet", factor: 1 },
  item: { family: "count-item", base: "item", factor: 1 }
};

const ingredientCleanupWords =
  /\b(sliced|fresh|large|small|medium|optional|roughly|finely|peeled|crushed|grated|drained|rinsed|cooked|uncooked|raw|extra|virgin|dried|freshly|toasted|halved|quartered|thinly|thickly|boneless|skinless)\b/g;

const ingredientRejectPatterns = [
  /\b(subscribe|newsletter|sign up|login|log in|register|cookie|privacy|terms|advert|advertisement|sponsored|affiliate|copyright|all rights reserved)\b/i,
  /\b(comment|comments|review|reviews|rating|ratings|share|pin|print|save|jump to|skip to|read more|video|author|posted|updated)\b/i,
  /\b(calories|kcal|nutrition|nutritional|protein|carbohydrate|carbohydrates|fat|saturated|fibre|fiber|sodium|cholesterol)\b/i,
  /^(method|instructions|directions|preparation|prep|cook|total|notes|equipment|ingredients|serves|servings|yield)\b/i,
  /^(home|recipes|shop|menu|search|contact|about|privacy policy|terms of use)$/i
];

const ingredientValidationFoodWords =
  /\b(onion|garlic|tomato|tomatoes|potato|potatoes|carrot|pepper|peppers|lemon|lime|apple|banana|mushroom|broccoli|courgette|zucchini|avocado|ginger|herb|coriander|cilantro|parsley|basil|chicken|duck|beef|pork|fish|salmon|tuna|cod|haddock|trout|prawn|prawns|shrimp|bacon|sausage|egg|eggs|milk|cheese|yogurt|yoghurt|butter|cream|rice|pasta|flour|sugar|oil|vinegar|beans|lentils|stock|broth|oats|cereal|noodle|soy|honey|salt|pepper|paprika|cumin|cinnamon|oregano|thyme|chilli|chili|curry|bread|wrap|tortilla|peas|spinach|lettuce|cucumber|celery|chorizo|parmesan|cheddar|mozzarella)\b/i;

const ingredientAliasRules: Array<{
  canonicalName: string;
  patterns: RegExp[];
  preserve?: RegExp;
  possibleMerge?: {
    aliasName: string;
    canonicalName: string;
    label: string;
    warning: string;
  };
}> = [
  {
    canonicalName: "spring onion",
    patterns: [/\b(spring onion|spring onions|scallion|scallions)\b/],
    possibleMerge: {
      aliasName: "spring onion",
      canonicalName: "onion",
      label: "Merge with onion",
      warning: "Spring onions are kept separate from onions. Merge if you usually buy them together."
    }
  },
  { canonicalName: "red onion", patterns: [/\b(red onion|red onions)\b/] },
  { canonicalName: "white onion", patterns: [/\b(white onion|white onions)\b/] },
  { canonicalName: "onion", patterns: [/\b(brown onion|brown onions|yellow onion|yellow onions|onion|onions)\b/] },
  { canonicalName: "garlic", patterns: [/\b(garlic clove|garlic cloves|garlic|garlic bulb|garlic bulbs)\b/] },
  { canonicalName: "chicken breast", patterns: [/\b(chicken breast|chicken breasts)\b/] },
  { canonicalName: "chicken thigh", patterns: [/\b(chicken thigh|chicken thighs)\b/] },
  { canonicalName: "duck breast", patterns: [/\b(duck breast|duck breasts)\b/] },
  { canonicalName: "beef mince", patterns: [/\b(beef mince|minced beef|ground beef)\b/] },
  { canonicalName: "pork mince", patterns: [/\b(pork mince|minced pork|ground pork)\b/] },
  { canonicalName: "sweet potato", patterns: [/\b(sweet potato|sweet potatoes)\b/] },
  { canonicalName: "new potato", patterns: [/\b(new potato|new potatoes)\b/] },
  { canonicalName: "baby potato", patterns: [/\b(baby potato|baby potatoes)\b/] },
  { canonicalName: "potato", patterns: [/\b(potato|potatoes)\b/] },
  { canonicalName: "chopped tomatoes", patterns: [/\b(chopped tomatoes|diced tomatoes|tinned tomatoes|canned tomatoes|tin of tomatoes|can of tomatoes)\b/] },
  { canonicalName: "cherry tomatoes", patterns: [/\b(cherry tomatoes)\b/] },
  { canonicalName: "tomato puree", patterns: [/\b(tomato puree|tomato purée|tomato paste)\b/] },
  { canonicalName: "tomato", patterns: [/\b(tomato|tomatoes|plum tomatoes)\b/] },
  { canonicalName: "red pepper", patterns: [/\b(red pepper|red peppers)\b/] },
  { canonicalName: "yellow pepper", patterns: [/\b(yellow pepper|yellow peppers)\b/] },
  { canonicalName: "green pepper", patterns: [/\b(green pepper|green peppers)\b/] },
  { canonicalName: "pepper", patterns: [/\b(bell pepper|bell peppers|pepper|peppers)\b/] },
  { canonicalName: "carrot", patterns: [/\b(carrot|carrots)\b/] },
  { canonicalName: "mushroom", patterns: [/\b(mushroom|mushrooms)\b/] },
  { canonicalName: "lemon", patterns: [/\b(lemon|lemons)\b/] },
  { canonicalName: "lime", patterns: [/\b(lime|limes)\b/] },
  { canonicalName: "egg noodles", patterns: [/\b(egg noodle|egg noodles)\b/] },
  { canonicalName: "egg", patterns: [/\b(egg|eggs)\b/] },
  { canonicalName: "coconut milk", patterns: [/\b(coconut milk)\b/] },
  { canonicalName: "oat milk", patterns: [/\b(oat milk)\b/] },
  { canonicalName: "almond milk", patterns: [/\b(almond milk)\b/] },
  { canonicalName: "semi skimmed milk", patterns: [/\b(semi skimmed milk|semi-skimmed milk)\b/] },
  { canonicalName: "whole milk", patterns: [/\b(whole milk)\b/] },
  { canonicalName: "skimmed milk", patterns: [/\b(skimmed milk)\b/] },
  { canonicalName: "milk", patterns: [/\b(milk)\b/] },
  { canonicalName: "unsalted butter", patterns: [/\b(unsalted butter)\b/] },
  { canonicalName: "salted butter", patterns: [/\b(salted butter)\b/] },
  { canonicalName: "butter", patterns: [/\b(butter)\b/] },
  { canonicalName: "yoghurt", patterns: [/\b(yogurt|yoghurt)\b/] },
  { canonicalName: "cheddar", patterns: [/\b(cheddar|cheddar cheese)\b/] },
  { canonicalName: "parmesan", patterns: [/\b(parmesan|parmesan cheese)\b/] },
  { canonicalName: "mozzarella", patterns: [/\b(mozzarella|mozzarella cheese)\b/] },
  { canonicalName: "olive oil", patterns: [/\b(olive oil|extra virgin olive oil)\b/] },
  { canonicalName: "vegetable oil", patterns: [/\b(vegetable oil|sunflower oil|rapeseed oil)\b/] },
  { canonicalName: "plain flour", patterns: [/\b(plain flour|all purpose flour|all-purpose flour)\b/] },
  { canonicalName: "self-raising flour", patterns: [/\b(self raising flour|self-raising flour)\b/] },
  { canonicalName: "caster sugar", patterns: [/\b(caster sugar|superfine sugar)\b/] },
  { canonicalName: "puff pastry", patterns: [/\b(puff pastry|ready rolled puff pastry|ready-rolled puff pastry)\b/] },
  { canonicalName: "flat rice noodles", patterns: [/\b(flat rice noodle|flat rice noodles)\b/] },
  { canonicalName: "rice noodles", patterns: [/\b(rice noodle|rice noodles)\b/] },
  { canonicalName: "udon noodles", patterns: [/\b(udon noodle|udon noodles)\b/] },
  { canonicalName: "noodles", patterns: [/\b(noodle|noodles)\b/] },
  { canonicalName: "basmati rice", patterns: [/\b(basmati rice)\b/] },
  { canonicalName: "long grain rice", patterns: [/\b(long grain rice)\b/] },
  { canonicalName: "jasmine rice", patterns: [/\b(jasmine rice)\b/] },
  { canonicalName: "rice", patterns: [/\b(rice)\b/] },
  { canonicalName: "tortelloni", patterns: [/\b(tortelloni|tortellini)\b/] },
  { canonicalName: "spaghetti", patterns: [/\b(spaghetti)\b/] },
  { canonicalName: "penne", patterns: [/\b(penne)\b/] },
  { canonicalName: "fusilli", patterns: [/\b(fusilli)\b/] },
  { canonicalName: "tagliatelle", patterns: [/\b(tagliatelle)\b/] },
  { canonicalName: "linguine", patterns: [/\b(linguine)\b/] },
  { canonicalName: "pasta", patterns: [/\b(pasta)\b/] },
  { canonicalName: "light soy sauce", patterns: [/\b(light soy sauce)\b/] },
  { canonicalName: "dark soy sauce", patterns: [/\b(dark soy sauce)\b/] },
  { canonicalName: "soy sauce", patterns: [/\b(soy sauce)\b/] },
  { canonicalName: "vegetable stock", patterns: [/\b(vegetable stock|vegetable stock cube|vegetable stock cubes)\b/] },
  { canonicalName: "chicken stock", patterns: [/\b(chicken stock|chicken stock cube|chicken stock cubes)\b/] },
  { canonicalName: "beef stock", patterns: [/\b(beef stock|beef stock cube|beef stock cubes)\b/] },
  { canonicalName: "stock", patterns: [/\b(stock cube|stock cubes|stock)\b/] }
];

export function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function labelMealSlot(slot: MealSlot) {
  return slotLabels[slot];
}

export function normalizeMealTypes(mealTypes?: MealSlot[], fallback: MealSlot = "dinner") {
  const normalized = (mealTypes ?? []).filter((slot): slot is MealSlot => mealSlotSet.has(slot));
  const unique = normalized.filter((slot, index, slots) => slots.indexOf(slot) === index);
  return unique.length > 0 ? unique : [fallback];
}

export function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function weekDates(weekStart: string) {
  const start = new Date(`${weekStart}T12:00:00`);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function normalizeIngredientName(name: string) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[,.;:]/g, "")
    .replace(ingredientCleanupWords, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIngredientAliasKey(name: string) {
  return normalizeIngredientName(name)
    .replace(/\b(and|or|with|for|to taste)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeIngredientName(
  name: string,
  customAliases: Record<string, string> = {}
): {
  canonicalName: string;
  normalizedName: string;
  mergeWarning?: string;
  mergeSuggestion?: ShoppingListItem["mergeSuggestion"];
} {
  const normalizedName = normalizeIngredientAliasKey(name);
  if (!normalizedName) return { canonicalName: "other", normalizedName };

  const customCanonical = customAliases[normalizedName] ?? customAliases[singularizeIngredientName(normalizedName)];
  if (customCanonical) {
    return {
      canonicalName: normalizeIngredientAliasKey(customCanonical) || normalizedName,
      normalizedName
    };
  }

  for (const rule of ingredientAliasRules) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedName))) {
      return {
        canonicalName: rule.canonicalName,
        normalizedName,
        mergeWarning: rule.possibleMerge?.warning,
        mergeSuggestion: rule.possibleMerge
      };
    }
  }

  return {
    canonicalName: singularizeIngredientName(normalizedName),
    normalizedName
  };
}

function singularizeIngredientName(name: string) {
  const preservedPhrases: Record<string, string> = {
    "__chopped_tomatoes__": "chopped tomatoes",
    "__cherry_tomatoes__": "cherry tomatoes",
    "__tinned_tomatoes__": "tinned tomatoes",
    "__canned_tomatoes__": "canned tomatoes",
    "__flat_rice_noodles__": "flat rice noodles",
    "__rice_noodles__": "rice noodles",
    "__egg_noodles__": "egg noodles",
    "__udon_noodles__": "udon noodles"
  };

  let normalized = name;
  Object.values(preservedPhrases).forEach((phrase, index) => {
    normalized = normalized.replace(new RegExp(`\\b${phrase}\\b`, "g"), Object.keys(preservedPhrases)[index]);
  });

  const singularized = normalized
    .replace(/\b(tomatoes)\b/g, "tomato")
    .replace(/\b(potatoes)\b/g, "potato")
    .replace(/\b(leaves)\b/g, "leaf")
    .replace(/\b(cloves)\b/g, "clove")
    .replace(/\b([a-z]{4,})s\b/g, "$1")
    .trim();

  return Object.entries(preservedPhrases).reduce((value, [token, phrase]) => value.replace(new RegExp(token, "g"), phrase), singularized);
}

export function validateIngredientLine(line: string, strict = false) {
  const cleaned = line.replace(/^[-*•]\s*/, "").trim();
  const reasons: string[] = [];

  if (!cleaned) reasons.push("Blank line");
  if (cleaned.length > 170) reasons.push("Too long to be a normal ingredient line");
  if (!/[a-zA-Z]/.test(cleaned)) reasons.push("No ingredient name found");
  if (ingredientRejectPatterns.some((pattern) => pattern.test(cleaned))) reasons.push("Looks like page text rather than an ingredient");
  if (/^[A-Z\s]{3,}$/.test(cleaned) && cleaned.split(/\s+/).length <= 4) reasons.push("Looks like a heading");

  const hasQuantityOrUnit = /^[-*•]?\s*(\d|[¼½¾⅓⅔⅛⅜⅝⅞])/.test(cleaned) || new RegExp(`\\b(${Object.keys(unitAliases).join("|")})\\b`, "i").test(cleaned);
  const hasFoodWord = ingredientValidationFoodWords.test(cleaned);
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;

  if (strict && !hasQuantityOrUnit && !hasFoodWord) reasons.push("No clear food, quantity, or unit found");
  if (strict && wordCount > 14 && !hasQuantityOrUnit) reasons.push("Too wordy for a reliable ingredient");
  if (strict && /[.!?]$/.test(cleaned) && !hasQuantityOrUnit) reasons.push("Looks like a sentence");

  return {
    valid: reasons.length === 0,
    reasons
  };
}

export function isLikelyIngredientLine(line: string, strict = false) {
  return validateIngredientLine(line, strict).valid;
}

export function normalizeUnit(unit?: string) {
  if (!unit) return "";
  const cleaned = unit.toLowerCase().replace(/[.]/g, "").trim();
  return unitAliases[cleaned] ?? cleaned;
}

export function standardizeIngredientQuantity(quantity?: number, unit?: string) {
  const normalizedUnit = normalizeUnit(unit);
  if (typeof quantity !== "number") return { quantity, unit: normalizedUnit };

  const metricConversions: Record<string, { factor: number; unit: "g" | "ml" }> = {
    oz: { factor: 28.3495, unit: "g" },
    lb: { factor: 453.592, unit: "g" },
    "fl oz": { factor: 28.4131, unit: "ml" },
    pt: { factor: 568.261, unit: "ml" },
    qt: { factor: 1136.52, unit: "ml" },
    gal: { factor: 4546.09, unit: "ml" },
    cup: { factor: 240, unit: "ml" }
  };
  const conversion = metricConversions[normalizedUnit];
  if (!conversion) return { quantity, unit: normalizedUnit };

  const convertedQuantity = quantity * conversion.factor;
  return {
    quantity: Math.round(convertedQuantity * 10) / 10,
    unit: conversion.unit
  };
}

function readLeadingQuantity(value: string) {
  const match = value.match(/^((?:\d+(?:\.\d+)?)|(?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(.*)$/);
  if (!match) return { quantity: undefined, rest: value.trim() };
  return {
    quantity: parseQuantity(match[1]),
    rest: match[2].trim()
  };
}

function splitIngredientUnit(rest: string, hasQuantity: boolean) {
  const words = rest.split(/\s+/).filter(Boolean);
  if (!hasQuantity || words.length < 2) return { unit: "", name: rest };

  const twoWordCandidate = words.slice(0, 2).join(" ").toLowerCase().replace(/[.]/g, "");
  const oneWordCandidate = words[0].toLowerCase().replace(/[.]/g, "");

  if (unitAliases[twoWordCandidate]) {
    return {
      unit: normalizeUnit(twoWordCandidate),
      name: words.slice(2).join(" ").trim()
    };
  }

  if (unitAliases[oneWordCandidate]) {
    return {
      unit: normalizeUnit(oneWordCandidate),
      name: words.slice(1).join(" ").trim()
    };
  }

  return { unit: "", name: rest };
}

export function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
}

export function isAutomaticRecipeTag(tag: string) {
  return automaticTagSet.has(tag.trim().toLowerCase());
}

export function normalizeSuppressedAutomaticTags(tags?: string[]) {
  return (tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => automaticTagSet.has(tag))
    .filter((tag, index, allTags) => allTags.indexOf(tag) === index);
}

export function cleanOcrRecipeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, "\n")
    .replace(/\b(?:l|I)\s*(?:tbsp|tsp|cup|cups|g|kg|ml|l)\b/gi, (match) => match.replace(/^(?:l|I)/i, "1"))
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function draftFromOcrText(text: string, fileName = "Recipe book import") {
  const cleanedText = cleanOcrRecipeText(text);
  const draft = parseRecipeText(cleanedText, "photo");
  const warnings = [...draft.warnings];

  if (cleanedText.length < 120) {
    warnings.push("Only a small amount of text was found. Retake the photo or try the free online OCR fallback.");
  }

  if (draft.ingredients.length < 2) {
    warnings.push("Ingredient extraction looks incomplete. Review against the photo before saving.");
  }

  return {
    ...draft,
    title: draft.title === "Imported recipe" ? fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") : draft.title,
    tags: Array.from(new Set([...draft.tags, "photo import"])),
    rawText: cleanedText,
    warnings: Array.from(new Set([...warnings, "Nothing has been saved to the recipe library yet."]))
  };
}

export function inferAutomaticRecipeTags(recipe: Pick<Recipe, "title" | "ingredients" | "prepMinutes" | "cookMinutes">) {
  const text = `${recipe.title} ${recipe.ingredients.map((ingredient) => ingredient.name).join(" ")}`.toLowerCase();
  const tags: string[] = [];

  if (/\b(chicken|hen|turkey)\b/.test(text)) tags.push("chicken");
  if (/\b(duck|duck breast|duck legs)\b/.test(text)) tags.push("duck");
  if (/\b(pork|bacon|ham|gammon|chorizo|prosciutto|salami)\b/.test(text)) tags.push("pork");
  if (/\b(beef|steak|mince|brisket|burger)\b/.test(text)) tags.push("beef");
  if (/\b(fish|salmon|tuna|cod|haddock|trout|prawn|prawns|shrimp|mackerel|sardine|seabass|sea bass)\b/.test(text)) {
    tags.push("fish");
  }

  if (!tags.length) tags.push("vegetarian");

  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  if (totalMinutes > 0 && totalMinutes < 30) tags.push("under 30 mins");
  if (totalMinutes >= 30 && totalMinutes <= 60) tags.push("30-60 mins");
  if (totalMinutes > 60) tags.push("over 60 mins");

  return tags;
}

export function mergeAutomaticRecipeTags(
  manualTags: string[],
  recipe: Pick<Recipe, "title" | "ingredients" | "prepMinutes" | "cookMinutes">,
  suppressedAutoTags: string[] = []
) {
  const suppressed = new Set(normalizeSuppressedAutomaticTags(suppressedAutoTags));
  const manual = manualTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean).filter((tag) => !suppressed.has(tag));
  const withoutOldAutoTags = manual.filter((tag) => !automaticTagSet.has(tag));
  const inferred = inferAutomaticRecipeTags(recipe).filter((tag) => !suppressed.has(tag));
  const merged = [...withoutOldAutoTags, ...inferred];
  return merged.filter((tag, index, tags) => tags.indexOf(tag) === index);
}

export function inferRecipeMealTypes(recipe: Pick<Recipe, "title" | "tags" | "ingredients">) {
  const text = [recipe.title, ...recipe.tags, ...recipe.ingredients.map((ingredient) => ingredient.name)].join(" ").toLowerCase();
  const inferred: MealSlot[] = [];

  if (/\b(breakfast|brunch|oats|porridge|cereal|pancake|pancakes|granola|toast|smoothie|omelette|yoghurt|yogurt)\b/.test(text)) {
    inferred.push("breakfast");
  }

  if (/\b(lunch|sandwich|wrap|salad|soup|leftover|packed lunch|lunchbox)\b/.test(text)) {
    inferred.push("lunch");
  }

  if (/\b(snack|snacks|bites|dip|muffin|cookies|cookie|bar|bars)\b/.test(text)) {
    inferred.push("snack");
  }

  if (/\b(dinner|tea|supper|roast|traybake|curry|pasta|stir fry|stir-fry|tacos|chilli|chili|stew|risotto)\b/.test(text)) {
    inferred.push("dinner");
  }

  return normalizeMealTypes(inferred, "dinner");
}

export function totalRecipeMinutes(recipe: Pick<Recipe, "prepMinutes" | "cookMinutes">) {
  return (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
}

export function inferCategory(name: string): GroceryCategory {
  const normal = normalizeIngredientName(name);
  const canonical = canonicalizeIngredientName(name).canonicalName;
  const searchable = `${normal} ${canonical}`;

  if (/\b(chicken|duck|beef|pork|fish|salmon|tuna|prawn|shrimp|turkey|bacon|sausage|lamb|ham|steak|mince)\b/.test(searchable)) {
    return "Meat & Fish";
  }

  if (/\b(coconut milk|egg noodles?)\b/.test(searchable)) {
    return "Pantry";
  }

  if (/\b(milk|cheese|yogurt|yoghurt|butter|cream|egg|parmesan|cheddar|mozzarella|custard)\b/.test(searchable)) {
    return "Dairy & Eggs";
  }

  if (/\b(bread|bagel|wrap|tortilla|bun|bread rolls?|pitta|pita|crumpet|croissant|muffin|cake|bap)\b/.test(searchable)) {
    return "Bakery";
  }

  if (/\b(peas|frozen spinach|frozen|ice cream)\b/.test(searchable)) {
    return "Frozen";
  }

  if (/\b(salt|black pepper|white pepper|peppercorn|paprika|cumin|cinnamon|oregano|basil|thyme|chilli|chili|curry|spice)\b/.test(searchable)) {
    return "Spices";
  }

  if (/\b(chopped tomatoes|tinned tomatoes|canned tomatoes|tin of tomatoes|can of tomatoes|tomato puree|tomato purée|tomato paste|passata)\b/.test(searchable)) {
    return "Pantry";
  }

  if (
    /\b(onion|garlic|tomato|pepper|carrot|potato|lettuce|lemon|lime|apple|banana|mushroom|broccoli|courgette|zucchini|avocado|herb|coriander|cilantro|parsley|ginger|orange|pear|grape|berry|berries|cucumber|celery|leek|cabbage|cauliflower|sweetcorn|aubergine|eggplant|squash)\b/.test(
      searchable
    )
  ) {
    return "Produce";
  }

  if (/\b(rice|pasta|flour|sugar|oil|vinegar|bean|lentil|stock|broth|oat|cereal|noodle|soy sauce|honey|coffee|tea bags?|biscuit|cracker|ketchup|mayonnaise|mustard|jam|peanut butter)\b/.test(searchable)) {
    return "Pantry";
  }

  return "Other";
}

export function parseQuantity(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const unicodeFractions: Record<string, number> = {
    "¼": 0.25,
    "½": 0.5,
    "¾": 0.75,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875
  };

  if (unicodeFractions[trimmed]) return unicodeFractions[trimmed];

  const mixed = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }

  const fraction = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    return Number(fraction[1]) / Number(fraction[2]);
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function parseIngredientLine(line: string, options: { strict?: boolean } = {}): Ingredient {
  const cleaned = line.replace(/^[-*•]\s*/, "").trim();
  const parsedQuantity = readLeadingQuantity(cleaned);
  const parsedUnit = splitIngredientUnit(parsedQuantity.rest, typeof parsedQuantity.quantity === "number");
  const quantity = parsedQuantity.quantity;
  const unit = parsedUnit.unit;
  const name = parsedUnit.name || parsedQuantity.rest || cleaned;
  const validation = validateIngredientLine(cleaned, options.strict);
  const canonical = canonicalizeIngredientName(name);
  const confidence =
    validation.valid && quantity && name.length > 2
      ? "high"
      : validation.valid && (quantity || ingredientValidationFoodWords.test(name))
        ? "medium"
        : "low";

  return {
    id: createId("ing"),
    name,
    quantity,
    unit,
    category: inferCategory(name),
    canonicalName: canonical.canonicalName,
    originalLine: cleaned,
    confidence,
    needsReview: confidence !== "high" || !validation.valid
  };
}

export function parseRecipeText(text: string, importedFrom: ImportDraft["importedFrom"], sourceUrl?: string): ImportDraft {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lowerLines = lines.map((line) => line.toLowerCase());
  const title =
    lines.find((line) => !/^(ingredients|method|directions|instructions|serves|servings)/i.test(line)) ||
    "Imported recipe";
  const servingsMatch = text.match(/\b(?:serves|servings)\s*:?\s*(\d+)/i);
  const servings = servingsMatch ? Number(servingsMatch[1]) : 4;
  const ingredientStart = lowerLines.findIndex((line) => /^ingredients:?$/.test(line));
  const methodStart = lowerLines.findIndex((line) => /^(method|directions|instructions):?$/.test(line));
  const ingredientLines =
    ingredientStart >= 0
      ? lines.slice(ingredientStart + 1, methodStart > ingredientStart ? methodStart : undefined)
      : lines.filter((line) => /^[-*•]?\s*(\d|[¼½¾⅓⅔⅛⅜⅝⅞])/.test(line)).slice(0, 18);
  const methodLines =
    methodStart >= 0
      ? lines.slice(methodStart + 1)
      : lines.filter((line) => /^\d+[.)]\s+/.test(line)).map((line) => line.replace(/^\d+[.)]\s+/, ""));
  const ingredients = ingredientLines
    .filter((line) => isLikelyIngredientLine(line, importedFrom === "url"))
    .map((line) => parseIngredientLine(line, { strict: importedFrom === "url" }))
    .filter((ingredient) => ingredient.name.length > 1);
  const warnings: string[] = [];

  if (!servingsMatch) warnings.push("Servings were not found, so the draft defaults to 4.");
  if (ingredients.length === 0) warnings.push("No clear ingredient list was detected. Add ingredients before saving.");
  if (ingredients.some((ingredient) => ingredient.confidence === "low" || ingredient.needsReview)) {
    warnings.push("Some ingredient quantities or units need review.");
  }

  return {
    id: createId("draft"),
    title,
    servings,
    mealTypes: inferRecipeMealTypes({ title, tags: [], ingredients }),
    tags: [],
    ingredients,
    instructions: methodLines.length > 0 ? methodLines : ["Add cooking instructions."],
    source: sourceUrl,
    sourceUrl,
    suppressedAutoTags: [],
    warnings,
    importedFrom
  };
}

export function draftToRecipe(draft: ImportDraft): Recipe {
  const now = new Date().toISOString();

  return {
    id: createId("recipe"),
    title: draft.title.trim() || "Untitled recipe",
    servings: Math.max(1, Number(draft.servings) || 4),
    mealTypes: normalizeMealTypes(draft.mealTypes),
    prepMinutes: draft.prepMinutes,
    cookMinutes: draft.cookMinutes,
    tags: draft.tags,
    favorite: false,
    ingredients: draft.ingredients.map((ingredient) => ({
      ...ingredient,
      id: ingredient.id || createId("ing"),
      category: ingredient.category || inferCategory(ingredient.name),
      canonicalName: ingredient.canonicalName || canonicalizeIngredientName(ingredient.name).canonicalName,
      needsReview: ingredient.needsReview ?? ingredient.confidence === "low"
    })),
    instructions: draft.instructions.filter(Boolean),
    source: draft.source?.trim() || draft.sourceUrl,
    sourceUrl: draft.sourceUrl,
    photoDataUrl: draft.photoDataUrl,
    mealImageUrl: draft.mealImageUrl,
    suppressedAutoTags: normalizeSuppressedAutomaticTags(draft.suppressedAutoTags),
    importedFrom: draft.importedFrom,
    createdAt: now,
    updatedAt: now
  };
}

export function recipeToDraft(recipe: Recipe): ImportDraft {
  return {
    id: createId("draft"),
    title: recipe.title,
    servings: recipe.servings,
    mealTypes: normalizeMealTypes(recipe.mealTypes, inferRecipeMealTypes(recipe)[0]),
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    tags: recipe.tags,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, id: createId("ing") })),
    instructions: [...recipe.instructions],
    source: recipe.source ?? recipe.sourceUrl,
    sourceUrl: recipe.sourceUrl,
    photoDataUrl: recipe.photoDataUrl,
    mealImageUrl: recipe.mealImageUrl,
    suppressedAutoTags: normalizeSuppressedAutomaticTags(recipe.suppressedAutoTags),
    warnings: [],
    importedFrom: recipe.importedFrom ?? "manual"
  };
}

function scaleIngredient(ingredient: Ingredient, factor: number) {
  return {
    ...ingredient,
    quantity: typeof ingredient.quantity === "number" ? ingredient.quantity * factor : undefined,
    unit: normalizeUnit(ingredient.unit)
  };
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) return `${value}`;
  if (value < 10) return `${Math.round(value * 10) / 10}`;
  return `${Math.round(value)}`;
}

function displayQuantity(quantity?: number, unit?: string) {
  if (typeof quantity !== "number") return unit ? unit : "";
  const normalUnit = normalizeUnit(unit);

  if (normalUnit === "tsp") {
    return Math.abs(quantity % 3) < 0.001 ? `${formatNumber(quantity / 3)} tbsp` : `${formatNumber(quantity)} tsp`;
  }

  if (normalUnit === "g" && quantity >= 1000) {
    return `${formatNumber(quantity / 1000)} kg`;
  }

  if (normalUnit === "ml" && quantity >= 1000) {
    return `${formatNumber(quantity / 1000)} l`;
  }

  return `${formatNumber(quantity)}${normalUnit ? ` ${normalUnit}` : ""}`;
}

function conversionNote(originalQuantity?: number, originalUnit?: string, convertedQuantity?: number, convertedUnit?: string) {
  if (typeof originalQuantity !== "number" || typeof convertedQuantity !== "number") return "";
  const unit = normalizeUnit(originalUnit);
  if (!unit || ["g", "kg", "ml", "l", "tsp", "tbsp"].includes(unit)) return "";
  const converted = displayQuantity(convertedQuantity, convertedUnit);
  const original = displayQuantity(originalQuantity, unit);
  return `${original} converted to ${converted}`;
}

function isStaple(name: string, staples: string[]) {
  const normalName = normalizeIngredientName(name);
  return staples.some((staple) => normalName.includes(normalizeIngredientName(staple)));
}

export function generateShoppingList(
  recipes: Recipe[],
  plannedMeals: PlannedMeal[],
  settings: AppSettings,
  shoppingChecks: Record<string, boolean>,
  hiddenShoppingItems: Record<string, boolean>,
  manualItems: ShoppingListItem[]
) {
  type Bucket = {
    key: string;
    mergeKey: string;
    splitGroupKey?: string;
    name: string;
    canonicalName: string;
    category: GroceryCategory;
    unitFamily?: string;
    baseUnit?: string;
    quantity?: number;
    sourceCount: number;
    sourceMeals: Set<string>;
    sourceRecipeIds: Set<string>;
    sourceIngredients: Set<string>;
    conversionNotes: Set<string>;
    mergeWarnings: Set<string>;
    mergeSuggestion?: ShoppingListItem["mergeSuggestion"];
    canSplitMerge?: boolean;
    splitFromConsolidation?: boolean;
    incompatible?: boolean;
    staple: boolean;
  };

  const buckets = new Map<string, Bucket>();

  plannedMeals.forEach((meal) => {
    if (!meal.recipeId) return;
    const recipe = recipes.find((item) => item.id === meal.recipeId);
    if (!recipe) return;
    if (meal.peopleCount <= 0) return;
    const plannedRecipe = recipe;

    const factor = meal.peopleCount / Math.max(1, plannedRecipe.servings);
    plannedRecipe.ingredients.forEach((ingredient) => {
      const scaled = scaleIngredient(ingredient, factor);
      const savedShoppingName = scaled.canonicalName ? singularizeIngredientName(normalizeIngredientAliasKey(scaled.canonicalName)) : "";
      const canonical = savedShoppingName
        ? { canonicalName: savedShoppingName, normalizedName: savedShoppingName }
        : canonicalizeIngredientName(scaled.name, settings.ingredientAliases ?? {});
      const nameKey = canonical.canonicalName;
      const normalizedUnit = normalizeUnit(scaled.unit);
      const conversion = scaled.unit ? unitConversions[normalizedUnit] : undefined;
      const quantity = typeof scaled.quantity === "number" && conversion ? scaled.quantity * conversion.factor : scaled.quantity;
      const family = conversion?.family ?? (scaled.unit ? `raw-${scaled.unit}` : "no-unit");
      const baseUnit = conversion?.base ?? scaled.unit ?? "";
      const staple = isStaple(scaled.name, settings.stapleIngredients);
      const note = conversionNote(scaled.quantity, normalizedUnit, quantity, baseUnit);

      if (staple && !settings.includeStaples) return;

      const mergeKey = `${nameKey}::${family}`;
      const key = mergeKey;
      const existing = buckets.get(key);

      function addSourceToBucket(bucket: Bucket) {
        bucket.sourceCount += 1;
        bucket.sourceMeals.add(plannedRecipe.title);
        bucket.sourceRecipeIds.add(plannedRecipe.id);
        bucket.sourceIngredients.add(scaled.name);
        if (note) bucket.conversionNotes.add(note);
      }

      if (existing && typeof existing.quantity === "number" && typeof quantity === "number") {
        existing.quantity += quantity;
        addSourceToBucket(existing);
      } else if (existing && typeof existing.quantity !== "number" && typeof quantity !== "number") {
        addSourceToBucket(existing);
      } else if (!existing) {
        buckets.set(key, {
          key,
          mergeKey,
          name: nameKey || scaled.name,
          canonicalName: nameKey,
          category: scaled.category,
          unitFamily: family,
          baseUnit,
          quantity,
          sourceCount: 1,
          sourceMeals: new Set([plannedRecipe.title]),
          sourceRecipeIds: new Set([plannedRecipe.id]),
          sourceIngredients: new Set([scaled.name]),
          conversionNotes: new Set(note ? [note] : []),
          mergeWarnings: new Set(),
          staple
        });
      } else {
        const separateKey = `${key}::${meal.id}`;
        buckets.set(separateKey, {
          key: separateKey,
          mergeKey,
          name: nameKey || scaled.name,
          canonicalName: nameKey,
          category: scaled.category,
          unitFamily: family,
          baseUnit,
          quantity,
          sourceCount: 1,
          sourceMeals: new Set([plannedRecipe.title]),
          sourceRecipeIds: new Set([plannedRecipe.id]),
          sourceIngredients: new Set([scaled.name]),
          conversionNotes: new Set(note ? [note] : []),
          mergeWarnings: new Set(["This ingredient has another quantity or unit that could not be combined safely."]),
          incompatible: true,
          staple
        });
      }
    });
  });

  const generated = Array.from(buckets.values()).map<ShoppingListItem>((bucket) => {
    const id = `shop_${bucket.key}`;
    return {
      id,
      mergeKey: bucket.mergeKey,
      splitGroupKey: bucket.splitGroupKey,
      name: bucket.name,
      canonicalName: bucket.canonicalName,
      quantity: bucket.quantity,
      unit: bucket.baseUnit,
      displayQuantity: displayQuantity(bucket.quantity, bucket.baseUnit),
      category: bucket.category,
      sourceMeals: Array.from(bucket.sourceMeals),
      sourceRecipeIds: Array.from(bucket.sourceRecipeIds),
      sourceIngredients: Array.from(bucket.sourceIngredients),
      conversionNotes: Array.from(bucket.conversionNotes),
      mergeWarnings: Array.from(bucket.mergeWarnings),
      mergeSuggestion: undefined,
      canSplitMerge: false,
      splitFromConsolidation: bucket.splitFromConsolidation,
      canRestoreMerge: false,
      checked: shoppingChecks[id] ?? false,
      staple: bucket.staple,
      incompatible: bucket.incompatible
    };
  });

  return [...generated.filter((item) => !hiddenShoppingItems[item.id]), ...manualItems].sort((a, b) => {
    const categorySort = groceryCategories.indexOf(a.category) - groceryCategories.indexOf(b.category);
    return categorySort || a.name.localeCompare(b.name);
  });
}

export function seedState(): AppState {
  const todayStart = formatDateKey(startOfWeek(new Date()));
  const days = weekDates(todayStart).map(formatDateKey);
  const now = new Date().toISOString();
  const recipes: Recipe[] = [
    {
      id: "recipe_lentil_ragu",
      title: "Lentil ragu with pasta",
      servings: 4,
      mealTypes: ["dinner"],
      prepMinutes: 10,
      cookMinutes: 35,
      tags: ["vegetarian", "batch cook"],
      favorite: true,
      ingredients: [
        { id: "ing_1", name: "red onion", quantity: 1, unit: "item", category: "Produce", confidence: "high" },
        { id: "ing_2", name: "carrots", quantity: 2, unit: "item", category: "Produce", confidence: "high" },
        { id: "ing_3", name: "dried lentils", quantity: 250, unit: "g", category: "Pantry", confidence: "high" },
        { id: "ing_4", name: "chopped tomatoes", quantity: 2, unit: "can", category: "Pantry", confidence: "high" },
        { id: "ing_5", name: "pasta", quantity: 400, unit: "g", category: "Pantry", confidence: "high" },
        { id: "ing_6", name: "olive oil", quantity: 1, unit: "tbsp", category: "Pantry", confidence: "high" }
      ],
      instructions: ["Soften onion and carrot.", "Add lentils and tomatoes, then simmer.", "Cook pasta and serve with the ragu."],
      importedFrom: "manual",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "recipe_traybake",
      title: "Lemon chicken traybake",
      servings: 4,
      mealTypes: ["dinner"],
      prepMinutes: 15,
      cookMinutes: 45,
      tags: ["family", "low effort"],
      favorite: false,
      ingredients: [
        { id: "ing_7", name: "chicken thighs", quantity: 8, unit: "item", category: "Meat & Fish", confidence: "high" },
        { id: "ing_8", name: "potatoes", quantity: 800, unit: "g", category: "Produce", confidence: "high" },
        { id: "ing_9", name: "lemon", quantity: 1, unit: "item", category: "Produce", confidence: "high" },
        { id: "ing_10", name: "garlic", quantity: 4, unit: "clove", category: "Produce", confidence: "high" },
        { id: "ing_11", name: "dried oregano", quantity: 2, unit: "tsp", category: "Spices", confidence: "high" }
      ],
      instructions: ["Toss everything on a tray.", "Roast until the chicken is cooked and the potatoes are crisp."],
      importedFrom: "manual",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "recipe_oats",
      title: "Apple cinnamon overnight oats",
      servings: 2,
      mealTypes: ["breakfast"],
      prepMinutes: 8,
      cookMinutes: 0,
      tags: ["breakfast", "make ahead"],
      favorite: true,
      ingredients: [
        { id: "ing_12", name: "oats", quantity: 120, unit: "g", category: "Pantry", confidence: "high" },
        { id: "ing_13", name: "milk", quantity: 300, unit: "ml", category: "Dairy & Eggs", confidence: "high" },
        { id: "ing_14", name: "apple", quantity: 1, unit: "item", category: "Produce", confidence: "high" },
        { id: "ing_15", name: "cinnamon", quantity: 1, unit: "tsp", category: "Spices", confidence: "high" }
      ],
      instructions: ["Mix oats, milk, grated apple, and cinnamon.", "Chill overnight."],
      importedFrom: "manual",
      createdAt: now,
      updatedAt: now
    }
  ];

  return {
    recipes,
    plannedMeals: [
      {
        id: "meal_1",
        date: days[0],
        slot: "dinner",
        recipeId: "recipe_lentil_ragu",
        peopleCount: 4,
        producesLeftovers: true,
        leftoverTargetDate: days[1]
      },
      {
        id: "meal_2",
        date: days[1],
        slot: "breakfast",
        recipeId: "recipe_oats",
        peopleCount: 2
      },
      {
        id: "meal_3",
        date: days[2],
        slot: "dinner",
        recipeId: "recipe_traybake",
        peopleCount: 5
      }
    ],
    dayNotes: {},
    shoppingChecks: {},
    hiddenShoppingItems: {},
    manualShoppingItems: [],
    asdaProductLinks: {},
    asdaShoppingStatus: {},
    settings: {
      householdName: "Home",
      defaultPeople: 4,
      hiddenSlots: [],
      stapleIngredients: ["salt", "black pepper", "olive oil", "plain flour", "sugar"],
      includeStaples: false,
      ingredientAliases: {},
      shoppingNameVariants: {},
      commonExtraItems: [...defaultCommonExtraItems],
      splitShoppingItems: {}
    }
  };
}
