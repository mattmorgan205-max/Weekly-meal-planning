// Exercise the built content script against a synthetic trolley; no retailer requests.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const vm = require("node:vm");
const fs = require("node:fs");

async function testSavedProductPolicy() {
  const url = "https://groceries.asda.com/product/123";
  const queue = { createdAt:"one", items:[] };
  let listener, clicks = 0, searchesClosed = 0;
  const stored = {queue, currentIndex:0, productLinks:{}, itemStatus:{}};
  const context = vm.createContext({
    URL, setTimeout: fn => setTimeout(fn, 0), clearTimeout,
    document:{querySelector: () => ({innerText:"ASDA Gluten-Free Pork Sausages"})},
    chrome:{
      runtime:{onMessage:{addListener:fn => {listener=fn;}}},
      storage:{local:{get:(_, cb) => cb(stored), set:(state, cb) => {Object.assign(stored,state); cb();}}},
      tabs:{create:(_, cb) => cb({id:1}), onUpdated:{addListener() {}, removeListener() {}},
        remove:(_, cb) => {searchesClosed++; cb();}, query:(_, cb) => cb([]),
        sendMessage:(_, message, cb) => cb({ok:message.type === "SCAN_REVIEW_CHOICES",choices:[]})},
      scripting:{executeScript:({func,args}, cb) => {
        if (args) cb([{result:func(...args)}]);
        else {clicks++; cb([{result:{ok:true}}]);}
      }}
    }
  });
  context.importScripts = file => vm.runInContext(fs.readFileSync("extension/asda-helper/build/"+file, "utf8"), context);
  context.importScripts("background.js");
  const send = message => new Promise(resolve => listener(message, {}, resolve));
  const item = {itemId:"s",shoppingKey:"s",name:"sausages",displayQuantity:"6",savedProductUrl:url};
  queue.items = [item];
  const blocked = await send({type:"AUTO_ADD_SAVED"});
  assert.equal(clicks,0);
  assert.match(blocked.state.autoAddReviews[0].reason,/dietary variant/);
  stored.queue.items[0].name = "gluten free sausages";
  await send({type:"AUTO_ADD_SAVED"});
  assert.equal(clicks,1);
  const choices = await send({type:"FIND_REVIEW_CHOICES",itemId:"s",fallbackState:{queue}});
  assert.equal(choices.ok,true);
  assert.equal(searchesClosed,3);
}

(async () => {
  await testSavedProductPolicy();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body:
      "<title>Trolley</title>" + ["Yoghurt 500g", "Pasta 1kg", "Loose spinach", "Gluten-Free Pork Sausages 500g"].map((name, i) =>
        `<article><a href="/groceries/product/${i}">${name}</a> Quantity <input aria-label="Quantity" value="1"> Remove</article>`).join("")
    }));
    await page.goto("https://www.asda.com/groceries/trolley");
    await page.evaluate(() => {
      const items = [["Yoghurt", 750], ["Pasta", 1000], ["Loose spinach", 200], ["Oats", 300], ["Sausages", 400]].map(([name, n]) => ({
        name, itemId: name, shoppingKey: name, requiredQuantity: n, requiredUnit: "g", displayQuantity: n + " g",
        sourceMeals: ["Private meal"], avoidTerms: name === "Yoghurt" ? ["sweetened"] : [], searchUrl: ""
      }));
      window.fixture = { queue: { createdAt: "shop-one", items }, currentIndex: 0, itemStatus: {}, productLinks: {} };
      chrome.runtime = { sendMessage: (message, cb) => cb(message.type === "FIND_REVIEW_CHOICES"
        ? {ok:true, choices:message.itemId === "Sausages" ? [
          {name:"Thick pork sausages", url:"https://www.asda.com/groceries/product/122", priceText:"£3"},
          {name:"Pork sausages", url:"https://www.asda.com/groceries/product/123", priceText:"£2.50"}] : []}
        : { state: window.fixture }), onMessage: { addListener(fn) {window.scan = fn;} } };
      chrome.storage = { onChanged: { addListener(fn) { window.refreshHelper = fn; } } };
      Object.defineProperty(navigator, "clipboard", {value: {writeText: async text => { window.brief = text; }}});
    });
    await page.addScriptTag({path: "extension/asda-helper/build/product-policy.js"});
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
    assert.match(brief, /Sausages.*shortfall unknown/);
    assert.match(brief, /Never select a product marketed as gluten-free/);
    assert.equal(await page.evaluate(() => {
      let result;
      window.scan({type:"SCAN_REVIEW_CHOICES",itemId:"Sausages"}, {}, response => {result=response;});
      return result.choices.length;
    }), 0);
    assert.deepEqual(await page.evaluate(() => [
      compatibleAsdaVariant("sausages", "Gluten‑Free sausages"),
      compatibleAsdaVariant("sausages", "GF sausages"),
      compatibleAsdaVariant("gluten free sausages", "GF sausages"),
      compatibleAsdaVariant("gluten free sausages", "Pork sausages")
    ]), [false,false,true,false]);
    await page.getByRole("button", {name:"Find product choices"}).click();
    await page.getByLabel("Thick pork sausages · £3").check();
    await page.getByLabel("Pork sausages · £2.50").check();
    await page.locator(".weekwise-basket-card").filter({hasText:"Loose spinach"}).getByLabel("Skip this item").check();
    await copy.click();
    const selected = await page.evaluate(() => window.brief);
    assert.match(selected,/My choice for this shop only: Pork sausages/);
    assert.doesNotMatch(selected,/Thick pork sausages/);
    assert.doesNotMatch(selected,/Loose spinach/);
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
