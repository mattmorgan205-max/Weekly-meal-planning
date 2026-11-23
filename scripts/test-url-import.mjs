import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import assert from "node:assert/strict";
import ts from "typescript";

let html = "";
function load(path, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, crypto: webcrypto, URL, Response, fetch: async () => new Response(html) });
  return exports;
}
const domain = load("lib/domain.ts");
const route = load("app/api/import/url/route.ts", { "@/lib/domain": domain });
const importPage = async () => (await route.POST(new Request("https://weekwise.test/api/import/url", { method: "POST", body: JSON.stringify({ url: "https://example.test/recipe" }) }))).json();
html = `<p>Prep: 15 mins Cook: 1 hour 20 mins</p><script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "Test soup", recipeYield: "4", recipeIngredient: ["<b>1½</b>&nbsp;tbsp olive oil", "&#50;00g carrots"], recipeInstructions: [{ text: "<p>Chop carrots.</p>" }, { text: "Chop carrots." }, { itemListElement: [{ text: "Simmer." }] }], totalTime: "PT1H35M" })}</script>`;
let draft = await importPage();
assert.equal(draft.ingredients[0].quantity, 1.5);
assert.equal(draft.ingredients[0].unit, "tbsp");
assert.equal(draft.ingredients[1].quantity, 200);
assert.equal(draft.ingredients[1].unit, "g");
assert.deepEqual(draft.instructions, ["Chop carrots.", "Simmer."]);
assert.equal(draft.prepMinutes, 15);
assert.equal(draft.cookMinutes, 80);
assert.equal(draft.totalMinutes, 95);
html = '<h1>Carrot soup</h1><p>Prep: 10 mins</p><p>Cook: 25 mins</p><h2>Ingredients</h2><li class="recipe-ingredient"><span>200</span> <span>g</span> carrots</li><h2>Method</h2><p class="recipe-instruction">Chop carrots.</p><p class="recipe-instruction">Simmer carrots.</p>';
draft = await importPage();
assert.equal(draft.ingredients[0].quantity, 200);
assert.equal(draft.ingredients[0].unit, "g");
assert.deepEqual(draft.instructions, ["Chop carrots.", "Simmer carrots."]);
assert.equal(draft.prepMinutes, 10);
assert.equal(draft.cookMinutes, 25);
console.log("URL import regression checks passed (structured and fallback HTML).");
