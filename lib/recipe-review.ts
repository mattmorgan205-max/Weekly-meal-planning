import { canonicalizeIngredientName, normalizeUnit, type ImportDraft, type Ingredient, type Recipe } from "./domain";

export type ReviewIssue = { key: string; message: string; ingredientId?: string; blocking?: boolean };
const genericImportWarnings = new Set([
  "This URL did not provide structured recipe data, so only likely recipe sections were imported.",
  "Review the imported recipe before saving it to your library.",
  "Some extracted ingredient lines need review."
]);

export function actionableImportWarnings(warnings: string[]) {
  return warnings.filter(warning => !genericImportWarnings.has(warning.trim()));
}
export function reviewIssueSignature(draft: ImportDraft, issue: ReviewIssue) {
  const method = draft.instructions.map(step => step.trim()).filter(Boolean);
  if (issue.ingredientId) {
    const row = draft.ingredients.find(row => row.id === issue.ingredientId);
    return JSON.stringify([issue.message, row && [row.name.trim(), row.quantity, normalizeUnit(row.unit),
      canonicalizeIngredientName(row.canonicalName || row.name).canonicalName, row.packSize, row.packUnit,
      row.measurementSystem, row.weightBasis, row.originalLine, Boolean(row.needsReview)]]);
  }
  const value = issue.key === "method" ? method
    : issue.key === "time" ? [draft.prepMinutes, draft.cookMinutes, draft.totalMinutes]
    : issue.key === "page" ? [draft.sourceText ?? draft.rawText, method]
    : issue.key === "duplicate" ? [draft.title, draft.sourceUrl]
    : issue.key.startsWith("method:") ? [method, draft.ingredients.map(row => row.name)] : issue.message;
  return JSON.stringify([issue.message, value]);
}

export function acknowledgeReviewIssues(draft: ImportDraft, issues: ReviewIssue[]): ImportDraft {
  return { ...draft, reviewAcknowledgements: { ...draft.reviewAcknowledgements,
    ...Object.fromEntries(issues.filter(issue => !issue.blocking).map(issue => [issue.key, reviewIssueSignature(draft, issue)])) } };
}

export function ingredientReviewFields(issues: ReviewIssue[], id: string) {
  const fields = new Set<string>();
  for (const issue of issues.filter(issue => issue.ingredientId === id)) {
    const key = issue.key.split(":").pop();
    if (["amount", "quantity", "choice", "extraction"].includes(key!)) fields.add("quantity");
    if (["measure", "extraction"].includes(key!)) fields.add("unit");
    if (["name", "extraction", "choice"].includes(key!)) fields.add("name");
    if (key === "matching" || issue.key.startsWith("repeat:")) fields.add("shoppingName");
    if (["pack", "drained"].includes(key!)) fields.add("pack");
  }
  return fields;
}
export function ingredientIssues(ingredient: Ingredient): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const add = (key: string, message: string, blocking = false) => issues.push({ key: `${ingredient.id}:${key}`, message, ingredientId: ingredient.id, blocking });
  if (!ingredient.name.trim()) add("name", "Ingredient name is missing.", true);
  if (ingredient.quantity !== undefined && (!Number.isFinite(ingredient.quantity) || ingredient.quantity < 0)) add("quantity", "Quantity must be a non-negative number.", true);
  if (ingredient.packSize !== undefined && (!Number.isFinite(ingredient.packSize) || ingredient.packSize <= 0 || !ingredient.packUnit)) add("pack", "Enter a positive pack size and its unit.", true);
  if (ingredient.reviewed) return issues;
  if (ingredient.packSize && /drained/i.test(ingredient.originalLine ?? "")) add("drained", "Check whether the stated pack size is net or drained weight.");
  if (ingredient.needsReview || ingredient.confidence === "low") add("extraction", "Check the extracted name and amount against the source.");
  if (ingredient.quantity === undefined) add("amount", "No numeric amount; keep as unspecified or enter an amount.");
  if (["cup", "fl oz", "pt", "qt", "gal", "tsp", "tbsp"].includes(normalizeUnit(ingredient.unit)) && !ingredient.measurementSystem) add("measure", "Measurement convention is unspecified; volume conversions stay separate.");
  if (/\bor\b|\d\s*[-–]\s*\d/.test(ingredient.originalLine ?? ingredient.name)) add("choice", "Check the alternative or quantity range; no option has been chosen automatically.");
  const suggested = canonicalizeIngredientName(ingredient.name).canonicalName;
  if (ingredient.canonicalName && ingredient.canonicalName !== suggested) add("matching", `Shopping name differs from suggested '${suggested}'. Keep it or apply the suggestion.`);
  return issues;
}

