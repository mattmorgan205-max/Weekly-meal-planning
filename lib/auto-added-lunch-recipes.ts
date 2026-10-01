import type { GroceryCategory, Ingredient, Recipe } from "./domain";

export const AUTO_ADDED_LUNCH_PACK_ID = "good-food-lunches-2026-10-v1";
const checkedAt = "2026-10-01";
type PackIngredient = [name: string, category: GroceryCategory, quantity?: number, unit?: string, note?: string];
type LunchRecipe = Recipe & { sourceRating: { value: number; ratingCount: number; checkedAt: string } };
type Entry = {
  slug: string; title: string; servings: number; prep: number; cook: number;
  rating: number; count: number; image: string; tags: string[];
  ingredients: PackIngredient[]; instructions: string[]; notes?: string; alternateTitles?: string[];
};

// Prep is the publisher's hands-on time, not elapsed time or time to cook leftovers.
const entries: Entry[] = [
  {
    slug: "quick-chicken-hummus-bowl", title: "Quick chicken hummus bowl", servings: 2, prep: 10, cook: 0,
    rating: 4.7, count: 33, tags: ["chicken", "salad"],
    image: "2020/08/quick-chicken-and-hummus-bowl-3863168.jpg?resize=440,400",
    ingredients: [
      ["hummus", "Dairy & Eggs", 200, "g"], ["lemon", "Produce", 1, "item"],
      ["cooked mixed grains", "Pantry", 200, "g", "Ready-to-eat pouch"], ["baby spinach", "Produce", 150, "g"],
      ["avocado", "Produce", 1, "item"], ["cooked chicken breast", "Meat & Fish", 1, "item"],
      ["pomegranate seeds", "Produce", 100, "g"], ["red onion", "Produce", 0.5, "item"],
      ["toasted almonds", "Pantry", 2, "tbsp"]
    ],
    instructions: [
      "Thin 2 tbsp hummus with half the lemon juice, the zest and a little water. Toss this dressing with the ready-to-eat grains and divide between two bowls; add spinach.",
      "Dress sliced avocado with the remaining lemon juice. Arrange with sliced cooked chicken, pomegranate, onion, almonds and the rest of the hummus. Mix before eating."
    ],
    notes: "Requires ready-cooked chicken and ready-to-eat grains; their cooking time is not included."
  },
  {
    slug: "10minute-couscous-salad", title: "10-minute couscous salad", servings: 2, prep: 10, cook: 0,
    rating: 4.7, count: 263, tags: ["vegetarian", "salad"],
    image: "2020/08/couscous-9ab75f0.jpg?resize=500,454",
    ingredients: [
      ["couscous", "Pantry", 100, "g"], ["vegetable stock", "Pantry", 200, "ml", "Hot, low-salt"],
      ["spring onion", "Produce", 2, "item"], ["red pepper", "Produce", 1, "item"],
      ["cucumber", "Produce", 0.5, "item"], ["feta", "Dairy & Eggs", 50, "g"],
      ["vegetarian pesto", "Pantry", 2, "tbsp"], ["pine nuts", "Pantry", 2, "tbsp"]
    ],
    instructions: [
      "Cover couscous with the hot stock and leave covered for 10 minutes. Meanwhile slice the spring onions and pepper and dice the cucumber.",
      "Fluff the grains, mix with the vegetables and pesto, then add crumbled feta and pine nuts."
    ]
  },
  {
    slug: "spicy-chicken-avocado-wraps", title: "Spicy chicken & avocado wraps", servings: 2, prep: 5, cook: 8,
    rating: 4.4, count: 115, tags: ["chicken", "wraps"],
    image: "2020/08/spicychickenavocadowraps_5865-4035909.jpg?resize=440,400",
    ingredients: [
      ["chicken breast", "Meat & Fish", 180, "g", "About one breast, thinly sliced"], ["lime", "Produce", 0.5, "item", "Juice"],
      ["mild chilli powder", "Spices", 0.5, "tsp"], ["garlic", "Produce", 1, "clove"],
      ["olive oil", "Pantry", 1, "tsp"], ["seeded wraps", "Bakery", 2, "item"], ["avocado", "Produce", 1, "item"],
      ["jarred roasted red pepper", "Pantry", 1, "item"], ["coriander", "Produce", undefined, undefined, "A few sprigs"]
    ],
    instructions: [
      "Coat sliced chicken with lime juice, chilli and chopped garlic. Fry in oil until thoroughly cooked, adding sliced roasted pepper to warm through.",
      "Warm the wraps without drying them. Mash half the avocado onto each, add chicken, pepper and coriander, then fold and roll."
    ]
  },
  {
    slug: "quick-spicy-nasi-goreng", title: "Quick & spicy nasi goreng", servings: 1, prep: 10, cook: 10,
    rating: 4.5, count: 58, tags: ["rice"],
    image: "2020/08/quick-spicy-nasi-goreng-f266a12.jpg?resize=440,400",
    ingredients: [
      ["vegetable oil", "Pantry", 2, "tbsp"], ["onion", "Produce", 1, "item", "Small, sliced"],
      ["garlic", "Produce", 2, "clove"], ["carrot", "Produce", 1, "item", "Grate"],
      ["Savoy cabbage", "Produce", 0.5, "item", "Small; Chinese cabbage also works"],
      ["cooked brown rice", "Pantry", 175, "g"], ["fish sauce", "Pantry", 1, "tbsp", "Optional; omit for vegetarian"],
      ["soy sauce", "Pantry", 1, "tbsp"], ["egg", "Dairy & Eggs", 1, "item"],
      ["sriracha", "Pantry", undefined, undefined, "To serve"]
    ],
    instructions: [
      "Stir-fry onion in hot oil for 3-4 minutes, then garlic for 1 minute. Add grated carrot and shredded cabbage for another 1-2 minutes.",
      "Add cooked rice, soy and optional fish sauce, heating the rice thoroughly. Make space in the middle and fry the egg until set to your liking. Serve with sriracha."
    ],
    notes: "Uses cooked brown rice; cooking rice from dry is additional. Omit the optional fish sauce for a vegetarian version."
  },
  {
    slug: "storecupboard-pasta-salad", title: "Storecupboard pasta salad", servings: 2, prep: 5, cook: 0,
    rating: 4.3, count: 72, tags: ["fish", "pasta", "salad"],
    image: "2020/08/recipe-image-legacy-id-663451_11-43ad8a6.jpg?resize=440,400",
    ingredients: [
      ["red onion", "Produce", 2, "tsp", "Finely chop"], ["capers", "Pantry", 1, "tsp"],
      ["pesto", "Pantry", 1, "tbsp"], ["olive oil", "Pantry", 2, "tsp"],
      ["tinned tuna", "Meat & Fish", 1, "can", "185g tin in spring water, drained"],
      ["cooked pasta", "Pantry", 100, "g", "Leftover cooked weight, not dry weight"],
      ["sundried tomatoes", "Pantry", 3, "item"]
    ],
    instructions: [
      "Combine finely chopped onion, capers, pesto and oil to make a dressing.",
      "Mix flaked drained tuna, cold cooked pasta and chopped sundried tomatoes with the dressing."
    ],
    notes: "The 100g pasta is already cooked. The five-minute preparation time assumes leftover pasta."
  },
  {
    slug: "halloumi-carrot-orange-salad", title: "Halloumi, carrot & orange salad", servings: 4, prep: 5, cook: 15,
    rating: 4.8, count: 119, tags: ["vegetarian", "salad"],
    image: "2020/08/halloumi-carrot-orange-salad-64b2d8b.jpg?resize=440,400",
    ingredients: [
      ["orange", "Produce", 2, "item", "Large"], ["wholegrain mustard", "Pantry", 1.5, "tbsp"],
      ["honey", "Pantry", 1.5, "tsp"], ["white wine vinegar", "Pantry", 1, "tbsp"],
      ["olive oil", "Pantry", 3, "tbsp", "Plus a little for frying"], ["carrot", "Produce", 2, "item", "Large"],
      ["halloumi", "Dairy & Eggs", 225, "g"], ["watercress", "Produce", 100, "g", "Or baby spinach"]
    ],
    instructions: [
      "Peel and segment the oranges, catching their juice. Whisk the juice with mustard, honey, vinegar, oil and seasoning. Toss in carrot ribbons.",
      "Fry sliced halloumi in a little oil until browned on both faces. Toss watercress with the carrots and serve topped with halloumi and orange segments."
    ]
  },
  {
    slug: "chorizo-chickpea-soup", title: "Chorizo & chickpea soup", servings: 2, prep: 5, cook: 10,
    rating: 4.7, count: 146, tags: ["pork", "soup"],
    image: "2020/08/recipe-image-legacy-id-338571_12-66e09c7.jpg?resize=440,400",
    ingredients: [
      ["chopped tomatoes", "Pantry", 400, "g"], ["chorizo", "Meat & Fish", 110, "g"],
      ["Savoy cabbage", "Produce", 140, "g"], ["chilli flakes", "Spices", undefined, undefined, "A sprinkling"],
      ["chickpeas", "Pantry", 1, "can", "410g tin, drained and rinsed"], ["vegetable stock cube", "Pantry", 1, "item"],
      ["crusty bread", "Bakery", undefined, undefined, "To serve; garlic bread is an alternative"]
    ],
    instructions: [
      "Heat the tomatoes with 400ml water in a saucepan. Chop the chorizo and shred the cabbage.",
      "Add chorizo, cabbage, chilli, chickpeas and crumbled stock cube. Cover and boil for about 6 minutes until the cabbage is tender; serve with bread."
    ]
  },
  {
    slug: "chicken-tzatziki-wraps", title: "Chicken & tzatziki wraps", servings: 4, prep: 10, cook: 15,
    rating: 4.8, count: 30, tags: ["chicken", "wraps"],
    image: "2023/10/Chicken-and-tzatziki-wraps-fb41f04.jpg?resize=768,713",
    ingredients: [
      ["cucumber", "Produce", 1, "item"], ["Greek yogurt", "Dairy & Eggs", 250, "g"],
      ["chicken breast", "Meat & Fish", 500, "g"], ["olive oil", "Pantry", 2, "tbsp"],
      ["wholemeal wraps", "Bakery", 4, "item"], ["tomato", "Produce", 4, "item", "Large"]
    ],
    instructions: [
      "Deseed and grate three-quarters of the cucumber; mix it with yogurt and seasoning. Slice the remainder. Coat thinly sliced chicken with 1 tbsp oil and seasoning.",
      "Fry chicken in the remaining oil for 8-10 minutes until cooked through. Warm wraps and fill with the yogurt mixture, chicken, sliced tomatoes and cucumber; roll tightly."
    ]
  },
  {
    slug: "winter-tuna-nicoise", title: "Tuna Nicoise salad", servings: 4, prep: 10, cook: 20,
    rating: 4.6, count: 31, tags: ["fish", "salad"],
    image: "2020/08/recipe-image-legacy-id-19038_11-4fb76ca.jpg?resize=440,400",
    ingredients: [
      ["waxy potatoes", "Produce", 450, "g"], ["olive oil", "Pantry", 8, "tsp", "2 tbsp plus 2 tsp"],
      ["egg", "Dairy & Eggs", 4, "item"], ["red wine vinegar", "Pantry", 1, "tbsp"],
      ["capers", "Pantry", 2, "tbsp"], ["sundried tomatoes in oil", "Pantry", 50, "g"],
      ["red onion", "Produce", 0.5, "item"], ["baby spinach", "Produce", 100, "g"],
      ["tinned tuna", "Meat & Fish", 2, "can", "160g or 200g tins in spring water, drained"]
    ],
    instructions: [
      "Roast thick potato slices with 2 tsp oil and seasoning at 200C (180C fan) for 20 minutes, turning halfway. Meanwhile boil eggs for 8-10 minutes, cool, peel and halve.",
      "Mix the remaining oil, vinegar, capers and chopped sundried tomatoes. Toss with onion, spinach, tuna and potatoes; arrange the eggs on top."
    ]
  },
  {
    slug: "grilled-peach-chicken-feta-salad", title: "Grilled peach, chicken & feta salad", servings: 4, prep: 10, cook: 12,
    rating: 4.8, count: 30, tags: ["chicken", "salad"],
    image: "2020/08/recipe-image-legacy-id-1031452_11-e7a5417.jpg?resize=440,400",
    ingredients: [
      ["chicken mini fillets", "Meat & Fish", 400, "g"], ["olive oil", "Pantry", 3, "tbsp"],
      ["peach", "Produce", 4, "item"], ["sherry vinegar", "Pantry", 4, "tsp"], ["honey", "Pantry", 1, "tbsp"],
      ["red chilli", "Produce", 1, "item"], ["herb salad leaves", "Produce", 110, "g"], ["feta", "Dairy & Eggs", 100, "g"]
    ],
    instructions: [
      "Coat chicken with half a tablespoon of oil and seasoning. Griddle for 3-4 minutes per side until cooked through; rest. Quarter peaches and griddle with another half tablespoon of oil for 1-2 minutes per cut side.",
      "Whisk the remaining oil with vinegar, honey and chopped chilli. Dress the leaves, top with chicken, peaches and crumbled feta, and add the chicken resting juices."
    ]
  },
  {
    slug: "veggie-olive-wraps-mustard-vinaigrette", title: "Veggie olive wraps with mustard vinaigrette", servings: 1, prep: 10, cook: 0,
    rating: 4.7, count: 31, tags: ["vegetarian", "vegan", "wraps"],
    image: "2020/08/olive-wrap-c866064.jpg?resize=440,400",
    ingredients: [
      ["carrot", "Produce", 1, "item"], ["red cabbage", "Produce", 80, "g"], ["spring onion", "Produce", 2, "item"],
      ["courgette", "Produce", 1, "item"], ["basil", "Produce", undefined, undefined, "A handful"],
      ["green olives", "Pantry", 5, "item"], ["English mustard powder", "Spices", 0.5, "tsp"],
      ["rapeseed oil", "Pantry", 2, "tsp"], ["cider vinegar", "Pantry", 1, "tbsp"],
      ["seeded tortilla", "Bakery", 1, "item", "Large"]
    ],
    instructions: [
      "Grate carrot and courgette, shred cabbage and slice spring onions. Toss with basil, halved olives, mustard, oil and vinegar.",
      "Heap the mixture onto the tortilla and roll firmly, folding in the ends. Wrap for transport or halve and serve."
    ]
  },
  {
    slug: "chicken-satay-salad", title: "Chicken satay salad", servings: 2, prep: 15, cook: 10,
    rating: 4.8, count: 367, tags: ["chicken", "salad"],
    image: "2020/08/chicken-satay-salad-8f5b068.jpg?resize=440,400",
    ingredients: [
      ["tamari", "Pantry", 1, "tbsp"], ["curry powder", "Spices", 1, "tsp"], ["ground cumin", "Spices", 0.25, "tsp"],
      ["garlic", "Produce", 1, "clove"], ["honey", "Pantry", 1, "tsp"], ["chicken breast", "Meat & Fish", 2, "item"],
      ["crunchy peanut butter", "Pantry", 1, "tbsp"], ["sweet chilli sauce", "Pantry", 1, "tbsp"],
      ["lime juice", "Produce", 1, "tbsp"], ["sunflower oil", "Pantry", undefined, undefined, "To grease the pan"],
      ["Little Gem lettuce", "Produce", 2, "item"], ["cucumber", "Produce", 0.25, "item"],
      ["banana shallot", "Produce", 1, "item"], ["coriander", "Produce", undefined, undefined, "Chopped, to serve"],
      ["pomegranate", "Produce", 0.5, "item", "Seeds only"]
    ],
    instructions: [
      "Mix tamari, curry powder, cumin, garlic and honey. Halve chicken breasts horizontally, coat and refrigerate for at least 1 hour or overnight.",
      "Mix peanut butter, chilli sauce, lime juice and 1 tbsp water. Grease a non-stick pan; cook chicken covered over medium heat for 5-6 minutes, turning near the end and continuing until cooked through. Rest covered.",
      "Combine lettuce, cucumber, sliced shallot, coriander and pomegranate. Serve with sliced chicken and the peanut dressing."
    ],
    notes: "Allow at least 1 hour for marinating in addition to the listed 15-minute prep and 10-minute cook times."
  },
  {
    slug: "mexican-bean-soup-guacamole", title: "Mexican bean soup with guacamole", servings: 2, prep: 10, cook: 20,
    rating: 4.8, count: 153, tags: ["vegetarian", "vegan", "soup"],
    image: "2020/08/wdp-lunch-mexicanguacamolesoup_02051-d1c462c.jpg?resize=440,400",
    ingredients: [
      ["rapeseed oil", "Pantry", 2, "tsp"], ["onion", "Produce", 1, "item", "Large"],
      ["red pepper", "Produce", 1, "item"], ["garlic", "Produce", 2, "clove"],
      ["mild chilli powder", "Spices", 2, "tsp"], ["ground coriander", "Spices", 1, "tsp"],
      ["ground cumin", "Spices", 1, "tsp"], ["chopped tomatoes", "Pantry", 400, "g"],
      ["black beans", "Pantry", 1, "can", "400g, including liquid"], ["vegetable bouillon powder", "Pantry", 1, "tsp"],
      ["avocado", "Produce", 1, "item"], ["coriander", "Produce", undefined, undefined, "A handful"],
      ["lime", "Produce", 1, "item"], ["red chilli", "Produce", 0.5, "item", "Optional"]
    ],
    instructions: [
      "Reserve 1 tbsp chopped onion. Fry the rest with chopped pepper in oil for 10 minutes. Add garlic, spices, tomatoes, beans with their liquid, 200ml water and bouillon; simmer covered for 15 minutes.",
      "Mash avocado with the reserved onion, coriander, lime juice and optional chilli. Spoon over the hot soup."
    ],
    notes: "The source lists 20 minutes cooking, although its method gives 10 minutes frying plus 15 minutes simmering; allow extra time."
  },
  {
    slug: "pesto-spinach-penne", title: "Pesto spinach penne", servings: 4, prep: 5, cook: 15,
    rating: 4.2, count: 23, tags: ["vegetarian", "pasta"],
    image: "2023/12/Pesto-spinach-penne-9942b45.jpg?resize=768,713",
    ingredients: [
      ["wholemeal penne", "Pantry", 400, "g"], ["vegetarian basil pesto", "Pantry", 5, "tbsp"],
      ["baby spinach", "Produce", 500, "g"], ["cherry tomatoes", "Produce", 220, "g"]
    ],
    instructions: [
      "Boil penne according to its packet. Meanwhile heat 4 tbsp pesto, add chopped spinach and 2 tbsp water, and cover until wilted.",
      "Drain the pasta and combine with the spinach, remaining pesto and halved tomatoes. Serve immediately or cool promptly and refrigerate for later lunches."
    ]
  },
  {
    slug: "tortellini-pesto-broccoli", title: "Tortellini with pesto & broccoli", servings: 2, prep: 5, cook: 5,
    rating: 4.8, count: 37, tags: ["vegetarian", "pasta", "salad"],
    image: "2020/08/recipe-image-legacy-id-1046467_11-388017f.jpg?resize=440,400",
    ingredients: [
      ["Tenderstem broccoli", "Produce", 140, "g"], ["vegetarian tortellini", "Dairy & Eggs", 250, "g", "Fresh"],
      ["vegetarian pesto", "Pantry", 3, "tbsp"], ["toasted pine nuts", "Pantry", 2, "tbsp"],
      ["balsamic vinegar", "Pantry", 1, "tbsp"], ["cherry tomatoes", "Produce", 8, "item"]
    ],
    instructions: [
      "Boil short broccoli pieces for 2 minutes. Add tortellini and cook for another 2 minutes, or as directed on its packet. Drain and briefly rinse cold.",
      "Toss with pesto, pine nuts and vinegar, then add halved tomatoes. Divide between two lunch containers and chill."
    ]
  },
  {
    slug: "moroccan-chickpea-soup-0", title: "Moroccan-style chickpea soup", servings: 4, prep: 5, cook: 20,
    rating: 4.6, count: 326, tags: ["vegetarian", "vegan", "soup"],
    image: "2020/08/recipe-image-legacy-id-192471_11-88af07f.jpg?resize=440,400",
    ingredients: [
      ["olive oil", "Pantry", 1, "tbsp"], ["onion", "Produce", 1, "item"], ["celery", "Produce", 2, "stalk"],
      ["ground cumin", "Spices", 2, "tsp"], ["vegetable stock", "Pantry", 600, "ml"],
      ["chopped tomatoes with garlic", "Pantry", 400, "g"], ["chickpeas", "Pantry", 1, "can", "400g, drained and rinsed"],
      ["frozen broad beans", "Frozen", 100, "g"], ["lemon", "Produce", 0.5, "item", "Zest and juice"],
      ["coriander", "Produce", undefined, undefined, "Large handful; parsley also works"],
      ["flatbread", "Bakery", undefined, undefined, "To serve"]
    ],
    instructions: [
      "Soften chopped onion and celery in oil for 10 minutes. Stir in cumin for 1 minute, then add stock, tomatoes and chickpeas; simmer for 8 minutes.",
      "Add broad beans and lemon juice and cook for 2 minutes. Season, scatter with lemon zest and herbs, and serve with flatbread."
    ]
  },
  {
    slug: "leek-potato-soup", title: "Leek & potato soup (Vichyssoise)", alternateTitles: ["Leek and potato soup", "Vichyssoise"],
    servings: 8, prep: 20, cook: 25, rating: 4.8, count: 520, tags: ["vegetarian", "soup"],
    image: "2020/08/recipe-image-legacy-id-22567_12-4803173.jpg?resize=440,400",
    ingredients: [
      ["butter", "Dairy & Eggs", 50, "g", "Plus a small knob for the garnish"], ["potato", "Produce", 450, "g"],
      ["onion", "Produce", 1, "item", "Small"], ["leek", "Produce", 450, "g", "White parts"],
      ["vegetable stock", "Pantry", 850, "ml", "Source allows up to 1200ml to thin the soup"],
      ["whipping cream", "Dairy & Eggs", 142, "ml"], ["whole milk", "Dairy & Eggs", 125, "ml"],
      ["leek", "Produce", 1, "item", "White part, for garnish"], ["chives", "Produce", undefined, undefined, "For garnish"]
    ],
    instructions: [
      "Dice potato and onion and slice leeks. Toss in melted butter, season, cover vegetables with baking paper and a lid, and gently soften for 10 minutes without browning.",
      "Remove the paper, add 850ml stock and simmer for about 5 minutes until tender. Blend; stir in three-quarters of the cream and the milk.",
      "Soften the extra shredded leek in a little butter. Reheat soup gently, loosening with extra stock if needed. Finish with the remaining cream, buttered leek and chives."
    ],
    notes: "Stock range in source: 850-1200ml; 850ml is listed initially. Vegetable stock selected from the source's chicken/vegetable alternatives."
  },
  {
    slug: "broccoli-stilton-soup", title: "Broccoli & stilton soup", servings: 4, prep: 10, cook: 35,
    rating: 4.8, count: 579, tags: ["vegetarian", "soup"],
    image: "2020/08/recipe-image-legacy-id-889457_11-4468b81.jpg?resize=440,400",
    ingredients: [
      ["rapeseed oil", "Pantry", 2, "tbsp"], ["onion", "Produce", 1, "item"], ["celery", "Produce", 1, "stalk"],
      ["leek", "Produce", 1, "item"], ["potato", "Produce", 1, "item", "Medium"],
      ["butter", "Dairy & Eggs", undefined, undefined, "A knob"], ["vegetable stock", "Pantry", 1000, "ml"],
      ["broccoli", "Produce", 1, "item", "One head"], ["stilton", "Dairy & Eggs", 140, "g", "Vegetarian; crumble"]
    ],
    instructions: [
      "Soften chopped onion in oil. Add sliced celery and leek, diced potato and butter; cover and sweat for 5 minutes.",
      "Add stock and chopped broccoli stalk. Simmer for 10-15 minutes until tender, then add florets for 5 minutes.",
      "Blend until smooth, stir in crumbled stilton and season with pepper."
    ]
  },
  {
    slug: "chicken-caesar-salad", title: "Chicken caesar salad", servings: 4, prep: 10, cook: 20,
    rating: 4.8, count: 148, tags: ["chicken", "salad"],
    image: "2020/08/recipe-image-legacy-id-327831_11-3524329.jpg?resize=440,400",
    ingredients: [
      ["ciabatta", "Bakery", 1, "item", "Medium loaf, or 4 thick slices crusty bread"],
      ["olive oil", "Pantry", 3, "tbsp"], ["chicken breast", "Meat & Fish", 2, "item"],
      ["romaine lettuce", "Produce", 1, "item", "Large"], ["garlic", "Produce", 1, "clove"],
      ["tinned anchovies", "Meat & Fish", 2, "item"], ["parmesan", "Dairy & Eggs", undefined, undefined, "A handful grated, plus shavings; source gives no weight"],
      ["mayonnaise", "Pantry", 5, "tbsp"], ["white wine vinegar", "Pantry", 1, "tbsp"]
    ],
    instructions: [
      "Tear ciabatta into croutons, toss with 2 tbsp oil and bake at 200C (180C fan) for 8-10 minutes, turning occasionally.",
      "Coat chicken in the remaining oil and seasoning. Pan-fry for about 4 minutes per side, continuing until cooked through, then slice.",
      "Mash garlic and anchovies; mix with grated parmesan, mayonnaise and vinegar, thinning with water as needed. Toss torn lettuce, chicken and croutons with dressing and finish with cheese shavings."
    ]
  },
  {
    slug: "greek-salad", title: "Greek salad", servings: 2, prep: 15, cook: 0,
    rating: 4.8, count: 207, tags: ["vegetarian", "salad"],
    image: "2020/08/recipe-image-legacy-id-1201727_11-4026b8d.jpg?resize=440,400",
    ingredients: [
      ["vine tomato", "Produce", 4, "item", "Large"], ["cucumber", "Produce", 1, "item"],
      ["red onion", "Produce", 0.5, "item"], ["Kalamata olives", "Pantry", 16, "item"],
      ["dried oregano", "Spices", 1, "tsp"], ["feta", "Dairy & Eggs", 85, "g"],
      ["extra virgin olive oil", "Pantry", 4, "tbsp"], ["crusty bread", "Bakery", undefined, undefined, "To serve, as suggested in the source method"]
    ],
    instructions: [
      "Cut tomatoes into wedges, chop peeled and deseeded cucumber, and thinly slice onion. Combine with olives, oregano, feta chunks and oil.",
      "Season lightly, toss gently and serve with crusty bread."
    ],
    notes: "The source makes 4 side portions and recommends doubling for a main course. This unchanged quantity is saved as 2 lunch portions."
  }
];

