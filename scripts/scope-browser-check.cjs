const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
 const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
 try {
  const p = await b.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.CLAIMLENS_URL || 'http://127.0.0.1:3184');
  await p.waitForFunction(()=>!document.querySelector('.view-trigger').disabled);
  // Create an estimate through the review button before testing invalidation.
  const preset = require('./fixtures/demo-assessments-v2.json')[0];
  await p.route('**/api/analyze', route => route.fulfill({json: route.request().postDataJSON().step === 'quality'
   ? {quality:{summary:preset.quality,gaps:preset.gaps},decision:preset.decision}
   : {findings:preset.findings,lines:preset.lines}}));
  await p.getByRole('button',{name:'Review evidence',exact:true}).click();
  await p.getByRole('region', { name: 'Claim review progress' }).getByRole('button',{name:'Review estimate',exact:true}).click();
  await p.unroute('**/api/analyze');
  const description='A reversing vehicle struck only the front bumper. The old door scratch is not part of this accident.';
  await p.getByRole('button',{name:'Edit accident description'}).click();
  await p.getByRole('textbox',{name:'Accident description',exact:true}).fill(description);
  await p.getByRole('button',{name:'Save description'}).click();
  await p.getByRole('button',{name:'Estimate',exact:true}).click();
  assert((await p.locator('.estimate-total').innerText()).includes('12,612.60'));
  assert.equal(await p.getByRole('button',{name:'Submit for senior approval'}).count(),0);
  assert.equal(await p.getByRole('button',{name:'Edit estimate'}).count(),0);
  await p.locator('.scope-notice').filter({hasText:'Review evidence against'}).waitFor();
  await p.getByRole('button',{name:'Show review progress',exact:true}).click();
  const staleFlow=p.getByRole('region', { name: 'Claim review progress' });
  assert((await staleFlow.locator('.review-flow-kicker').innerText()).includes('Review required'));
  for (const title of ['LLM analysis','Decision Model','Damage analysis','Pricing catalogue']) {
    const node=staleFlow.locator('.review-node').filter({has: p.getByText(title,{exact:true})});
    if(await node.count()) assert.equal(await node.getAttribute('data-state'),'waiting');
  }
  assert.equal(await staleFlow.getByText(/% confidence/).count(),0);
  await staleFlow.getByRole('button',{name:'Hide progress',exact:true}).click();
  await p.reload();
  await p.waitForFunction(()=>!document.querySelector('.view-trigger').disabled);
  assert((await p.getByRole('region',{name:'Accident description'}).innerText()).includes(description));
  const finding={component:'Front bumper',code:'bumper',operation:'Replace',damage:'Cracked cover',repair:'Replace cover',severity:'Moderate',accidentRelation:'related',accidentReason:'Matches the reported bumper impact.',evidence:[{item:5,box:[10,10,900,900]}]};
  let requestCount=0;
  await p.route('**/api/analyze',route=>{
   const body=route.request().postDataJSON(); requestCount++;
   assert.equal(body.accidentDescription,description);
   return route.fulfill({json:body.step==='quality'?{quality:{summary:'Clear bumper damage views.',gaps:[]},decision:{choice:'sufficient',confidence:.98}}:{findings:[finding],excludedFindings:[{...finding,component:'Old door scratch',code:'door',accidentRelation:'unrelated',accidentReason:'Outside the reported impact area.'},{...finding,component:'Fender mark',code:'fender',accidentRelation:'uncertain',accidentReason:'Connection to this impact is unconfirmed.'}],lines:[{component:'Front bumper',repair:'Replace cover',parts:2620.8,labor:1747.2,source:'Mock catalogue',needsQuote:false}]}});
  });
  await p.getByRole('button',{name:'Review evidence',exact:true}).click();
  await p.getByRole('button',{name:'Run review again',exact:true}).click();
  const flow=p.getByRole('region', { name: 'Claim review progress' });
  await flow.getByRole('button',{name:'Review estimate',exact:true}).click();
  assert.equal(requestCount,2);
  assert.equal(await p.locator('.estimate-panel tbody tr').count(),1);
  assert((await p.locator('.estimate-total').innerText()).includes('4,368'));
  assert((await p.locator('.excluded-findings').innerText()).includes('Old door scratch'));
  assert((await p.locator('.excluded-findings').innerText()).includes('Accident connection unconfirmed'));
  assert(await p.getByRole('button',{name:'Submit for senior approval'}).isEnabled());
  await p.getByRole('button',{name:'Submit for senior approval'}).click();
  assert.equal(await p.getByRole('button',{name:'Authorize repairs'}).count(),0);
  // Keyboard switch, Escape, hover, and saved role.
  await p.locator('.view-trigger').focus(); await p.keyboard.press('ArrowDown');
  await p.waitForFunction(()=>document.activeElement?.getAttribute('role')==='menuitemradio' && document.activeElement.textContent==='Agent');
  await p.keyboard.press('End'); await p.waitForFunction(()=>document.activeElement?.textContent==='Senior adjuster'); await p.keyboard.press('Enter');
  await p.getByRole('heading',{name:'Senior desk'}).waitFor();
  assert.equal(await p.getByRole('button',{name:'Edit estimate'}).count(),0);
  assert(await p.getByRole('button',{name:'Authorize repairs'}).isEnabled());
  await p.getByRole('button',{name:'Evidence 6',exact:true}).click();
  assert.equal(await p.getByRole('button',{name:'Review evidence',exact:true}).count(),0);
  assert.equal(await p.getByRole('button',{name:'Add evidence',exact:true}).count(),0);
  assert.equal(await p.getByRole('button',{name:'Edit accident description'}).count(),0);
  await p.reload(); await p.waitForFunction(()=>!document.querySelector('.view-trigger').disabled);
  await p.getByRole('button',{name:'Switch view: Senior adjuster'}).waitFor();
  await p.locator('.view-trigger').hover(); await p.getByRole('menu',{name:'Workspace view'}).waitFor();
  await p.keyboard.press('Escape'); await p.getByRole('menu',{name:'Workspace view'}).waitFor({state:'detached'});
  await p.locator('.view-trigger').click(); await p.getByRole('menuitemradio',{name:'Agent',exact:true}).click();
  assert.equal(await p.getByRole('button',{name:'Evidence 6',exact:true}).getAttribute('aria-current'),'page');
  assert.equal(await p.locator('.region-pin,.region-outline').count(),0);
  assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'dark');
  await p.setViewportSize({width:375,height:812});
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.locator('.view-trigger').click();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await p.locator('.view-menu').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.deepEqual(errors,[]);
  console.log('PASS: accident description invalidation/persistence, scoped request and estimate, excluded observations, agent/senior action separation, keyboard/hover/click switcher, saved role, clean photos, dark theme, mobile and reduced motion.');
 } finally { await b.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
