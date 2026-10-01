import type { GroceryCategory, Ingredient, Recipe } from "./domain";

export const AUTO_ADDED_RECIPE_PACK_V3_ID = "good-food-rated-recipes-2026-10-v3";
const checkedAt = "2026-10-01";
const publishedAt = `${checkedAt}T12:00:00.000Z`;

type PackIngredient = [name: string, category: GroceryCategory, quantity?: number, unit?: string, note?: string];
type RatedRecipe = Recipe & {
  sourceRating: { value: number; ratingCount: number; checkedAt: string };
};
type PackRecipe = {
  slug: string;
  title: string;
  servings: number;
  prep: number;
  cook: number;
  tags: string[];
  rating: number;
  ratingCount: number;
  image: string;
  ingredients: PackIngredient[];
  instructions: string[];
  mealTypes?: Recipe["mealTypes"];
  notes?: string;
  alternateTitles?: string[];
};

// Ratings are the displayed averages, not the rounded JSON-LD star values.
const recipes: PackRecipe[] = [
  {
    slug: "spiced-carrot-lentil-soup", title: "Spiced carrot & lentil soup",
    servings: 4, prep: 10, cook: 15, tags: ["vegetarian", "soup"], mealTypes: ["lunch", "dinner"],
    rating: 4.5, ratingCount: 1560,
    image: "2020/08/recipe-image-legacy-id-1074500_11-ee0d41a.jpg?resize=440,400",
    ingredients: [
      ["cumin seeds", "Spices", 2, "tsp"], ["chilli flakes", "Spices", undefined, undefined, "A pinch"],
      ["olive oil", "Pantry", 2, "tbsp"], ["carrot", "Produce", 600, "g", "Coarsely grate"],
      ["red lentils", "Pantry", 140, "g"], ["vegetable stock", "Pantry", 1000, "ml"],
      ["milk", "Dairy & Eggs", 125, "ml"], ["plain yogurt", "Dairy & Eggs", undefined, undefined, "To serve"],
      ["naan bread", "Bakery", undefined, undefined, "To serve; source gives no quantity"]
    ],
    instructions: [
      "Toast the cumin and chilli in a dry saucepan for 1 minute; reserve half for serving.",
      "Add oil, grated carrot, lentils, stock and milk. Bring to a boil, then simmer for 15 minutes until the lentils soften.",
      "Blend to your preferred texture. Season and serve with yogurt, the reserved spices and warm naan."
    ]
  },
  {
    slug: "best-ever-macaroni-cheese-recipe", title: "Best ever macaroni cheese",
    alternateTitles: ["Best ever macaroni cheese recipe", "Macaroni cheese", "Mac and cheese"],
    servings: 4, prep: 10, cook: 40, tags: ["vegetarian", "pasta"], rating: 4.7, ratingCount: 454,
    image: "2024/09/Best-ever-macaroni-cheese-19c8add.jpg?resize=700,636",
    ingredients: [
      ["baguette", "Bakery", 50, "g", "Cut into chunks"], ["butter", "Dairy & Eggs", 3, "tbsp", "Melt 1 tbsp for the topping"],
      ["short pasta", "Pantry", 350, "g"], ["garlic", "Produce", 1, "clove"], ["English mustard powder", "Spices", 1, "tsp"],
      ["plain flour", "Pantry", 3, "tbsp"], ["whole milk", "Dairy & Eggs", 500, "ml"],
      ["mature cheddar", "Dairy & Eggs", 250, "g", "Vegetarian; grate"],
      ["vegetarian Italian hard cheese", "Dairy & Eggs", 50, "g", "Vegetarian alternative to parmesan, grated"]
    ],
    instructions: [
      "Set the oven to 200C (180C fan). Toss the bread in 1 tbsp melted butter and bake for 6 minutes. Boil the pasta for 2 minutes less than its packet time; drain.",
      "Melt the remaining butter. Cook garlic and mustard for 1 minute, then flour for 1 minute. Gradually whisk in milk; simmer for 5 minutes. Remove from heat and melt in cheddar and half the hard cheese.",
      "Combine sauce and pasta in a baking dish. Add the bread and remaining cheese; bake for 20 minutes until golden."
    ]
  },
  {
    slug: "crispy-greek-style-pie", title: "Spanakopita", alternateTitles: ["Crispy Greek-style pie"],
    servings: 4, prep: 10, cook: 30, tags: ["vegetarian", "pie"], rating: 4.6, ratingCount: 535,
    image: "2020/08/recipe-image-legacy-id-491503_12-f496108.jpg?resize=440,400",
    ingredients: [
      ["spinach", "Produce", 200, "g"], ["sundried tomatoes in oil", "Pantry", 175, "g", "Keep the oil for brushing pastry"],
      ["feta", "Dairy & Eggs", 100, "g"], ["egg", "Dairy & Eggs", 2, "item"], ["filo pastry", "Bakery", 125, "g"]
    ],
    instructions: [
      "Wilt the spinach with a little water, cool, squeeze dry and chop. Mix with chopped sundried tomatoes, crumbled feta and eggs.",
      "Brush filo with oil from the tomato jar. Overlap about three layers in a 22cm loose-bottomed tin, leaving edges overhanging. Add filling, fold the pastry over it and brush with more oil.",
      "Bake at 180C (160C fan) for 30 minutes until crisp and golden, then remove from the tin and cut into portions."
    ]
  },
  {
    slug: "satay-sweet-potato-curry", title: "Sweet potato & peanut curry", alternateTitles: ["Satay sweet potato curry"],
    servings: 4, prep: 15, cook: 45, tags: ["vegetarian", "vegan", "curry"], rating: 4.7, ratingCount: 1181,
    image: "2020/08/satay-sweet-potato-curry-17cc62d.jpg?resize=440,400",
    ingredients: [
      ["coconut oil", "Pantry", 1, "tbsp"], ["onion", "Produce", 1, "item"], ["garlic", "Produce", 2, "clove"],
      ["ginger", "Produce", 1, "item", "Thumb-sized piece, grated"],
      ["Thai red curry paste", "Pantry", 3, "tbsp", "Choose a vegetarian/vegan paste"],
      ["smooth peanut butter", "Pantry", 1, "tbsp"], ["sweet potato", "Produce", 500, "g", "Peel and cut into chunks"],
      ["coconut milk", "Pantry", 400, "ml"], ["spinach", "Produce", 200, "g"], ["lime", "Produce", 1, "item"],
      ["rice", "Pantry", undefined, undefined, "To serve; source gives no quantity"],
      ["dry roasted peanuts", "Pantry", undefined, undefined, "Optional garnish"]
    ],
    instructions: [
      "Soften the onion in coconut oil for 5 minutes. Add grated garlic and ginger and cook for another minute.",
      "Stir in curry paste, peanut butter and sweet potato. Add coconut milk and 200ml water; simmer uncovered for 25-30 minutes until the potato is tender.",
      "Wilt the spinach into the curry, add lime juice and season. Serve with rice and peanuts if desired."
    ]
  },
  {
    slug: "spinach-sweet-potato-lentil-dhal", title: "Spinach, sweet potato & lentil dhal",
    servings: 4, prep: 10, cook: 35, tags: ["vegetarian", "vegan", "curry"], rating: 4.7, ratingCount: 1001,
    image: "2020/08/spinach-sweet-potato-and-lentil-dhal-be8fae5.jpg?resize=440,400",
    ingredients: [
      ["sesame oil", "Pantry", 1, "tbsp"], ["red onion", "Produce", 1, "item"], ["garlic", "Produce", 1, "clove"],
      ["ginger", "Produce", 1, "item", "Thumb-sized piece"], ["red chilli", "Produce", 1, "item"],
      ["ground turmeric", "Spices", 1.5, "tsp"], ["ground cumin", "Spices", 1.5, "tsp"],
      ["sweet potato", "Produce", 400, "g", "About 2 potatoes, cut into chunks"], ["red lentils", "Pantry", 250, "g"],
      ["vegetable stock", "Pantry", 600, "ml"], ["spinach", "Produce", 80, "g"],
      ["spring onion", "Produce", 4, "item"], ["Thai basil", "Produce", 0.5, "pack", "Small pack"]
    ],
    instructions: [
      "Gently fry the onion in sesame oil for 10 minutes. Cook the garlic, ginger and chilli for 1 minute, then the turmeric and cumin for a further minute.",
      "Coat the sweet potato in the spices. Add lentils and stock, bring to a boil and simmer covered for 20 minutes until tender.",
      "Season, fold in spinach until wilted and finish with sliced spring onions and torn basil."
    ]
  },
  {
    slug: "5605/falafel-burgers", title: "Falafel burgers",
    servings: 4, prep: 10, cook: 6, tags: ["vegetarian", "vegan", "burgers"], rating: 4.3, ratingCount: 744,
    image: "2010/06/Easy-falafels-786beb5.jpg?resize=768,845",
    ingredients: [
      ["chickpeas", "Pantry", 1, "can", "400g tin; rinse and drain"], ["red onion", "Produce", 1, "item", "Small"],
      ["garlic", "Produce", 1, "clove"], ["parsley", "Produce", undefined, undefined, "A handful"],
      ["ground cumin", "Spices", 1, "tsp"], ["ground coriander", "Spices", 1, "tsp"], ["harissa paste", "Pantry", 0.5, "tsp"],
      ["plain flour", "Pantry", 2, "tbsp"], ["sunflower oil", "Pantry", 2, "tbsp"],
      ["pitta bread", "Bakery", undefined, undefined, "To serve"], ["tomato salsa", "Pantry", 200, "g"],
      ["salad leaves", "Produce", undefined, undefined, "To serve"]
    ],
    instructions: [
      "Dry the drained chickpeas well. Process with onion, garlic, parsley, spices, harissa, flour and a little salt until nearly smooth; form four burgers.",
      "Fry in sunflower oil for about 3 minutes per side until golden. Serve in toasted pittas with salsa and salad."
    ]
  },
  {
    slug: "gnocchi-tomato-bake", title: "Gnocchi & tomato bake",
    servings: 4, prep: 5, cook: 25, tags: ["vegetarian", "pasta"], rating: 4.3, ratingCount: 462,
    image: "2020/08/recipe-image-legacy-id-10785_12-ef97513.jpg?resize=440,400",
    ingredients: [
      ["olive oil", "Pantry", 1, "tbsp"], ["onion", "Produce", 1, "item"], ["red pepper", "Produce", 1, "item"],
      ["garlic", "Produce", 1, "clove"], ["chopped tomatoes", "Pantry", 400, "g"], ["gnocchi", "Pantry", 500, "g"],
      ["basil", "Produce", undefined, undefined, "A handful"], ["mozzarella", "Dairy & Eggs", 62.5, "g", "Half a 125g ball"]
    ],
    instructions: [
      "Soften chopped onion and pepper in olive oil for 5 minutes; add garlic for 1 minute.",
      "Add tomatoes and gnocchi, then simmer for 10-15 minutes, stirring, until tender and thickened. Season and add basil.",
      "Transfer to a grillproof dish, top with mozzarella and grill on high for 5-6 minutes until golden."
    ]
  },
  {
    slug: "red-lentil-chickpea-chilli-soup", title: "Red lentil, chickpea & chilli soup",
    servings: 4, prep: 10, cook: 25, tags: ["vegetarian", "soup"], mealTypes: ["lunch", "dinner"], rating: 4.8, ratingCount: 927,
    image: "2020/08/recipe-image-legacy-id-265545_11-90c5919.jpg?resize=440,400",
    ingredients: [
      ["cumin seeds", "Spices", 2, "tsp"], ["chilli flakes", "Spices", undefined, undefined, "A large pinch"],
      ["olive oil", "Pantry", 1, "tbsp"], ["red onion", "Produce", 1, "item"], ["red lentils", "Pantry", 140, "g"],
      ["vegetable stock", "Pantry", 850, "ml"], ["chopped tomatoes", "Pantry", 400, "g"],
      ["chickpeas", "Pantry", 0.5, "can", "Half a 400g tin, drained and rinsed"],
      ["coriander", "Produce", undefined, undefined, "A small bunch"], ["Greek yogurt", "Dairy & Eggs", 4, "tbsp", "0% fat"]
    ],
    instructions: [
      "Toast the cumin and chilli in a dry pan for 1 minute. Add oil and chopped onion; soften for 5 minutes.",
      "Add lentils, stock and tomatoes. Simmer for 15 minutes, then blend to a coarse soup.",
      "Add drained chickpeas and warm through. Season, stir in coriander and serve with yogurt."
    ]
  },
  {
    slug: "chicken-chorizo-jambalaya", title: "Chicken & chorizo jambalaya",
    servings: 4, prep: 10, cook: 45, tags: ["chicken", "pork", "one pot"], rating: 4.8, ratingCount: 3082,
    image: "2020/08/recipe-image-legacy-id-1274503_8-05ae02b.jpg?resize=440,400",
    ingredients: [
      ["olive oil", "Pantry", 1, "tbsp"], ["chicken breast", "Meat & Fish", 2, "item", "Cut into pieces"],
      ["onion", "Produce", 1, "item"], ["red pepper", "Produce", 1, "item"], ["garlic", "Produce", 2, "clove"],
      ["chorizo", "Meat & Fish", 75, "g"], ["Cajun seasoning", "Spices", 1, "tbsp"],
      ["long grain rice", "Pantry", 250, "g"], ["tinned plum tomatoes", "Pantry", 400, "g"], ["chicken stock", "Pantry", 350, "ml"]
    ],
    instructions: [
      "Brown the chicken in the oil for 5-8 minutes and set aside. Soften the diced onion for 3-4 minutes.",
      "Cook the sliced pepper, garlic, chorizo and Cajun seasoning with the onion for 5 minutes.",
      "Return chicken and add rice, tomatoes and stock. Cover and gently simmer for 20-25 minutes until the rice is tender and chicken cooked through."
    ]
  },
  {
    slug: "chicken-biryani", title: "Chicken biryani",
    servings: 4, prep: 10, cook: 30, tags: ["chicken", "one pot"], rating: 4.6, ratingCount: 823,
    image: "2020/08/recipe-image-legacy-id-328452_12-d995182.jpg?resize=440,400",
    ingredients: [
      ["basmati rice", "Pantry", 300, "g"], ["butter", "Dairy & Eggs", 25, "g"], ["onion", "Produce", 1, "item", "Large, sliced"],
      ["bay leaf", "Spices", 1, "item"], ["cardamom pods", "Spices", 3, "item"], ["cinnamon stick", "Spices", 1, "item", "Small"],
      ["ground turmeric", "Spices", 1, "tsp"], ["chicken breast", "Meat & Fish", 4, "item", "Skinless, cut into chunks"],
      ["balti curry paste", "Pantry", 4, "tbsp"], ["raisins", "Pantry", 85, "g"], ["chicken stock", "Pantry", 850, "ml"],
      ["coriander", "Produce", 30, "g"], ["flaked almonds", "Pantry", 2, "tbsp", "Toast before serving"]
    ],
    instructions: [
      "Soak the rice in warm water, then rinse until clear. Cook sliced onion, bay, cardamom and cinnamon in butter for 10 minutes.",
      "Add turmeric, chicken and curry paste; cook until fragrant. Stir in rice and raisins, then add stock.",
      "Cover tightly and bring to a vigorous boil. Reduce to the lowest heat for 5 minutes, then turn off and leave covered for 10 minutes. Check chicken is cooked; mix in half the coriander and top with the rest and almonds."
    ]
  },
  {
    slug: "easy-teriyaki-chicken", title: "Easy teriyaki chicken", alternateTitles: ["Teriyaki chicken"],
    servings: 4, prep: 5, cook: 15, tags: ["chicken"], rating: 4.3, ratingCount: 306,
    image: "2020/08/easy-teriyaki-c845724.jpg?resize=440,400",
    ingredients: [
      ["toasted sesame oil", "Pantry", 2, "tbsp"], ["chicken thigh", "Meat & Fish", 6, "item", "Boneless and skinless, sliced"],
      ["garlic", "Produce", 2, "clove"], ["ginger", "Produce", 1, "item", "Thumb-sized piece, grated"],
      ["honey", "Pantry", 50, "g"], ["light soy sauce", "Pantry", 30, "ml"], ["rice wine vinegar", "Pantry", 1, "tbsp"],
      ["sesame seeds", "Pantry", 1, "tbsp"], ["spring onion", "Produce", 4, "item"],
      ["sticky rice", "Pantry", undefined, undefined, "To serve; source gives no quantity"],
      ["pak choi", "Produce", undefined, undefined, "Steam to serve; spring greens are an alternative"]
    ],
    instructions: [
      "Fry the sliced chicken in sesame oil for about 7 minutes until golden. Add garlic and ginger for 2 minutes.",
      "Add honey, soy, vinegar and 100ml water. Boil and reduce for 2-5 minutes to a sticky glaze, ensuring chicken is cooked through. Add spring onions and sesame; serve with cooked rice and steamed greens."
    ]
  },
  {
    slug: "easy-coronation-chicken", title: "Easy coronation chicken", alternateTitles: ["Coronation chicken"],
    servings: 6, prep: 5, cook: 0, tags: ["chicken"], mealTypes: ["lunch"], rating: 4.8, ratingCount: 189,
    image: "2020/08/coronation_chicken-55f6963.jpg?resize=440,400",
    notes: "Source serves 4-6; saved as 6 portions. Uses already-cooked chicken. Curry powder and sultanas use the lower ends of the source ranges; adjust to taste.",
    ingredients: [
      ["mayonnaise", "Pantry", 6, "tbsp"], ["mild curry powder", "Spices", 2, "tsp", "Source allows 2-3 tsp"],
      ["ground cinnamon", "Spices", 0.5, "tsp"], ["mango chutney", "Pantry", 2, "tbsp"],
      ["sultanas", "Pantry", 1, "tbsp", "Source allows 1-3 tbsp"], ["cooked chicken", "Meat & Fish", 500, "g", "Shred"]
    ],
    instructions: [
      "Combine mayonnaise, curry powder, cinnamon, chutney and sultanas; add black pepper to taste.",
      "Fold in the cooked shredded chicken. Add up to 2 tbsp water if the dressing is too thick. Use as a sandwich, jacket-potato or salad filling."
    ]
  },
  {
    slug: "slow-cooker-pulled-chicken", title: "Slow cooker pulled chicken",
    servings: 10, prep: 5, cook: 375, tags: ["chicken", "slow cooker"], rating: 4.7, ratingCount: 118,
    image: "2020/08/pulled-chicken-ecb7673.jpg?resize=440,400",
    notes: "Source serves 8-10 and uses 10-12 thighs; saved as 10 portions with 12 thighs. Allow 6-8 hours in the slow cooker, plus browning. Serving suggestions are unquantified in the source.",
    ingredients: [
      ["vegetable oil", "Pantry", 2, "tbsp"], ["chicken thigh", "Meat & Fish", 12, "item", "Boneless and skinless; source range 10-12"],
      ["red onion", "Produce", 2, "item"], ["garlic", "Produce", 2, "clove"], ["paprika", "Spices", 2, "tsp"],
      ["chipotle paste", "Pantry", 2, "tbsp"], ["passata", "Pantry", 250, "ml"], ["barbecue sauce", "Pantry", 100, "g"],
      ["light brown sugar", "Pantry", 1, "tbsp"], ["lime", "Produce", 1, "item"]
    ],
    instructions: [
      "Brown chicken in batches using half the oil; transfer to a slow cooker set to low. Soften onions in the remaining oil for 5 minutes, then cook garlic and paprika for 1 minute.",
      "Transfer onions and 100ml water from rinsing the pan to the cooker. Add chipotle, passata, barbecue sauce, sugar and lime juice. Season, cover and cook on low for 6-8 hours.",
      "Shred the tender chicken into its sauce. The source suggests buns, tacos, jacket potatoes or rice, with coriander, chilli and guacamole; add your chosen sides in the planner."
    ]
  },
  {
    slug: "superhealthy-salmon-burgers", title: "Superhealthy salmon burgers", alternateTitles: ["Salmon burgers"],
    servings: 4, prep: 20, cook: 10, tags: ["fish", "burgers"], rating: 4.6, ratingCount: 412,
    image: "2020/08/recipe-image-legacy-id-195496_11-7d050d4.jpg?resize=440,400",
    notes: "Current source uses lightly smoked salmon fillets. Rice is suggested in the method without a quantity; add it as a planner side if wanted.",
    ingredients: [
      ["lightly smoked salmon fillet", "Meat & Fish", 4, "item", "Raw fillets, cut into chunks"],
      ["Thai red curry paste", "Pantry", 2, "tbsp"], ["ginger", "Produce", 1, "item", "Thumb-sized piece, grated"],
      ["soy sauce", "Pantry", 1, "tsp"], ["coriander", "Produce", 1, "bunch"], ["vegetable oil", "Pantry", 1, "tsp"],
      ["lemon", "Produce", undefined, undefined, "Wedges to serve"], ["carrot", "Produce", 2, "item"],
      ["cucumber", "Produce", 1, "item", "Small, or half a large cucumber"],
      ["white wine vinegar", "Pantry", 2, "tbsp"], ["golden caster sugar", "Pantry", 1, "tsp"]
    ],
    instructions: [
      "Pulse salmon, curry paste, ginger, soy and half the coriander to a coarse mince. Shape into four burgers and fry in the oil for 4-5 minutes each side until fully cooked.",
      "Shave carrot and cucumber into ribbons. Toss with vinegar and sugar until dissolved, then add remaining coriander. Serve alongside the burgers with lemon."
    ]
  },
  {
    slug: "thai-style-steamed-fish", title: "Thai-style steamed fish",
    servings: 2, prep: 15, cook: 15, tags: ["fish"], rating: 4.5, ratingCount: 246,
    image: "2020/08/recipe-image-legacy-id-192665_11-3def7e4.jpg?resize=440,400",
    ingredients: [
      ["trout fillet", "Meat & Fish", 280, "g", "2 fillets of about 140g each"],
      ["ginger", "Produce", undefined, undefined, "A small piece, chopped"], ["garlic", "Produce", 1, "clove"],
      ["red chilli", "Produce", 1, "item", "Small and mild; remove seeds"], ["lime", "Produce", 1, "item", "Zest and juice"],
      ["baby pak choi", "Produce", 3, "item", "Quarter lengthways"], ["soy sauce", "Pantry", 2, "tbsp"]
    ],
    instructions: [
      "Put the trout on foil. Add chopped ginger, garlic, chilli and lime zest; pour over lime juice. Arrange pak choi around the fish and drizzle with soy.",
      "Seal the foil loosely, leaving room for steam. Steam for 15 minutes until the fish is cooked. Alternatively, place the parcel on a heatproof plate over simmering water and cover."
    ]
  },
  {
    slug: "smoky-hake-beans-greens", title: "Smoky hake, beans & greens",
    servings: 2, prep: 15, cook: 10, tags: ["fish", "pork"], rating: 4.8, ratingCount: 148,
    image: "2020/08/smoky-hake-beans-greens-with-quick-garlic-mayonnaise-42e0557.jpg?resize=440,400",
    ingredients: [
      ["olive oil", "Pantry", 1, "tsp", "Plus a little for the fish and tray"], ["cooking chorizo", "Meat & Fish", 100, "g"],
      ["onion", "Produce", 1, "item"], ["spinach", "Produce", 260, "g"], ["hake fillet", "Meat & Fish", 280, "g", "2 skinless 140g fillets"],
      ["smoked paprika", "Spices", 0.5, "tsp"], ["red chilli", "Produce", 1, "item"],
      ["cannellini beans", "Pantry", 1, "can", "400g tin, drained"], ["lemon", "Produce", 0.5, "item"],
      ["extra virgin olive oil", "Pantry", 1, "tbsp"], ["garlic mayonnaise", "Pantry", undefined, undefined, "Optional, to serve"]
    ],
    instructions: [
      "Cook chorizo and onion in 1 tsp oil for 5 minutes, breaking up the meat. Wilt spinach with boiling water, cool and squeeze dry.",
      "Place fish on an oiled foil-lined tray, season with paprika and drizzle with oil. Grill on high for about 5 minutes until cooked and flaky.",
      "Cook chilli with the chorizo for 1 minute. Add beans, spinach, lemon juice and extra virgin oil; heat through and serve beneath the fish. Add garlic mayonnaise if desired."
    ]
  },
  {
    slug: "simple-seafood-chowder", title: "Simple seafood chowder",
    servings: 4, prep: 15, cook: 25, tags: ["fish", "pork", "soup"], rating: 4.8, ratingCount: 148,
    image: "2020/08/seafood_chowder-be84c14.jpg?resize=500,454",
    ingredients: [
      ["vegetable oil", "Pantry", 1, "tbsp"], ["onion", "Produce", 1, "item", "Large, chopped"],
      ["streaky bacon", "Meat & Fish", 100, "g"], ["plain flour", "Pantry", 1, "tbsp"], ["fish stock", "Pantry", 600, "ml"],
      ["new potatoes", "Produce", 225, "g", "Halve"], ["mace", "Spices", undefined, undefined, "A pinch"],
      ["cayenne pepper", "Spices", undefined, undefined, "A pinch"], ["milk", "Dairy & Eggs", 300, "ml"],
      ["fish pie mix", "Meat & Fish", 320, "g", "Salmon, haddock and smoked haddock"], ["single cream", "Dairy & Eggs", 4, "tbsp"],
      ["cooked mixed shellfish", "Meat & Fish", 250, "g"], ["parsley", "Produce", undefined, undefined, "A small bunch"],
      ["crusty bread", "Bakery", undefined, undefined, "To serve"]
    ],
    instructions: [
      "Fry onion and bacon in oil for 8-10 minutes, then stir in flour for 2 minutes. Add fish stock and potatoes; cover and simmer for 10-12 minutes until tender.",
      "Add mace, cayenne, seasoning and milk. Simmer the fish mix in the soup for 4 minutes, then add cream and cooked shellfish for another minute, until everything is cooked and hot.",
      "Finish with parsley and serve with bread."
    ]
  },
  {
    slug: "cottage-pie", title: "Cottage pie",
    servings: 10, prep: 35, cook: 110, tags: ["beef", "batch cook"], rating: 4.8, ratingCount: 1167,
    image: "2020/08/recipe-image-legacy-id-1074465_10-0f090a9.jpg?resize=440,400",
    ingredients: [
      ["olive oil", "Pantry", 3, "tbsp"], ["beef mince", "Meat & Fish", 1250, "g"], ["onion", "Produce", 2, "item"],
      ["carrot", "Produce", 3, "item"], ["celery", "Produce", 3, "stalk"], ["garlic", "Produce", 2, "clove"],
      ["plain flour", "Pantry", 3, "tbsp"], ["tomato puree", "Pantry", 1, "tbsp"],
      ["red wine", "Pantry", undefined, undefined, "Optional large glass; source gives no ml amount"],
      ["beef stock", "Pantry", 850, "ml"], ["Worcestershire sauce", "Pantry", 4, "tbsp"],
      ["thyme", "Produce", undefined, undefined, "A few sprigs"], ["bay leaf", "Spices", 2, "item"],
      ["potato", "Produce", 1800, "g"], ["milk", "Dairy & Eggs", 225, "ml"], ["butter", "Dairy & Eggs", 25, "g"],
      ["mature cheddar", "Dairy & Eggs", 200, "g"], ["nutmeg", "Spices", undefined, undefined, "Grate to taste"]
    ],
    instructions: [
      "Brown mince in 1 tbsp oil and set aside. Soften onion, carrot and celery in remaining oil for about 20 minutes. Cook garlic, flour and tomato puree for a few minutes; return beef.",
      "Reduce the wine if using, then add stock, Worcestershire sauce and herbs. Simmer uncovered for 45 minutes until thick. Remove herb stalks and bay leaves.",
      "Boil and drain potatoes, then mash with milk, butter, three-quarters of the cheese and nutmeg. Cover the filling with mash and remaining cheese. Bake at 220C (200C fan) for 25-30 minutes."
    ]
  },
  {
    slug: "best-spaghetti-bolognese-recipe", title: "Spaghetti bolognese",
    alternateTitles: ["The best spaghetti bolognese recipe", "Spaghetti Bolognese recipe", "Beef bolognese"],
    servings: 6, prep: 25, cook: 110, tags: ["beef", "pork", "pasta"], rating: 4.8, ratingCount: 1214,
    image: "2020/08/the-best-spaghetti-bolognese-7e83155.jpg?resize=440,400",
    ingredients: [
      ["olive oil", "Pantry", 1, "tbsp"], ["smoked streaky bacon", "Meat & Fish", 4, "rasher"],
      ["onion", "Produce", 2, "item"], ["carrot", "Produce", 2, "item"], ["celery", "Produce", 2, "stalk"],
      ["garlic", "Produce", 2, "clove"], ["rosemary", "Produce", 2, "sprig", "Source allows 2-3 sprigs"],
      ["beef mince", "Meat & Fish", 500, "g"], ["tinned plum tomatoes", "Pantry", 800, "g"],
      ["basil", "Produce", 1, "pack", "Small pack"], ["dried oregano", "Spices", 1, "tsp"], ["bay leaf", "Spices", 2, "item"],
      ["tomato puree", "Pantry", 2, "tbsp"], ["beef stock cube", "Pantry", 1, "item"],
      ["red chilli", "Produce", 1, "item", "Optional"], ["red wine", "Pantry", 125, "ml"],
      ["cherry tomatoes", "Produce", 6, "item"], ["parmesan", "Dairy & Eggs", 75, "g", "Plus extra to serve"],
      ["spaghetti", "Pantry", 400, "g"], ["crusty bread", "Bakery", undefined, undefined, "Optional, to serve"]
    ],
    instructions: [
      "Fry chopped bacon in oil for 10 minutes. Add finely chopped onion, carrot, celery, garlic and rosemary; soften for 10 minutes. Brown mince over a higher heat for 3-4 minutes.",
      "Add both tomatoes, most basil, oregano, bay, puree, stock cube, optional chilli and wine. Break up plum tomatoes and simmer covered for 75 minutes until thick.",
      "Stir in parmesan and season. Cook spaghetti following its packet, drain and combine with sauce. Top with remaining basil and extra cheese."
    ]
  },
  {
    slug: "sams-toad-hole", title: "Toad-in-the-hole",
    servings: 4, prep: 15, cook: 45, tags: ["pork"], rating: 4.3, ratingCount: 576,
    image: "2020/08/recipe-image-legacy-id-736458_11-5ff6be2.jpg?resize=440,400",
    ingredients: [
      ["chipolata sausages", "Meat & Fish", 12, "item"], ["sunflower oil", "Pantry", 1, "tbsp"],
      ["plain flour", "Pantry", 140, "g"], ["egg", "Dairy & Eggs", 2, "item"],
      ["semi-skimmed milk", "Dairy & Eggs", 200, "ml"], ["salt", "Spices", 0.5, "tsp", "Specified in source method"]
    ],
    instructions: [
      "Set the oven to 220C (200C fan). Roast sausages with oil in a 20 x 30cm tin for 15 minutes.",
      "Whisk flour, salt and eggs, gradually adding milk to make a smooth batter. Rest while the sausages brown.",
      "Pour batter into the tin while its fat is sizzling hot. Bake on the top shelf for 25-30 minutes until risen and golden. Add gravy and vegetables as planner sides if wanted."
    ]
  }
];

