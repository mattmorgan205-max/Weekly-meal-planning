import type { Recipe, ImportDraft } from "./domain";

export const tagGroups = {
  Diet: ["vegetarian", "vegan"],
  "Main ingredient": ["chicken", "beef", "pork", "lamb", "fish", "other meat"],
  Dish: ["pasta", "rice / noodles", "curry", "soup / stew", "salad", "sandwich / wrap", "pie", "pizza / burger"],
  "Cooking method": ["one-pot", "traybake", "slow cooker", "air fryer", "no-cook"],
  Practical: ["quick prep", "freezer-friendly", "make ahead", "packed lunch"]
};
export const householdTagNames = ["familiar", "not sophia friendly", "sophia friendly"];
export const sourceTagNames = ["auto-added", "cookbook", "photo import", "url import", "text import"];
export const timeTagNames = ["quick", "under 30 mins", "30-60 mins", "over 60 mins"];
const aliases: Record<string, string> = { "one pot": "one-pot", "one pan": "one-pot", "one-pan": "one-pot", "tray bake": "traybake", "tray-bake": "traybake", "slow-cooker": "slow cooker", "air-fryer": "air fryer", "no cook": "no-cook", "freezer friendly": "freezer-friendly", "make-ahead": "make ahead", "lunchbox": "packed lunch", "pasta bake": "pasta", gnocchi: "pasta", rice: "rice / noodles", noodles: "rice / noodles", soup: "soup / stew", stew: "soup / stew", soups: "soup / stew", wrap: "sandwich / wrap", wraps: "sandwich / wrap", sandwich: "sandwich / wrap", sandwiches: "sandwich / wrap", burger: "pizza / burger", burgers: "pizza / burger", pizza: "pizza / burger", turkey: "chicken", seafood: "fish", duck: "other meat", "photo-import": "photo import", "auto added": "auto-added" };
export const canonicalTag = (tag: string) => { const clean = tag.trim().toLowerCase().replace(/\s+/g, " "); return aliases[clean] ?? clean; };
export const uniqueTags = (tags: string[]) => [...new Set(tags.map(canonicalTag).filter(Boolean))];
export const controlledTags = Object.values(tagGroups).flat();
export const isControlledTag = (tag: string) => controlledTags.includes(canonicalTag(tag));
export const isTagMetadata = (tag: string) => [...sourceTagNames, ...householdTagNames, ...timeTagNames, "breakfast", "lunch", "dinner", "snack", "pudding", "favorite", "favourite"].includes(canonicalTag(tag));
export const customRecipeTags = (tags: string[]) => uniqueTags(tags).filter(tag => !isControlledTag(tag) && !isTagMetadata(tag));
export const tagLabel = (tag: string) => ({ chicken: "Chicken / turkey", fish: "Fish / seafood", "url import": "URL import" }[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1));
type TagRecipe = Pick<Recipe, "title" | "ingredients" | "prepMinutes" | "cookMinutes" | "totalMinutes"> & Partial<Pick<Recipe, "instructions" | "notes" | "confirmedTags" | "suppressedAutoTags" | "tags" | "provenanceTags" | "householdTags">>;

export function knownTotalMinutes(recipe: TagRecipe) {
  if (typeof recipe.totalMinutes === "number" && recipe.totalMinutes > 0) return recipe.totalMinutes;
  if (typeof recipe.prepMinutes === "number" && typeof recipe.cookMinutes === "number") return recipe.prepMinutes + recipe.cookMinutes;
  return 0;
}

