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
  confidence?: "high" | "medium" | "low";
};

export type Recipe = {
  id: string;
  title: string;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  tags: string[];
  favorite: boolean;
  ingredients: Ingredient[];
  instructions: string[];
  sourceUrl?: string;
  photoDataUrl?: string;
  notes?: string;
  importedFrom?: "manual" | "paste" | "url" | "photo";
  createdAt: string;
  updatedAt: string;
};

export type PlannedMeal = {
  id: string;
  date: string;
  slot: MealSlot;
  recipeId: string;
  peopleCount: number;
  notes?: string;
  producesLeftovers?: boolean;
  leftoverTargetDate?: string;
};

export type ShoppingListItem = {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  displayQuantity: string;
  category: GroceryCategory;
  sourceMeals: string[];
  checked: boolean;
  manual?: boolean;
  staple?: boolean;
  incompatible?: boolean;
};

export type AppSettings = {
  householdName: string;
  defaultPeople: number;
  hiddenSlots: MealSlot[];
  stapleIngredients: string[];
  includeStaples: boolean;
};

export type ImportDraft = {
  id: string;
  title: string;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  tags: string[];
  ingredients: Ingredient[];
  instructions: string[];
  sourceUrl?: string;
  photoDataUrl?: string;
  warnings: string[];
  importedFrom: "manual" | "paste" | "url" | "photo";
};

export type AppState = {
  recipes: Recipe[];
  plannedMeals: PlannedMeal[];
  shoppingChecks: Record<string, boolean>;
  hiddenShoppingItems: Record<string, boolean>;
  manualShoppingItems: ShoppingListItem[];
  settings: AppSettings;
};

export const mealSlots: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

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

const autoMealTypeTags = ["vegetarian", "chicken", "pork", "beef", "fish"];
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
  whole: "item"
};

const unitConversions: Record<string, { family: string; base: string; factor: number }> = {
  g: { family: "mass", base: "g", factor: 1 },
  kg: { family: "mass", base: "g", factor: 1000 },
  ml: { family: "volume", base: "ml", factor: 1 },
  l: { family: "volume", base: "ml", factor: 1000 },
  tsp: { family: "spoon", base: "ml", factor: 5 },
  tbsp: { family: "spoon", base: "ml", factor: 15 },
  cup: { family: "volume", base: "ml", factor: 240 },
  can: { family: "count-can", base: "can", factor: 1 },
  pack: { family: "count-pack", base: "pack", factor: 1 },
  clove: { family: "count-clove", base: "clove", factor: 1 },
  slice: { family: "count-slice", base: "slice", factor: 1 },
  item: { family: "count-item", base: "item", factor: 1 }
};

export function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function labelMealSlot(slot: MealSlot) {
  return slotLabels[slot];
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
    .replace(/\b(chopped|diced|minced|sliced|fresh|large|small|medium|optional|roughly|finely)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUnit(unit?: string) {
  if (!unit) return "";
  const cleaned = unit.toLowerCase().replace(/[.]/g, "").trim();
  return unitAliases[cleaned] ?? cleaned;
}

export function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
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
    warnings: Array.from(new Set([...warnings, "Nothing has been saved to the recipe library yet."]))
  };
}

