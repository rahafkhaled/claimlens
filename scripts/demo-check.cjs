const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const presets = require('./fixtures/demo-assessments-v2.json');
const url = process.env.CLAIMLENS_URL || 'http://127.0.0.1:3184';
const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function ready(p) {
  await p.locator(".view-trigger:enabled").waitFor();
}
async function choose(p, id) {
  await p.getByRole('link', { name: 'Claims workspace home' }).click();
  await p.getByRole('button', { name: /^All claims\s*\d/ }).click();
  await p.getByRole('row').filter({ hasText: id }).locator('.claim-title').click();
}
async function switchView(p, role) {
  await p.getByRole('button', { name: /^Switch view:/ }).click();
  await p.getByRole('menuitemradio', { name: role, exact: true }).click();
}
async function stored(p) {
  return p.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('keyval-store');
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('keyval').objectStore('keyval').get('claimlens.workspace.v1');
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => reject(get.error);
    };
    request.onerror = () => reject(request.error);
  }));
}
async function untilStored(p, predicate) {
  for (let i = 0; i < 30; i++) {
    const data = await stored(p);
    if (data && predicate(data)) return data;
    await p.waitForTimeout(100);
  }
  throw new Error('Claim storage did not reach the expected state');
}
(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.setDefaultTimeout(10000);
    await p.goto(url); await ready(p);
    assert.equal(await p.locator('header.mast, footer, .brand').count(), 0);
    assert.equal(await p.getByRole('heading', { name: 'Claims queue' }).count(), 1);
    const original = await untilStored(p, d => d.claims.length === 4);
    for (const c of original.claims) {
      assert.equal(c.photos.length, 6);
      assert.equal(new Set(c.photos.map(x => x.src)).size, 6);
      assert.equal(c.currency, 'QAR');
      for (const photo of c.photos) {
        const r = await p.request.get(url + photo.src);
        assert.equal(r.status(), 200);
        assert(r.headers()['content-type'].includes('image/'));
      }
    }
    assert.deepEqual(original.claims.map(c => c.stage), ['intake', 'intake', 'intake', 'intake']);
    let reviewCalls = 0;
    await p.route('**/api/analyze', route => {
      if (route.request().postDataJSON().step === 'pins') return route.fulfill({ json: { pins: [] } });
      reviewCalls++;
      const body = route.request().postDataJSON();
      const preset = presets.find(claim => claim.vehicle === body.vehicle);
      return route.fulfill({ json: body.step === 'quality'
        ? { quality: { summary: preset.quality, gaps: preset.gaps }, decision: preset.decision }
        : { findings: preset.findings, lines: preset.lines } });
    });
    for (const claim of original.claims) {
      await choose(p, claim.id);
      assert.equal((await p.locator('.case-state').innerText()).trim(), 'New claim');
      assert.equal(await p.locator('.action-note,.scope-notice').count(), 0);
      await p.getByRole('button', { name: 'Repair estimate', exact: true }).click();
      assert.equal(await p.locator('.estimate-total').count(), 0);
      assert.equal(await p.getByRole('region', { name: 'Claim review progress' }).count(), 0);
      await p.getByRole('button', { name: 'Evidence 6', exact: true }).click();
      assert.equal(await p.getByRole('button', { name: 'Evidence 6', exact: true }).getAttribute('aria-current'), 'page');
    }
    assert.equal(reviewCalls, 0, 'opening claims, estimates and workflow must not review photos');
    for (const claim of original.claims) {
      await choose(p, claim.id);
      await p.getByRole('button', { name: 'Assess evidence', exact: true }).click();
      const flow = p.getByRole('region', { name: 'Claim review progress' });
      await flow.getByRole('heading', { name: /Draft estimate ready|More evidence needed|Evidence needs manual review|Inspection required/ }).waitFor();
      assert.equal(await flow.locator('.review-flow').count(), 0);
      assert.equal(await p.locator('main .primary:enabled').count(), 1);
      await untilStored(p, d => d.claims.find(c => c.id === claim.id).decisionSource === 'jev');
    }
    assert.equal(reviewCalls, 6);

    await p.reload(); await ready(p);
    assert.deepEqual((await stored(p)).claims.map(c => c.stage), ['review', 'missing', 'uncertain', 'review']);
    await choose(p, 'CLM-2084');
    assert.equal(await p.getByRole('button', { name: 'Assessment', exact: true }).count(), 0);
    await p.getByRole('button', { name: 'Repair estimate', exact: true }).click();
    assert((await p.locator('.estimate-total').innerText()).includes('12,612.60'));
    assert((await p.locator('.estimate-total b').evaluate(el => getComputedStyle(el).fontFamily)).includes('Inter'));
    assert.equal(await p.locator('.region-pin,.region-outline').count(), 0);
    await p.getByRole('button', { name: 'Left fender', exact: true }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Fender close-up', exact: true }).click();
    assert((await p.getByRole('dialog').locator('img').getAttribute('src')).endsWith('bmw/6.jpg'));
    await p.keyboard.press('Escape');
    await p.getByRole('button', { name: 'Evidence 6', exact: true }).click();
    assert.equal(await p.locator('.gallery-pin').count(), 0, 'Overview uses the findings list');
    await p.getByRole('complementary', {name: 'Damage findings'}).getByRole('button', {name: /Left fender/}).click();
    assert(await p.getByRole('button', {name: 'Photo pin 2: Left fender'}).isVisible());
    assert((await p.locator('.photo-caption').innerText()).includes('Fender close-up'));

    await choose(p, 'CLM-2085');
    await p.getByRole('heading', { name: 'More evidence needed', exact: true }).waitFor();
    await p.getByRole('button', {name: 'Request additional evidence', exact: true}).first().click();
    const composer = p.getByRole('dialog');
    await composer.getByLabel('Request notes').fill('Please send a close-up of the right tail lamp.');
    await composer.getByRole('button', {name:'Send evidence request'}).click();
    await p.getByRole('button', {name:'View as policyholder'}).click();
    const portal = p.getByRole('dialog', {name:'Your evidence request'});
    await portal.getByText('Please send a close-up of the right tail lamp.', {exact:true}).waitFor();
    await portal.locator('input[type=file]').setInputFiles('public/evidence/camry/5.jpg');
    await portal.getByRole('button', {name:'Send evidence to agent'}).click();
    await p.getByRole('heading', {name:'Updated evidence ready for assessment'}).waitFor();
    const response = (await stored(p)).claims.find(c => c.id === 'CLM-2085');
    assert.equal(response.photos.length, 7);
    assert.equal(response.evidenceRequests.at(-1).status, 'received');
    await choose(p, 'CLM-2086');
    await p.getByRole('button', { name: 'Check flagged evidence', exact: true }).click();
    assert(await p.getByRole('button', { name: 'Accept evidence & assess damage' }).isEnabled());
    await p.keyboard.press('Escape');
    await choose(p, 'CLM-2087');
    await p.getByRole('button', { name: 'Evidence 6' }).click();
    await p.getByRole('button', { name: 'Review inspection requirements', exact: true }).click();
    await p.getByRole('region', { name: 'Estimate requirements' }).waitFor();
    assert.equal(await p.getByRole('region', { name: 'Estimate requirements' }).evaluate(el => el === document.activeElement), true);
    assert(await p.getByRole('button', { name: 'Submit estimate for approval' }).isDisabled());
    const updateInspection = p.getByRole('button', { name: 'Update inspection' });
    await updateInspection.click();
    await p.getByRole('button', { name: 'Save inspection' }).click();
    assert(await p.getByRole('button', { name: 'Submit estimate for approval' }).isDisabled());
    await updateInspection.click();
    await p.getByLabel('Inspection status').selectOption('completed');
    await p.getByLabel('Technician findings').fill('Alignment within tolerance, workshop report Q-48.');
    assert(await p.getByRole('button', { name: 'Save inspection' }).isDisabled());
    await p.getByLabel('Repair decision').fill('No suspension repair required.');
    await p.getByRole('button', { name: 'Save inspection' }).click();
    await untilStored(p, data => data.claims.find(c => c.id === "CLM-2087").lines.some(line => line.inspection?.status === "completed"));
    // This older fixture used a generic catalogue allowance. Reopening it requires a supplier quote.
    assert(await p.getByRole('button', { name: 'Submit estimate for approval' }).isDisabled());
    await p.getByRole('region', { name: 'Estimate requirements' }).getByRole('button', { name: 'Enter supplier quote' }).click();
    await p.getByLabel('Labor (QAR)').fill('500');
    await p.getByRole('textbox', { name: 'Pricing source', exact: true }).fill('Workshop inspection quote Q-48');
    await p.getByLabel('I confirm the quoted').check();
    await p.getByRole('button', { name: 'Save supplier quote' }).click();
    await p.locator('button:enabled').filter({ hasText: 'Submit estimate for approval' }).waitFor();

    await choose(p, 'CLM-2084');
    await p.getByRole('button', { name: 'Repair estimate', exact: true }).click();
    const draftDownload = p.waitForEvent('download');
    await p.getByRole('button', { name: 'Download draft PDF' }).click();
    const draft = await draftDownload;
    assert.equal(draft.suggestedFilename(), 'CLM-2084-draft.pdf');
    assert.equal(fs.readFileSync(await draft.path()).subarray(0, 5).toString(), '%PDF-');
    await p.getByRole('button', { name: 'Submit estimate for approval' }).click();
    assert.equal(await p.getByRole('button', {name:'Authorize repairs'}).count(), 0);
    await switchView(p, 'Senior adjuster');
    await p.getByRole('button', { name: 'Review submission', exact: true }).click();
    await p.getByRole('button', { name: 'Return for changes' }).click();
    await p.getByRole('textbox').fill('Update bumper labor quote.');
    await p.getByRole('button', { name: 'Return estimate' }).click();
    await switchView(p, 'Agent');
    await p.getByRole('button', {name:'Repair estimate',exact:true}).click();
    await p.getByRole('button', { name: 'Select items' }).click();
    await p.getByLabel('Select Front bumper').check();
    await p.getByRole('button', { name: 'Edit items' }).click();
    await p.getByLabel('Labor (QAR)').first().fill('1800');
    await p.getByLabel('Pricing source').first().fill('Workshop Q-49');
    await p.getByRole('button', { name: 'Save estimate' }).click();
    await p.getByRole('button', { name: 'Mark corrections complete' }).click();
    await p.getByRole('button', { name: 'Submit estimate for approval' }).click();
    await switchView(p, 'Senior adjuster');
    await p.getByRole('button', { name: 'Review submission', exact: true }).click();
    await p.getByRole('button', { name: 'Authorize repairs' }).click();
    assert(await p.getByRole('button', { name: 'Confirm authorization' }).isDisabled());
    await p.getByLabel('Approved repair shop').selectOption('Harbor Auto Body');
    await p.getByLabel('Senior adjuster name').fill('Demo Adjuster');
    assert((await p.locator('.authorization-summary').innerText()).includes('Harbor Auto Body'));
    assert((await p.locator('.authorization-summary').innerText()).includes('12,665.40'));
    await p.getByRole('button', { name: 'Confirm authorization' }).click();
    const downloaded = p.waitForEvent('download');
    await p.getByRole('button', { name: 'Download authorized report' }).click();
    const authorizedFile = await downloaded;
    assert.equal(authorizedFile.suggestedFilename(), 'CLM-2084-authorized.pdf');
    const report = fs.readFileSync(await authorizedFile.path(), 'latin1');
    assert(report.startsWith('%PDF-'));
    if (process.env.AUTHORIZED_PDF_PATH) await authorizedFile.saveAs(process.env.AUTHORIZED_PDF_PATH);
    for (const text of ['QAR', '12,665.40', 'Workshop Q-49', 'Harbor Auto Body', 'Senior adjuster signature', 'Demo Adjuster', 'generated imagery']) assert(report.includes(text), text);
    assert(!report.includes('USD'));
    await untilStored(p, d => d.claims.find(c => c.id === 'CLM-2084').stage === 'authorized');
    await p.reload(); await ready(p);
    await choose(p, 'CLM-2084');
    assert(await p.getByRole('button', {name:'Download authorized report'}).isVisible());

    assert.equal(await p.getByRole('button', {name:'Switch view: Senior adjuster'}).count(),1);
    await switchView(p, 'Agent');

    // Reset only sample claims, then exercise the actual button and request payload.
    await p.getByRole('link', { name: 'Claims workspace home' }).click();
    await p.getByRole('button', { name: 'Reset sample claims' }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Reset sample claims', exact: true }).click();
    let verdict = 'sufficient', failDamage = true, calls = [];
    const finding = { component: 'Test bumper', code: 'bumper', damage: 'Visible crack', repair: 'Replace cover', severity: 'Moderate', accidentRelation: 'related', accidentReason: 'Matches the accident area.', operation: 'Replace', evidence: [{ item: 5, box: [100, 100, 700, 700], seconds: null }] };
    await p.route('**/api/analyze', async route => {
      const body = route.request().postDataJSON();
      if (body.step === 'pins') return route.fulfill({json:{pins:[]}});
      assert(body.accidentDescription.length >= 10);
      assert.equal(body.images.length, 6);
      assert(body.images.every(i => i.startsWith('data:image/jpeg;base64,')));
      assert(!JSON.stringify(body).includes('API_KEY'));
      calls.push(body.step);
      if (body.step === 'damage' && failDamage) return route.fulfill({ status: 502, json: { error: 'Provider unavailable for test' } });
      return route.fulfill({ json: body.step === 'quality' ? { quality: { summary: 'Live test photo review', gaps: verdict === 'missing' ? ['Need a clear detail.'] : [] }, decision: { choice: verdict, confidence: .9 } } : { findings: [finding], lines: [{ component: finding.component, repair: finding.repair, parts: 2620.8, labor: 1747.2, needsQuote: false, source: 'Demo QAR rates' }] } });
    });
    await choose(p, 'CLM-2084');
    await p.getByRole('button', { name: 'Assess evidence', exact: true }).click();
    await p.getByRole('alert').filter({ hasText: 'Provider unavailable for test' }).waitFor();
    assert.equal((await stored(p)).claims.find(c => c.id === 'CLM-2084').stage, 'intake');
    assert.equal((await stored(p)).claims.find(c => c.id === 'CLM-2084').lines.length, 0);
    assert.deepEqual(calls, ['quality', 'damage']);
    assert.equal((await stored(p)).claims.find(c => c.id === 'CLM-2084').findings.length, 0);
    failDamage = false;
    await p.getByRole('button', { name: 'Try analysis again', exact: true }).click();
    await p.getByRole('region', { name: 'Claim review progress' }).getByRole('button', { name: 'Review estimate', exact: true }).click();
    await p.getByText('Test bumper', { exact: true }).waitFor(); await ready(p);
    assert((await p.locator('.estimate-total').innerText()).includes('4,368'));
    verdict = 'missing'; await choose(p, 'CLM-2085');
    await p.getByRole('button', { name: 'Assess evidence', exact: true }).click();
    await p.getByRole('region', { name: 'Claim review progress' }).getByText('Need a clear detail.', { exact: true }).waitFor(); await ready(p);
    verdict = 'uncertain'; await choose(p, 'CLM-2086');
    await p.getByRole('button', { name: 'Assess evidence', exact: true }).click();
    await ready(p);
    await p.getByRole('region', { name: 'Claim review progress' }).getByRole('button', { name: 'Check flagged evidence', exact: true }).click();
    await p.getByRole('button', { name: 'Accept evidence & assess damage' }).click();
    await p.getByRole('region', { name: 'Claim review progress' }).getByRole('button', { name: 'Review estimate', exact: true }).click();
    await p.getByText('Test bumper', { exact: true }).waitFor(); await ready(p);
    assert.equal((await untilStored(p, d => d.claims.find(c => c.id === 'CLM-2086').stage === 'review')).claims.find(c => c.id === 'CLM-2086').override, true);

    // Legacy storage upgrades the untouched seed, preserves custom claims and converts once.
    const migration = await browser.newPage(); await migration.goto(url); await ready(migration);
    const ts = require('typescript');
    const legacyModule = { exports: {} };
    new Function('exports', ts.transpileModule(fs.readFileSync('lib/legacy-sample.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(legacyModule.exports);
    await migration.evaluate(claim => new Promise(resolve => { const r = indexedDB.open('keyval-store'); r.onsuccess = () => { const db = r.result; const t = db.transaction('keyval', 'readwrite'); t.objectStore('keyval').put({ claims: [claim], active: claim.id }, 'claimlens.workspace.v1'); t.oncomplete = () => { db.close(); resolve(); }; }; }), legacyModule.exports.sample);
    await migration.reload(); await ready(migration);
    const upgraded = await untilStored(migration, d => d.claims.length === 4 && d.claims[0].demoVersion === 3);
    assert.equal(upgraded.claims[0].photos.length, 6);
    const custom = { ...presets[0], id: 'CLM-UPLOADED', sample: false, demoVersion: undefined, currency: undefined, title: 'Keep my claim', lines: [{ ...presets[0].lines[0], parts: 100, labor: 50 }] };
    await migration.evaluate(data => new Promise(resolve => { const r = indexedDB.open('keyval-store'); r.onsuccess = () => { const db = r.result; const t = db.transaction('keyval', 'readwrite'); t.objectStore('keyval').put(data, 'claimlens.workspace.v1'); t.oncomplete = () => { db.close(); resolve(); }; }; }), { claims: [custom], active: custom.id });
    await migration.reload(); await ready(migration);
    let migrated = await untilStored(migration, d => d.claims.length === 5 && d.claims[0].currency === 'QAR');
    assert.equal(migrated.claims[0].lines[0].parts, 364);
    await migration.reload(); await ready(migration);
    assert.equal((await stored(migration)).claims[0].lines[0].parts, 364);
    await migration.getByRole('button', { name: 'Reset sample claims' }).click(); await migration.getByRole('dialog').getByRole('button', { name: 'Reset sample claims', exact: true }).click();
    assert((await untilStored(migration, d => d.active === 'CLM-2084')).claims.some(c => c.title === 'Keep my claim'));

    const m = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await m.goto(url); await ready(m);
    for (const id of ['CLM-2084', 'CLM-2085', 'CLM-2086', 'CLM-2087']) {
      await choose(m, id);
      assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, id);
      await m.getByRole('button', { name: 'Repair estimate', exact: true }).click();
      assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, id + ' estimate');
    }
    await m.setViewportSize({ width: 812, height: 375 });
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('PASS: four six-photo scenarios, image assets, QAR/font, evidence links, inspection gate, corrections, authorization/report, persistence/migration, reset preservation, live-button payload/routing, failure recovery, mobile layouts, branding/footer removal.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
