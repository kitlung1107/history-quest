const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/full-card-access');
const base = process.env.FULL_CARD_PREVIEW_URL || 'http://127.0.0.1:4197';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Preview must be local');
const cards = JSON.parse(fs.readFileSync(path.join(root, 'client/src/content/settings/cards.json'), 'utf8')).cards;
const backgrounds = JSON.parse(fs.readFileSync(path.join(root, 'client/src/content/settings/backgrounds.json'), 'utf8')).backgrounds;
const external = new Set(), errors = [], checks = [];
let browser;
async function openMenu(page) {
  await page.locator('button[aria-label="開啟年級選單"]:visible').click();
  await page.locator('.change-character:visible').waitFor();
}
async function edit(page) {
  await openMenu(page);
  await page.locator('.change-character:visible').click();
  await page.locator('input[name="cardId"]').first().waitFor();
}
async function choose(page, id) {
  await page.locator(`input[name="cardId"][value="${id}"]`).check();
  await page.getByRole('button', { name: '儲存卡片', exact: true }).click();
  const card = cards.find(c => c.id === id);
  const image = backgrounds.find(b => b.id === card.backgroundId)?.image;
  assert.ok(image, `Mapped background for ${id}`);
  await page.waitForFunction(expected => {
    const img = document.querySelector('.hero-panel > img');
    return img && decodeURIComponent(new URL(img.src).pathname).endsWith(expected.replace('/history-quest', '')) && img.complete && img.naturalWidth > 0;
  }, image);
}
async function shot(page, name) { await page.screenshot({ path: path.join(output, name), fullPage: true }); }
(async () => {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
    external.add(url.hostname);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/__role-preview?fullCards=1`);
  await page.getByLabel('示範年級').selectOption('2A');
  await page.locator('input[name="role"]').first().check();
  assert.equal(await page.locator('input[name="cardId"]').count(), cards.filter(c => c.enabled).length);
  await page.getByText('此帳號可使用所有已啟用卡片，包括男、女角色卡。').waitFor();
  await shot(page, 'desktop-all-cards.png');
  await choose(page, 'stone-age-explorer-girl');
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hdc.full-card-preview.v1')));
  assert.equal(stored.role, 'studentBoy');
  assert.deepEqual(stored.ownedCardIds, ['starter-explorer-boy']);
  await openMenu(page);
  assert.ok((await page.locator('.explorer-card:visible img').getAttribute('src')).includes('stone-age-girl'));
  await shot(page, 'desktop-cross-role-background.png');
  checks.push('All enabled cards selectable across roles; role and earned collection unchanged; matching sidebar card and homepage background.');
  await page.reload();
  await page.locator('.hero-panel > img').waitFor();
  await edit(page);
  assert.equal(await page.locator('input[name="role"]').count(), 0);
  assert.equal(await page.locator('input[value="stone-age-explorer-girl"]').isChecked(), true);
  checks.push('Full selection survives local reload; fixed role cannot be changed in editor.');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await choose(page, 'nile-explorer-girl');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
    await openMenu(page);
    await page.locator('.explorer-card:visible img').evaluate(img => img.decode());
    await shot(page, `mobile-${width}-cross-role.png`);
    await page.locator('.change-character:visible').click();
    assert.equal(await page.locator('input[name="cardId"]').count(), cards.filter(c => c.enabled).length);
    await shot(page, `mobile-${width}-all-cards.png`);
  }
  checks.push('390px and 320px phone layouts: full card picker and matching background work without horizontal overflow.');
  await page.goto(`${base}/__role-preview`);
  await page.getByLabel('示範年級').selectOption('2A');
  await page.locator('input[name="role"]').first().check();
  assert.deepEqual(await page.locator('input[name="cardId"]').evaluateAll(inputs => inputs.map(i => i.value)), ['starter-explorer-boy']);
  await page.getByLabel('示範年級').selectOption('1A');
  await page.locator('input[name="role"]').last().check();
  assert.deepEqual(await page.locator('input[name="cardId"]').evaluateAll(inputs => inputs.map(i => i.value)), ['starter-explorer-girl', 'nile-explorer-girl']);
  checks.push('Ordinary 2A still has only same-role starter; ordinary 1A still has same-role starter + Nile.');
  assert.deepEqual(errors, []);
  const result = { status: 'PASS', checks, blockedExternalHosts: [...external], errors,
    limitations: ['Synthetic local preview only; no real Google login, production data or cloud writes.'] };
  fs.writeFileSync(path.join(output, 'ui-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
