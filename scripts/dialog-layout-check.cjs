const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(process.env.CLAIMLENS_URL || "http://localhost:3185/");
      const walkthrough = page.getByRole("button", { name: "Demo walkthrough" });
      await walkthrough.click();
      const dialog = page.getByRole("dialog");
      await dialog.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      const box = await dialog.boundingBox();
      assert(Math.abs((width - box.width) / 2 - box.x) < 2, "Horizontal centering");
      assert(Math.abs((height - box.height) / 2 - box.y) < 2, `Vertical centering at ${width}×${height}: ${JSON.stringify(box)}`);
      assert(await dialog.locator("h2").evaluate(el => el === document.activeElement));
      const close = dialog.getByRole("button", { name: "Close dialog" });
      const top = (await close.boundingBox()).y;
      await dialog.locator(".modal-body").evaluate(el => { el.scrollTop = el.scrollHeight; });
      assert(Math.abs((await close.boundingBox()).y - top) < 2, "Close button remains visible");
      if (process.env.CLAIMLENS_SCREENSHOT_DIR && width !== 844) {
        await dialog.locator(".modal-body").evaluate(el => { el.scrollTop = 0; });
        await page.screenshot({ path: process.env.CLAIMLENS_SCREENSHOT_DIR + "/claim-dialog-" + width + ".png" });
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert(await walkthrough.evaluate(el => el === document.activeElement));
      const action = page.locator(".claims-table .next-action").first();
      const actionBox = await action.boundingBox();
      assert(actionBox.x >= 0 && actionBox.x + actionBox.width <= width, "Queue action fits screen");
      await page.getByRole("button", { name: "Reset sample claims" }).click();
      await page.getByRole("button", { name: "Cancel" }).click();
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.route("**/api/analyze", route => route.fulfill({ json: {
        quality: { summary: "A lamp close-up is missing.", gaps: ["Provide a clear right tail lamp close-up."] },
        decision: { choice: "missing", confidence: .96 },
      } }));
      await page.getByRole("button", {name: "2021 BMW 330i"}).click();
      await page.getByRole("button", {name: "Assess evidence", exact: true}).click();
      await page.getByRole("button", {name: "Review flagged evidence", exact: true}).click();
      await page.getByRole("button", {name: "Photo pin 1: Flagged evidence"}).click();
      const flags = page.getByRole("dialog");
      const rect = await flags.boundingBox();
      assert(Math.abs(rect.x * 2 + rect.width - width) < 2);
      assert(Math.abs(rect.y * 2 + rect.height - height) < 2);
      if (process.env.CLAIMLENS_SCREENSHOT_DIR && width !== 844) {
        await page.screenshot({path: process.env.CLAIMLENS_SCREENSHOT_DIR + "/flagged-review-" + width + ".png"});
      }
      await page.close();
    }
    console.log("PASS centered dialogs, focus return, anchored close control and visible queue actions on desktop, portrait and landscape");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
