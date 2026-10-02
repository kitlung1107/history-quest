const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'client/public');
const output = path.join(root, 'tmp/card-background-review');
const bundlePath = process.env.SVELTIA_CMS_BUNDLE || path.resolve(root, '../history-quest/tmp/sveltia-cms.js');
const base = 'http://127.0.0.1:4187';
const dependencies = {
  'https://unpkg.com/immutable@5.1.9/dist/immutable.es.js': 'immutable.es.js',
  'https://unpkg.com/@sveltia/cms/dist/chunks/react-dom.js': 'react-dom.js',
  'https://unpkg.com/@sveltia/cms@0.223.0/dist/chunks/react-dom.js': 'react-dom.js',
  'https://unpkg.com/@sveltia/cms@0.223.0/locales/zh-TW.json': 'zh-TW.json',
  'https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3:vf@5.3.0/latin-wght-normal.woff2': 'source-sans.woff2',
  'https://cdn.jsdelivr.net/fontsource/fonts/material-symbols-outlined:vf@5.3.8/latin-wght-normal.woff2': 'material-symbols.woff2',
};
const fixtureFiles = {};
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(target);
    else if (entry.name.endsWith('.json')) fixtureFiles[path.relative(root, target).replaceAll('\\', '/')] = fs.readFileSync(target, 'utf8');
  }
}
collect(path.join(root, 'client/src/content'));
const siteFixture = JSON.parse(fixtureFiles['client/src/content/settings/site.json']);
const cardFixture = JSON.parse(fixtureFiles['client/src/content/settings/cards.json']);
for (const image of new Set([siteFixture.hero, siteFixture.logo, ...cardFixture.cards.map(card => card.image)])) {
  if (!image.startsWith('/history-quest/')) continue;
  const file = `client/public/${image.slice('/history-quest/'.length)}`;
  fixtureFiles[file] = { base64: fs.readFileSync(path.join(root, file)).toString('base64') };
}
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, base).pathname);
  if (pathname === '/seed') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local CMS QA seed</title>'); return; }
  const publicPath = pathname.replace(/^\/history-quest\//, '/');
  const local = path.resolve(publicRoot, `.${publicPath.endsWith('/') ? publicPath + 'index.html' : publicPath}`);
  if (!local.startsWith(publicRoot + path.sep) || !fs.existsSync(local) || !fs.statSync(local).isFile()) { response.writeHead(404); response.end('Not found'); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.yml': 'text/yaml', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
  response.setHeader('Content-Type', (types[path.extname(local)] || 'application/octet-stream') + (['.html','.js','.yml','.json'].includes(path.extname(local)) ? '; charset=utf-8' : ''));
  response.end(fs.readFileSync(local));
});

