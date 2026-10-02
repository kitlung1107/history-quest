const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/card-background-review');
const base = process.env.CARD_BACKGROUND_PREVIEW_URL || 'http://127.0.0.1:4186';
const defaultImage = '/uploads/home-voyages-exchange-v2.webp';
const otherImage = '/uploads/home-history-hero.webp';
const profileKey = 'hdc.role-preview.v1';
const results = { screenshots: [], checks: [], blockedExternalHosts: [], limitations: ['Local RolePreview persistence only; no real Google login, Firebase writes or production CMS publishing.'] };
const external = new Set();
const errors = [];
const children = [];
let browser;

async function context(width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1000 }, serviceWorkers: 'block' });
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
    external.add(url.hostname);
    return route.abort('blockedbyclient');
  });
  ctx.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return ctx;
}
async function hero(page, suffix) {
  const img = page.locator('.hero-panel > img');
  await img.waitFor();
  await page.waitForFunction(expected => {
    const image = document.querySelector('.hero-panel > img');
    return image?.getAttribute('src')?.endsWith(expected) && image.complete && image.naturalWidth > 0;
  }, suffix);
  assert.ok((await img.getAttribute('src')).endsWith(suffix));
  return img;
}
async function shot(page, name) {
  await page.waitForFunction(() => [...document.querySelectorAll('.mission-card')].every(element => Number(getComputedStyle(element).opacity) === 1));
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';
    scrollTo({ top: 0, behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.screenshot({ path: path.join(output, name), fullPage: false, animations: 'disabled' });
  results.screenshots.push(name);
  if (['desktop-boy-starter.png', 'desktop-boy-nile.png', 'mobile-390-nile.png', 'mobile-320-nile.png'].includes(name)) {
    const cleanName = name.replace('.png', '-home.png');
    await page.locator('.manga-home').screenshot({ path: path.join(output, cleanName), animations: 'disabled' });
    results.screenshots.push(cleanName);
  }
}
async function save(page) {
  await page.getByRole('button', { name: '儲存卡片', exact: true }).click();
  await page.locator('.hero-panel').waitFor();
}
async function chooseRole(page, role) {
  await page.locator('label.card-choice').filter({ hasText: role === 'studentBoy' ? '男學生' : '女學生' }).locator('input[name="role"]').check();
  assert.equal(await page.locator('input[name="cardId"]').count(), 2);
  await save(page);
}
async function changeCard(page, cardId) {
  await page.getByRole('button', { name: '開啟年級選單', exact: true }).click();
  await page.getByRole('button', { name: '更換卡片及暱稱', exact: true }).click();
  assert.equal(await page.locator('input[name="role"]').count(), 0, 'saved role stays locked');
  await page.locator(`input[name="cardId"][value="${cardId}"]`).check();
  await save(page);
}
async function titleMetrics(page) {
  return page.locator('.hero-title-wrap').evaluate(wrapper => {
    const hero = wrapper.closest('.hero-panel').getBoundingClientRect();
    const properties = ['color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'textShadow', 'position', 'transform'];
    const get = element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return { text: element.textContent, className: element.className,
        rect: { x: box.x - hero.x, y: box.y - hero.y, width: box.width, height: box.height },
        style: Object.fromEntries(properties.map(property => [property, style[property]])) };
    };
    return { wrapper: get(wrapper), chinese: get(wrapper.querySelector('h1')), english: get(wrapper.querySelector('p')) };
  });
}
async function server(scenario, port) {
  const child = spawn(process.execPath, ['scripts/preview-card-backgrounds.mjs', '--fixtures', `--scenario=${scenario}`, `--port=${port}`], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let log = '';
  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Preview ${scenario} failed: ${log}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/__role-preview`)).ok) return `http://127.0.0.1:${port}`; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Preview ${scenario} timed out: ${log}`);
}
const seededProfile = cardId => ({ className: '1A', studentNo: '12', name: '可豪', nickname: '歷史小探員', avatar: 'explorer', configured: true, role: 'studentBoy', ownedCardIds: ['starter-explorer-boy', 'nile-explorer-boy'], cardId });
async function seed(ctx, cardId = 'nile-explorer-boy') {
  await ctx.addInitScript(({ key, value }) => {
    if (location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname) && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: profileKey, value: seededProfile(cardId) });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await context();
  const page = await ctx.newPage();
  await page.goto(`${base}/__role-preview`);
  await page.getByRole('heading', { name: '我的卡片' }).waitFor();
  await chooseRole(page, 'studentBoy');
  await hero(page, defaultImage);
  results.defaultImage = await page.locator('.hero-panel > img').evaluate(img => ({ src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight }));
  await shot(page, 'desktop-boy-starter.png');
  await changeCard(page, 'nile-explorer-boy');
  await hero(page, otherImage);
  results.mappedImage = await page.locator('.hero-panel > img').evaluate(img => ({ src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight }));
  await shot(page, 'desktop-boy-nile.png');
  results.desktopMappedTitle = await titleMetrics(page);
  results.checks.push('Boy starter → Nile switches homepage image immediately through ProfileEditor.');
  await page.reload();
  await hero(page, otherImage);
  await page.getByRole('button', { name: '模擬重新登入', exact: true }).click();
  await hero(page, otherImage);
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).cardId, profileKey), 'nile-explorer-boy');
  results.checks.push('Reload and existing simulated login preserve the selected card and its background.');
  await page.getByRole('button', { name: '重設新帳戶', exact: true }).click();
  await chooseRole(page, 'studentGirl');
  await hero(page, defaultImage);
  await changeCard(page, 'nile-explorer-girl');
  await hero(page, otherImage);
  await shot(page, 'desktop-girl-nile.png');
  results.checks.push('Both starter cards share one background; both Nile cards share another without duplicate images.');
  await page.getByRole('button', { name: '測試舊帳戶', exact: true }).click();
  await page.getByRole('heading', { name: '我的卡片' }).waitFor();
  assert.equal(await page.locator('input[name="role"]').count(), 2);
  await chooseRole(page, 'studentGirl');
  await hero(page, defaultImage);
  await changeCard(page, 'nile-explorer-girl');
  await hero(page, otherImage);
  results.checks.push('Existing legacy-account role onboarding still works and can select an owned card/background.');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await hero(page, otherImage);
    assert.ok(await page.locator('.hero-panel').evaluate(element => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No ${width}px horizontal overflow`);
    await shot(page, `mobile-${width}-nile.png`);
    results[`mobile${width}MappedTitle`] = await titleMetrics(page);
    await changeCard(page, 'starter-explorer-girl');
    await hero(page, defaultImage);
    await changeCard(page, 'nile-explorer-girl');
    await hero(page, otherImage);
  }
  results.checks.push('390px and 320px mobile: sidebar card switching works; homepage fits viewport.');
  await ctx.close();

  for (const [index, scenario] of ['none', 'blank', 'stale', 'broken'].entries()) {
    const scenarioBase = await server(scenario, 4191 + index);
    const scenarioContext = await context();
    await seed(scenarioContext);
    const scenarioPage = await scenarioContext.newPage();
    await scenarioPage.goto(`${scenarioBase}/__role-preview`);
    await hero(scenarioPage, defaultImage);
    await shot(scenarioPage, `desktop-fallback-${scenario}.png`);
    if (scenario === 'none') {
      results.desktopDefaultTitle = await titleMetrics(scenarioPage);
      assert.deepEqual(results.desktopMappedTitle, results.desktopDefaultTitle, 'desktop title text, typography, colors and layout must match');
      for (const width of [390, 320]) {
        await scenarioPage.setViewportSize({ width, height: 844 });
        await hero(scenarioPage, defaultImage);
        await shot(scenarioPage, `mobile-${width}-default.png`);
        assert.deepEqual(results[`mobile${width}MappedTitle`], await titleMetrics(scenarioPage), `${width}px title text, typography, colors and layout must match`);
      }
    }
    await scenarioPage.reload();
    await hero(scenarioPage, defaultImage);
    await scenarioContext.close();
    children[children.length - 1].kill();
    results.checks.push(`${scenario}: default hero fallback renders and survives reload.`);
  }
  results.checks.push('Chinese/English title text, font, color and bounding rectangles exactly match the no-mapping baseline at desktop/390px/320px.');

  const recoveryContext = await context();
  await seed(recoveryContext);
  const recovery = await recoveryContext.newPage();
  const failOnce = route => route.abort('failed');
  await recovery.route('**/uploads/home-history-hero.webp', failOnce);
  await recovery.goto(`${base}/__role-preview`);
  await hero(recovery, defaultImage);
  await recovery.unroute('**/uploads/home-history-hero.webp', failOnce);
  await changeCard(recovery, 'starter-explorer-boy');
  await hero(recovery, defaultImage);
  await changeCard(recovery, 'nile-explorer-boy');
  await hero(recovery, otherImage);
  await shot(recovery, 'desktop-image-recovery.png');
  results.checks.push('Failed image falls back; selecting another card then returning retries and restores the valid image.');
  await recoveryContext.close();
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  results.blockedExternalHosts = [...external].sort();
  results.uncaughtBrowserErrors = errors;
  results.status = 'PASS';
  fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ status: results.status, checks: results.checks, screenshots: results.screenshots, blockedExternalHosts: results.blockedExternalHosts }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const child of children) if (child.exitCode === null) child.kill();
  if (browser) await browser.close();
});
