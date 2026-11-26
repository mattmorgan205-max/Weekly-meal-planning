// Black-box tests of the shipped extension on offline, synthetic ASDA trolley pages.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const row = (id, name, quantity = 1) => `<article data-testid="trolley-item">
  <a href="/groceries/product/${id}">${name}</a>
  <a href="/groceries/product/${id}?tracking=thumbnail">View product</a>
  ${quantity === null ? "" : `<input aria-label="Quantity" value="${quantity}">`}
  <button>Remove</button></article>`;
const want = (name, quantity, unit, extra = {}) => ({
  name, quantity, unit, displayQuantity: [quantity, unit].filter(v => v != null).join(" "), ...extra
});

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<title>Trolley</title><main></main>" }));
    const setup = async (items, html) => {
      await page.goto("https://www.asda.com/groceries/trolley");
      await page.evaluate(({items, html}) => {
        document.querySelector("main").innerHTML = html;
        const queue = { createdAt: "fixture", items: items.map((i, index) => ({
          itemId: String(index), shoppingKey: String(index), sourceMeals: [], category: "Other", searchUrl: "", ...i
        })) };
        chrome.runtime = { onMessage: {addListener() {}}, sendMessage: (_, cb) =>
          cb({state: {queue, currentIndex: 0, itemStatus: {}, productLinks: {}}}) };
        chrome.storage = {onChanged: {addListener() {}}};
        Object.defineProperty(navigator, "clipboard", {value: {writeText: async text => { window.brief = text; }}});
      }, {items, html});
      await page.addScriptTag({path: "extension/asda-helper/build/product-policy.js"});
      await page.addScriptTag({path: "extension/asda-helper/build/asda-content.js"});
    };
    const clickVerify = () => page.getByRole("button", {name: "Verify basket"}).click();
    const checked = () => page.getByText("Trolley checked.", {exact: true}).waitFor();
    const summary = text => page.getByText(text, {exact: true}).waitFor();
    const noResults = async () => {
      assert.equal(await page.locator(".weekwise-basket-card, #weekwise-copy-remaining, #weekwise-find-choices").count(), 0);
    };

    await setup([want("Rice", 400, "g"), want("Rice", 400, "g"), want("Salt")],
      '<h1>Trolley (2 products)</h1>' + row("rice", "Rice 500g") + '<button id="more">Show more items</button>');
    await page.evaluate(() => document.querySelector("#more").onclick = () => {
      document.querySelector("#more").remove();
      document.querySelector("main").setAttribute("aria-busy", "true");
    });
    await clickVerify();
    assert.equal(await page.locator("main").getAttribute("aria-busy"), "true");
    await noResults();
    await page.evaluate(html => {
      document.querySelector("main").insertAdjacentHTML("beforeend", html);
      document.querySelector("main").removeAttribute("aria-busy");
    }, row("salt", "ASDA Table Salt", null));
    await checked();
    await summary("2 ok · 1 short · 0 missing · 0 review");
    await page.locator("#weekwise-copy-remaining").click();
    const brief = await page.evaluate(() => window.brief);
    assert.match(brief, /Rice \| Total needed: 400 g \| In trolley: 100 g \| Short by: 300 g/);
    assert.doesNotMatch(brief, /Table Salt/);
    await page.locator("h1").evaluate(el => el.textContent = "Trolley (3 products)");
    await page.getByText("Basket changed. Verify basket again before continuing.").waitFor();
    await noResults();

    await setup([want("Rice", 250, "g"), want("Rice", 250, "g"), want("Rice", 1, "pack")],
      '<h1>Trolley (1 product)</h1>' + row("rice", "Rice 500g"));
    await clickVerify(); await checked();
    await summary("2 ok · 1 short · 0 missing · 0 review");
    assert.match(await page.locator(".weekwise-basket-short").innerText(), /1 pack Rice/);

    await setup([want("Herbs"), want("Basil", undefined, undefined, {savedProductUrl:"https://www.asda.com/groceries/product/herbs?ref=saved"}),
      want("Sausages"), want("Garlic", 2, "tbsp"), want("Yoghurt", 500, "g")],
      '<h1>Trolley (4 products)</h1>' + row("herbs", "ASDA Basil Herbs") + row("sausages", "GF Pork Sausages") +
      row("garlic", "Garlic Paste") + row("yoghurt", "Yoghurt 500g", null));
    await clickVerify(); await checked();
    await summary("1 ok · 0 short · 0 missing · 4 review");
    assert.match(await page.locator(".weekwise-basket-unknown").filter({hasText:"Matching packs"}).innerText(), /Herbs/);

    await setup([want("Apples", 6, "items"), want("Apples", 1, "pack")],
      '<h1>Trolley (2 items)</h1>' + row("apples", "Apples 6 pack", 2));
    await clickVerify(); await checked(); await summary("2 ok · 0 short · 0 missing · 0 review");

    await setup([want("Spinach")], '<h1>Trolley (1 product)</h1><button id="group" aria-expanded="false" aria-controls="chilled">Chilled</button><div id="chilled" hidden>' +
      row("spinach", "Spinach", null) + "</div>");
    await page.locator("#group").evaluate(button => button.onclick = () => {
      button.setAttribute("aria-expanded", "true");
      document.getElementById("chilled").hidden = false;
    });
    await clickVerify(); await checked(); await summary("1 ok · 0 short · 0 missing · 0 review");

    await setup([want("Pasta"), want("Salt")], '<h1>Trolley (2 products)</h1>' + row("salt", "Salt") +
      '<aside data-testid="recommendations">' + row("pasta", "Pasta") + "</aside>");
    await clickVerify();
    await page.getByText(/The full trolley could not be read/).waitFor();
    await noResults();
    assert.equal(await page.locator("#weekwise-confirm-visible").count(), 0);
    await page.locator("main").evaluate(el => el.innerHTML = "<h2>Your trolley is empty</h2>");
    await clickVerify(); await checked(); await summary("0 ok · 0 short · 2 missing · 0 review");
    await page.locator("main").evaluate(el => el.innerHTML = "");
    await clickVerify();
    await page.getByText(/The full trolley could not be read/).waitFor();
    await noResults();
    console.log("ASDA verifier passed: delayed/partial/empty trolleys, stale totals, presence, dietary exclusions, shared pack capacity and duplicate links.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