(async () => {
  for (const [url, name] of Object.entries(dependencies)) {
    const file = path.join(output, name);
    if (fs.existsSync(file)) continue;
    const pinnedURL = name === 'react-dom.js' ? 'https://unpkg.com/@sveltia/cms@0.223.0/dist/chunks/react-dom.js' : url;
    const response = await fetch(pinnedURL);
    assert(response.ok, `Failed to download public CMS dependency ${pinnedURL}: ${response.status}`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  await new Promise(resolve => server.listen(4187, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const blocked = [];
  const errors = [];
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url === 'https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js') {
      return route.fulfill({ path: bundlePath, contentType: 'text/javascript' });
    }
    if (dependencies[url]) return route.fulfill({ path: path.join(output, dependencies[url]), contentType: url.endsWith('.json') ? 'application/json' : url.endsWith('.js') ? 'text/javascript' : 'font/woff2' });
    if (url === 'https://unpkg.com/@sveltia/cms/package.json') return route.fulfill({ json: { version: '0.223.0' } });
    if (new URL(url).origin === base) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(String(error)));
  const readSaved = async name => JSON.parse(await page.evaluate(async fileName => {
    let dir = await navigator.storage.getDirectory();
    for (const part of ['sveltia-cms-test', 'client', 'src', 'content', 'settings']) dir = await dir.getDirectoryHandle(part);
    return (await (await dir.getFileHandle(fileName)).getFile()).text();
  }, name));
  const save = async () => {
    await page.waitForTimeout(650); // Allow Sveltia's async field value/validation to settle.
    await page.getByRole('button', { name: '儲存', exact: true }).click();
    await page.getByRole('tree', { name: '集合清單' }).waitFor();
  };
  const unchangedCards = cards => assert.deepEqual(cards.map(({ backgroundId, ...rest }) => rest), cardFixture.cards);
  try {
    await page.goto(base + '/seed');
    await page.evaluate(async files => {
      const root = await navigator.storage.getDirectory();
      const repo = await root.getDirectoryHandle('sveltia-cms-test', { create: true });
      for (const [filePath, content] of Object.entries(files)) {
        const parts = filePath.split('/');
        let dir = repo;
        for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
        const file = await dir.getFileHandle(parts.at(-1), { create: true });
        const writable = await file.createWritable();
        await writable.write(typeof content === 'string' ? content : Uint8Array.from(atob(content.base64), c => c.charCodeAt(0)));
        await writable.close();
      }
    }, fixtureFiles);
    await page.goto(base + '/cms/?test=1');
    await page.getByRole('button', { name: '使用測試倉庫' }).click();
    await page.waitForTimeout(2000);
    await page.getByText('背景圖片與名稱', { exact: true }).click();
    await page.getByRole('button', { name: /新增.*可重用背景/ }).click();
    await page.getByRole('textbox').nth(0).fill('qa-shared-background');
    await page.getByRole('textbox').nth(1).fill('預覽共用背景');
    await page.getByRole('button', { name: '瀏覽', exact: true }).click();
    await page.getByRole('option', { name: path.basename(siteFixture.hero), exact: true }).click();
    await page.getByRole('button', { name: '插入', exact: true }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(output, 'cms-background-library.png'), fullPage: true });
    await save();
    const saved = await readSaved('backgrounds.json');
    assert.equal(saved.backgrounds[0].image, siteFixture.hero);
    await page.getByRole('treeitem', { name: '收藏卡庫', exact: true }).click();
    await page.getByText('收藏卡上載、排序與啟用', { exact: true }).click();
    await page.getByRole('radio', { name: '預覽共用背景', exact: true }).nth(0).check();
    await page.getByRole('radiogroup', { name: '配對首頁背景', exact: true }).nth(0).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(output, 'cms-card-background-first.png'), fullPage: true });
    await page.getByRole('radio', { name: '預覽共用背景', exact: true }).nth(1).check();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(output, 'cms-card-background-shared.png'), fullPage: true });
    await save();
    const shared = await readSaved('cards.json');
    assert.equal(shared.cards[0].backgroundId, 'qa-shared-background');
    assert.equal(shared.cards[1].backgroundId, 'qa-shared-background');
    unchangedCards(shared.cards);
    await page.getByText('收藏卡上載、排序與啟用', { exact: true }).click();
    const firstRelation = page.getByRole('radiogroup', { name: '配對首頁背景', exact: true }).nth(0);
    assert(await firstRelation.getByRole('radio', { name: '預覽共用背景', exact: true }).isChecked());
    await firstRelation.getByRole('radio', { name: '(無)', exact: true }).check();
    await firstRelation.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(output, 'cms-card-background-cleared.png'), fullPage: true });
    await save();
    const cleared = await readSaved('cards.json');
    assert([undefined, null, ''].includes(cleared.cards[0].backgroundId));
    assert.equal(cleared.cards[1].backgroundId, 'qa-shared-background');
    unchangedCards(cleared.cards);
    await page.getByRole('treeitem', { name: '首頁背景庫', exact: true }).click();
    await page.getByText('背景圖片與名稱', { exact: true }).click();
    await page.getByRole('textbox', { name: '背景名稱', exact: true }).fill('共用背景・已改名');
    await save();
    const renamed = await readSaved('backgrounds.json');
    assert.equal(renamed.backgrounds[0].name, '共用背景・已改名');
    assert.equal(renamed.backgrounds[0].id, 'qa-shared-background');
    assert.equal(renamed.backgrounds[0].image, siteFixture.hero);
    await page.getByRole('treeitem', { name: '收藏卡庫', exact: true }).click();
    await page.getByText('收藏卡上載、排序與啟用', { exact: true }).click();
    assert(await page.getByRole('radiogroup', { name: '配對首頁背景', exact: true }).nth(1).getByRole('radio', { name: '共用背景・已改名', exact: true }).isChecked());
    const mediaFiles = await page.evaluate(async () => {
      let dir = await navigator.storage.getDirectory();
      for (const part of ['sveltia-cms-test', 'client', 'public', 'uploads']) dir = await dir.getDirectoryHandle(part);
      const files = []; for await (const [name] of dir.entries()) files.push(name); return files.sort();
    });
    const seededMedia = Object.keys(fixtureFiles).filter(file => file.startsWith('client/public/uploads/')).map(file => path.basename(file)).sort();
    assert.deepEqual(mediaFiles, seededMedia);
    assert.deepEqual(errors, []);
    const report = { sveltiaVersion: '0.223.0', backend: 'test-repo (browser OPFS only)', libraryCreateAndRename: true, namedRelationLabels: true, twoCardsShareOneBackground: true, existingCardFieldsPreserved: true, clearSerializedValue: Object.hasOwn(cleared.cards[0], 'backgroundId') ? cleared.cards[0].backgroundId : '(omitted)', secondCardReferenceAfterClear: cleared.cards[1].backgroundId, mediaFileCountBefore: seededMedia.length, mediaFileCountAfter: mediaFiles.length, noImageReupload: true, errors, blocked: [...new Set(blocked)], savedBackground: renamed, sharedCards: shared, clearedCards: cleared };
    fs.writeFileSync(path.join(output, 'cms-results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'cms-failure.png'), fullPage: true });
    fs.writeFileSync(path.join(output, 'cms-failure-aria.txt'), await page.locator('body').ariaSnapshot());
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
