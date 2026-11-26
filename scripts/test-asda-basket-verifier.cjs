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
    page.setDefaultTimeout(12000);
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

    const extras = Array.from({length:18}, (_, i) => want("Extra " + i));
    await setup([want("Rice", 2000, "g"), ...extras], '<h1>Trolley (1 product)</h1>' + row("rice", "Rice 500g"));
    await page.addStyleTag({path:"extension/asda-helper/asda-overlay.css"});
    await clickVerify(); await checked();
    const riceCard = page.locator('[data-item-id="0"]');
    const extraCard = page.locator('[data-item-id="10"]');
    await extraCard.getByText("Looks ok").focus();
    await page.evaluate(() => {
      const list = document.querySelector(".weekwise-basket-list");
      window.scrollBefore = list.scrollTop;
      window.otherRow = document.querySelector('[data-item-id="11"]');
      document.activeElement.click();
    });
    assert.deepEqual(await page.evaluate(() => [
      window.otherRow.isConnected, window.scrollBefore > 0,
      document.querySelector(".weekwise-basket-list").scrollTop === window.scrollBefore,
      document.activeElement.closest("[data-item-id]") === window.otherRow
    ]), [true,true,true,true]);
    await riceCard.getByText("Add one more").click();
    await riceCard.getByText(/Allocated 1 kg of/).waitFor();
    assert.equal(await page.locator("main input").inputValue(), "2");
    assert.equal(await extraCard.count(), 0);
    await riceCard.getByText("Looks ok").click();
    await page.locator("main input").fill("1");
    await riceCard.getByText(/Allocated 500 g of/).waitFor();
    assert.equal(await extraCard.count(), 0);

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
    await page.getByText(/Partial scan:.*ASDA shows 3 products/).waitFor();
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

    // "Items" can mean distinct lines rather than the number of packs. Neither a
    // delivery progress meter nor a department subtotal describes trolley readiness.
    await setup([want("Apples", 3, "packs"), want("Milk")],
      '<h1>Your trolley (2 items)</h1><section><h2>Delivery</h2><div role="progressbar" aria-valuenow="75">75%</div><button>Show more</button></section>' +
      '<p>1 item</p>' + row("apple", "Apples", 3) + row("milk", "Milk 1l") +
      '<button aria-disabled="true">Load more items</button>');
    await clickVerify(); await checked(); await summary("2 ok · 0 short · 0 missing · 0 review");

    // A modal trolley outside main can contain named rows rather than product links.
    await setup([want("Rice", 500, "g"), want("Salt")], '<div aria-busy="true">Loading offers</div>');
    await page.evaluate(() => document.body.insertAdjacentHTML("beforeend",
      '<div role="dialog" aria-labelledby="title"><h2 id="title">Trolley (2 products)</h2>' +
      '<article data-testid="trolley-item"><h3>Rice 500g</h3><input aria-label="Quantity" value="1"></article>' +
      '<ul><li><span itemprop="name">Table salt</span><button aria-label="Remove salt from trolley">Remove</button></li></ul></div>'));
    await clickVerify(); await checked(); await summary("2 ok · 0 short · 0 missing · 0 review");

    await setup([want("Milk"), want("Salt")], '<h1>Trolley (1 product)</h1>' + row("milk", "Milk") +
      '<a href="/groceries/product/advert">Featured offer</a>');
    await clickVerify();
    await page.getByText("Products read (1)", {exact: true}).click();
    assert.deepEqual(await page.locator("#weekwise-asda-helper details li").allTextContents(), ["Milk"]);
    await noResults();
    await page.locator("#weekwise-confirm-visible").click(); await checked();
    await summary("1 ok · 0 short · 1 missing · 0 review");

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
    await page.getByText(/Partial scan: read 1 distinct products?\. ASDA shows 2 products.*cover 1 of 2/).waitFor();
    await noResults();
    assert.equal(await page.locator("#weekwise-confirm-visible").count(), 0);
    await page.locator("main").evaluate(el => el.innerHTML = "<h2>Your trolley is empty</h2>");
    await clickVerify(); await checked(); await summary("0 ok · 0 short · 2 missing · 0 review");
    await page.locator("main").evaluate(el => el.innerHTML = "");
    await clickVerify();
    await page.getByText(/No product rows or empty-trolley notice were found/).waitFor();
    await noResults();
    await setup([want("Salt")], '<h1>Trolley (1 product)</h1>' + row("salt", "Salt") +
      '<article data-testid="trolley-item"><button>Remove</button></article>');
    await clickVerify();
    await page.getByText(/Some product rows could not be identified/).waitFor();
    await noResults();
    assert.equal(await page.locator("#weekwise-confirm-visible").count(), 0);
    console.log("ASDA verifier passed: delayed/partial/empty trolleys, stale totals, presence, dietary exclusions, shared pack capacity and duplicate links.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
