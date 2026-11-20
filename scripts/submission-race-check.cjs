const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");
const fixture = require("./fixtures/demo-assessments-v2.json")[0];
const url = process.env.CLAIMLENS_URL || "http://127.0.0.1:3185";

async function exercise(browser, order) {
  const context = await browser.newContext();
  try {
    const agent = await context.newPage();
    const senior = await context.newPage();
    await agent.goto(url);
    await agent.locator(".claim-title").first().waitFor();
    await agent.evaluate(async fixture => {
      const db = await new Promise(resolve => {
        const open = indexedDB.open("keyval-store");
        open.onsuccess = () => resolve(open.result);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("keyval", "readwrite");
        const store = tx.objectStore("keyval");
        const read = store.get("claimlens.workspace.v1");
        read.onsuccess = () => {
          const saved = read.result;
          const claim = saved.claims[0];
          Object.assign(claim, { findings: fixture.findings, lines: fixture.lines, stage: "senior", scopeReviewed: true });
          claim.log.unshift({ title: "Submitted to senior adjuster", detail: "Agent submitted the estimate.", at: new Date().toISOString(), delivery: "unread" });
          store.put(saved, "claimlens.workspace.v1");
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, fixture);
    await agent.reload();
    await agent.locator(".claim-title").first().click();
    const recall = agent.getByRole("button", { name: "Recall submission" });
    await recall.waitFor();
    await senior.goto(url);
    await senior.getByRole("button", { name: /Switch view:/ }).click();
    await senior.getByRole("menuitemradio", { name: "Senior adjuster" }).click();
    const openSubmission = senior.getByRole("button", { name: "Review submission" });
    await openSubmission.waitFor();
    if (order === "recall first") {
      await recall.click();
      await recall.waitFor({ state: "hidden" });
      await openSubmission.click();
      await senior.getByText(/The agent recalled this submission before senior review/).waitFor();
      assert.equal(await senior.getByRole("button", { name: "Authorize repairs" }).count(), 0);
    } else {
      await openSubmission.click();
      await senior.getByRole("button", { name: "Activity log", exact: true }).click();
      await senior.getByText("Viewed by senior adjuster", { exact: true }).waitFor();
      if (order === "authorize first") {
        await senior.getByRole("button", { name: "Repair estimate", exact: true }).click();
        await senior.getByRole("button", { name: "Authorize repairs", exact: true }).click();
        await senior.getByLabel("Approved repair shop").selectOption({ index: 1 });
        await senior.getByLabel("Senior adjuster name").fill("QA adjuster");
        await senior.getByRole("button", { name: "Confirm authorization" }).click();
        await senior.getByRole("button", { name: "Download authorized report" }).waitFor();
      }
      await recall.click();
      await agent.getByRole("alert").filter({hasText: order === "authorize first" ? "already been authorized" : "recall window has closed"}).waitFor();
      assert.equal(await recall.count(), 0);
    }
    await agent.reload();
    await agent.locator('.dashboard-filters button').filter({hasText:"All claims"}).click();
    const state = order === "authorize first" ? "Repairs authorized" : order === "recall first" ? "Draft estimate ready" : "Awaiting approval";
    await agent.locator(".claims-table tbody tr").filter({hasText: fixture.vehicle}).getByText(state, {exact: true}).waitFor();
    console.log("PASS", order);
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    for (const order of ["recall first", "open first", "authorize first"]) await exercise(browser, order);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
