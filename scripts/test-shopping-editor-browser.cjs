// Run against a local Weekwise preview using an isolated, signed-out browser.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 895 } });
    const failures = [];
    page.on("pageerror", error => failures.push(error.message));
    await page.goto(process.env.TEST_URL || "http://127.0.0.1:3008");
    await page.waitForFunction(() => localStorage.getItem("weekwise-meal-planner-v1"));
    await page.evaluate(() => {
      const key = "weekwise-meal-planner-v1", state = JSON.parse(localStorage.getItem(key));
      const recipe = state.recipes[0];
      recipe.ingredients = [
        { id: "test1", name: "yogurt", quantity: 500, unit: "g", category: "Dairy & Eggs" },
        { id: "test2", name: "yogrt", quantity: 1, unit: "pack", category: "Dairy & Eggs" },
        { id: "test3", name: "carrot", quantity: 2, unit: "item", category: "Produce" }
      ];
      state.plannedMeals = [{ id: "test", date: state.guidedShop.startDate, recipeId: recipe.id, peopleCount: recipe.servings, slot: "dinner" }];
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.reload();
    for (const view of ["settings", "recipes", "add", "guided", "planner", "shopping"]) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.waitForFunction(v => sessionStorage.getItem("weekwise.activeView") === v, view);
      await page.reload();
      await page.locator(`[data-view="${view}"].active`).waitFor();
    }
    const buy = page.locator(".shopping-groups");
    await buy.getByTitle("Edit yogrt", { exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit shopping ingredient" });
    await editor.getByLabel("Shopping name").fill("yogurt");
    await editor.getByLabel("Unit", { exact: true }).selectOption("kg");
    assert.equal(await editor.getByLabel("Amount", { exact: true }).inputValue(), "");
    await editor.getByLabel("Amount", { exact: true }).fill("0.25");
    await editor.getByRole("button", { name: "Save changes" }).click();
    await buy.getByText("750 g", { exact: true }).waitFor();
    assert.equal(await buy.getByTitle("Edit yogrt", { exact: true }).count(), 0);
    for (const width of [1366, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 895 });
      const layout = await buy.evaluate(el => {
        const header = el.querySelector(".section-heading").getBoundingClientRect();
        const groups = [...el.querySelectorAll(".shopping-group")].map(g => g.getBoundingClientRect());
        return { top: Math.min(...groups.map(g => g.top)) >= header.bottom,
          overflow: Math.max(...groups.map(g => g.right)) - innerWidth,
          columns: new Set(groups.map(g => Math.round(g.left))).size };
      });
      assert.ok(layout.top && layout.overflow <= 1, JSON.stringify({ width, layout }));
      if (width === 1366) assert.ok(layout.columns > 1);
      if (width === 390) assert.equal(layout.columns, 1);
    }
    await page.setViewportSize({ width: 1366, height: 895 });
    await page.locator('[data-view="guided"]').click();
    await page.locator(".guided-steps").getByRole("button", { name: /Check supplies/ }).click();
    await page.reload();
    await page.locator(".supply-row").filter({ hasText: "750 g" }).getByRole("button", { name: /Edit yog/ }).click();
    assert.equal(await editor.getByLabel("Amount", { exact: true }).count(), 2);
    await page.keyboard.press("Escape");
    await editor.waitFor({ state: "detached" });
    assert.deepEqual(failures, []);
    console.log("Shopping edit, merge, cross-view persistence, tab reloads and responsive buy list passed.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
