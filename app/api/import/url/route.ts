import { inferRecipeMealTypes, parseIngredientLine, parseRecipeText, type ImportDraft } from "@/lib/domain";

type JsonLdRecipe = {
  "@type"?: string | string[];
  name?: string;
  recipeYield?: string | string[];
  recipeIngredient?: string[];
  recipeInstructions?: Array<string | { text?: string; name?: string }> | string;
  prepTime?: string;
  cookTime?: string;
};

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const hours = value.match(/(\d+)H/i);
  const minutes = value.match(/(\d+)M/i);
  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0) || undefined;
}

function draftFromJsonLd(recipe: JsonLdRecipe, sourceUrl: string): ImportDraft {
  const yieldText = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield;
  const servings = Number(yieldText?.match(/\d+/)?.[0]) || 4;
  const ingredients = (recipe.recipeIngredient ?? []).map(parseIngredientLine);
  const instructions = Array.isArray(recipe.recipeInstructions)
    ? recipe.recipeInstructions
        .map((step) => (typeof step === "string" ? step : step.text || step.name || ""))
        .filter(Boolean)
    : recipe.recipeInstructions
      ? [recipe.recipeInstructions]
      : ["Add cooking instructions."];

  return {
    id: crypto.randomUUID(),
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

  const fallbackText = stripHtml(html).slice(0, 10000);
  return Response.json(parseRecipeText(fallbackText, "url", sourceUrl));
}
