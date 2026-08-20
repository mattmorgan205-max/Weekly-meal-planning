import type { GroceryCategory, Ingredient, Recipe } from "./domain";

export const AUTO_ADDED_RECIPE_PACK_V2_ID = "published-dinners-with-images-2026-08-v2";

const publishedAt = "2026-08-20T12:00:00.000Z";

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

function publishedRecipe(recipe: PackRecipe): Recipe {
  const { slug, ...details } = recipe;

  return {
    ...details,
    id: `auto_recipe_v2_${slug}`,
    favorite: false,
    ingredients: recipe.ingredients.map((item, index) => ({
      ...item,
      id: `auto_ing_v2_${slug}_${index + 1}`
    })),
    notes: "Auto-added from a published Good Food recipe. Follow the source link for the original recipe.",
    importedFrom: "url",
    createdAt: publishedAt,
    updatedAt: publishedAt
  };
}

export const autoAddedRecipesV2: Recipe[] = [
  publishedRecipe({
    slug: "creamy-courgette-lasagne",
    title: "Creamy courgette lasagne",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 20,
    tags: ["auto-added", "vegetarian", "30-60 mins", "pasta"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/creamy-courgette-lasagne",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2022/03/Creamy-courgette-lasagne-e63aa0c.jpg?resize=768,698",
    ingredients: [
      ingredient("lasagne sheets", "Pantry", 9, "sheet"),
      ingredient("sunflower oil", "Pantry", 1, "tbsp"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("courgette", "Produce", 700, "g"),
      ingredient("garlic", "Produce", 2, "clove"),
      ingredient("ricotta", "Dairy & Eggs", 250, "g"),
      ingredient("cheddar", "Dairy & Eggs", 50, "g"),
      ingredient("tomato pasta sauce", "Pantry", 350, "g")
    ],
    instructions: [
      "Part-cook the lasagne sheets, drain them and keep them separated.",
      "Soften the onion, courgette and garlic, then stir in most of the ricotta and cheddar.",
      "Layer the courgette filling, pasta and tomato sauce, top with the remaining cheese, and bake until golden."
    ]
  }),
  publishedRecipe({
    slug: "caponata-pasta",
    title: "Caponata pasta",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 2,
    cookMinutes: 18,
    tags: ["auto-added", "vegetarian", "under 30 mins", "quick", "pasta"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/caponata-pasta",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/caponata-pasta-a0027c4.jpg?resize=440,400",
    ingredients: [
      ingredient("olive oil", "Pantry", 4, "tbsp"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("garlic", "Produce", 4, "clove"),
      ingredient("chargrilled Mediterranean vegetables", "Produce", 250, "g"),
      ingredient("chopped tomatoes", "Pantry", 1, "can", "400g can"),
      ingredient("capers", "Pantry", 1, "tbsp"),
      ingredient("raisins", "Pantry", 2, "tbsp"),
      ingredient("rigatoni", "Pantry", 350, "g"),
      ingredient("basil", "Produce", 1, "bunch"),
      ingredient("parmesan", "Dairy & Eggs", 1, "handful")
    ],
    instructions: [
      "Cook the onion in the oil until sweet and soft, adding the garlic near the end.",
      "Add the chargrilled vegetables, tomatoes, capers and raisins and simmer into a rich sauce.",
      "Cook the pasta, toss it through the sauce with a splash of pasta water, and finish with basil and parmesan."
    ]
  }),
  publishedRecipe({
    slug: "paneer-korma",
    title: "Paneer korma",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 5,
    cookMinutes: 25,
    tags: ["auto-added", "vegetarian", "30-60 mins", "curry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/paneer-korma",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/paneer-korma-07a67d4.jpg?resize=440,400",
    ingredients: [
      ingredient("vegetable oil", "Pantry", 3, "tbsp"),
      ingredient("paneer", "Dairy & Eggs", 225, "g"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("ginger", "Produce", 1, "item", "thumb-sized piece"),
      ingredient("garlic", "Produce", 2, "clove"),
      ingredient("korma paste", "Pantry", 5, "tbsp"),
      ingredient("cardamom pods", "Spices", 3, "item"),
      ingredient("ground almonds", "Pantry", 70, "g"),
      ingredient("vegetable stock", "Pantry", 500, "ml"),
      ingredient("spinach", "Produce", 150, "g"),
      ingredient("Greek yogurt", "Dairy & Eggs", 100, "g"),
      ingredient("basmati rice", "Pantry", 300, "g", "to serve")
    ],
    instructions: [
      "Fry the paneer until golden on all sides, then set it aside.",
      "Blend the onion, ginger and garlic, cook the mixture until golden, then add the korma paste, cardamom and almonds.",
      "Add the stock and reduce the sauce before stirring in the spinach, yogurt and paneer. Serve with rice."
    ]
  }),
  publishedRecipe({
    slug: "baked-tomato-mozzarella-orzo",
    title: "Baked tomato & mozzarella orzo",
    servings: 2,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["auto-added", "vegetarian", "30-60 mins", "one pot"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/baked-tomato-mozzarella-orzo",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/baked-tomato-mozzarella-orzo-44660ad.jpg?resize=440,400",
    ingredients: [
      ingredient("orzo", "Pantry", 150, "g"),
      ingredient("olive oil", "Pantry", 0.5, "tbsp"),
      ingredient("roasted red peppers", "Pantry", 2, "item", "from a jar"),
      ingredient("olives", "Pantry", 1, "handful"),
      ingredient("chilli flakes", "Spices", 1, "pinch"),
      ingredient("dried oregano", "Spices", 0.5, "tsp"),
      ingredient("chopped tomatoes", "Pantry", 1, "can", "400g can with garlic"),
      ingredient("mozzarella", "Dairy & Eggs", 125, "g")
    ],
    instructions: [
      "Mix the orzo with the oil, peppers, olives, chilli, oregano, tomatoes and water in a covered casserole dish.",
      "Bake until the orzo is almost tender, uncover and cook briefly, then tear over the mozzarella and grill until bubbling."
    ]
  }),
  publishedRecipe({
    slug: "spinach-three-cheese-cannelloni",
    title: "Spinach & three cheese cannelloni",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 25,
    cookMinutes: 60,
    tags: ["auto-added", "vegetarian", "over 60 mins", "pasta"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/spinach-three-cheese-cannelloni",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-327816_11-6b2d496.jpg?resize=440,400",
    ingredients: [
      ingredient("olive oil", "Pantry", 1, "tbsp"),
      ingredient("garlic", "Produce", 3, "clove"),
      ingredient("caster sugar", "Pantry", 1, "pinch"),
      ingredient("red wine vinegar", "Pantry", 1, "tbsp"),
      ingredient("dried oregano", "Spices", 1, "tsp"),
      ingredient("chopped tomatoes", "Pantry", 2, "can", "400g cans"),
      ingredient("spinach", "Produce", 500, "g"),
      ingredient("goat's cheese", "Dairy & Eggs", 300, "g"),
      ingredient("parmesan", "Dairy & Eggs", 100, "g"),
      ingredient("nutmeg", "Spices", 1, "pinch"),
      ingredient("cannelloni tubes", "Pantry", 200, "g"),
      ingredient("mozzarella", "Dairy & Eggs", 1, "pack")
    ],
    instructions: [
      "Simmer the garlic, sugar, vinegar, oregano and tomatoes into a thick sauce.",
      "Wilt and thoroughly drain the spinach, then blend it with the goat's cheese, half the parmesan and nutmeg.",
      "Fill the cannelloni, cover with tomato sauce and the remaining cheeses, and bake until golden and bubbling."
    ]
  }),
  publishedRecipe({
    slug: "veggie-shepherds-pie",
    title: "Veggie shepherd's pie with sweet potato mash",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 60,
    tags: ["auto-added", "vegetarian", "over 60 mins", "batch cook"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/veggie-shepherds-pie-sweet-potato-mash",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2011/02/veggie-shepherds-pie-with-sweet-potato-mash-ced560e.jpg?resize=768,699",
    ingredients: [
      ingredient("olive oil", "Pantry", 1, "tbsp"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("carrot", "Produce", 500, "g"),
      ingredient("thyme", "Produce", 2, "tbsp"),
      ingredient("red wine", "Pantry", 200, "ml"),
      ingredient("chopped tomatoes", "Pantry", 1, "can", "400g can"),
      ingredient("vegetable stock cube", "Pantry", 2, "item"),
      ingredient("green lentils", "Pantry", 1, "can", "410g can"),
      ingredient("sweet potato", "Produce", 950, "g"),
      ingredient("butter", "Dairy & Eggs", 25, "g"),
      ingredient("mature cheddar", "Dairy & Eggs", 85, "g")
    ],
    instructions: [
      "Soften the onion and carrots with most of the thyme, then add the wine, tomatoes, stock and water.",
      "Simmer the filling, stir in the lentils, and separately boil and mash the sweet potatoes with butter.",
      "Spoon the filling into a pie dish, top with the mash, cheddar and remaining thyme, and bake until golden."
    ]
  }),
  publishedRecipe({
    slug: "green-masala-squash-curry",
    title: "Green masala butternut squash curry",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["auto-added", "vegetarian", "30-60 mins", "vegan", "curry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/green-masala-butternut-squash-curry",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/green-masala-butternut-squash-curry-1aff052.jpg?resize=440,400",
    ingredients: [
      ingredient("coriander", "Produce", 40, "g"),
      ingredient("mint", "Produce", 20, "g"),
      ingredient("green chilli", "Produce", 2, "item"),
      ingredient("garlic", "Produce", 4, "clove"),
      ingredient("ginger", "Produce", 1, "item", "2cm piece"),
      ingredient("coconut milk", "Pantry", 1, "can", "400ml can"),
      ingredient("garam masala", "Spices", 1, "tsp"),
      ingredient("ground turmeric", "Spices", 1, "tsp"),
      ingredient("butternut squash", "Produce", 500, "g"),
      ingredient("green beans", "Produce", 150, "g"),
      ingredient("basmati rice", "Pantry", 300, "g"),
      ingredient("mango chutney", "Pantry", 1, "pack")
    ],
    instructions: [
      "Blend the herbs, chillies, garlic, ginger and coconut milk until smooth.",
      "Simmer the sauce with the spices and squash until tender, then add blanched green beans and serve with rice and chutney."
    ]
  }),
  publishedRecipe({
    slug: "coconut-squash-dhansak",
    title: "Coconut & squash dhansak",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 5,
    cookMinutes: 15,
    tags: ["auto-added", "vegetarian", "under 30 mins", "quick", "curry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/coconut-squash-dhansak",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/coconut-squash-dhansak-a3a9133.jpg?resize=768,698",
    ingredients: [
      ingredient("vegetable oil", "Pantry", 1, "tbsp"),
      ingredient("butternut squash", "Produce", 500, "g"),
      ingredient("onion", "Frozen", 100, "g"),
      ingredient("mild curry paste", "Pantry", 4, "tbsp"),
      ingredient("chopped tomatoes", "Pantry", 1, "can", "400g can"),
      ingredient("light coconut milk", "Pantry", 1, "can", "400ml can"),
      ingredient("mini naan bread", "Bakery", 4, "item"),
      ingredient("lentils", "Pantry", 1, "can", "400g can"),
      ingredient("spinach", "Produce", 200, "g"),
      ingredient("coconut yogurt", "Dairy & Eggs", 150, "ml")
    ],
    instructions: [
      "Cook the squash until tender while softening the onion and simmering the curry paste, tomatoes and coconut milk into a sauce.",
      "Add the squash, lentils and spinach, simmer until the spinach wilts, then stir in the coconut yogurt and serve with naan."
    ]
  }),
  publishedRecipe({
    slug: "chicken-tikka-masala",
    title: "Chicken tikka masala",
    servings: 10,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 50,
    tags: ["auto-added", "chicken", "over 60 mins", "batch cook", "curry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/chicken-tikka-masala",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-202451_12-50a0c95.jpg?resize=440,400",
    ingredients: [
      ingredient("vegetable oil", "Pantry", 4, "tbsp"),
      ingredient("butter", "Dairy & Eggs", 25, "g"),
      ingredient("onion", "Produce", 4, "item"),
      ingredient("tikka masala paste", "Pantry", 6, "tbsp"),
      ingredient("red pepper", "Produce", 2, "item"),
      ingredient("chicken breast", "Meat & Fish", 8, "item"),
      ingredient("chopped tomatoes", "Pantry", 2, "can", "400g cans"),
      ingredient("tomato puree", "Pantry", 4, "tbsp"),
      ingredient("mango chutney", "Pantry", 3, "tbsp"),
      ingredient("double cream", "Dairy & Eggs", 150, "ml"),
      ingredient("natural yogurt", "Dairy & Eggs", 150, "ml"),
      ingredient("coriander", "Produce", 1, "bunch")
    ],
    instructions: [
      "Cook the onions slowly in the oil and butter until soft and golden, then add the curry paste and peppers.",
      "Coat the chicken in the paste, add the tomatoes, tomato puree and water, and simmer until cooked through.",
      "Stir in the mango chutney, cream and yogurt, warm gently, and finish with coriander."
    ]
  }),
  publishedRecipe({
    slug: "chow-mein",
    title: "Chow mein",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 20,
    tags: ["auto-added", "chicken", "30-60 mins", "noodles"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/chow-mein",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/chow-mein-c48a006.jpg?resize=440,400",
    ingredients: [
      ingredient("egg noodles", "Pantry", 225, "g"),
      ingredient("sesame oil", "Pantry", 2, "tbsp"),
      ingredient("chicken breast", "Meat & Fish", 100, "g"),
      ingredient("groundnut oil", "Pantry", 2.5, "tbsp"),
      ingredient("garlic", "Produce", 2, "clove"),
      ingredient("mangetout", "Produce", 50, "g"),
      ingredient("cooked ham", "Meat & Fish", 50, "g"),
      ingredient("light soy sauce", "Pantry", 4, "tsp"),
      ingredient("dark soy sauce", "Pantry", 2, "tsp"),
      ingredient("Shaoxing rice wine", "Pantry", 5, "tsp"),
      ingredient("white pepper", "Spices", 1, "tsp"),
      ingredient("caster sugar", "Pantry", 0.5, "tsp"),
      ingredient("spring onion", "Produce", 2, "item")
    ],
    instructions: [
      "Cook and drain the noodles, toss them with sesame oil, and briefly marinate the chicken with soy, rice wine and pepper.",
      "Stir-fry the chicken and set it aside, then cook the garlic, mangetout and ham in the hot wok.",
      "Add the noodles and seasonings, return the chicken, and toss over a high heat until cooked through."
    ]
  }),
  publishedRecipe({
    slug: "one-pot-garlic-chicken",
    title: "One-pot garlic chicken",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["auto-added", "chicken", "30-60 mins", "one pot"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/one-pot-garlic-chicken",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2022/09/OnePotGarlicChicken-d0de695.jpg?resize=768,768",
    ingredients: [
      ingredient("chicken breast", "Meat & Fish", 4, "item"),
      ingredient("plain flour", "Pantry", 75, "g"),
      ingredient("olive oil", "Pantry", 2, "tbsp"),
      ingredient("butter", "Dairy & Eggs", 50, "g"),
      ingredient("garlic", "Produce", 12, "clove"),
      ingredient("chicken stock", "Pantry", 250, "ml"),
      ingredient("double cream", "Dairy & Eggs", 100, "ml"),
      ingredient("parmesan", "Dairy & Eggs", 30, "g"),
      ingredient("parsley", "Produce", 1, "bunch"),
      ingredient("green beans", "Produce", 300, "g", "to serve")
    ],
    instructions: [
      "Coat the chicken in seasoned flour and fry until lightly golden.",
      "Add the butter and garlic and cook until the garlic colours, then pour in the stock and simmer until tender.",
      "Stir in the cream and parmesan, reduce until slightly thickened, and finish with parsley."
    ]
  }),
  publishedRecipe({
    slug: "chicken-tinga-enchiladas",
    title: "Chicken tinga-style enchiladas",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 45,
    tags: ["auto-added", "chicken", "30-60 mins", "family"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/chicken-tinga-style-enchiladas",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2022/09/Chicken-Tinga-Enchiladas-c4eded1.jpg?resize=768,713",
    ingredients: [
      ingredient("olive oil", "Pantry", 1, "tbsp"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("garlic", "Produce", 2, "clove"),
      ingredient("coriander", "Produce", 1, "handful"),
      ingredient("chipotle paste", "Pantry", 2, "tsp"),
      ingredient("chopped tomatoes", "Pantry", 2, "can", "400g cans"),
      ingredient("chicken breast", "Meat & Fish", 2, "item"),
      ingredient("frozen sweetcorn", "Frozen", 200, "g"),
      ingredient("wholemeal tortillas", "Bakery", 8, "item"),
      ingredient("cheddar", "Dairy & Eggs", 65, "g"),
      ingredient("guacamole", "Produce", 1, "pack", "to serve")
    ],
    instructions: [
      "Soften the onion, garlic and coriander stems, then add the chipotle, tomatoes, water and chicken and simmer until cooked.",
      "Shred the chicken into the reduced sauce, add the sweetcorn, roll the filling in tortillas, top with reserved sauce and cheese, and bake until golden."
    ]
  }),
  publishedRecipe({
    slug: "chicken-casserole-dumplings",
    title: "Chicken casserole with herby dumplings",
    servings: 6,
    mealTypes: ["dinner"],
    prepMinutes: 30,
    cookMinutes: 70,
    tags: ["auto-added", "chicken", "over 60 mins", "one pot"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/chicken-casserole-herby-dumplings",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-1243615_8-8bc4792.jpg?resize=440,400",
    ingredients: [
      ingredient("chicken pieces", "Meat & Fish", 12, "item"),
      ingredient("plain flour", "Pantry", 3, "tbsp"),
      ingredient("sunflower oil", "Pantry", 2, "tbsp"),
      ingredient("onion", "Produce", 2, "item"),
      ingredient("carrot", "Produce", 2, "item"),
      ingredient("bacon lardons", "Meat & Fish", 200, "g"),
      ingredient("bay leaves", "Spices", 3, "item"),
      ingredient("thyme", "Produce", 3, "sprig"),
      ingredient("red wine", "Pantry", 250, "ml"),
      ingredient("tomato puree", "Pantry", 3, "tbsp"),
      ingredient("chicken stock cube", "Pantry", 1, "item"),
      ingredient("butter", "Dairy & Eggs", 140, "g"),
      ingredient("self-raising flour", "Pantry", 250, "g"),
      ingredient("mixed herbs", "Produce", 2, "tbsp")
    ],
    instructions: [
      "Coat and brown the chicken, then soften the onions, carrots and bacon with the bay and thyme.",
      "Return the chicken, add the wine, tomato puree, stock and water, and bake until nearly tender.",
      "Rub the butter into the flour, add herbs and water to form dumplings, place them over the casserole, and bake until cooked."
    ]
  }),
  publishedRecipe({
    slug: "healthy-salmon-pasta",
    title: "Healthy salmon pasta",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 15,
    tags: ["auto-added", "fish", "under 30 mins", "quick", "pasta"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/summer-salmon-pasta",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-1244455_7-e831545.jpg?resize=440,400",
    ingredients: [
      ingredient("penne", "Pantry", 350, "g"),
      ingredient("salmon fillet", "Meat & Fish", 350, "g"),
      ingredient("olive oil", "Pantry", 1, "tbsp"),
      ingredient("pine nuts", "Pantry", 2, "tbsp"),
      ingredient("red pepper", "Produce", 1, "item"),
      ingredient("mushrooms", "Produce", 300, "g"),
      ingredient("basil", "Produce", 1, "handful")
    ],
    instructions: [
      "Cook the pasta, adding the salmon to the water near the end of the cooking time.",
      "Toast the pine nuts, then soften the pepper and mushrooms with a little pasta water.",
      "Flake the salmon and toss it with the drained pasta, vegetables and basil."
    ]
  }),
  publishedRecipe({
    slug: "easy-fish-pie",
    title: "Easy fish pie",
    servings: 6,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 45,
    tags: ["auto-added", "fish", "30-60 mins", "family"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/family-meals-easy-fish-pie-recipe",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-1110455_10-bf7460d.jpg?resize=440,400",
    ingredients: [
      ingredient("potatoes", "Produce", 1, "kg"),
      ingredient("milk", "Dairy & Eggs", 400, "ml"),
      ingredient("butter", "Dairy & Eggs", 25, "g"),
      ingredient("plain flour", "Pantry", 25, "g"),
      ingredient("spring onion", "Produce", 4, "item"),
      ingredient("fish pie mix", "Meat & Fish", 400, "g"),
      ingredient("Dijon mustard", "Pantry", 1, "tsp"),
      ingredient("chives", "Produce", 1, "bunch"),
      ingredient("frozen sweetcorn", "Frozen", 1, "handful"),
      ingredient("frozen peas", "Frozen", 1, "handful"),
      ingredient("cheddar", "Dairy & Eggs", 1, "handful")
    ],
    instructions: [
      "Boil and mash the potatoes with a splash of milk and butter.",
      "Cook the butter, flour and spring onions, gradually whisk in the milk, and thicken into a sauce.",
      "Stir in the fish, mustard, chives, sweetcorn and peas, top with mash and cheddar, and bake until golden and bubbling."
    ]
  }),
  publishedRecipe({
    slug: "easy-thai-prawn-curry",
    title: "Easy Thai prawn curry",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 5,
    cookMinutes: 15,
    tags: ["auto-added", "fish", "under 30 mins", "quick", "curry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/easy-thai-prawn-curry",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-338576_12-d97fbf5.jpg?resize=440,400",
    ingredients: [
      ingredient("vegetable oil", "Pantry", 1, "tbsp"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("ginger", "Produce", 1, "tsp"),
      ingredient("Thai red curry paste", "Pantry", 2, "tsp"),
      ingredient("chopped tomatoes", "Pantry", 1, "can", "400g can"),
      ingredient("coconut cream", "Pantry", 50, "g"),
      ingredient("raw prawns", "Meat & Fish", 400, "g"),
      ingredient("coriander", "Produce", 1, "bunch"),
      ingredient("basmati rice", "Pantry", 300, "g", "to serve")
    ],
    instructions: [
      "Soften the onion and ginger, add the curry paste, then simmer the tomatoes and coconut cream into a sauce.",
      "Add the prawns and cook until pink and firm, then serve with rice and coriander."
    ]
  }),
  publishedRecipe({
    slug: "teriyaki-salmon-parcels",
    title: "Teriyaki salmon parcels",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 20,
    tags: ["auto-added", "fish", "30-60 mins", "family"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/teriyaki-salmon-parcels",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/salmon_9-8ec47b9.jpg?resize=440,400",
    ingredients: [
      ingredient("soy sauce", "Pantry", 2, "tbsp"),
      ingredient("honey", "Pantry", 1, "tbsp"),
      ingredient("garlic", "Produce", 1, "clove"),
      ingredient("mirin", "Pantry", 1, "tbsp"),
      ingredient("sunflower oil", "Pantry", 1, "tsp"),
      ingredient("tenderstem broccoli", "Produce", 300, "g"),
      ingredient("salmon fillet", "Meat & Fish", 4, "item"),
      ingredient("ginger", "Produce", 1, "item", "small piece"),
      ingredient("spring onion", "Produce", 4, "item"),
      ingredient("sesame seeds", "Pantry", 1, "tbsp"),
      ingredient("rice", "Pantry", 300, "g", "to serve")
    ],
    instructions: [
      "Mix the soy, honey, garlic and mirin into a sauce.",
      "Divide the broccoli, salmon and ginger between lightly oiled foil squares, spoon over the sauce and seal the parcels.",
      "Bake until the salmon is cooked, then serve with spring onions, sesame seeds and rice."
    ]
  }),
  publishedRecipe({
    slug: "beef-stroganoff",
    title: "Beef stroganoff",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 35,
    tags: ["auto-added", "beef", "30-60 mins"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/beef-stroganoff",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/beefstroganoff-d53f55e.jpg?resize=440,400",
    ingredients: [
      ingredient("olive oil", "Pantry", 1, "tbsp"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("garlic", "Produce", 1, "clove"),
      ingredient("butter", "Dairy & Eggs", 1, "tbsp"),
      ingredient("mushrooms", "Produce", 250, "g"),
      ingredient("plain flour", "Pantry", 1, "tbsp"),
      ingredient("fillet steak", "Meat & Fish", 500, "g"),
      ingredient("creme fraiche", "Dairy & Eggs", 150, "g"),
      ingredient("English mustard", "Pantry", 1, "tsp"),
      ingredient("beef stock", "Pantry", 100, "ml"),
      ingredient("parsley", "Produce", 1, "pack")
    ],
    instructions: [
      "Soften the onion and garlic, add the butter and mushrooms, then cook until tender and set aside.",
      "Coat the sliced steak in seasoned flour and sear it quickly until browned.",
      "Return the vegetables and stir in the creme fraiche, mustard and stock, simmer briefly, and finish with parsley."
    ]
  }),
  publishedRecipe({
    slug: "easy-sausage-casserole",
    title: "Easy sausage casserole",
    servings: 6,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 60,
    tags: ["auto-added", "pork", "over 60 mins", "batch cook"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/sausage-bean-casserole",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-901576_11-b01794a.jpg?resize=440,400",
    ingredients: [
      ingredient("olive oil", "Pantry", 2, "tbsp"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("celery", "Produce", 2, "stalk"),
      ingredient("red pepper", "Produce", 1, "item"),
      ingredient("yellow pepper", "Produce", 1, "item"),
      ingredient("pork sausages", "Meat & Fish", 6, "item"),
      ingredient("chorizo sausages", "Meat & Fish", 6, "item"),
      ingredient("garlic", "Produce", 3, "clove"),
      ingredient("smoked paprika", "Spices", 1.5, "tsp"),
      ingredient("ground cumin", "Spices", 0.5, "tsp"),
      ingredient("dried thyme", "Spices", 1, "tbsp"),
      ingredient("white wine", "Pantry", 125, "ml"),
      ingredient("chopped tomatoes", "Pantry", 2, "can", "400g cans"),
      ingredient("chicken stock cube", "Pantry", 1, "item"),
      ingredient("cannellini beans", "Pantry", 1, "can", "400g can")
    ],
    instructions: [
      "Soften the onion, celery and peppers, then add and brown both kinds of sausage.",
      "Stir in the garlic and spices, deglaze with the wine, and add the tomatoes and stock.",
      "Simmer until rich, add the drained beans for the final few minutes, and season before serving."
    ]
  }),
  publishedRecipe({
    slug: "italian-meatballs-orzo",
    title: "Italian meatballs with orzo",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 20,
    tags: ["auto-added", "beef", "30-60 mins", "family"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/italian-meatballs-orzo",
    mealImageUrl: "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/italian-meatballs-with-orzo-830e66f.jpg?resize=451,410",
    ingredients: [
      ingredient("basil", "Produce", 1, "pack"),
      ingredient("beef mince", "Meat & Fish", 500, "g"),
      ingredient("garlic", "Produce", 2, "clove"),
      ingredient("dried oregano", "Spices", 1, "tbsp"),
      ingredient("olive oil", "Pantry", 1, "tbsp"),
      ingredient("passata", "Pantry", 540, "g"),
      ingredient("orzo", "Pantry", 300, "g"),
      ingredient("parmesan", "Dairy & Eggs", 1, "handful")
    ],
    instructions: [
      "Mix chopped basil with the beef, garlic and oregano and shape into meatballs.",
      "Brown the meatballs, add the passata and simmer until the meat is cooked and the sauce thickens.",
      "Cook and drain the orzo, spoon over the meatballs and sauce, and finish with parmesan and basil."
    ]
  })
];

export function installAutoAddedRecipePackV2(
  recipes: Recipe[],
  installedRecipePacks: string[] = []
): { recipes: Recipe[]; installedRecipePacks: string[]; addedCount: number } {
  if (installedRecipePacks.includes(AUTO_ADDED_RECIPE_PACK_V2_ID)) {
    return { recipes, installedRecipePacks, addedCount: 0 };
  }

  const existingIds = new Set(recipes.map((recipe) => recipe.id));
  const existingSources = new Set(recipes.map((recipe) => recipe.sourceUrl?.trim().toLowerCase()).filter(Boolean));
  const existingTitles = new Set(recipes.map((recipe) => recipe.title.trim().toLowerCase()));
  const additions = autoAddedRecipesV2.filter((recipe) => {
    const source = recipe.sourceUrl?.trim().toLowerCase();
    return !existingIds.has(recipe.id) && (!source || !existingSources.has(source)) && !existingTitles.has(recipe.title.toLowerCase());
  });

  return {
    recipes: [...recipes, ...additions],
    installedRecipePacks: [...installedRecipePacks, AUTO_ADDED_RECIPE_PACK_V2_ID],
    addedCount: additions.length
  };
}