export function inferAutomaticRecipeTags(recipe: Pick<Recipe, "title" | "ingredients" | "prepMinutes" | "cookMinutes">) {
  const text = `${recipe.title} ${recipe.ingredients.map((ingredient) => ingredient.name).join(" ")}`.toLowerCase();
  const tags: string[] = [];

  if (/\b(chicken|hen|turkey)\b/.test(text)) tags.push("chicken");
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

export function mergeAutomaticRecipeTags(manualTags: string[], recipe: Pick<Recipe, "title" | "ingredients" | "prepMinutes" | "cookMinutes">) {
  const manual = manualTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const withoutOldAutoTags = manual.filter((tag) => !automaticTagSet.has(tag));
  const merged = [...withoutOldAutoTags, ...inferAutomaticRecipeTags(recipe)];
  return merged.filter((tag, index, tags) => tags.indexOf(tag) === index);
}

export function totalRecipeMinutes(recipe: Pick<Recipe, "prepMinutes" | "cookMinutes">) {
  return (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
}

export function inferCategory(name: string): GroceryCategory {
  const normal = normalizeIngredientName(name);

  if (/(chicken|beef|pork|fish|salmon|tuna|prawn|shrimp|turkey|bacon|sausage)/.test(normal)) {
    return "Meat & Fish";
  }

  if (/(milk|cheese|yogurt|butter|cream|egg|eggs|parmesan|cheddar|mozzarella)/.test(normal)) {
    return "Dairy & Eggs";
  }

  if (/(bread|bagel|wrap|tortilla|bun|roll|pitta|pita)/.test(normal)) {
    return "Bakery";
  }

  if (/(peas|spinach frozen|frozen|ice cream)/.test(normal)) {
    return "Frozen";
  }

  if (/(salt|pepper|paprika|cumin|cinnamon|oregano|basil|thyme|chilli|chili|curry|spice)/.test(normal)) {
    return "Spices";
  }

  if (
    /(onion|garlic|tomato|pepper|carrot|potato|lettuce|lemon|lime|apple|banana|mushroom|broccoli|courgette|zucchini|avocado|herb|coriander|cilantro|parsley|ginger)/.test(
      normal
    )
  ) {
    return "Produce";
  }

  if (/(rice|pasta|flour|sugar|oil|vinegar|beans|lentils|stock|broth|oats|cereal|noodle|soy sauce|honey)/.test(normal)) {
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

export function parseIngredientLine(line: string): Ingredient {
  const cleaned = line.replace(/^[-*•]\s*/, "").trim();
  const pattern =
    /^((?:\d+(?:\.\d+)?)|(?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|[¼½¾⅓⅔⅛⅜⅝⅞])?\s*([a-zA-Z]+)?\s+(.+)$/;
  const match = cleaned.match(pattern);
  const quantity = match?.[1] ? parseQuantity(match[1]) : undefined;
  const rawUnit = match?.[2]?.toLowerCase().replace(/[.]/g, "").trim();
  const unit = rawUnit && unitAliases[rawUnit] ? normalizeUnit(rawUnit) : "";
  const name = rawUnit && !unit ? `${match?.[2]} ${match?.[3]}`.trim() : match?.[3]?.trim() || cleaned;
  const confidence = quantity && name.length > 2 ? "high" : "low";

  return {
    id: createId("ing"),
    name,
    quantity,
    unit,
    category: inferCategory(name),
    confidence
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
  const ingredients = ingredientLines.map(parseIngredientLine).filter((ingredient) => ingredient.name.length > 1);
  const warnings: string[] = [];

  if (!servingsMatch) warnings.push("Servings were not found, so the draft defaults to 4.");
  if (ingredients.length === 0) warnings.push("No clear ingredient list was detected. Add ingredients before saving.");
  if (ingredients.some((ingredient) => ingredient.confidence === "low")) {
    warnings.push("Some ingredient quantities or units need review.");
  }

  return {
    id: createId("draft"),
    title,
    servings,
    tags: [],
    ingredients,
    instructions: methodLines.length > 0 ? methodLines : ["Add cooking instructions."],
    sourceUrl,
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
    prepMinutes: draft.prepMinutes,
    cookMinutes: draft.cookMinutes,
    tags: draft.tags,
    favorite: false,
    ingredients: draft.ingredients.map((ingredient) => ({
      ...ingredient,
      id: ingredient.id || createId("ing"),
      category: ingredient.category || inferCategory(ingredient.name)
    })),
    instructions: draft.instructions.filter(Boolean),
    sourceUrl: draft.sourceUrl,
    photoDataUrl: draft.photoDataUrl,
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
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    tags: recipe.tags,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, id: createId("ing") })),
    instructions: [...recipe.instructions],
    sourceUrl: recipe.sourceUrl,
    photoDataUrl: recipe.photoDataUrl,
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

  if (normalUnit === "g" && quantity >= 1000) {
    return `${formatNumber(quantity / 1000)} kg`;
  }

  if (normalUnit === "ml" && quantity >= 1000) {
    return `${formatNumber(quantity / 1000)} l`;
  }

  return `${formatNumber(quantity)}${normalUnit ? ` ${normalUnit}` : ""}`;
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
    name: string;
    category: GroceryCategory;
    unitFamily?: string;
    baseUnit?: string;
    quantity?: number;
    sourceMeals: Set<string>;
    incompatible?: boolean;
    staple: boolean;
  };

  const buckets = new Map<string, Bucket>();

  plannedMeals.forEach((meal) => {
    const recipe = recipes.find((item) => item.id === meal.recipeId);
    if (!recipe) return;

    const factor = meal.peopleCount / Math.max(1, recipe.servings);
    recipe.ingredients.forEach((ingredient) => {
      const scaled = scaleIngredient(ingredient, factor);
      const nameKey = normalizeIngredientName(scaled.name);
      const conversion = scaled.unit ? unitConversions[normalizeUnit(scaled.unit)] : undefined;
      const quantity = typeof scaled.quantity === "number" && conversion ? scaled.quantity * conversion.factor : scaled.quantity;
      const family = conversion?.family ?? (scaled.unit ? `raw-${scaled.unit}` : "no-unit");
      const baseUnit = conversion?.base ?? scaled.unit ?? "";
      const staple = isStaple(scaled.name, settings.stapleIngredients);

      if (staple && !settings.includeStaples) return;

      const key = `${nameKey}::${family}`;
      const existing = buckets.get(key);
      if (existing && typeof existing.quantity === "number" && typeof quantity === "number") {
        existing.quantity += quantity;
        existing.sourceMeals.add(recipe.title);
      } else if (!existing) {
        buckets.set(key, {
          key,
          name: scaled.name,
          category: scaled.category,
          unitFamily: family,
          baseUnit,
          quantity,
          sourceMeals: new Set([recipe.title]),
          staple
        });
      } else {
        const separateKey = `${key}::${meal.id}`;
        buckets.set(separateKey, {
          key: separateKey,
          name: scaled.name,
          category: scaled.category,
          unitFamily: family,
          baseUnit: scaled.unit,
          quantity: scaled.quantity,
          sourceMeals: new Set([recipe.title]),
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
      name: bucket.name,
      quantity: bucket.quantity,
      unit: bucket.baseUnit,
      displayQuantity: displayQuantity(bucket.quantity, bucket.baseUnit),
      category: bucket.category,
      sourceMeals: Array.from(bucket.sourceMeals),
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
    shoppingChecks: {},
    hiddenShoppingItems: {},
    manualShoppingItems: [],
    settings: {
      householdName: "Home",
      defaultPeople: 4,
      hiddenSlots: [],
      stapleIngredients: ["salt", "black pepper", "olive oil", "plain flour", "sugar"],
      includeStaples: false
    }
  };
}
