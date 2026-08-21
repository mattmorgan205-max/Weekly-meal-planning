import type { GroceryCategory, Ingredient, Recipe } from "./domain";

export const GREEN_ROASTING_TIN_RECIPE_PACK_ID = "green-roasting-tin-cookbook-2026-08-v1";

const importedAt = "2026-08-21T11:30:00.000Z";
const imageRoot = "/recipe-images/green-roasting-tin";

type PackIngredient = Omit<Ingredient, "id">;
type PackRecipe = Omit<Recipe, "id" | "favorite" | "createdAt" | "updatedAt" | "ingredients"> & {
  slug: string;
  ingredients: PackIngredient[];
};

function ingredient(
  name: string,
  category: GroceryCategory,
  quantity?: number,
  unit?: string,
  note?: string
): PackIngredient {
  return {
    name,
    category,
    quantity,
    unit,
    note,
    confidence: "high",
    needsReview: false,
    role: "required"
  };
}

function cookbookRecipe(recipe: PackRecipe): Recipe {
  const { slug, ...details } = recipe;

  return {
    ...details,
    id: `green_tin_recipe_${slug}`,
    favorite: false,
    ingredients: recipe.ingredients.map((item, index) => ({
      ...item,
      id: `green_tin_ing_${slug}_${index + 1}`
    })),
    notes: "Imported from your copy of The Green Roasting Tin. The method has been condensed for quick planning.",
    importedFrom: "photo",
    createdAt: importedAt,
    updatedAt: importedAt
  };
}