export const autoAddedLunchRecipes: LunchRecipe[] = entries.map((entry) => {
  const total = entry.prep + entry.cook;
  return {
    id: `auto_lunch_${entry.slug}`, title: entry.title, servings: entry.servings, mealTypes: ["lunch"],
    prepMinutes: entry.prep, cookMinutes: entry.cook,
    tags: ["auto-added", ...entry.tags, ...(entry.prep <= 10 ? ["10-min prep"] : []),
      total < 30 ? "under 30 mins" : total <= 60 ? "30-60 mins" : "over 60 mins"],
    favorite: false, visibility: "global", source: "BBC Good Food",
    sourceUrl: `https://www.bbcgoodfood.com/recipes/${entry.slug}`,
    mealImageUrl: `https://images.immediate.co.uk/production/volatile/sites/30/${entry.image}`,
    sourceRating: { value: entry.rating, ratingCount: entry.count, checkedAt },
    ingredients: entry.ingredients.map(([name, category, quantity, unit, note], index): Ingredient => ({
      id: `auto_lunch_ing_${entry.slug}_${index + 1}`, name, category, quantity, unit, note,
      confidence: "high", needsReview: false, role: "required"
    })),
    instructions: entry.instructions,
    notes: `Auto-added from BBC Good Food. ${entry.rating}/5 from ${entry.count} ratings, checked ${checkedAt}. Condensed method; see source for the full recipe. ${entry.notes ?? ""}`.trim(),
    importedFrom: "url", createdAt: `${checkedAt}T12:00:00.000Z`, updatedAt: `${checkedAt}T12:00:00.000Z`
  };
});

function titleKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceKey(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^(www|tollbit)\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch { return value.trim().toLowerCase(); }
}

export function installAutoAddedLunchPack(existing: Recipe[], installedRecipePacks: string[] = []) {
  if (installedRecipePacks.includes(AUTO_ADDED_LUNCH_PACK_ID)) {
    return { recipes: existing, installedRecipePacks, addedCount: 0 };
  }
  const ids = new Set(existing.map((recipe) => recipe.id));
  const titles = new Set(existing.map((recipe) => titleKey(recipe.title)));
  const sources = new Set(existing.map((recipe) => sourceKey(recipe.sourceUrl)).filter(Boolean));
  const additions = autoAddedLunchRecipes.filter((recipe, index) =>
    !ids.has(recipe.id) && !sources.has(sourceKey(recipe.sourceUrl)) &&
    ![recipe.title, ...(entries[index].alternateTitles ?? [])].some((title) => titles.has(titleKey(title)))
  );
  return {
    recipes: [...existing, ...additions],
    installedRecipePacks: [...installedRecipePacks, AUTO_ADDED_LUNCH_PACK_ID], addedCount: additions.length
  };
}
