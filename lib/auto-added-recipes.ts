import type { GroceryCategory, Ingredient, Recipe } from "./domain";

export const AUTO_ADDED_RECIPE_PACK_ID = "published-dinners-2026-08-v1";

const publishedAt = "2026-08-20T00:00:00.000Z";

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
  return {
    ...recipe,
    id: `auto_recipe_${recipe.slug}`,
    favorite: false,
    ingredients: recipe.ingredients.map((item, index) => ({
      ...item,
      id: `auto_ing_${recipe.slug}_${index + 1}`
    })),
    notes: "Auto-added from a published Good Food recipe. Follow the source link for the original recipe.",
    importedFrom: "url",
    createdAt: publishedAt,
    updatedAt: publishedAt
  };
}

export const autoAddedRecipes: Recipe[] = [
  publishedRecipe({
    slug: "chickpea-curry",
    title: "Chickpea curry",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 25,
    tags: ["auto-added", "vegetarian", "30-60 mins", "vegan", "batch cook"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/kadala-curry",
    ingredients: [
      ingredient("vegetable oil", "Pantry", 2, "tbsp"),
      ingredient("onion", "Produce", 1, "item", "diced"),
      ingredient("chilli", "Produce", 1, "item"),
      ingredient("garlic", "Produce", 9, "clove"),
      ingredient("ginger", "Produce", 1, "item", "thumb-sized piece"),
      ingredient("ground coriander", "Spices", 1, "tbsp"),
      ingredient("ground cumin", "Spices", 2, "tbsp"),
      ingredient("garam masala", "Spices", 1, "tbsp"),
      ingredient("tomato puree", "Pantry", 2, "tbsp"),
      ingredient("chickpeas", "Pantry", 2, "can", "400g cans, drained"),
      ingredient("chopped tomatoes", "Pantry", 1, "can", "400g can"),
      ingredient("creamed coconut", "Pantry", 100, "g"),
      ingredient("coriander", "Produce", 1, "pack"),
      ingredient("spinach", "Produce", 100, "g"),
      ingredient("basmati rice", "Pantry", 300, "g", "to serve")
    ],
    instructions: [
      "Soften the onion and chilli, then blend with the garlic, ginger, spices, tomato puree and oil to make a curry paste.",
      "Cook the paste briefly, add the chickpeas and tomatoes, and simmer until the sauce reduces.",
      "Stir in the creamed coconut, coriander and spinach, then cook until the spinach wilts. Serve with rice."
    ]
  }),
  publishedRecipe({
    slug: "mushroom-risotto",
    title: "Mushroom risotto",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 5,
    cookMinutes: 25,
    tags: ["auto-added", "vegetarian", "30-60 mins"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/mushroom-risotto",
    ingredients: [
      ingredient("dried porcini mushrooms", "Produce", 50, "g"),
      ingredient("vegetable stock cube", "Pantry", 1, "item"),
      ingredient("olive oil", "Pantry", 2, "tbsp"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("garlic", "Produce", 2, "clove"),
      ingredient("chestnut mushrooms", "Produce", 250, "g"),
      ingredient("risotto rice", "Pantry", 300, "g"),
      ingredient("white wine", "Pantry", 175, "ml"),
      ingredient("butter", "Dairy & Eggs", 25, "g"),
      ingredient("parsley", "Produce", 1, "handful"),
      ingredient("parmesan", "Dairy & Eggs", 50, "g")
    ],
    instructions: [
      "Soak the porcini in boiling water, drain them while reserving the liquid, and dissolve the stock cube in that liquid.",
      "Soften the onion and garlic in oil, add both types of mushroom, then stir in the rice and wine.",
      "Add the hot mushroom stock gradually, stirring until each addition is absorbed and the rice is tender.",
      "Finish with butter, parsley and parmesan, then rest briefly before serving."
    ]
  }),
  publishedRecipe({
    slug: "halloumi-traybake",
    title: "Halloumi traybake",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 60,
    tags: ["auto-added", "vegetarian", "over 60 mins", "traybake"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/halloumi-traybake",
    ingredients: [
      ingredient("new potatoes", "Produce", 750, "g"),
      ingredient("red onion", "Produce", 2, "item"),
      ingredient("olive oil", "Pantry", 4, "tbsp"),
      ingredient("chickpeas", "Pantry", 1, "can", "400g can, drained"),
      ingredient("red pepper", "Produce", 1, "item"),
      ingredient("romanesco broccoli", "Produce", 400, "g", "or cauliflower"),
      ingredient("cherry tomatoes", "Produce", 250, "g"),
      ingredient("garlic", "Produce", 4, "clove"),
      ingredient("halloumi", "Dairy & Eggs", 250, "g"),
      ingredient("basil", "Produce", 1, "bunch")
    ],
    instructions: [
      "Roast the potatoes and red onion with half the oil until they begin to soften.",
      "Add the chickpeas, pepper, romanesco, tomatoes and garlic with the remaining oil and continue roasting.",
      "Lay the halloumi over the vegetables, grill until golden, and finish with torn basil."
    ]
  }),
  publishedRecipe({
    slug: "vegetable-bean-chilli",
    title: "Vegetable & bean chilli",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 35,
    tags: ["auto-added", "vegetarian", "30-60 mins", "vegan", "batch cook"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/vegetable-bean-chilli",
    ingredients: [
      ingredient("olive oil", "Pantry", 1, "tbsp"),
      ingredient("garlic", "Produce", 1, "clove"),
      ingredient("ginger", "Produce", 1, "item", "small piece"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("courgette", "Produce", 2, "item"),
      ingredient("red pepper", "Produce", 1, "item"),
      ingredient("yellow pepper", "Produce", 1, "item"),
      ingredient("chilli powder", "Spices", 1, "tbsp"),
      ingredient("red lentils", "Pantry", 100, "g"),
      ingredient("tomato puree", "Pantry", 1, "tbsp"),
      ingredient("chopped tomatoes", "Pantry", 2, "can", "400g cans"),
      ingredient("sweetcorn", "Pantry", 1, "can", "195g can"),
      ingredient("butter beans", "Pantry", 1, "can", "420g can"),
      ingredient("kidney beans", "Pantry", 1, "can", "400g can")
    ],
    instructions: [
      "Cook the garlic, ginger, onion, courgettes and peppers in the oil until they start to soften, then stir in the chilli powder.",
      "Add the lentils, tomato puree, chopped tomatoes and water and simmer until the lentils are tender.",
      "Stir in the sweetcorn and drained beans and cook until everything is hot and the sauce has thickened."
    ]
  }),
  publishedRecipe({
    slug: "vegetable-stir-fry",
    title: "Vegetable stir-fry",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 5,
    cookMinutes: 12,
    tags: ["auto-added", "vegetarian", "under 30 mins", "quick"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/noodles-stir-fried-chilli-veg",
    ingredients: [
      ingredient("egg noodles", "Pantry", 250, "g"),
      ingredient("tomato puree", "Pantry", 1, "tbsp"),
      ingredient("soy sauce", "Pantry", 2, "tbsp"),
      ingredient("sweet chilli sauce", "Pantry", 2, "tbsp"),
      ingredient("sunflower oil", "Pantry", 1, "tbsp"),
      ingredient("ginger", "Produce", 1, "item", "small piece"),
      ingredient("stir-fry vegetables", "Produce", 300, "g"),
      ingredient("red chilli", "Produce", 1, "item", "optional")
    ],
    instructions: [
      "Cook and drain the noodles, and mix the tomato puree, soy sauce and sweet chilli sauce with water.",
      "Stir-fry the ginger, vegetables and chilli briefly over a high heat.",
      "Add the noodles and sauce and toss until piping hot and evenly coated."
    ]
  }),
  publishedRecipe({
    slug: "squash-spinach-ricotta-pasta",
    title: "Roasted squash, spinach & ricotta pasta",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 40,
    tags: ["auto-added", "vegetarian", "30-60 mins", "pasta"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/roasted-squash-shallot-spinach-ricotta-pasta",
    ingredients: [
      ingredient("butternut squash", "Produce", 1, "item", "about 800g"),
      ingredient("banana shallots", "Produce", 4, "item"),
      ingredient("olive oil", "Pantry", 2, "tbsp"),
      ingredient("wholemeal pasta", "Pantry", 400, "g"),
      ingredient("spinach", "Produce", 300, "g"),
      ingredient("ricotta", "Dairy & Eggs", 6, "tbsp"),
      ingredient("sage", "Produce", 4, "sprig"),
      ingredient("lemon", "Produce", 1, "item"),
      ingredient("nutmeg", "Spices", 1, "pinch")
    ],
    instructions: [
      "Roast the diced squash and shallots with the oil until tender and caramelised.",
      "Cook the pasta and wilt the spinach, then squeeze the spinach dry.",
      "Mix the spinach with most of the ricotta, sage, lemon and nutmeg, toss through the pasta, and top with the roasted vegetables and remaining ricotta."
    ]
  }),
  publishedRecipe({
    slug: "aubergine-black-bean-stir-fry",
    title: "Aubergine & black bean stir-fry",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 20,
    tags: ["auto-added", "vegetarian", "30-60 mins", "stir-fry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/aubergine-black-bean-stir-fry",
    ingredients: [
      ingredient("basmati rice", "Pantry", 250, "g"),
      ingredient("aubergine", "Produce", 2, "item"),
      ingredient("red pepper", "Produce", 2, "item"),
      ingredient("spring onion", "Produce", 8, "item"),
      ingredient("black bean sauce", "Pantry", 220, "g"),
      ingredient("vegetable oil", "Pantry", 4, "tbsp")
    ],
    instructions: [
      "Cook the rice according to its packet instructions.",
      "Stir-fry the aubergines in the oil until golden and tender, then add the peppers and most of the spring onions.",
      "Stir through the black bean sauce with a splash of water and serve over the rice with the remaining spring onion."
    ]
  }),
  publishedRecipe({
    slug: "tofu-stir-fry",
    title: "Tofu stir-fry",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 15,
    tags: ["auto-added", "vegetarian", "30-60 mins", "stir-fry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/tofu-stir-fry",
    ingredients: [
      ingredient("soy sauce", "Pantry", 3, "tbsp"),
      ingredient("honey", "Pantry", 1.5, "tbsp"),
      ingredient("white wine vinegar", "Pantry", 1, "tbsp"),
      ingredient("tofu", "Produce", 300, "g"),
      ingredient("sunflower oil", "Pantry", 2, "tbsp"),
      ingredient("garlic", "Produce", 2, "clove"),
      ingredient("ginger", "Produce", 1, "item", "2cm piece"),
      ingredient("carrot", "Produce", 2, "item"),
      ingredient("broccoli", "Produce", 300, "g"),
      ingredient("red pepper", "Produce", 1, "item"),
      ingredient("cornflour", "Pantry", 1, "tsp"),
      ingredient("spring onion", "Produce", 1, "item"),
      ingredient("sesame seeds", "Pantry", 2, "tsp"),
      ingredient("coriander", "Produce", 1, "bunch")
    ],
    instructions: [
      "Mix the soy sauce, honey and vinegar, then fry the tofu until golden and add the garlic and ginger.",
      "Coat the tofu with half the dressing and set it aside while the vegetables are stir-fried until tender-crisp.",
      "Thicken the remaining dressing with cornflour, toss it through the vegetables, and serve with the tofu and garnishes."
    ]
  }),
  publishedRecipe({
    slug: "chicken-pesto-pasta",
    title: "Chicken & pesto pasta",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 10,
    tags: ["auto-added", "chicken", "under 30 mins", "quick", "pasta"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/creamy-chicken-green-bean-pesto-pasta",
    ingredients: [
      ingredient("pasta", "Pantry", 400, "g"),
      ingredient("green beans", "Produce", 250, "g"),
      ingredient("olive oil", "Pantry", 1, "tbsp"),
      ingredient("spring onion", "Produce", 1, "bunch"),
      ingredient("cooked chicken breast", "Meat & Fish", 2, "item"),
      ingredient("pesto", "Pantry", 5, "tbsp"),
      ingredient("double cream", "Dairy & Eggs", 3, "tbsp"),
      ingredient("parmesan", "Dairy & Eggs", 1, "handful")
    ],
    instructions: [
      "Cook the pasta, adding the green beans for the final few minutes, then drain while reserving a little cooking water.",
      "Soften the spring onions, warm through the shredded chicken, and stir in the pesto and cream.",
      "Toss the pasta and beans through the chicken sauce, loosen with cooking water if needed, and finish with parmesan."
    ]
  }),
  publishedRecipe({
    slug: "chicken-fajitas",
    title: "Chicken fajitas",
    servings: 8,
    mealTypes: ["dinner"],
    prepMinutes: 20,
    cookMinutes: 25,
    tags: ["auto-added", "chicken", "30-60 mins", "family"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/chicken-fajitas",
    ingredients: [
      ingredient("flour tortilla", "Bakery", 24, "item"),
      ingredient("soured cream", "Dairy & Eggs", 300, "g"),
      ingredient("chicken breast", "Meat & Fish", 6, "item"),
      ingredient("olive oil", "Pantry", 6, "tbsp"),
      ingredient("garlic", "Produce", 2, "clove"),
      ingredient("lime", "Produce", 2, "item"),
      ingredient("chilli powder", "Spices", 1, "tsp"),
      ingredient("ground cumin", "Spices", 1, "tsp"),
      ingredient("coriander", "Produce", 1, "pack"),
      ingredient("red onion", "Produce", 1, "item"),
      ingredient("red pepper", "Produce", 2, "item"),
      ingredient("yellow pepper", "Produce", 2, "item"),
      ingredient("cherry tomatoes", "Produce", 200, "g")
    ],
    instructions: [
      "Slice and season the chicken with oil, garlic, lime, chilli, cumin and coriander.",
      "Fry the onion, peppers and tomatoes in batches until softened and lightly charred.",
      "Cook the chicken strips over a high heat until cooked through, warm the tortillas, and serve everything with soured cream."
    ]
  }),
  publishedRecipe({
    slug: "all-in-one-chicken-traybake",
    title: "All-in-one chicken traybake",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 20,
    tags: ["auto-added", "chicken", "30-60 mins", "traybake"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/all-one-chicken-traybake",
    ingredients: [
      ingredient("olive oil", "Pantry", 2, "tbsp"),
      ingredient("chicken breast", "Meat & Fish", 4, "item", "skin-on"),
      ingredient("new potatoes", "Produce", 750, "g"),
      ingredient("dried thyme", "Spices", 1, "pinch"),
      ingredient("garlic", "Produce", 4, "clove"),
      ingredient("roasted peppers", "Pantry", 1, "jar", "450g jar"),
      ingredient("orange", "Produce", 2, "item"),
      ingredient("black olives", "Pantry", 200, "g")
    ],
    instructions: [
      "Brown the chicken skin-side down with the sliced potatoes in a flameproof roasting tin.",
      "Turn everything, add the thyme and garlic, and roast until the potatoes are tender.",
      "Add the peppers, orange and olives and return to the oven until the chicken is fully cooked."
    ]
  }),
  publishedRecipe({
    slug: "summery-chicken-stir-fry",
    title: "Summery chicken stir-fry",
    servings: 2,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 15,
    tags: ["auto-added", "chicken", "under 30 mins", "quick", "stir-fry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/summery-chicken-stir-fry",
    ingredients: [
      ingredient("cashew nuts", "Pantry", 1, "handful"),
      ingredient("sunflower oil", "Pantry", 2, "tbsp"),
      ingredient("chicken breast", "Meat & Fish", 2, "item"),
      ingredient("spring onion", "Produce", 3, "item"),
      ingredient("broccoli", "Produce", 175, "g"),
      ingredient("sugar snap peas", "Produce", 175, "g"),
      ingredient("Chinese leaf", "Produce", 0.5, "head"),
      ingredient("hoisin sauce", "Pantry", 2, "tbsp")
    ],
    instructions: [
      "Toast the cashews, then stir-fry the chicken until browned and set it aside.",
      "Stir-fry the spring onions and broccoli, then add the sugar snaps and Chinese leaf.",
      "Return the chicken with the hoisin sauce and a splash of water, cover until cooked through, and scatter over the cashews."
    ]
  }),
  publishedRecipe({
    slug: "chicken-sweet-potato-curry",
    title: "Chicken & sweet potato curry",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 45,
    tags: ["auto-added", "chicken", "30-60 mins", "curry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/chicken-sweet-potato-curry",
    ingredients: [
      ingredient("sunflower oil", "Pantry", 1, "tbsp"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("chicken thigh", "Meat & Fish", 450, "g", "boneless and skinless"),
      ingredient("korma paste", "Pantry", 165, "g"),
      ingredient("garlic", "Produce", 2, "clove"),
      ingredient("sweet potato", "Produce", 500, "g"),
      ingredient("chopped tomatoes", "Pantry", 1, "can", "400g can"),
      ingredient("spinach", "Produce", 100, "g"),
      ingredient("basmati rice", "Pantry", 300, "g", "to serve")
    ],
    instructions: [
      "Soften the onion in oil, add the chicken and cook until lightly browned.",
      "Stir in the korma paste and garlic, then add water, sweet potato and chopped tomatoes.",
      "Simmer until the chicken and sweet potato are cooked, then fold through the spinach and serve with rice."
    ]
  }),
  publishedRecipe({
    slug: "easy-tuna-pasta-bake",
    title: "Easy tuna pasta bake",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 20,
    tags: ["auto-added", "fish", "30-60 mins", "pasta"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/easy-tuna-pasta-bake",
    ingredients: [
      ingredient("fusilli", "Pantry", 400, "g"),
      ingredient("frozen peas", "Frozen", 100, "g"),
      ingredient("butter", "Dairy & Eggs", 50, "g"),
      ingredient("plain flour", "Pantry", 50, "g"),
      ingredient("milk", "Dairy & Eggs", 600, "ml"),
      ingredient("Dijon mustard", "Pantry", 1, "tsp"),
      ingredient("tuna", "Meat & Fish", 2, "can", "195g cans, drained"),
      ingredient("spring onion", "Produce", 4, "item"),
      ingredient("sweetcorn", "Pantry", 1, "can", "198g can"),
      ingredient("cheddar", "Dairy & Eggs", 100, "g")
    ],
    instructions: [
      "Cook the pasta, adding the peas for the final few minutes.",
      "Make a white sauce with the butter, flour and milk, then stir in the mustard.",
      "Mix the pasta and peas with the tuna, spring onions, sweetcorn and sauce, top with cheddar, and grill until bubbling and golden."
    ]
  }),
  publishedRecipe({
    slug: "fish-tacos",
    title: "Fish tacos",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 20,
    cookMinutes: 10,
    tags: ["auto-added", "fish", "30-60 mins", "family"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/fish-tacos-2",
    ingredients: [
      ingredient("ground cumin", "Spices", 1, "tsp"),
      ingredient("ground coriander", "Spices", 1, "tsp"),
      ingredient("smoked paprika", "Spices", 2, "tsp"),
      ingredient("lime", "Produce", 2, "item"),
      ingredient("white fish fillet", "Meat & Fish", 500, "g"),
      ingredient("red cabbage", "Produce", 0.25, "head"),
      ingredient("tomato", "Produce", 2, "item"),
      ingredient("avocado", "Produce", 2, "item"),
      ingredient("vegetable oil", "Pantry", 2, "tbsp"),
      ingredient("tortilla wrap", "Bakery", 8, "item"),
      ingredient("coriander", "Produce", 1, "bunch"),
      ingredient("green chilli", "Produce", 1, "item", "optional"),
      ingredient("soured cream", "Dairy & Eggs", 100, "g")
    ],
    instructions: [
      "Mix the spices with lime juice, coat the fish, and leave it while preparing the cabbage, tomatoes and avocado.",
      "Grill the fish until it flakes easily and warm the tortillas.",
      "Fill each tortilla with soured cream, cabbage, tomatoes, avocado and flaked fish, then add coriander and chilli."
    ]
  }),
  publishedRecipe({
    slug: "cod-tomato-traybake",
    title: "Cod & tomato traybake",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 30,
    tags: ["auto-added", "fish", "30-60 mins", "traybake"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/cod-tomato-traybake",
    ingredients: [
      ingredient("red pepper", "Produce", 2, "item"),
      ingredient("red onion", "Produce", 2, "item"),
      ingredient("cherry tomatoes", "Produce", 250, "g"),
      ingredient("black olives", "Pantry", 1, "handful"),
      ingredient("passata", "Pantry", 340, "g"),
      ingredient("butter beans", "Pantry", 1, "can", "400g can"),
      ingredient("cod fillet", "Meat & Fish", 600, "g"),
      ingredient("basil", "Produce", 1, "bunch")
    ],
    instructions: [
      "Roast the peppers, onions, tomatoes and olives until they begin to soften and colour.",
      "Stir in the passata and drained butter beans, then nestle the cod into the vegetables.",
      "Return the tray to the oven until the cod is cooked through and finish with basil."
    ]
  }),
  publishedRecipe({
    slug: "sticky-mango-salmon",
    title: "Sticky mango-roasted salmon",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 25,
    tags: ["auto-added", "fish", "30-60 mins", "traybake"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/sticky-mango-roasted-salmon",
    ingredients: [
      ingredient("green beans", "Produce", 150, "g"),
      ingredient("tenderstem broccoli", "Produce", 150, "g"),
      ingredient("spring onion", "Produce", 6, "item"),
      ingredient("olive oil", "Pantry", 3, "tsp"),
      ingredient("salmon fillet", "Meat & Fish", 4, "item"),
      ingredient("mango chutney", "Pantry", 3, "tbsp"),
      ingredient("soy sauce", "Pantry", 2, "tsp"),
      ingredient("ginger puree", "Pantry", 1, "tsp"),
      ingredient("coriander", "Produce", 1, "handful"),
      ingredient("rice", "Pantry", 300, "g", "or noodles, to serve")
    ],
    instructions: [
      "Briefly blanch the beans, broccoli and spring onions, drain them, and spread them over a roasting tray with oil.",
      "Place the salmon in the tray and mix the mango chutney, soy sauce and ginger into a glaze.",
      "Roast with half the glaze, add the rest near the end, and serve with coriander and rice or noodles."
    ]
  }),
  publishedRecipe({
    slug: "chilli-con-carne",
    title: "Chilli con carne",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 10,
    cookMinutes: 60,
    tags: ["auto-added", "beef", "over 60 mins", "batch cook"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/chilli-con-carne-recipe",
    ingredients: [
      ingredient("onion", "Produce", 1, "item"),
      ingredient("red pepper", "Produce", 1, "item"),
      ingredient("garlic", "Produce", 2, "clove"),
      ingredient("vegetable oil", "Pantry", 1, "tbsp"),
      ingredient("chilli powder", "Spices", 1, "tsp"),
      ingredient("paprika", "Spices", 1, "tsp"),
      ingredient("ground cumin", "Spices", 1, "tsp"),
      ingredient("beef mince", "Meat & Fish", 500, "g"),
      ingredient("beef stock cube", "Pantry", 1, "item"),
      ingredient("chopped tomatoes", "Pantry", 1, "can", "400g can"),
      ingredient("dried marjoram", "Spices", 0.5, "tsp"),
      ingredient("sugar", "Pantry", 1, "tsp"),
      ingredient("tomato puree", "Pantry", 2, "tbsp"),
      ingredient("kidney beans", "Pantry", 1, "can", "410g can"),
      ingredient("long grain rice", "Pantry", 300, "g", "to serve")
    ],
    instructions: [
      "Soften the onion, pepper and garlic with the spices, then add the beef and brown it thoroughly.",
      "Add stock, tomatoes, marjoram, sugar and tomato puree and simmer gently until rich and thick.",
      "Stir in the kidney beans, simmer again, then rest briefly before serving with rice."
    ]
  }),
  publishedRecipe({
    slug: "pork-noodle-stir-fry",
    title: "Pork noodle stir-fry",
    servings: 4,
    mealTypes: ["dinner"],
    prepMinutes: 15,
    cookMinutes: 15,
    tags: ["auto-added", "pork", "30-60 mins", "stir-fry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/pork-noodle-stir-fry",
    ingredients: [
      ingredient("sesame oil", "Pantry", 3, "tbsp"),
      ingredient("pork mince", "Meat & Fish", 350, "g"),
      ingredient("egg noodles", "Pantry", 350, "g"),
      ingredient("ginger", "Produce", 1, "item", "thumb-sized piece"),
      ingredient("garlic", "Produce", 3, "clove"),
      ingredient("stir-fry vegetables", "Produce", 320, "g"),
      ingredient("soy sauce", "Pantry", 4, "tbsp"),
      ingredient("cornflour", "Pantry", 2, "tsp"),
      ingredient("sweet chilli sauce", "Pantry", 4, "tbsp")
    ],
    instructions: [
      "Brown the pork mince in sesame oil while soaking the noodles until soft.",
      "Add the ginger, garlic and vegetables to the pork and stir-fry until the vegetables begin to soften.",
      "Mix the soy, cornflour, sweet chilli sauce and water, then add the drained noodles and toss until coated."
    ]
  }),
  publishedRecipe({
    slug: "easy-beef-broccoli",
    title: "Easy beef and broccoli",
    servings: 2,
    mealTypes: ["dinner"],
    prepMinutes: 5,
    cookMinutes: 10,
    tags: ["auto-added", "beef", "under 30 mins", "quick", "stir-fry"],
    source: "Good Food",
    sourceUrl: "https://www.bbcgoodfood.com/recipes/beef-stir-fry-broccoli-oyster-sauce",
    ingredients: [
      ingredient("sunflower oil", "Pantry", 1, "tbsp"),
      ingredient("beef stir-fry strips", "Meat & Fish", 200, "g"),
      ingredient("tenderstem broccoli", "Produce", 200, "g"),
      ingredient("onion", "Produce", 1, "item"),
      ingredient("garlic", "Produce", 1, "clove"),
      ingredient("oyster sauce", "Pantry", 2, "tbsp")
    ],
    instructions: [
      "Stir-fry the beef in hot oil until browned, then transfer it to a plate.",
      "Cook the broccoli with a splash of water, add the onion and garlic, then pour in the oyster sauce and water.",
      "Reduce to a glossy sauce, return the beef and its juices to the pan, and serve immediately."
    ]
  })
];

export function installAutoAddedRecipePack(
  recipes: Recipe[],
  installedRecipePacks: string[] = []
): { recipes: Recipe[]; installedRecipePacks: string[]; addedCount: number } {
  if (installedRecipePacks.includes(AUTO_ADDED_RECIPE_PACK_ID)) {
    return { recipes, installedRecipePacks, addedCount: 0 };
  }

  const existingIds = new Set(recipes.map((recipe) => recipe.id));
  const existingSources = new Set(recipes.map((recipe) => recipe.sourceUrl?.trim().toLowerCase()).filter(Boolean));
  const existingTitles = new Set(recipes.map((recipe) => recipe.title.trim().toLowerCase()));
  const additions = autoAddedRecipes.filter((recipe) => {
    const source = recipe.sourceUrl?.trim().toLowerCase();
    return !existingIds.has(recipe.id) && (!source || !existingSources.has(source)) && !existingTitles.has(recipe.title.toLowerCase());
  });

  return {
    recipes: [...recipes, ...additions],
    installedRecipePacks: [...installedRecipePacks, AUTO_ADDED_RECIPE_PACK_ID],
    addedCount: additions.length
  };
}