export const autoAddedRecipesV3: RatedRecipe[] = recipes.map((entry) => {
  const slug = entry.slug.replaceAll("/", "-");
  const total = entry.prep + entry.cook;
  return {
    id: `auto_recipe_v3_${slug}`,
    title: entry.title,
    servings: entry.servings,
    mealTypes: entry.mealTypes ?? ["dinner"],
    prepMinutes: entry.prep,
    cookMinutes: entry.cook,
    tags: ["auto-added", ...entry.tags, total < 30 ? "under 30 mins" : total <= 60 ? "30-60 mins" : "over 60 mins"],
    favorite: false,
    visibility: "global",
    source: "BBC Good Food",
    sourceUrl: `https://www.bbcgoodfood.com/recipes/${entry.slug}`,
    mealImageUrl: `https://images.immediate.co.uk/production/volatile/sites/30/${entry.image}`,
    sourceRating: { value: entry.rating, ratingCount: entry.ratingCount, checkedAt },
    ingredients: entry.ingredients.map(([name, category, quantity, unit, note], index): Ingredient => ({
      id: `auto_ing_v3_${slug}_${index + 1}`,
      name, category, quantity, unit, note,
      confidence: "high", needsReview: false, role: "required"
    })),
    instructions: entry.instructions,
    notes: `Auto-added from BBC Good Food. ${entry.rating}/5 from ${entry.ratingCount} ratings, checked ${checkedAt}. Condensed method; follow the source link for the full recipe. ${entry.notes ?? ""}`.trim(),
    importedFrom: "url",
    createdAt: publishedAt,
    updatedAt: publishedAt
  };
});

