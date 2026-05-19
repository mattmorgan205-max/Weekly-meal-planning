import {
  createId,
  inferRecipeMealTypes,
  isLikelyIngredientLine,
  parseIngredientLine,
  type ImportDraft
} from "@/lib/domain";

type JsonLdRecipe = {
  "@type"?: string | string[];
  name?: string;
  recipeYield?: string | string[];
  recipeIngredient?: string[];
  recipeInstructions?: Array<string | { text?: string; name?: string; itemListElement?: unknown }> | string;
  prepTime?: string;
  cookTime?: string;
};

const sectionStopPattern = /^(method|instructions|directions|preparation|prep|cook|total|notes|nutrition|comments|reviews|related|you may also like|equipment|video)\b/i;
const ingredientHeadingPattern = /^(ingredients|for the|to serve|for serving|for the sauce|for the dressing|for the marinade)\b/i;
const methodHeadingPattern = /^(method|instructions|directions|preparation|steps)\b/i;

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, "\"")
    .replace(/&ldquo;/g, "\"")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-");
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&[a-z0-9#]+;/gi, (entity) => decodeHtml(entity))
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function removePageChrome(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ");
}

function findRecipeJsonLd(value: unknown): JsonLdRecipe | undefined {
  if (!value) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeJsonLd(item);
      if (found) return found;
    }
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const type = record["@type"];
    const types = Array.isArray(type) ? type : [type];

    if (types.some((item) => typeof item === "string" && item.toLowerCase() === "recipe")) {
      return record as JsonLdRecipe;
    }

    if (Array.isArray(record["@graph"])) {
      return findRecipeJsonLd(record["@graph"]);
    }
  }

  return undefined;
}

function parseDurationMinutes(value?: string) {
  if (!value) return undefined;
  const isoHours = value.match(/(\d+)H/i);
  const isoMinutes = value.match(/(\d+)M/i);
  const plainHours = value.match(/(\d+)\s*(?:hours?|hrs?|hr)\b/i);
  const plainMinutes = value.match(/(\d+)\s*(?:minutes?|mins?|min)\b/i);
  const hours = isoHours ?? plainHours;
  const minutes = isoMinutes ?? plainMinutes;
  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0) || undefined;
}

type JsonLdInstruction = string | { text?: string; name?: string; itemListElement?: unknown };

function normalizeInstruction(step: JsonLdInstruction): string[] {
  if (typeof step === "string") return [step.trim()].filter(Boolean);
  if (Array.isArray(step.itemListElement)) {
    return step.itemListElement.flatMap((item) => normalizeInstruction(item as JsonLdInstruction));
  }
  return [step.text || step.name || ""].map((line) => line.trim()).filter(Boolean);
}

function draftFromJsonLd(recipe: JsonLdRecipe, sourceUrl: string): ImportDraft {
  const yieldText = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield;
  const servings = Number(yieldText?.match(/\d+/)?.[0]) || 4;
  const ingredients = (recipe.recipeIngredient ?? [])
    .filter((line) => isLikelyIngredientLine(line, true))
    .map((line) => parseIngredientLine(line, { strict: true }));
  const instructions = Array.isArray(recipe.recipeInstructions)
    ? recipe.recipeInstructions.flatMap((step) => normalizeInstruction(step))
    : recipe.recipeInstructions
      ? [recipe.recipeInstructions]
      : ["Add cooking instructions."];

  return {
    id: createId("draft"),
    title: recipe.name || "Imported recipe",
    servings,
    mealTypes: inferRecipeMealTypes({ title: recipe.name || "Imported recipe", tags: ["url import"], ingredients }),
    prepMinutes: parseDurationMinutes(recipe.prepTime),
    cookMinutes: parseDurationMinutes(recipe.cookTime),
    tags: ["url import"],
    ingredients,
    instructions,
    source: sourceUrl,
    sourceUrl,
    warnings: recipe.recipeIngredient?.length
      ? ["Review the imported recipe before saving it to your library."]
      : ["No structured ingredients were found. Review and add ingredients before saving."],
    importedFrom: "url"
  };
}

