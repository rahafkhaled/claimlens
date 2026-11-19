const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.CLAIMLENS_URL || 'http://127.0.0.1:3184';
async function ready(page) { await page.waitForFunction(() => !document.querySelector('.view-trigger')?.disabled); }
async function stored(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('keyval-store');
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('keyval').objectStore('keyval').get('claimlens.workspace.v1');
      read.onsuccess = () => { resolve(read.result); db.close(); };
      read.onerror = () => reject(read.error);
    };
  }));
}
async function until(page, predicate) {
  for (let n = 0; n < 40; n++) { const data = await stored(page); if (data && predicate(data)) return data; await page.waitForTimeout(100); }
  throw new Error('Claim was not persisted');
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { Object.defineProperty(crypto, 'randomUUID', { value: undefined }); });
    await page.goto(url); await ready(page);
    assert.equal(await page.locator('.evidence-origin').count(), 0);
    assert(!/demo|synthetic/i.test(await page.locator('.file-meta').innerText()));
    let apiCalls = 0;
    await page.route('**/api/analyze', route => { apiCalls++; return route.fulfill({ json: { quality: { summary: 'The detail is blurred.', gaps: ['Provide a clear bumper close-up.'] }, decision: { choice: 'missing', confidence: .95 } } }); });
    // The missing route now composes a request, never opens an upload form.
    await page.getByRole('button', { name: 'Review evidence', exact: true }).click();
    const flow = page.getByRole('dialog', { name: 'Claim workflow' });
    await flow.getByRole('button', { name: 'Request evidence', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Request evidence', exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.locator('input[type=file]').count(), 0);
    assert.equal(await dialog.getByLabel('Request notes').inputValue(), 'Provide a clear bumper close-up.');
    await dialog.getByLabel('Request notes').fill('Please photograph only the accident damage.');
    const surface = dialog.getByRole('button', { name: 'Place a pin on this photo' });
    await surface.click({ position: { x: 130, y: 100 } });
    assert(await dialog.getByRole('button', { name: 'Request evidence', exact: true }).isDisabled());
    await dialog.getByLabel('Comment for pin 1').fill('Retake this bumper corner in daylight.');
    const firstName = await dialog.locator('.request-photo-label span').first().innerText();
    await dialog.locator('.request-filmstrip button').nth(4).click();
    await dialog.getByRole('button', { name: 'Add pin', exact: true }).click();
    await dialog.getByLabel('Comment for pin 2').fill('Show the headlamp mounting point close up.');
    // Keyboard positioning, editing and removing a draft pin.
    const secondPin = dialog.getByRole('button', { name: 'Pin 2: Show the headlamp mounting point close up.' });
    await secondPin.focus(); await secondPin.press('ArrowRight');
    await dialog.getByRole('button', { name: 'Add pin', exact: true }).click();
    await dialog.getByRole('button', { name: 'Remove pin', exact: true }).click();
    assert.equal(await dialog.locator('.pin-comment').count(), 2);
    assert.equal(await dialog.locator('select').count(), 0);
    assert.equal((await dialog.locator('.request-recipient').innerText()).trim(), 'To Policyholder');
    await page.screenshot({ path: '/tmp/claimlens-request-desktop.png', fullPage: true });
    await dialog.getByRole('button', { name: 'Request evidence', exact: true }).click();
    let data = await until(page, data => data.claims[0].evidenceRequests?.length === 1);
    let claim = data.claims[0]; const record = claim.evidenceRequests[0];
    assert.equal(claim.stage, 'missing'); assert.equal(record.recipient, 'Policyholder'); assert.equal(record.pins.length, 2);
    assert.equal(record.pins[0].photoName, firstName); assert.equal(record.pins[1].x, 51);
    assert.equal(claim.log[0].title, 'Evidence requested'); assert.equal(apiCalls, 1);
    assert.equal((await page.locator('.case-state').innerText()).trim(), 'Awaiting evidence');
    assert(await page.getByRole('button', { name: 'Review evidence', exact: true }).isDisabled());
    await page.reload(); await ready(page);
    assert(await page.locator('.action-note .primary').getByText('Record received evidence', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Estimate', exact: true }).click();
    await page.getByRole('heading', { name: 'Awaiting policyholder evidence', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Workflow', exact: true }).click();
    await page.getByRole('dialog', { name: 'Claim workflow' }).getByRole('button', { name: 'View request', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Evidence request', exact: true });
    assert.equal(await dialog.locator('.pin-comment').count(), 2);
    assert.equal(await dialog.locator('textarea').count(), 0);
    assert.equal(await dialog.getByRole('button', { name: 'Place a pin on this photo' }).count(), 0);
    const savedPin = dialog.locator('.evidence-pin').first();
    const expectedX = record.pins[0].x;
    async function aligned() {
      const photo = await dialog.locator('.request-photo > img').boundingBox();
      const pin = await savedPin.boundingBox();
      assert(Math.abs((pin.x + pin.width / 2 - photo.x) / photo.width * 100 - expectedX) < .3);
    }
    await aligned();
    await page.setViewportSize({ width: 390, height: 844 }); await aligned();
    await page.screenshot({ path: '/tmp/claimlens-request-mobile.png', fullPage: true });
    assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    // Senior can inspect saved requests, but cannot annotate or request photos.
    await page.getByRole('button', { name: /^Switch view:/ }).click();
    await page.getByRole('menuitemradio', { name: 'Senior adjuster', exact: true }).click();
    await page.getByRole('button', { name: 'Evidence 6', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Request evidence', exact: true }).count(), 0);
    await page.locator('.request-record').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: /^Switch view:/ }).click();
    await page.getByRole('menuitemradio', { name: 'Agent', exact: true }).click();
    // Cancel a draft without changing the saved request.
    await page.locator('.evidence-actions').getByRole('button', { name: 'Request evidence', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Request evidence', exact: true });
    await dialog.getByLabel('Request notes').fill('Discard me');
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await dialog.getByRole('button', { name: 'Discard draft', exact: true }).click();
    assert.equal((await stored(page)).claims[0].evidenceRequests.length, 1);
    // Received evidence is an explicit, separate action, never auto-reviewed.
    await page.locator('.action-note').getByRole('button', { name: 'Record received evidence', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Record received evidence', exact: true });
    await dialog.getByLabel('Response / inspection notes').fill('Policyholder supplied the requested close-up.');
    await dialog.locator('input[type=file]').setInputFiles({ name: 'bumper-response.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync('public/evidence/bmw/5.jpg') });
    await dialog.getByText('bumper-response.jpg', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Record response', exact: true }).click();
    data = await until(page, data => data.claims[0].stage === 'intake');
    assert.equal(data.claims[0].photos.length, 7); assert.equal(data.claims[0].evidenceRequests[0].status, 'received');
    assert.equal(data.claims[0].evidenceRequests[0].pins[0].photoId, record.pins[0].photoId);
    assert.equal(apiCalls, 1); assert(await page.getByRole('button', { name: 'Review evidence', exact: true }).isEnabled());
    // Two requests can receive separate responses; one response must not clear both.
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const text of ['Confirm the bumper mount.', 'Confirm the lamp bracket.']) {
      await page.locator('.evidence-actions').getByRole('button', { name: 'Request evidence', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Request evidence', exact: true });
      await dialog.getByLabel('Request notes').fill(text);
      await dialog.getByRole('button', { name: 'Request evidence', exact: true }).click();
    }
    await page.locator('.action-note').getByRole('button', { name: 'Record received evidence', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Record received evidence', exact: true });
    await dialog.getByLabel('Response / inspection notes').fill('Bumper mount inspected by the repair shop.');
    await dialog.locator('input[type=checkbox]').nth(1).uncheck();
    await dialog.getByRole('button', { name: 'Record response', exact: true }).click();
    data = await until(page, data => data.claims[0].evidenceRequests?.[1].status === 'received');
    assert.equal(data.claims[0].evidenceRequests[2].status, 'awaiting');
    assert.equal(data.claims[0].stage, 'missing');
    assert(await page.getByRole('button', { name: 'Review evidence', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Edit accident description', exact: true }).click();
    await page.getByRole('textbox', { name: 'Accident description', exact: true }).fill('Front-left collision with a parked car, damaging bumper and lamp.');
    await page.getByRole('button', { name: 'Save description', exact: true }).click();
    assert.equal((await page.locator('.case-state').innerText()).trim(), 'Awaiting evidence');
    assert.deepEqual(errors, []);
    console.log('PASS: missing-route request composer, multi-photo pins/comments, keyboard movement, empty-pin validation, recipient, persistence, responsive pin alignment, senior read-only requests, draft cancellation and separate response upload without automatic review.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