export const greenRoastingTinRecipes: Recipe[] = [
  cookbookRecipe({
    slug: "creamy-gnocchi-figs",
    title: "Creamy baked gnocchi with dolcelatte, figs & hazelnut",
    servings: 2,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["cookbook", "vegetarian", "30-60 mins", "gnocchi"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/creamy-gnocchi-figs.jpg`,
    ingredients: [
      ingredient("gnocchi", "Pantry", 400, "g"),
      ingredient("creme fraiche", "Dairy & Eggs", 100, "g", "about 2 heaped tablespoons"),
      ingredient("sea salt", "Spices", 1, "tsp"),
      ingredient("black pepper", "Spices"),
      ingredient("dolcelatte", "Dairy & Eggs", 150, "g", "roughly torn"),
      ingredient("fig", "Produce", 4, "item", "quartered"),
      ingredient("runny honey", "Pantry"),
      ingredient("hazelnut", "Pantry", 40, "g", "roughly chopped"),
      ingredient("watercress", "Produce", 85, "g", "to serve"),
      ingredient("lemon juice", "Produce", 1, "tbsp", "to serve"),
      ingredient("extra virgin olive oil", "Pantry", 0.5, "tbsp", "to serve")
    ],
    instructions: [
      "Cover the gnocchi with boiling water for 2 minutes, then drain well and mix with the creme fraiche, salt and pepper in a roasting tin.",
      "Scatter over the dolcelatte, figs and hazelnuts, add a small drizzle of honey, and bake at 180C fan for 30 minutes.",
      "Dress the watercress with lemon juice and olive oil and serve it with the hot gnocchi."
    ]
  }),
  cookbookRecipe({
    slug: "tandoori-salmon",
    title: "Tandoori-style salmon with spiced roasted sweet potatoes, tomatoes & red onion",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["cookbook", "fish", "30-60 mins", "traybake"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/tandoori-salmon.jpg`,
    ingredients: [
      ingredient("garlic", "Produce", 3, "clove", "grated"),
      ingredient("ginger", "Produce", 4, "cm", "grated"),
      ingredient("natural yogurt", "Dairy & Eggs", 75, "g", "plus extra to serve"),
      ingredient("lemon", "Produce", 1, "item", "zest only"),
      ingredient("ground cumin", "Spices", 3, "tsp"),
      ingredient("ground turmeric", "Spices", 1, "tsp"),
      ingredient("smoked paprika", "Spices", 1, "tsp"),
      ingredient("mild chilli powder", "Spices", 0.5, "tsp"),
      ingredient("sea salt", "Spices", 2, "pinch"),
      ingredient("salmon fillet", "Meat & Fish", 4, "item"),
      ingredient("sweet potato", "Produce", 650, "g", "peeled and cut into 1cm cubes"),
      ingredient("vegetable oil", "Pantry", 2, "tbsp"),
      ingredient("cherry tomato", "Produce", 400, "g", "on the vine"),
      ingredient("red onion", "Produce", 1, "item", "roughly sliced")
    ],
    instructions: [
      "Mix the garlic, ginger, yogurt, lemon zest and spices, then coat the salmon and chill it while the vegetables start cooking.",
      "Roast the sweet potato with the oil, cumin and salt at 210C fan for 10 minutes, then add the tomatoes and red onion.",
      "Nestle in the salmon, reduce the oven to 180C fan, and roast for another 20 minutes. Serve with natural yogurt."
    ]
  }),
  cookbookRecipe({
    slug: "crispy-gnocchi-chard",
    title: "Crispy baked gnocchi with leeks, rainbow chard & cream",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 20,
    tags: ["cookbook", "vegetarian", "30-60 mins", "gnocchi"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/crispy-gnocchi-chard.jpg`,
    ingredients: [
      ingredient("leek", "Produce", 2, "item", "cut into thin half moons"),
      ingredient("rainbow chard", "Produce", 200, "g", "or Swiss chard, roughly sliced"),
      ingredient("gnocchi", "Pantry", 500, "g"),
      ingredient("double cream", "Dairy & Eggs", 250, "ml"),
      ingredient("Dijon mustard", "Pantry", 2, "tsp", "heaped"),
      ingredient("sea salt", "Spices", 1, "tsp"),
      ingredient("black pepper", "Spices"),
      ingredient("soft goat's cheese", "Dairy & Eggs", 125, "g", "crumbled"),
      ingredient("panko breadcrumbs", "Pantry", 50, "g"),
      ingredient("olive oil", "Pantry", 1, "tbsp")
    ],
    instructions: [
      "Cover the leeks, chard and gnocchi with boiling water for 2 minutes, then drain very thoroughly and spread them in a roasting tin.",
      "Stir through the cream and Dijon mustard, season, and top with goat's cheese and breadcrumbs.",
      "Drizzle with olive oil and bake at 200C fan for 15-20 minutes until crisp and golden."
    ]
  }),
  cookbookRecipe({
    slug: "leek-puy-lentil-gratin",
    title: "Leek & Puy lentil gratin with a crunchy feta topping",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 40,
    tags: ["cookbook", "vegetarian", "30-60 mins", "batch cook"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/leek-puy-lentil-gratin.jpg`,
    ingredients: [
      ingredient("butter", "Dairy & Eggs", 30, "g"),
      ingredient("garlic", "Produce", 3, "clove", "crushed"),
      ingredient("leek", "Produce", 500, "g", "thinly sliced"),
      ingredient("sea salt", "Spices", 2, "tsp"),
      ingredient("black pepper", "Spices"),
      ingredient("Puy lentils", "Pantry", 500, "g", "vacuum-packed and cooked"),
      ingredient("creme fraiche", "Dairy & Eggs", 450, "ml"),
      ingredient("feta", "Dairy & Eggs", 125, "g", "crumbled"),
      ingredient("panko breadcrumbs", "Pantry", 50, "g"),
      ingredient("olive oil", "Pantry", 1, "tbsp")
    ],
    instructions: [
      "Melt the butter with the garlic in a roasting tin at 180C fan, then add the leeks, season, and roast for 20 minutes.",
      "Stir in the lentils and creme fraiche, then top with feta and breadcrumbs.",
      "Drizzle with olive oil and bake for another 20-25 minutes until the topping is golden."
    ]
  }),
  cookbookRecipe({
    slug: "broccoli-bacon-conchiglie",
    title: "Roasted broccoli & bacon conchiglie bake with lemon creme fraiche",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["cookbook", "pork", "30-60 mins", "pasta"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/broccoli-bacon-conchiglie.jpg`,
    ingredients: [
      ingredient("conchiglie pasta", "Pantry", 300, "g"),
      ingredient("broccoli", "Produce", 1, "item", "large head, cut into small pieces"),
      ingredient("bacon lardons", "Meat & Fish", 160, "g"),
      ingredient("thyme", "Produce", 1, "pack", "a few sprigs"),
      ingredient("olive oil", "Pantry", 3, "tbsp"),
      ingredient("creme fraiche", "Dairy & Eggs", 400, "g"),
      ingredient("spinach", "Produce", 100, "g", "roughly chopped"),
      ingredient("lemon", "Produce", 0.5, "item", "juice only"),
      ingredient("sea salt", "Spices", 1, "tsp", "optional"),
      ingredient("parmesan", "Dairy & Eggs", 30, "g", "grated"),
      ingredient("panko breadcrumbs", "Pantry", 40, "g")
    ],
    instructions: [
      "Cook the pasta for 10 minutes. At the same time, roast the broccoli, bacon and thyme with 1 tablespoon of oil at 200C fan for 10 minutes.",
      "Stir the drained pasta into the tin with the creme fraiche, spinach, lemon juice, seasoning and another tablespoon of oil.",
      "Top with parmesan and breadcrumbs, drizzle with the remaining oil, and bake for 15-20 minutes until crisp."
    ]
  }),
  cookbookRecipe({
    slug: "quick-chicken-leek-chorizo-pie",
    title: "Quick chicken, leek & chorizo pie",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["cookbook", "chicken", "pork", "30-60 mins", "pie"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/quick-chicken-leek-chorizo-pie.jpg`,
    ingredients: [
      ingredient("leek", "Produce", 2, "item", "very finely sliced"),
      ingredient("chicken breast", "Meat & Fish", 4, "item", "cut into large chunks"),
      ingredient("chorizo", "Meat & Fish", 120, "g", "diced"),
      ingredient("creme fraiche", "Dairy & Eggs", 300, "g", "full-fat"),
      ingredient("lemon", "Produce", 0.5, "item", "zest and juice"),
      ingredient("sea salt", "Spices", 1, "tsp", "optional"),
      ingredient("black pepper", "Spices"),
      ingredient("egg", "Dairy & Eggs", 1, "item", "beaten"),
      ingredient("puff pastry", "Bakery", 1, "sheet", "320g ready-rolled sheet")
    ],
    instructions: [
      "Cover the sliced leeks with boiling water for 2 minutes, then drain them very well.",
      "Mix the leeks with the chicken, chorizo, creme fraiche, lemon and seasoning in a roasting tin.",
      "Cover with puff pastry, seal and egg-wash the edges and top, then bake at 180C fan for 25-30 minutes. Rest for 5 minutes before serving."
    ]
  }),
  cookbookRecipe({
    slug: "crispy-baked-cod",
    title: "Crispy baked cod with herby broccoli, peas & beans",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 25,
    tags: ["cookbook", "fish", "30-60 mins", "traybake"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/crispy-baked-cod.jpg`,
    ingredients: [
      ingredient("Tenderstem broccoli", "Produce", 300, "g"),
      ingredient("frozen peas", "Frozen", 300, "g"),
      ingredient("courgette", "Produce", 2, "item", "cut into half moons"),
      ingredient("olive oil", "Pantry", 2, "tbsp"),
      ingredient("sea salt", "Spices", 1, "tsp", "optional"),
      ingredient("black pepper", "Spices"),
      ingredient("cod fillet", "Meat & Fish", 4, "item"),
      ingredient("green pesto", "Pantry", 4, "tsp"),
      ingredient("panko breadcrumbs", "Pantry", 4, "tbsp", "heaped"),
      ingredient("butter beans", "Pantry", 1, "can", "400g can, drained and rinsed"),
      ingredient("lemon", "Produce", 0.5, "item", "zest and juice"),
      ingredient("basil", "Produce", 1, "bunch", "finely chopped")
    ],
    instructions: [
      "Briefly soak the Tenderstem in boiling water, drain it, then mix with the peas and courgettes, most of the olive oil, salt and pepper in a roasting tin.",
      "Add the butter beans, lay over the cod, and top each fillet with pesto and breadcrumbs. Drizzle with the remaining oil.",
      "Bake at 180C fan for 20-25 minutes, then stir the lemon zest, juice and basil through the vegetables."
    ]
  }),
  cookbookRecipe({
    slug: "thyme-leek-mushroom-pasta",
    title: "Crispy thyme roasted leek & mushroom pasta bake",
    servings: 3,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["cookbook", "vegetarian", "30-60 mins", "pasta"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/thyme-leek-mushroom-pasta.jpg`,
    ingredients: [
      ingredient("tagliatelle", "Pantry", 200, "g"),
      ingredient("leek", "Produce", 2, "item", "cut into thin half moons"),
      ingredient("chestnut mushroom", "Produce", 250, "g", "roughly sliced"),
      ingredient("creme fraiche", "Dairy & Eggs", 300, "ml"),
      ingredient("olive oil", "Pantry", 1, "tbsp", "plus extra for baking"),
      ingredient("sea salt", "Spices", 1, "tsp"),
      ingredient("thyme", "Produce", 10, "sprig", "leaves only"),
      ingredient("cheddar", "Dairy & Eggs", 75, "g", "grated"),
      ingredient("panko breadcrumbs", "Pantry", 100, "g")
    ],
    instructions: [
      "Cook the pasta until just al dente, adding the leeks for the final minute, then drain well.",
      "Mix the pasta and leeks with the creme fraiche, olive oil, salt and half the thyme in a baking dish.",
      "Top with the mushrooms, remaining thyme, cheddar and breadcrumbs, drizzle with oil, and bake at 200C fan for 15-20 minutes."
    ]
  }),
  cookbookRecipe({
    slug: "aubergine-courgette-macaroni",
    title: "Roasted aubergine, courgette & macaroni bake",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["cookbook", "vegetarian", "30-60 mins", "pasta"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/aubergine-courgette-macaroni.jpg`,
    ingredients: [
      ingredient("aubergine", "Produce", 1, "item", "cut into 1cm cubes"),
      ingredient("courgette", "Produce", 1, "item", "cut into 1cm cubes"),
      ingredient("sea salt", "Spices", 1, "tsp", "optional"),
      ingredient("olive oil", "Pantry", 3, "tbsp"),
      ingredient("macaroni", "Pantry", 300, "g"),
      ingredient("chopped tomatoes", "Pantry", 2, "can", "400g cans"),
      ingredient("Boursin cheese", "Dairy & Eggs", 150, "g", "crumbled"),
      ingredient("panko breadcrumbs", "Pantry", 40, "g")
    ],
    instructions: [
      "Roast the aubergine and courgette with 1 tablespoon of oil and the salt at 210C fan for 10 minutes.",
      "Cook and drain the macaroni, then stir it into the vegetables with the tomatoes and another tablespoon of oil.",
      "Top with the Boursin and breadcrumbs, drizzle with the final tablespoon of oil, and bake at 200C fan for 15-20 minutes."
    ]
  }),
  cookbookRecipe({
    slug: "breakfast-pancake-berries",
    title: "Breakfast pancake with berries & lemon butter",
    servings: 4,
    mealTypes: ["breakfast"],
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["cookbook", "vegetarian", "30-60 mins", "breakfast"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/breakfast-pancake-berries.jpg`,
    ingredients: [
      ingredient("unsalted butter", "Dairy & Eggs", 150, "g", "50g for the pancake and 100g softened for serving"),
      ingredient("ricotta", "Dairy & Eggs", 250, "g", "or cottage cheese"),
      ingredient("egg", "Dairy & Eggs", 4, "item"),
      ingredient("milk", "Dairy & Eggs", 200, "ml"),
      ingredient("caster sugar", "Pantry", 50, "g"),
      ingredient("plain flour", "Pantry", 150, "g"),
      ingredient("baking powder", "Pantry", 1.5, "tsp"),
      ingredient("mixed berries", "Frozen", 300, "g", "raspberries, blueberries and blackberries; approximate amount"),
      ingredient("icing sugar", "Pantry", 30, "g", "plus extra for dusting"),
      ingredient("lemon", "Produce", 0.5, "item", "zest and juice for the butter")
    ],
    instructions: [
      "Melt 50g butter in a roasting tin at 200C fan. Beat the ricotta, eggs, milk and sugar, then mix in the melted butter, flour and baking powder.",
      "Pour the batter into the hot tin, scatter over the berries, and bake for 25-30 minutes until risen and golden.",
      "Beat the softened butter with icing sugar, lemon zest and juice. Dust the pancake with icing sugar and serve with the lemon butter."
    ]
  }),
  cookbookRecipe({
    slug: "lamb-meatballs-cauliflower",
    title: "Lamb meatballs with sumac roasted cauliflower & pomegranate",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 25,
    tags: ["cookbook", "lamb", "30-60 mins", "traybake"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/lamb-meatballs-cauliflower.jpg`,
    ingredients: [
      ingredient("lamb mince", "Meat & Fish", 400, "g"),
      ingredient("onion", "Produce", 1, "item", "small, roughly chopped"),
      ingredient("mild chilli powder", "Spices", 1, "tsp"),
      ingredient("ground coriander", "Spices", 1, "tsp"),
      ingredient("ground cumin", "Spices", 3, "tsp"),
      ingredient("sea salt", "Spices", 2, "tsp"),
      ingredient("egg", "Dairy & Eggs", 1, "item"),
      ingredient("gram flour", "Pantry", 2, "tsp", "optional"),
      ingredient("mint", "Produce", 15, "g"),
      ingredient("cauliflower", "Produce", 1, "item", "large, cut into florets with the leaves"),
      ingredient("sumac", "Spices", 3, "tsp"),
      ingredient("olive oil", "Pantry", 2, "tbsp", "one tablespoon should be extra virgin"),
      ingredient("lemon", "Produce", 1, "item", "zest and juice"),
      ingredient("pomegranate", "Produce", 1, "item", "seeds only"),
      ingredient("flat-leaf parsley", "Produce", 1, "handful", "chopped"),
      ingredient("pomegranate molasses", "Pantry", 1, "tbsp", "optional")
    ],
    instructions: [
      "Blend the lamb, onion, chilli, coriander, 1 teaspoon each of cumin and salt, egg, gram flour and mint, then roll into small meatballs.",
      "Mix the cauliflower with the sumac, remaining cumin and salt, and olive oil in a roasting tin, then nestle in the meatballs.",
      "Roast at 180C fan for 25 minutes. Dress with lemon and extra virgin olive oil, then finish with pomegranate, parsley and optional molasses."
    ]
  }),
  cookbookRecipe({
    slug: "harissa-sprouts-halloumi",
    title: "Spicy harissa sprouts & broccoli with halloumi, spinach & cous cous",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 25,
    tags: ["cookbook", "vegetarian", "30-60 mins", "traybake"],
    source: "The Green Roasting Tin",
    mealImageUrl: `${imageRoot}/harissa-sprouts-halloumi.jpg`,
    ingredients: [
      ingredient("broccoli", "Produce", 1, "item", "cut into florets"),
      ingredient("Brussels sprouts", "Produce", 500, "g"),
      ingredient("halloumi", "Dairy & Eggs", 250, "g", "cut into cubes"),
      ingredient("harissa", "Pantry", 2, "tbsp"),
      ingredient("olive oil", "Pantry", 2, "tbsp"),
      ingredient("spinach", "Produce", 150, "g", "chopped"),
      ingredient("sea salt", "Spices", 1, "pinch"),
      ingredient("lemon", "Produce", 0.5, "item", "juice only"),
      ingredient("flatbread", "Bakery", 4, "item", "to serve"),
      ingredient("yogurt", "Dairy & Eggs", 4, "tbsp", "to serve")
    ],
    instructions: [
      "Mix the broccoli, sprouts, halloumi, harissa and olive oil in a roasting tin.",
      "Roast at 180C fan for 25 minutes, then stir through the chopped spinach.",
      "Season with salt and lemon juice and serve in flatbreads with yogurt."
    ]
  })
];

export function installGreenRoastingTinRecipePack(
  recipes: Recipe[],
  installedRecipePacks: string[] = []
): { recipes: Recipe[]; installedRecipePacks: string[]; addedCount: number } {
  if (installedRecipePacks.includes(GREEN_ROASTING_TIN_RECIPE_PACK_ID)) {
    return { recipes, installedRecipePacks, addedCount: 0 };
  }

  const existingIds = new Set(recipes.map((recipe) => recipe.id));
  const existingTitles = new Set(recipes.map((recipe) => recipe.title.trim().toLowerCase()));
  const additions = greenRoastingTinRecipes.filter(
    (recipe) => !existingIds.has(recipe.id) && !existingTitles.has(recipe.title.trim().toLowerCase())
  );

  return {
    recipes: [...recipes, ...additions],
    installedRecipePacks: [...installedRecipePacks, GREEN_ROASTING_TIN_RECIPE_PACK_ID],
    addedCount: additions.length
  };
}
