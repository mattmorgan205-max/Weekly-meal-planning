// Exercise the built content script against a synthetic trolley; no retailer requests.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body:
      "<title>Trolley</title>" + ["Yoghurt 500g", "Pasta 1kg", "Loose spinach"].map((name, i) =>
        `<article><a href="/groceries/product/${i}">${name}</a> Quantity <input aria-label="Quantity" value="1"> Remove</article>`).join("")
    }));
    await page.goto("https://www.asda.com/groceries/trolley");
    await page.evaluate(() => {
      const items = [["Yoghurt", 750], ["Pasta", 1000], ["Loose spinach", 200], ["Oats", 300]].map(([name, n]) => ({
        name, itemId: name, shoppingKey: name, requiredQuantity: n, requiredUnit: "g", displayQuantity: n + " g",
        sourceMeals: ["Private meal"], avoidTerms: name === "Yoghurt" ? ["sweetened"] : [], searchUrl: ""
      }));
      window.fixture = { queue: { createdAt: "shop-one", items }, currentIndex: 0, itemStatus: {}, productLinks: {} };
      chrome.runtime = { sendMessage: (_, cb) => cb({ state: window.fixture }), onMessage: { addListener() {} } };
      chrome.storage = { onChanged: { addListener(fn) { window.refreshHelper = fn; } } };
      Object.defineProperty(navigator, "clipboard", {value: {writeText: async text => { window.brief = text; }}});
    });
    await page.addScriptTag({path: "extension/asda-helper/build/asda-content.js"});
    const copy = page.getByRole("button", { name: "Copy remaining shop for ChatGPT" });
    const verify = page.getByRole("button", { name: "Verify basket" });
    assert.equal(await copy.count(), 0);
    await verify.click();
    await copy.click();
    const brief = await page.evaluate(() => window.brief);
    assert.match(brief, /Yoghurt \| Total needed: 750 g \| In trolley: 500 g \| Short by: 250 g/);
    assert.match(brief, /Avoid: sweetened/);
    assert.match(brief, /Oats.*Outstanding if still absent: 300 g/);
    assert.match(brief, /Loose spinach.*shortfall unknown/);
    assert.doesNotMatch(brief, /Pasta|Private meal/);
    assert.match(brief, /total additional price/);
    assert.match(brief, /Stop before checkout/);
    await page.locator(".weekwise-basket-card").filter({hasText:"Oats"}).getByText("Looks ok").click();
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(Error("denied")); });
    await copy.click();
    const fallback = await page.getByRole("textbox", {name:"Remaining shop for ChatGPT"}).inputValue();
    assert.match(fallback, /Short by: 250 g/);
    assert.doesNotMatch(fallback, /Oats/);
    await page.evaluate(() => {
      window.fixture.queue = {createdAt:"shop-two", items:window.fixture.queue.items.filter(item => item.name === "Pasta")};
      return window.refreshHelper();
    });
    assert.equal(await copy.count(), 0);
    await verify.click();
    assert.equal(await copy.count(), 0);
    console.log("ASDA handoff passed: mixed basket, quantities, exclusions, manual copy, new shop and all-covered basket.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