function extractTextLinesFromHtml(html: string) {
  const readableHtml = removePageChrome(html)
    .replace(/<\/(li|p|div|h1|h2|h3|h4|h5|h6|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return stripHtml(readableHtml)
    .split(/\n+/)
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function takeSection(lines: string[], startIndex: number, stopPattern: RegExp, maxLines: number) {
  const section: string[] = [];

  for (const line of lines.slice(startIndex + 1)) {
    if (section.length >= maxLines) break;
    if (stopPattern.test(line)) break;
    if (/^(advertisement|subscribe|sign up|share|print|save|nutrition)$/i.test(line)) continue;
    section.push(line);
  }

  return section;
}

function extractClassScopedItems(html: string, kind: "ingredient" | "method") {
  const cleaned = removePageChrome(html);
  const classPattern =
    kind === "ingredient"
      ? /<(li|p|span|div)[^>]*(?:class|id)=["'][^"']*(?:ingredient|recipe-ingredient|wprm-recipe-ingredient)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi
      : /<(li|p|span|div)[^>]*(?:class|id)=["'][^"']*(?:instruction|direction|method|recipe-instruction|wprm-recipe-instruction)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;

  return Array.from(cleaned.matchAll(classPattern))
    .map((match) => stripHtml(match[2]))
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function extractDomFallbackDraft(html: string, sourceUrl: string): ImportDraft {
  const lines = extractTextLinesFromHtml(html);
  const scopedIngredients = extractClassScopedItems(html, "ingredient");
  const scopedInstructions = extractClassScopedItems(html, "method");
  const ingredientHeadingIndex = lines.findIndex((line) => ingredientHeadingPattern.test(line));
  const methodHeadingIndex = lines.findIndex((line) => methodHeadingPattern.test(line));
  const title =
    lines.find((line) => !ingredientHeadingPattern.test(line) && !methodHeadingPattern.test(line) && line.length > 4 && line.length < 90) ??
    "URL import draft";
  const servingsMatch = lines.join("\n").match(/\b(?:serves|servings|yield)\s*:?\s*(\d+)/i);
  const servings = servingsMatch ? Number(servingsMatch[1]) : 4;
  const ingredientLines = [
    ...scopedIngredients,
    ...(ingredientHeadingIndex >= 0 ? takeSection(lines, ingredientHeadingIndex, sectionStopPattern, 35) : [])
  ]
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line, index, allLines) => allLines.indexOf(line) === index)
    .filter((line) => isLikelyIngredientLine(line, true))
    .slice(0, 30);
  const ingredients = ingredientLines.map((line) => parseIngredientLine(line, { strict: true }));
  const methodLines = [
    ...scopedInstructions,
    ...(methodHeadingIndex >= 0 ? takeSection(lines, methodHeadingIndex, /^(nutrition|comments|reviews|related|you may also like|ingredients)\b/i, 40) : [])
  ]
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter((line, index, allLines) => line.length > 4 && allLines.indexOf(line) === index)
    .slice(0, 30);
  const warnings = [
    "This URL did not provide structured recipe data, so only likely recipe sections were imported.",
    "Review the imported recipe before saving it to your library."
  ];

  if (!servingsMatch) warnings.push("Servings were not found, so the draft defaults to 4.");
  if (ingredients.length < 2) {
    warnings.push("No reliable ingredient section was found. Paste the recipe text or edit the draft rather than saving bad webpage text.");
  }
  if (ingredients.some((ingredient) => ingredient.needsReview || ingredient.confidence === "low")) {
    warnings.push("Some extracted ingredient lines need review.");
  }

  return {
    id: createId("draft"),
    title,
    servings,
    mealTypes: inferRecipeMealTypes({ title, tags: ["url import"], ingredients }),
    tags: ["url import"],
    ingredients,
    instructions: methodLines.length > 0 ? methodLines : ["Add cooking instructions."],
    source: sourceUrl,
    sourceUrl,
    warnings: Array.from(new Set(warnings)),
    importedFrom: "url"
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const sourceUrl = body?.url?.trim();

  if (!sourceUrl) {
    return Response.json({ error: "A recipe URL is required." }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return Response.json({ error: "Enter a valid public URL." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return Response.json({ error: "Only public http or https recipe URLs are supported." }, { status: 400 });
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "WeekwiseMealPlanner/0.1 recipe importer"
    },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    return Response.json({ error: "The recipe page could not be loaded." }, { status: 422 });
  }

  const html = await response.text();
  const jsonLdBlocks = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));

  for (const block of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const recipe = findRecipeJsonLd(parsed);
      if (recipe) return Response.json(draftFromJsonLd(recipe, sourceUrl));
    } catch {
      continue;
    }
  }

  return Response.json(extractDomFallbackDraft(html, sourceUrl));
}