export function reviewRecipe(draft: ImportDraft, recipes: Recipe[] = [], editingId?: string | null): ReviewIssue[] {
  const issues = draft.ingredients.flatMap(ingredientIssues);
  if (!draft.title.trim()) issues.push({ key: "title", message: "Recipe name is required.", blocking: true });
  if (!Number.isFinite(draft.servings) || draft.servings <= 0) issues.push({ key: "servings", message: "Servings must be greater than zero.", blocking: true });
  if (!draft.ingredients.length) issues.push({ key: "ingredients", message: "Add at least one ingredient.", blocking: true });
  for (const field of ["prepMinutes", "cookMinutes", "totalMinutes"] as const) if (draft[field] !== undefined && (!Number.isFinite(draft[field]) || draft[field]! < 0)) issues.push({ key: field, message: "Times must be non-negative numbers.", blocking: true });
  if (!draft.instructions.some(step => step.trim() && !/^(add cooking instructions|review the photo)/i.test(step))) issues.push({ key: "method", message: "The method is missing or incomplete." });
  if (draft.totalMinutes !== undefined && draft.totalMinutes < Math.max(draft.prepMinutes ?? 0, draft.cookMinutes ?? 0)) issues.push({ key: "time", message: "Total time is shorter than preparation or cooking time." });
  if (/\bcontinued\b|→/.test(draft.sourceText ?? draft.rawText ?? "")) issues.push({ key: "page", message: "The source may continue on another page. Check the method is complete." });
  const names = new Set<string>();
  for (const ingredient of draft.ingredients) {
    const name = canonicalizeIngredientName(ingredient.name).canonicalName;
    if (names.has(name)) issues.push({ key: `repeat:${ingredient.id}`, ingredientId: ingredient.id, message: "Repeated ingredient: confirm it belongs to a separate part of the recipe." });
    names.add(name);
  }
  const titleKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const urlKey = (value?: string) => { try { const url = new URL(value!); return url.origin + url.pathname.replace(/\/$/, ""); } catch { return ""; } };
  const duplicate = recipes.find(recipe => recipe.id !== editingId && (titleKey(recipe.title) === titleKey(draft.title) || (urlKey(draft.sourceUrl) && urlKey(recipe.sourceUrl) === urlKey(draft.sourceUrl))));
  const method = draft.instructions.join(" ").toLowerCase();
  for (const name of ["water", "oil", "butter", "salt", "pepper", "cornflour"]) {
    if (new RegExp(`\\b${name}\\b`).test(method) && !draft.ingredients.some(row => new RegExp(`\\b${name}\\b`).test(row.name.toLowerCase()))) issues.push({ key: `method:${name}`, message: `${name} appears in the method but not the ingredient list. Check whether it is needed.` });
  }
  if (duplicate) issues.push({ key: "duplicate", message: `Possible duplicate: ${duplicate.title}. Saving will create a separate recipe.` });
  return issues.filter(issue => issue.blocking || draft.reviewAcknowledgements?.[issue.key] !== reviewIssueSignature(draft, issue));
}

export type SavedRecipeDraft = { draft: ImportDraft; editingRecipeId: string | null; tagInput: string; importMode: ImportDraft["importedFrom"]; importText: string; importUrl: string; photoRawText: string; savedAt: string };
export const draftStorageKey = (scope: string) => `weekwise-recipe-drafts-v1:${encodeURIComponent(scope)}`;
export function readDraftArchive(value: string | null): SavedRecipeDraft[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(row => row && typeof row.draft?.id === "string" && Array.isArray(row.draft.ingredients) && Array.isArray(row.draft.instructions))) throw new Error("Saved drafts could not be read. Existing drafts have not been overwritten.");
  return parsed;
}
export function upsertDraftArchive(records: SavedRecipeDraft[], record: SavedRecipeDraft) {
  return [record, ...records.filter(row => row.draft.id !== record.draft.id)];
}
