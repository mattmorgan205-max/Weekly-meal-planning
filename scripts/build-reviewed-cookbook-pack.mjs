import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const input = process.argv[2];
if (!input) throw new Error("Provide the approved review JSON path.");
const reviewed = JSON.parse(fs.readFileSync(input, "utf8"));
const original = JSON.parse(fs.readFileSync("drafts/2026-10-06-photo-recipes/extracted-recipes.json", "utf8"));
if (reviewed.format !== "weekwise-photo-extraction-review-v1") throw new Error("Unexpected review format");
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/domain.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: module.exports, module, crypto: globalThis.crypto });
const { parseIngredientLine, inferCategory } = module.exports;

// Only entries whose prep field was edited represent the user's total-time estimates.
// Unedited fields remain the preparation times transcribed from the books.
const cookMinutes = { "06": 35, "17": 205, "18": 240, "19": 180, "20": 240 };
const ingredientOverrides = {
  "01": { 7: "1 lemon, zest plus 1 slice" },
  "04": { 7: "2 lemons, juice of both and zest of one", 8: null },
  "07": { 3: "1 lemon, zest and juice of half", 5: "200 g chickpeas (half a 400 g tin), drained; reserve half the tin liquid", 10: null },
  "09": { 3: "1 tbsp olive oil, plus a drizzle for roasting", 8: "1 pomegranate, seeds only" },
  "11": { 5: "0.5 lemon, juice only" },
  "18": { 6: "900 ml boiling water (chicken stock is a non-vegetarian alternative)" }
};

function ingredientsFor(r) {
  const suffix = r.id.slice(-2);
  return r.ingredients.flatMap((originalLine, index) => {
    const overrides = ingredientOverrides[suffix] ?? {};
    if (Object.hasOwn(overrides, index) && overrides[index] === null) return [];
    let line = overrides[index] ?? originalLine;
    line = line.replace(/^(?:FOR THE [A-Z ]+|TO SERVE):\s*/, "");
    line = line.replace(/^(\d+)\/(\d+)\s+/, (_, a, b) => `${Number(a) / Number(b)} `);
    line = line.replace(/^(\d+(?:\.\d+)?)\s+heaped\s+(tsp|tbsp)\s+/, "$1 $2 ");
    line = line.replace(/^(\d+)\s*x\s*(\d+)\s*(g|ml)\s+(?:tins?|jars?|balls?)\s+/i,
      (_, count, size, unit) => `${Number(count) * Number(size)} ${unit} `);
    line = line.replace(/\s+OR 1 x 700 g jar/i, "");
    line = line.replace(/^Zest of 1 (?:unwaxed )?lemon/, "1 lemon, zest only");
    const parsed = parseIngredientLine(line);
    // Preserve ranges and inch measurements verbatim instead of parsing the first digit as a count.
    const ambiguous = /^\d+(?:-\d+|-(?:inch))/.test(line);
    const needsReview = ambiguous || /confirm quantity|\bor\b|handful|pinch|bunch|knobs|drizzle/i.test(line) || parsed.needsReview;
    return [{
      ...parsed,
      id: `${r.id}-ingredient-${index + 1}`,
      ...(ambiguous ? { name: line, quantity: undefined, unit: undefined } : {}),
      unit: ambiguous ? undefined : parsed.unit || (parsed.quantity !== undefined ? "item" : undefined),
      category: inferCategory(line),
      originalLine,
      note: originalLine,
      needsReview,
      confidence: needsReview ? "medium" : "high"
    }];
  });
}

const recipes = reviewed.recipes.filter(r => r.reviewStatus === "approved").map(r => {
  const before = original.recipes.find(item => item.id === r.id);
  if (!before) throw new Error(`Unknown recipe ${r.id}`);
  const suffix = r.id.slice(-2);
  const incomplete = suffix === "07";
  const timings = r.cooking.map(c => `${c.mode}: ${c.minutesMin === null ? "not supplied" : c.minutesMin === c.minutesMax ? `${c.minutesMin} minutes` : `${c.minutesMin}-${c.minutesMax} minutes`}.`);
  const nutrition = Object.entries(r.nutritionPerServing ?? {}).filter(([k, v]) => v !== null && k !== "needsReview")
    .map(([k, v]) => `${k}: ${v}`).join("; ");
  return {
    id: r.id, title: r.title, servings: r.servings, mealTypes: r.suggestedMealTypes,
    totalMinutes: r.prepMinutes,
    cookMinutes: cookMinutes[suffix],
    tags: [...new Set(["cookbook", "reviewed October 2026", ...r.suggestedTags, ...(incomplete ? ["incomplete method"] : [])])],
    favorite: false, visibility: "household", ingredients: ingredientsFor(r),
    instructions: [...r.instructions, ...(incomplete ? ["INCOMPLETE METHOD: The continuation page, final assembly and final baking instructions have not been supplied. Do not treat the steps above as a complete recipe."] : [])],
    source: [r.source.book ?? "Book title unconfirmed", r.source.page ? `page ${r.source.page}` : null, r.source.chapter].filter(Boolean).join(" | "),
    notes: [
      incomplete ? "Incomplete recipe added at your request. Only the vegan filling is visible in the supplied page." : "Imported from your reviewed cookbook photographs.",
      `Your total-time estimate: ${r.prepMinutes} minutes. This is a planning estimate, not a change to the cooking instructions. Follow the source cooking stages below, even where they take longer.`,
      "Source cooking stages (high and low slow-cooker settings are alternatives):\n" + timings.join("\n"),
      "Serving suggestions:\n" + r.servingSuggestions.join("\n"),
      r.notes.join("\n"),
      nutrition ? `Printed nutrition per serving (not independently calculated): ${nutrition}${r.nutritionPerServing.needsReview ? ". Tentative: check the original photo." : ""}` : null,
      r.warnings.length ? "Source cautions:\n" + r.warnings.join("\n") : null,
      r.reviewNotes,
      `Original photograph: ${r.source.photo}`
    ].filter(Boolean).join("\n\n"),
    importedFrom: "photo", createdAt: reviewed.exportedAt, updatedAt: reviewed.exportedAt
  };
});
if (new Set(recipes.map(r => r.id)).size !== recipes.length) throw new Error("Duplicate recipe IDs");
const output = `// Generated from the user-approved October 2026 cookbook review.\nimport type { Recipe } from "./domain";\n\nexport const REVIEWED_COOKBOOK_PACK_ID = "reviewed-cookbooks-2026-10-06-v1";\n\nexport const reviewedCookbookRecipes: Recipe[] = ${JSON.stringify(recipes, null, 2)};\n\nexport function installReviewedCookbookPack(existing: Recipe[], installedRecipePacks: string[] = []) {\n  if (installedRecipePacks.includes(REVIEWED_COOKBOOK_PACK_ID)) {\n    return { recipes: existing, installedRecipePacks, addedCount: 0 };\n  }\n  const ids = new Set(existing.map(recipe => recipe.id));\n  // Same-titled recipes from other books remain separate; never overwrite household edits.\n  const additions = reviewedCookbookRecipes.filter(recipe => !ids.has(recipe.id));\n  return {\n    recipes: [...existing, ...additions],\n    installedRecipePacks: [...installedRecipePacks, REVIEWED_COOKBOOK_PACK_ID],\n    addedCount: additions.length\n  };\n}\n`;
fs.writeFileSync("lib/reviewed-cookbook-recipes.ts", output);
console.log(`Generated ${recipes.length} approved recipes.`);
