const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.QUIZ_PREVIEW_URL || 'http://127.0.0.1:4197';
const output = path.resolve(__dirname, '../tmp/quiz-step-review');
fs.mkdirSync(output, { recursive: true });
const results = { checks: [], screenshots: [], errors: [], limitations: ['Production submission tested with a local mock of the existing ScoreSync boundary; no live student login, Firebase submission or reward writes.'] };
const check = name => results.checks.push(name);
async function open(page, fixture = 0) {
  await page.goto(`${base}/quiz-preview.html`);
  await page.locator('#preview-task').selectOption(String(fixture));
  await page.getByRole('button', { name: '開啟教材預覽', exact: true }).click();
  await page.getByRole('button', { name: '開始挑戰', exact: true }).click();
  if (fixture !== 3) await page.locator('.quiz-step-heading').waitFor();
}
async function summary(page, count) {
  for (let i = 1; i < count; i++) await page.getByRole('button', { name: '下一題', exact: true }).click();
  await page.getByRole('button', { name: '檢查答案總覽', exact: true }).click();
}
async function shot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
  results.screenshots.push(name);
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    context.on('page', page => page.on('pageerror', e => results.errors.push(e.message)));
    const page = await context.newPage();
    await open(page);
    assert.match(await page.getByRole('dialog').innerText(), /石器時代・課堂重溫\(1\)/);
    assert.equal(await page.locator('fieldset').count(), 1);
    assert.match(await page.locator('.quiz-step-heading').innerText(), /第 1 題 \/ 共 10 題/);
    assert.equal(await page.getByRole('button', { name: '提交全部答案', exact: true }).count(), 0);
    assert.equal(await page.locator('.quiz-answer-correct').count(), 0);
    await page.locator('input[type=radio]').nth(1).check();
    await page.getByRole('button', { name: '下一題', exact: true }).click();
    await page.locator('input[type=radio]').nth(2).check();
    await page.getByRole('button', { name: '上一題', exact: true }).click();
    assert.ok(await page.locator('input[type=radio]').nth(1).isChecked());
    await page.locator('input[type=radio]').nth(0).check();
    await shot(page, 'desktop-stone-question.png');
    check('Existing unchanged Stone Age quiz: one question at a time, previous/next retains and edits choices, no submit button before overview.');
    await summary(page, 10);
    assert.equal(await page.locator('fieldset').count(), 10);
    assert.match(await page.locator('.quiz-missing').innerText(), /尚有 8 題/);
    assert.equal(await page.locator('.result-strip').count(), 0);
    assert.equal(await page.locator('.quiz-answer-correct').count(), 0);
    await page.getByRole('button', { name: '提交全部答案', exact: true }).click();
    assert.match(await page.locator('.quiz-panel [role=alert]').innerText(), /第 3、4、5、6、7、8、9、10 題/);
    await shot(page, 'desktop-stone-overview-missing.png');
    check('Overview shows every question and exact missing numbers; incomplete submit reveals no marks or explanations.');
    await page.getByRole('button', { name: '前往第 3 題', exact: true }).click();
    assert.match(await page.locator('.quiz-step-heading').innerText(), /第 3 題/);
    await page.locator('input[type=radio]').nth(0).check();
    await page.getByRole('button', { name: '返回答案總覽', exact: true }).click();
    assert.ok(await page.locator('fieldset').nth(0).locator('input').nth(0).isChecked());
    for (const field of await page.locator('fieldset').all()) await field.locator('input[type=radio]').nth(0).check();
    await page.locator('fieldset').nth(0).locator('input').nth(1).check();
    await page.getByRole('button', { name: '返回第 1 題', exact: true }).click();
    assert.ok(await page.locator('input').nth(1).isChecked());
    await page.getByRole('button', { name: '返回答案總覽', exact: true }).click();
    const original = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/src/content/tasks/task_c1cc8f27-d16d-4cd9-8efd-9cccfc7dfdce.json'), 'utf8'));
    for (const q of original.questions) assert.equal(await page.getByText(q.explanation, { exact: false }).count(), 0);
    assert.equal(await page.locator('.quiz-answer-correct').count(), 0);
    await page.getByRole('button', { name: '提交全部答案', exact: true }).click();
    await page.locator('.result-strip').waitFor();
    assert.match(await page.locator('.result-strip').innerText(), /暫計成績：30 \/ 100/);
    assert.equal(await page.getByRole('button', { name: '提交全部答案', exact: true }).count(), 0);
    assert.ok(await page.locator('fieldset').nth(0).locator('input').nth(0).isDisabled());
    check('Overview edits survive round trip; explanations appear only after explicit submission; original marking returns 30/100 and locks completed answers.');
    for (let index = 0; index < original.questions.length; index++) {
      const q = original.questions[index];
      const selected = index === 0 ? 1 : 0;
      const field = page.locator('fieldset').nth(index);
      const correct = selected === q.answer;
      assert.equal(await field.locator('.quiz-answer-feedback').getAttribute('data-state'), correct ? 'correct' : 'wrong');
      assert.equal(await field.locator('.quiz-answer-symbol').innerText(), correct ? '✓' : '✗');
      assert.equal(await field.locator('.quiz-answer-symbol').getAttribute('aria-label'), correct ? '答對' : '答錯');
      assert.equal(await field.locator('.quiz-answer-your').count(), 0);
      if (correct) assert.equal(await field.locator('.quiz-answer-correct').count(), 0);
      else assert.equal(await field.locator('.quiz-answer-correct').innerText(), `正確答案：${String.fromCharCode(65 + q.answer)}．${q.options[q.answer]}`);
      assert.equal(await field.locator('.quiz-answer-explanation').innerText(), `解說：${q.explanation}`);
    }
    assert.match(await page.locator('fieldset').nth(1).innerText(), /本題 0 \/ 10 分/);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport);
      await page.locator('fieldset').nth(1).evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      assert.equal(await page.getByRole('dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
      await shot(page, `${viewport.width === 1440 ? 'desktop' : viewport.width === 390 ? 'phone' : 'ipad'}-stone-wrong-simple-result.png`);
      await page.locator('fieldset').nth(2).evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await shot(page, `${viewport.width === 1440 ? 'desktop' : viewport.width === 390 ? 'phone' : 'ipad'}-stone-correct-simple-result.png`);
    }
    check('Simplified submitted MC feedback: green accessible ✓ before the real score for correct answers, red accessible ✗ before zero score plus correct answer for wrong answers; explanations preserved and no separate selected-answer block. Correct/wrong screenshots on desktop, phone and iPad.');
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await open(page, 1);
      const img = page.locator('.quiz-prompt img');
      await img.waitFor();
      await page.waitForFunction(() => { const img = document.querySelector('.quiz-prompt img'); return img?.complete && img.naturalWidth > 0; });
      assert.equal(await page.locator('fieldset').count(), 1);
      await page.locator('input').nth(0).check();
      await page.getByRole('button', { name: '下一題', exact: true }).click();
      await page.locator('textarea').fill('  ');
      await page.getByRole('button', { name: '下一題', exact: true }).click();
      await page.locator('input').nth(1).check();
      await page.getByRole('button', { name: '檢查答案總覽', exact: true }).click();
      assert.match(await page.locator('.quiz-missing').innerText(), /前往第 2 題/);
      await page.locator('textarea').fill('圖片呈現歷史場景。');
      await page.getByRole('button', { name: '返回第 2 題', exact: true }).click();
      assert.equal(await page.locator('textarea').inputValue(), '圖片呈現歷史場景。');
      await page.getByRole('button', { name: '返回答案總覽', exact: true }).click();
      assert.equal(await page.locator('.quiz-missing').count(), 0);
      assert.equal(await page.locator('.quiz-answer-correct').count(), 0);
      const overflow = await page.getByRole('dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow, false);
      await page.getByRole('button', { name: '返回第 1 題', exact: true }).click();
      await shot(page, `${viewport.width === 768 ? 'ipad' : viewport.width > 1000 ? 'desktop' : 'phone-' + viewport.width}-image-question.png`);
      const next = await page.getByRole('button', { name: '下一題', exact: true }).boundingBox();
      const prev = await page.getByRole('button', { name: '上一題', exact: true }).boundingBox();
      assert.ok(next.x > prev.x, 'next sits to the right');
      await page.getByRole('button', { name: '返回答案總覽', exact: true }).click();
      await page.getByRole('button', { name: '提交全部答案', exact: true }).click();
      await page.locator('.result-strip').waitFor();
      const shortResult = page.locator('fieldset').nth(1);
      assert.match(await shortResult.innerText(), /待老師批改/);
      assert.equal(await shortResult.locator('.quiz-answer-correct').count(), 0);
      assert.equal(await shortResult.locator('.quiz-answer-feedback').getAttribute('data-state'), 'neutral');
      assert.equal(await shortResult.locator('.quiz-answer-symbol').count(), 0);
      check(`${viewport.width}px: 3-question mixed MC/short/image prompt; whitespace missing detection, editing persistence, no horizontal overflow, next on right.`);
    }
    await open(page, 2);
    assert.match(await page.locator('.quiz-step-heading').innerText(), /共 1 題/);
    await page.locator('input').nth(0).check();
    await summary(page, 1);
    assert.equal(await page.locator('.result-strip').count(), 0);
    await page.getByRole('button', { name: '提交全部答案', exact: true }).click();
    assert.match(await page.locator('.result-strip').innerText(), /100 \/ 100/);
    check('Legacy task.question fallback: 1-question MC still requires overview and explicit submission.');
    assert.equal(await page.locator('.quiz-answer-correct').count(), 0);
    assert.equal(await page.locator('.quiz-answer-symbol').innerText(), '✓');
    await open(page, 3);
    assert.equal(await page.getByRole('button', { name: '提交全部答案', exact: true }).count(), 0);
    check('Zero questions: TaskModal omits the quiz and offers no submission.');
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport);
      await open(page);
      await page.getByRole('button', { name: '下一題', exact: true }).click();
      await page.getByRole('button', { name: '上一題', exact: true }).click();
      assert.equal(await page.locator('fieldset').count(), 1);
      assert.equal(await page.getByRole('dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
      await shot(page, `${viewport.width === 390 ? 'phone' : 'ipad'}-stone-question.png`);
      if (viewport.width === 390) {
        await summary(page, 10);
        await shot(page, 'phone-stone-overview-missing.png');
      }
      check(`${viewport.width}px: unchanged Stone Age 10-question quiz works in the real TaskModal without horizontal overflow.`);
    }
    // A local-only image option checks that answer feedback preserves actual media.
    await context.route('**/src/quiz-preview.tsx*', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace('"示範選項甲"', JSON.stringify('示範選項甲\n\n![選項圖片](/uploads/home-history-hero.webp)'));
      assert.ok(body.includes('![選項圖片]'), 'image-option fixture injection must match');
      await route.fulfill({ response, body });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 1);
    await page.locator('input').nth(1).check();
    await summary(page, 3);
    await page.locator('textarea').fill('實際圖片答案驗證。');
    await page.locator('fieldset').nth(2).locator('input').nth(1).check();
    assert.equal(await page.locator('.quiz-answer-correct').count(), 0);
    await page.getByRole('button', { name: '提交全部答案', exact: true }).click();
    await page.locator('.result-strip').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.quiz-answer-feedback img')].length === 1 && [...document.querySelectorAll('.quiz-answer-feedback img')].every(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.locator('.quiz-answer-your').count(), 0);
    assert.equal(await page.locator('.quiz-answer-correct img').count(), 1);
    assert.equal(await page.getByRole('dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    check('Wrong image-option answers show ✗, actual points and the real correct image after submission; no selected-answer block or mobile horizontal overflow.');
    await context.unroute('**/src/quiz-preview.tsx*');
    // Exercise the production branch through a local mocked ScoreSync boundary.
    await context.route('**/src/contexts/ScoreSyncContext.tsx*', async route => {
      await route.fulfill({ contentType: 'application/javascript', body: `import { assessmentVersion } from '/src/lib/assessment.ts'; export function ScoreSyncProvider({children}) { return children; } export function useScoreSync() { return {progress:{},syncError:'',syncing:false,retry:async()=>{},completeTask:async(task,answers)=>{ window.submitCalls=(window.submitCalls||0)+1; await new Promise(r=>setTimeout(r,350)); if(window.failSubmit)throw new Error('本機模擬儲存失敗'); return {id:'mock-attempt',taskId:task.id,version:window.staleVersion ? 'stale-version' : assessmentVersion(task.questions || [{...task.question,id:'q1',type:'choice',points:100}]),answers}; }}; }` });
    });
    await context.route('**/src/components/TaskQuiz.tsx*', async route => {
      const response = await route.fetch();
      // The preview wrapper stays safe; exercise only the existing submit path, without RewardStatus.
      await route.fulfill({ response, body: (await response.text()).replace('if (preview) setAttemptId', 'if (false) setAttemptId') });
    });
    await open(page, 2);
    await page.locator('input').nth(0).check();
    await summary(page, 1);
    await page.evaluate(() => window.failSubmit = true);
    await page.getByRole('button', { name: '提交全部答案', exact: true }).click();
    await page.locator('.quiz-panel [role=alert]').waitFor();
    assert.match(await page.locator('.quiz-panel [role=alert]').innerText(), /本機模擬儲存失敗/);
    assert.equal(await page.evaluate(() => window.submitCalls), 1);
    assert.equal(await page.locator('.quiz-answer-correct').count(), 0);
    await page.evaluate(() => { window.failSubmit = false; window.staleVersion = true; });
    await page.getByRole('button', { name: '提交全部答案', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.quiz-panel [role=alert]')?.textContent.includes('題目版本已更新'));
    assert.equal(await page.locator('.quiz-answer-correct').count(), 0);
    assert.equal(await page.locator('.result-strip').count(), 0);
    assert.ok(await page.locator('input').nth(0).isChecked());
    check('Correct-answer feedback absent before submission, in overview, after failed submission and after version mismatch; short answers do not invent a standard answer.');
    await page.evaluate(() => window.staleVersion = false);
    await page.getByRole('button', { name: '提交全部答案', exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.locator('.result-strip').waitFor();
    assert.equal(await page.evaluate(() => window.submitCalls), 3);
    check('Production submit path via mock: failure retains editable answers; retry succeeds; two synchronous clicks invoke completeTask only once.');
    assert.deepEqual(results.errors, []);
    check('No browser page errors.');
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
