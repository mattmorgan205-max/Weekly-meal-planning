// Run against a local production preview. All Supabase requests are intercepted;
// this test never signs into or writes to the real database.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.TEST_URL || 'http://127.0.0.1:3007';
const env = fs.readFileSync('.env.local', 'utf8');
const supabaseUrl = env.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
if (!supabaseUrl) throw Error('A configured public Supabase URL is needed for the mocked client.');
const host = new URL(supabaseUrl).host;
const key = `sb-${host.split('.')[0]}-auth-token`;
const household = '10000000-0000-0000-0000-000000000001';
const account = '20000000-0000-0000-0000-000000000001';
const user = { id: account, email: 'sync-test@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:account,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
const session = { access_token: token, refresh_token: 'test-only', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [];
  let snapshot, writes = 0, blocked = new Set();
  try {
    const bootstrap = await browser.newPage();
    await bootstrap.route(`https://${host}/**`, route => route.fulfill({json: {message:'No test session'}, status:401}));
    await bootstrap.goto(url);
    await bootstrap.waitForFunction(() => localStorage.getItem('weekwise-meal-planner-v1'));
    const fixture = await bootstrap.evaluate(() => JSON.parse(localStorage.getItem('weekwise-meal-planner-v1')));
    fixture.plannedMeals = []; fixture.dayNotes = {}; fixture.settings.householdName = 'Test household';
    fixture.recipes = [fixture.recipes[0]];
    snapshot = { state: fixture, version: 1, applied: false };
    await bootstrap.close();
    const pages = [];
    for (let index = 0; index < 3; index++) {
      const context = await browser.newContext({ viewport: index === 1 ? {width:390,height:844} : {width:1366,height:895} });
      await context.route(`https://${host}/**`, async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (blocked.has(index)) return route.abort('internetdisconnected');
        if (path === '/auth/v1/user') return route.fulfill({json:user});
        if (path.endsWith('/bootstrap_weekwise_households')) return route.fulfill({json:[{id:household,name:'Test household',role:'owner'}]});
        if (path.endsWith('/sync_weekwise_household')) {
          const body = request.postDataJSON();
          if (body.new_state && body.expected_revision === snapshot.version) {
            snapshot = {state:structuredClone(body.new_state),version:snapshot.version+1,applied:true}; writes++;
            return route.fulfill({json:snapshot});
          }
          return route.fulfill({json:{...snapshot,applied:false}});
        }
        return route.fulfill({json:[]});
      });
      await context.addInitScript(({key,session,fixture}) => {
        localStorage.setItem(key,JSON.stringify(session));
        if (!localStorage.getItem('weekwise-meal-planner-v1')) localStorage.setItem('weekwise-meal-planner-v1',JSON.stringify(fixture));
      }, {key,session,fixture});
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto(url); await page.locator('header .sync-badge').filter({hasText:'Saved'}).waitFor(); pages.push(page);
    }
    // Edit distinct planner notes from desktop and two phone sessions.
    for (let i=0;i<3;i++) {
      if (i===1) await pages[i].setViewportSize({width:1366,height:895});
      await pages[i].getByPlaceholder('Day note', {exact:true}).nth(i).fill(`Note from device ${i+1}`);
    }
    await pause(1500);
    for (const page of pages) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    for (const page of pages) await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('weekwise-meal-planner-v1')).dayNotes).length === 3);
    assert.equal(Object.keys(snapshot.state.dayNotes).length,3);

    // Deliberately hold network access while two devices edit the same field.
    blocked.add(0); blocked.add(1);
    for (let i=0;i<2;i++) { await pages[i].getByRole('button',{name:'Settings',exact:true}).click(); await pages[i].getByLabel('Household name',{exact:true}).fill(i===0?'Desktop choice':'Phone choice'); }
    await pause(1100); blocked.delete(0); await pages[0].evaluate(() => window.dispatchEvent(new Event('online')));
    await pages[0].waitForFunction(() => document.querySelector('header .sync-badge')?.textContent === 'Saved');
    blocked.delete(1); await pages[1].evaluate(() => window.dispatchEvent(new Event('online')));
    await pages[1].getByRole('heading',{name:'Changes need your choice'}).waitFor();
    assert.match(await pages[1].locator('.sync-conflict-notice').innerText(), /Desktop choice/);
    assert.match(await pages[1].locator('.sync-conflict-notice').innerText(), /Phone choice/);
    await pages[1].screenshot({path:'/tmp/weekwise-sync-conflict-desktop.png'});
    await pages[1].setViewportSize({width:390,height:844});
    await pages[1].screenshot({path:'/tmp/weekwise-sync-conflict-mobile.png'});
    assert.equal(await pages[1].evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
    await pages[1].getByRole('button',{name:"Keep this device's conflicting changes"}).click();
    await pages[1].getByRole('heading',{name:'Changes need your choice'}).waitFor({state:'hidden'});
    for (const page of pages) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    for (const page of pages) await page.waitForFunction(() => JSON.parse(localStorage.getItem('weekwise-meal-planner-v1')).settings.householdName === 'Phone choice');

    // Pending offline edits survive a reload of the same tab.
    blocked.add(2);
    await pages[2].getByPlaceholder('Day note',{exact:true}).nth(4).fill('Offline note retained');
    await pause(1100); await pages[2].reload();
    blocked.delete(2); await pages[2].reload();
    await pages[2].waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('weekwise-meal-planner-v1')).dayNotes).includes('Offline note retained'));
    await pages[2].locator('header .sync-badge').filter({hasText:'Saved'}).waitFor();
    assert.ok(Object.values(snapshot.state.dayNotes).includes('Offline note retained'));
    assert.equal(Object.keys(snapshot.state.dayNotes).length,4);

    // Closing the offline tab also leaves a recoverable household journal.
    blocked.add(2);
    await pages[2].getByPlaceholder('Day note',{exact:true}).nth(5).fill('Closed-tab note');
    await pause(100); const context = pages[2].context(); await pages[2].close();
    pages[2] = await context.newPage(); pages[2].on('pageerror',error => errors.push(error.message));
    await pages[2].goto(url);
    await pages[2].waitForFunction(() => [...document.querySelectorAll('textarea')].some(el => el.value === 'Closed-tab note'));
    await pages[2].locator('header .sync-badge').filter({hasText:'Sync error'}).waitFor();
    await pages[2].getByPlaceholder('Day note',{exact:true}).nth(6).fill('Edited after offline restart');
    await pages[2].waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('weekwise-meal-planner-v1')).dayNotes).includes('Edited after offline restart'));
    blocked.delete(2); await pages[2].evaluate(() => window.dispatchEvent(new Event('online')));
    await pages[2].locator('header .sync-badge').filter({hasText:'Saved'}).waitFor();
    assert.ok(Object.values(snapshot.state.dayNotes).includes('Edited after offline restart'));
    assert.ok(Object.values(snapshot.state.dayNotes).includes('Closed-tab note'));

    // An open recipe editor must merge only the fields changed in that draft.
    for (let i=0;i<2;i++) {
      await pages[i].setViewportSize({width:1366,height:895});
      await pages[i].getByRole('button',{name:'Recipes',exact:true}).click();
      await pages[i].getByPlaceholder('Search meals, tags, sources, ingredients').fill(fixture.recipes[0].title);
      await pages[i].getByRole('button',{name:'Edit',exact:true}).first().click();
    }
    await pages[0].getByLabel('Recipe name',{exact:true}).fill('Concurrent soup');
    await pages[1].getByLabel('Serves',{exact:true}).fill('7');
    const saveRecipe = async page => {
      await page.getByRole('button',{name:'Update recipe',exact:true}).click();
      const warning = page.getByRole('dialog',{name:'Check recipe before saving'});
      if (await warning.isVisible()) await warning.getByRole('button',{name:'Update recipe anyway',exact:true}).click();
    };
    await saveRecipe(pages[0]); await pause(1200);
    await pages[1].evaluate(() => window.dispatchEvent(new Event('focus')));
    await pages[1].waitForFunction(() => JSON.parse(localStorage.getItem('weekwise-meal-planner-v1')).recipes.some(recipe => recipe.title === 'Concurrent soup'));
    await saveRecipe(pages[1]); await pause(1200);
    if (snapshot.state.recipes.find(recipe => recipe.id === fixture.recipes[0].id).servings !== 7) console.log((await pages[1].locator('body').innerText()).slice(0,12000));
    assert.equal(snapshot.state.recipes.find(recipe => recipe.id === fixture.recipes[0].id).title,'Concurrent soup');
    assert.equal(snapshot.state.recipes.find(recipe => recipe.id === fixture.recipes[0].id).servings,7);
    assert.deepEqual(errors,[]);
    console.log(`Browser checks passed: three sessions, independent edits, conflict comparison/resolution, mobile layout, offline reload, closed-tab recovery, offline restart edits and open recipe editor merging. ${writes} accepted saves.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
