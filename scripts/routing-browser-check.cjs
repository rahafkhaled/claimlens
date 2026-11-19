const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try {
  const page=await browser.newPage();
  await page.goto(process.env.CLAIMLENS_URL||'http://127.0.0.1:3184');
  await page.waitForFunction(()=>!document.querySelector('.view-trigger').disabled);
  let damageCalls=0;
  const reason="Model confidence is below the 80% routing threshold. An agent must review the evidence.";
  await page.route('**/api/analyze',route=>{
   if(route.request().postDataJSON().step==='quality')return route.fulfill({json:{quality:{summary:'Exterior views are clear.',gaps:[],ambiguities:[]},decision:{choice:'uncertain',confidence:.46,modelChoice:'missing',reason}}});
   damageCalls++;return route.fulfill({json:{findings:[],excludedFindings:[],lines:[]}});
  });
  await page.getByRole('button',{name:'Review evidence',exact:true}).click();
  let flow=page.getByRole('region', { name: 'Claim review progress' });
  await flow.getByText('Review complete',{exact:true}).waitFor();
  await flow.getByText('Review rules applied',{exact:true}).waitFor();
  await flow.getByText('Why this route?',{exact:true}).click();
  assert((await flow.innerText()).includes('Original model route: missing · 46% confidence'));
  assert((await flow.locator('.decision-branch[data-selected="true"]').innerText()).includes('Uncertain'));
  assert.equal(damageCalls,0);
  await flow.getByRole('button',{name:'Check flagged evidence',exact:true}).click();
  assert((await page.locator('.action-note').innerText()).includes(reason));
  await page.reload();await page.waitForFunction(()=>!document.querySelector('.view-trigger').disabled);
  await page.getByRole('button',{name:'Show review progress',exact:true}).click();
  await flow.getByText('Review rules applied',{exact:true}).waitFor();
  await flow.getByRole('button',{name:'Hide progress',exact:true}).click();
  await page.getByRole('button',{name:'Accept & assess damage',exact:true}).click();
  await flow.getByText('Review complete',{exact:true}).waitFor();
  await flow.getByRole('button',{name:'Hide progress',exact:true}).click();
  assert.equal(damageCalls,1);
  assert.equal((await page.locator('.case-state').innerText()).trim(),'Agent review');
  assert.equal(await page.getByRole('button',{name:'Submit for senior approval',exact:true}).count(),0);
  await page.getByRole('button',{name:'Evidence 6',exact:true}).click();
  assert((await page.locator('.action-note').innerText()).includes('No accident-related repairs confirmed'));
  assert(!(await page.locator('.action-note').innerText()).includes('Provide a close-up'));
  console.log('PASS: guarded route and raw model audit in live/saved workflow, agent-only continuation, empty findings do not fabricate missing-photo requests.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