function titleKey(title: string) {
  return title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceKey(source?: string) {
  if (!source) return "";
  try {
    const url = new URL(source);
    return `${url.hostname.replace(/^(www|tollbit)\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return source.trim().toLowerCase();
  }
}

export function installAutoAddedRecipePackV3(
  existing: Recipe[],
  installedRecipePacks: string[] = []
): { recipes: Recipe[]; installedRecipePacks: string[]; addedCount: number } {
  if (installedRecipePacks.includes(AUTO_ADDED_RECIPE_PACK_V3_ID)) {
    return { recipes: existing, installedRecipePacks, addedCount: 0 };
  }
  const ids = new Set(existing.map((recipe) => recipe.id));
  const titles = new Set(existing.map((recipe) => titleKey(recipe.title)));
  const sources = new Set(existing.map((recipe) => sourceKey(recipe.sourceUrl)).filter(Boolean));
  const additions = autoAddedRecipesV3.filter((recipe, index) => {
    const names = [recipe.title, ...(recipes[index].alternateTitles ?? [])];
    return !ids.has(recipe.id) && !sources.has(sourceKey(recipe.sourceUrl)) && !names.some((name) => titles.has(titleKey(name)));
  });
  return {
    recipes: [...existing, ...additions],
    installedRecipePacks: [...installedRecipePacks, AUTO_ADDED_RECIPE_PACK_V3_ID],
    addedCount: additions.length
  };
}
