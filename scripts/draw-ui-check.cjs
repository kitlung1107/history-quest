const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
);
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const output = process.env.DRAW_REVIEW_DIR
  ? path.resolve(process.env.DRAW_REVIEW_DIR)
  : path.resolve(__dirname, "../tmp/browser-draw-a0df-review");
fs.mkdirSync(output, { recursive: true });
const results = {
  checks: [],
  screenshots: [],
  externalRequests: [],
  localPorts: [],
  errors: [],
};
const base =
  process.env.DRAW_PREVIEW_URL || "http://127.0.0.1:4340/__coin-draw-demo";
let browser;
async function context(width = 1440) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 1050 },
    serviceWorkers: "block",
  });
  await ctx.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    if (["localhost", "127.0.0.1"].includes(host)) {
      results.localPorts.push(new URL(route.request().url()).port);
      return route.continue();
    }
    results.externalRequests.push(host);
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.errors.push(e.message));
  return { ctx, page };
}
async function ready(page, url = base) {
  await page.goto(url);
  const frame = page.frameLocator("iframe.coin-draw-frame");
  await frame.locator("#scene[data-phase=idle]").waitFor({ timeout: 60000 });
  await page.getByText(/示範探索幣：\d+/).waitFor();
  return frame;
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(output, name), fullPage: true });
  results.screenshots.push(name);
}
(async () => {
  try {
    browser = await chromium.launch({ headless: true, channel: "msedge" });
    let { ctx, page } = await context();
    let frame = await ready(page);
    await screenshot(page, "desktop-ready.png");
    assert.equal(await page.locator(".card-choice").count(), 1);
    assert.equal(
      await page.getByText(/未擁有|其他獲得方式尚未開放/).count(),
      0
    );
    results.checks.push("ordinary library shows owned cards only");
    await frame.locator("#start").click();
    await frame
      .locator("#scene[data-phase=revealed]")
      .waitFor({ timeout: 30000 });
    const image = await frame
      .locator("#result-card-host .explorer-card-figure")
      .getAttribute("data-card-image");
    assert(image && !image.includes("card-art"));
    assert.equal(
      await frame.locator(".explorer-card-identity").innerText(),
      "3A(12) 陳小明（示範）"
    );
    assert.equal(
      await frame.locator(".explorer-card-nickname").innerText(),
      "歷史小探險"
    );
    assert.equal(await page.locator(".card-choice").count(), 2);
    await page
      .getByText("示範探索幣：1900；不使用正式帳戶或真餘額。")
      .waitFor();
    const chosen = await page
      .locator(".card-choice input:checked")
      .getAttribute("value");
    assert.equal(chosen, "starter-explorer-boy");
    await screenshot(page, "desktop-reveal.png");
    const phases = await frame
      .locator("#scene")
      .evaluate(() => [
        ...new Set(window.coinDrawPresentation.stats.poses.map((x) => x.phase)),
      ]);
    for (const phase of [
      "approaching",
      "reaching",
      "pressing",
      "pushing",
      "falling",
      "landing",
      "growing",
      "revealing",
    ])
      assert(phases.includes(phase), phase);
    results.checks.push(
      "full automatic animation; real ExplorerCard identity/nickname; 100 debit before reveal"
    );
    await frame.locator("#join").click();
    await frame.locator("#scene[data-phase=idle]").waitFor();
    assert.equal(await page.locator(".card-choice").count(), 2);
    assert.equal(
      await page.locator(".card-choice input:checked").getAttribute("value"),
      chosen
    );
    results.checks.push(
      "join only returns; no second grant or selected-card replacement"
    );
    // Discard a successfully committed browser transaction result before the UI
    // receives it, matching a lost post-commit response / tab termination.
    await page.evaluate(async () => {
      const client = await import("/src/lib/localDrawClient.ts");
      await client.localDraw();
      // Pending request is intentionally retained, with no animation/result UI.
    });
    await page.reload();
    frame = await ready(page);
    await page.getByRole("button", { name: "恢復／重試上次抽卡" }).click();
    await frame
      .locator("#scene[data-phase=revealed]")
      .waitFor({ timeout: 30000 });
    await page
      .getByText("示範探索幣：1800；不使用正式帳戶或真餘額。")
      .waitFor();
    assert.equal(await page.locator(".card-choice").count(), 3);
    results.checks.push(
      "lost committed response + reload + same-ID recovery grants once and debits once"
    );
    await ctx.close();
    ({ ctx, page } = await context(390));
    frame = await ready(page, base + "?role=studentGirl&class=S6");
    await frame.locator("#start").click();
    await frame
      .locator("#scene[data-phase=revealed]")
      .waitFor({ timeout: 30000 });
    assert.equal(
      await frame.locator(".explorer-card-identity").innerText(),
      "S6(12) 陳小明（示範）"
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    );
    await screenshot(page, "phone-girl-reveal.png");
    results.checks.push("phone S6 girl reveal; no horizontal overflow");
    await ctx.close();
    for (const scenario of ["poor", "empty"]) {
      ({ ctx, page } = await context());
      frame = await ready(page, base + "?scenario=" + scenario);
      await frame.locator("#start").click();
      await page.getByRole("alert").waitFor();
      assert.match(
        await page.getByRole("alert").innerText(),
        scenario === "poor" ? /不足/ : /集齊/
      );
      await frame.locator("#scene[data-phase=idle]").waitFor();
      assert.equal(
        await frame.locator("#result-card-host .explorer-card").count(),
        0
      );
      results.checks.push(scenario + " rejection does not start animation");
      await ctx.close();
    }
    for (const account of ["tangkl@ctshkpcc.edu.hk", "kitlung1107@gmail.com"]) {
      ({ ctx, page } = await context());
      frame = await ready(
        page,
        base + "?account=" + encodeURIComponent(account)
      );
      assert.equal(await page.locator(".card-choice").count(), 18);
      results.checks.push(account + " isolated full-card demo");
      await ctx.close();
    }
    ({ ctx, page } = await context());
    await page.goto(base + "?mode=unavailable");
    frame = page.frameLocator("iframe.coin-draw-frame");
    await frame.locator("#scene[data-phase=idle]").waitFor();
    assert.equal(await frame.locator("#start").isDisabled(), true);
    results.checks.push("production/unavailable mode remains disabled");
    await ctx.close();
    assert.deepEqual(results.errors, []);
    assert(
      !results.localPorts.includes("4341"),
      "superseded HTTP service must not be used"
    );
    assert(
      results.localPorts.includes("8185"),
      "browser must use Firestore emulator"
    );
    results.localPorts = [...new Set(results.localPorts)];
    assert(
      results.externalRequests.every((host) => host === "fonts.googleapis.com")
    );
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify(results, null, 2)
    );
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser?.close();
  }
})().catch((e) => {
  fs.writeFileSync(
    path.join(output, "failure.json"),
    JSON.stringify({ ...results, failure: e.stack }, null, 2)
  );
  console.error(e);
  process.exitCode = 1;
});
