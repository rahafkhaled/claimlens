const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const preset = require('./fixtures/demo-assessments-v2.json')[0];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.CLAIMLENS_URL || 'http://127.0.0.1:3184');
    await page.waitForFunction(() => !document.querySelector('.view-trigger').disabled);
    await page.route('**/api/analyze', route => route.fulfill({ json: route.request().postDataJSON().step === 'quality'
      ? { quality: { summary: preset.quality, gaps: [] }, decision: preset.decision }
      : { findings: preset.findings, lines: preset.lines.map((line, index) => index === 0 ? { ...line, parts: 0, source: 'Quote required', needsQuote: true } : line) } }));
    await page.getByRole('button', { name: 'Analyze evidence', exact: true }).click();
    const outcome = page.getByRole('region', { name: 'Claim review progress' });
    await outcome.getByRole('heading', { name: 'Pricing needs confirmation', exact: true }).waitFor();
    assert.equal(await outcome.locator('.review-flow').count(), 0);
    assert.equal(await page.locator('main .primary:enabled').count(), 1);
    await page.screenshot({ path: '/tmp/claimlens-analysis-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await outcome.getByRole('button', { name: 'Review pricing gaps', exact: true }).click();
    const requirements = page.getByRole('region', { name: 'Estimate requirements' });
    await requirements.waitFor();
    assert.equal(await requirements.evaluate(el => el === document.activeElement), true);
    assert(await page.getByRole('button', { name: 'Submit for approval', exact: true }).isDisabled());
    assert.equal(await page.getByRole('button', { name: 'Edit estimate', exact: true }).getAttribute('class'), 'primary');
    await page.getByRole('button', { name: 'Edit estimate', exact: true }).click();
    await page.getByLabel('Parts (QAR)').first().fill('1200');
    await page.getByLabel('Pricing source').first().fill('Workshop quote Q-51');
    await page.getByRole('button', { name: 'Save estimate', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Submit for approval', exact: true }).isEnabled());
    await page.getByRole('button', { name: 'Evidence 6', exact: true }).click();
    await outcome.getByRole('heading', { name: 'Estimate prepared', exact: true }).waitFor();
    assert.equal(await outcome.locator('.review-flow').count(), 0);
    await outcome.getByRole('button', { name: 'View analysis details', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await outcome.getByRole('button', { name: 'Hide analysis details', exact: true }).getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Enter');
    assert.equal(await outcome.locator('.review-flow').count(), 0);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addStyleTag({ content: '.analysis-panel { font-size: 200%; } .analysis-panel p, .analysis-panel button { font-size: 24px; }' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('PASS: quote outcome, targeted requirements focus, single primary action, pricing correction, compact mobile/landscape, large text and keyboard disclosure.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
