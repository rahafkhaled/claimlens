const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const url = process.env.CLAIMLENS_URL || 'http://127.0.0.1:3184';
async function stored(page) { return page.evaluate(() => new Promise(resolve => { const req = indexedDB.open('keyval-store'); req.onsuccess = () => { const db = req.result; const read = db.transaction('keyval').objectStore('keyval').get('claimlens.workspace.v1'); read.onsuccess = () => { resolve(read.result); db.close(); }; }; })); }
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
 try {
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto(url); await page.getByRole('button', { name: 'Demo walkthrough', exact: true }).waitFor();
 await page.waitForFunction(() => document.querySelectorAll('.claims-table tbody tr').length === 4);
 await page.screenshot({path:'/tmp/claimlens-dashboard.png',fullPage:true});
 await page.getByLabel('Search claims').fill('Camry'); assert.equal(await page.locator('.claims-table tbody tr').count(),1);
 await page.getByLabel('Search claims').fill('not a claim'); await page.getByText('No matching claims',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Clear filters'}).click();
 await page.locator('.claim-title').first().click();
 let calls=0;
 await page.route('**/api/analyze', route => {
   if (route.request().postDataJSON().step === 'pins') return route.fulfill({json:{pins:[]}});
   calls++;
   return route.fulfill({json:{quality:{summary:'The detail is blurred.',gaps:['Provide a clear bumper close-up.']},decision:{choice:'missing',confidence:.95}}});
 });
 await page.getByRole('button',{name:'Assess evidence',exact:true}).click();
 const flow=page.getByRole('region',{name:'Claim review progress'});
 await flow.getByRole('heading',{name:'More evidence needed',exact:true}).waitFor();
 await flow.getByRole('button',{name:'Request additional evidence',exact:true}).click();
 let dialog=page.getByRole('dialog');
 assert.equal(await dialog.getByLabel('Request notes').inputValue(),'Provide a clear bumper close-up.');
 await dialog.getByRole('button',{name:'Send evidence request',exact:true}).click();
 await flow.getByRole('heading',{name:'Awaiting policyholder response',exact:true}).waitFor();
 for (const reload of [false, true]) {
   if (reload) {
     await page.reload();
     await page.locator('.claim-title').first().click();
   }
   await flow.getByRole('button',{name:'View request',exact:true}).click();
   await page.getByRole('dialog').getByText('Provide a clear bumper close-up.',{exact:true}).first().waitFor();
   assert.equal(await page.getByRole('dialog').locator('textarea,input[type=file]').count(),0);
   await page.keyboard.press('Escape');
   assert.equal(await page.getByRole('button',{name:/Add policyholder response|View as policyholder|Assess evidence again/}).count(),0);
 }
 const data=await stored(page);
 assert.equal(data.claims.find(c=>c.id===data.active).evidenceRequests[0].status,'awaiting');
 assert.equal(calls,1);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/claimlens-workspace-mobile.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'All claims',exact:true}).click();await page.screenshot({path:'/tmp/claimlens-dashboard-mobile.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]); console.log('PASS dashboard search, sent request, read-only waiting state, persistence, and mobile layouts');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