export function inferredRecipeTags(recipe: TagRecipe) {
  const tags: string[] = [];
  const names = recipe.ingredients.map(row => row.name.toLowerCase().trim());
  const animalPatterns: [string, RegExp][] = [["chicken", /\b(chicken|turkey|hen)\b/], ["pork", /\b(pork|bacon|ham|gammon|chorizo|prosciutto|salami|pancetta)\b/], ["beef", /\b(beef|brisket|veal)\b/], ["lamb", /\b(lamb|mutton)\b/], ["fish", /\b(fish|salmon|tuna|cod|haddock|trout|prawns?|shrimp|mackerel|sardines?|anchov\w*|oyster|mussels?|crab|lobster|sea bass|seabass|squid)\b/], ["other meat", /\b(duck|goose|venison|rabbit|pheasant|quail|game)\b/]];
  const plantSubstitute = /\b(vegan|vegetarian|plant-based|meat-free|meat free|quorn|tofu|tempeh)\b/;
  const isPlantSubstitute = (name: string) => plantSubstitute.test(name) && !/\bor\b|\//.test(name);
  const withoutPlantHomonyms = (name: string) => name
    .replace(/\boyster mushrooms?\b|\bchicken of the woods\b/g, "mushrooms")
    .replace(/\bbeef(?:steak)? tomatoes\b|\bbeef(?:steak)? tomato\b/g, "tomatoes")
    .replace(/\blamb['\u2019]s lettuce\b/g, "lettuce")
    .replace(/\b(?:duck|hen|chicken) eggs?\b/g, "eggs");
  const animalNames = names.filter(name => !isPlantSubstitute(name)).map(withoutPlantHomonyms);
  const animalPresent = animalPatterns.some(([, pattern]) => animalNames.some(name => pattern.test(name)));
  const mainIngredients = animalNames.filter(name => !/\b(stock|broth|bouillon|sauce|gravy)\b/.test(name));
  for (const [tag, pattern] of animalPatterns) if (mainIngredients.some(name => pattern.test(name))) tags.push(tag);
  const ambiguous = /\b(steak|mince|burger|sausage|gelatine?|lard|suet|rennet|worcestershire|stock|broth|paste|sauce|pesto|parmesan)\b/;
  const plant = /\b(vegetable stock|vegetable broth|olive oil|vegetable oil|sunflower oil|sesame oil|coconut oil|soy sauce|tamari|tomato (paste|puree|sauce)|passata|flour|rice|pasta|noodles|bread|breadcrumbs|oats?|quinoa|couscous|lentils?|beans?|chickpeas?|peas|tofu|tempeh|potatoes?|tomatoes?|onions?|shallots?|garlic|ginger|carrots?|celery|leeks?|spinach|kale|broccoli|cauliflower|cabbage|mushrooms?|peppers?|courgettes?|aubergines?|squash|pumpkin|sweetcorn|corn|avocado|cucumber|lettuce|rocket|olives?|capers|beetroot|lemon|lime|orange|apple|pear|banana|berries|raspberries|strawberries|blueberries|kiwi|mango|pineapple|raisins|dates|almonds?|walnuts?|cashews?|peanuts?|seeds|tahini|coconut|salt|pepper|sugar|water|vinegar|cumin|coriander|paprika|turmeric|cinnamon|chilli|oregano|basil|parsley|thyme|rosemary|mint|dill|nutmeg|cardamom|cloves|bay leaves|baking powder|bicarbonate|yeast|maple syrup|agave)\b/;
  const animalProduct = /\b(eggs?|milk|cream|butter|cheese|cheddar|mozzarella|ricotta|feta|halloumi|yogh?urt|honey|ghee)\b/;
  const knownPlant = (name: string) => isPlantSubstitute(name) || (plant.test(withoutPlantHomonyms(name)) && (!ambiguous.test(name) || /vegetable (stock|broth)|soy sauce|tomato (paste|sauce)|tamari/.test(name)));
  const complete = names.length > 0 && names.every(Boolean) && recipe.ingredients.every(row => row.confidence !== "low" || row.reviewed) && Boolean(recipe.instructions?.some(step => step.trim()));
  const titleHasMeat = !isPlantSubstitute(recipe.title.toLowerCase()) && animalPatterns.some(([, pattern]) => pattern.test(withoutPlantHomonyms(recipe.title.toLowerCase())));
  if (complete && !animalPresent && !titleHasMeat && names.every(name => knownPlant(name) || (animalProduct.test(name) && !ambiguous.test(name)))) {
    tags.push("vegetarian");
    if (names.every(name => knownPlant(name) && (!animalProduct.test(name) || isPlantSubstitute(name)))) tags.push("vegan");
  }
  const title = recipe.title.toLowerCase();
  const dishRules: [string, RegExp][] = [["pasta", /\b(pasta|spaghetti|lasagn[ae]|macaroni|gnocchi|tagliatelle|penne|orzo|ravioli)\b/], ["rice / noodles", /\b(rice|risotto|noodles?|ramen|pilaf|biryani)\b/], ["curry", /\b(curry|d[ah]+l|korma|tikka masala)\b/], ["soup / stew", /\b(soup|stew|casserole|chilli con carne)\b/], ["salad", /\bsalad\b/], ["sandwich / wrap", /\b(sandwich\w*|wraps?|quesadillas?|tacos?|panini)\b/], ["pie", /\b(pie|tart|quiche)\b/], ["pizza / burger", /\b(pizza|burgers?)\b/]];
  for (const [tag, rule] of dishRules) if (rule.test(title)) tags.push(tag);
  const text = [recipe.title, ...(recipe.instructions ?? []), recipe.notes ?? ""].join(" ").toLowerCase();
  for (const [tag, rule] of [["one-pot", /\bone[- ](?:pot|pan)\b/], ["traybake", /\b(tray[- ]?bake|sheet[- ]pan)\b/], ["slow cooker", /\bslow[- ]cook(?:er|ing)\b/], ["air fryer", /\bair[- ]fry(?:er|ing)\b/], ["no-cook", /\bno[- ]cook\b/]] as [string, RegExp][]) if (rule.test(text) && !new RegExp(`(?:without|not|no) (?:an? )?${tag.replace(/[- ]/g, "[- ]")}`).test(text)) tags.push(tag);
  const positiveSentences = text.split(/[.!?\n]+/).filter(line => !/\b(not|don't|do not|cannot|can't|avoid|unsuitable)\b/.test(line));
  if (positiveSentences.some(line => /freezer[- ]friendly|suitable for freezing|can be frozen|freez(?:e|es) (?:well|for|up to)/.test(line))) tags.push("freezer-friendly");
  if (positiveSentences.some(line => /make[- ]ahead|(?:prepare|make|made|prepared) (?:it |this |the .*? )?(?:ahead|in advance|the day before)/.test(line))) tags.push("make ahead");
  if (positiveSentences.some(line => /packed lunch|lunchbox|lunch box/.test(line))) tags.push("packed lunch");
  if (typeof recipe.prepMinutes === "number" && recipe.prepMinutes >= 0 && recipe.prepMinutes <= 10) tags.push("quick prep");
  const total = knownTotalMinutes(recipe);
  if (total > 0 && total < 30) tags.push("under 30 mins");
  if (total >= 30 && total <= 60) tags.push("30-60 mins");
  if (total > 60) tags.push("over 60 mins");
  return uniqueTags(tags);
}

export function standardRecipeTags(manual: string[], recipe: TagRecipe, excluded = recipe.suppressedAutoTags ?? []) {
  const suppressed = uniqueTags(excluded);
  const confirmed = uniqueTags(recipe.confirmedTags ?? []).filter(isControlledTag);
  if (confirmed.includes("vegan") && !suppressed.includes("vegan")) confirmed.push("vegetarian");
  return uniqueTags([...customRecipeTags(manual), ...confirmed, ...inferredRecipeTags(recipe)])
    .filter(tag => !suppressed.includes(tag) && !timeTagNames.includes(tag));
}
export function preferenceTags(recipe: Pick<Recipe, "tags" | "householdTags">) {
  return uniqueTags([...(recipe.householdTags ?? []), ...recipe.tags.filter(tag => householdTagNames.includes(canonicalTag(tag)))]);
}
export function sourceTags(recipe: Partial<Recipe>) {
  return uniqueTags([...(recipe.provenanceTags ?? []), ...(recipe.tags ?? []).filter(tag => sourceTagNames.includes(canonicalTag(tag))),
    ...(recipe.importedFrom === "photo" ? ["photo import"] : recipe.importedFrom === "url" ? ["url import"] : recipe.importedFrom === "paste" ? ["text import"] : []),
    ...(recipe.source && /cookbook|roasting tin|bored of lunch|page \d/i.test(recipe.source) ? ["cookbook"] : [])]);
}
export function displayRecipeTags(recipe: Recipe) {
  return standardRecipeTags(recipe.tags, recipe).filter(tag => !timeTagNames.includes(tag));
}
export type TagDecisions = Record<string, string | null>;
export function cleanRecipeTags<T extends Recipe | ImportDraft>(recipe: T, decisions: TagDecisions = {}): T {
  const custom = customRecipeTags(recipe.tags).flatMap(tag => decisions[tag] === null ? [] : [decisions[tag] ?? tag]);
  const explicit = uniqueTags(custom.filter(isControlledTag));
  const confirmedTags = uniqueTags([...(recipe.confirmedTags ?? []), ...explicit]);
  const householdTags = uniqueTags([...preferenceTags(recipe), ...custom.filter(tag => householdTagNames.includes(canonicalTag(tag)))]);
  const provenanceTags = uniqueTags([...sourceTags(recipe), ...custom.filter(tag => sourceTagNames.includes(canonicalTag(tag)))]);
  const favorite = "favorite" in recipe ? { favorite: recipe.favorite || recipe.tags.some(tag => ["favorite", "favourite"].includes(canonicalTag(tag))) } : {};
  return { ...recipe, ...favorite, confirmedTags, householdTags, provenanceTags,
    tags: standardRecipeTags(custom, { ...recipe, confirmedTags }) };
}

export function tagCleanupChanged(before: Recipe, after: Recipe) {
  return (["tags", "confirmedTags", "householdTags", "provenanceTags"] as const).some(key => JSON.stringify(before[key] ?? []) !== JSON.stringify(after[key] ?? [])) || before.favorite !== after.favorite;
}

export function recipeSearchText(recipe: Recipe) {
  return [recipe.title, recipe.source ?? recipe.sourceUrl ?? "", ...displayRecipeTags(recipe), ...preferenceTags(recipe), ...sourceTags(recipe), ...recipe.ingredients.map(row => row.name)].join(" ").toLowerCase();
}

export function addRecipeTags(recipe: Recipe, additions: string[]): Recipe {
  const tags = uniqueTags(additions);
  return cleanRecipeTags({ ...recipe, tags: [...recipe.tags, ...tags],
    confirmedTags: uniqueTags([...(recipe.confirmedTags ?? []), ...tags.filter(isControlledTag)]),
    suppressedAutoTags: uniqueTags(recipe.suppressedAutoTags ?? []).filter(tag => !tags.includes(tag))
  });
}
