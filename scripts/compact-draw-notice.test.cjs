// Real presentation client, synthetic host messages only. No accounts or writes.
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/compact-draw-notice.test.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../client/public');
const output = path.resolve(__dirname, '../tmp/compact-draw-notice');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<html><style>body{margin:0}iframe{width:100vw;height:100vh;border:0;display:block}</style><iframe src="/coin-draw/index.html?mode=integrated"></iframe><script>window.attempts=0;window.ends=0;window.notice='insufficient';addEventListener('message',e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;if(e.data.kind==='coin-draw-request'){attempts++;setTimeout(()=>e.source.postMessage({kind:'coin-draw-error',reminder:notice},location.origin),80);}if(e.data.kind==='coin-draw-reminder-ended')ends++;});</script></html>`); return;
  }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
let browser;
const reports = [];
async function setup(width, height, insets = {}, layout = 'compact', reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, serviceWorkers:'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  const frame = page.frames()[1];
  await frame.waitForFunction(() => window.coinDrawPresentation?.phase === 'idle');
  await setLayout(page, layout, insets);
  await frame.waitForFunction(() => document.querySelector('#start').disabled === false);
  await frame.evaluate(() => {
    window.times = [];
    new MutationObserver(() => { const phase = document.querySelector('#scene').dataset.phase; if (times.at(-1)?.phase !== phase) times.push({ phase, time:performance.now() }); }).observe(document.querySelector('#scene'), { attributes:true, attributeFilter:['data-phase'] });
  });
  return {context,page,frame,errors};
}
async function setLayout(page, layout, insets = {}) {
  await page.evaluate(({layout,insets}) => document.querySelector('iframe').contentWindow.postMessage({kind:'coin-draw-layout',compact:layout==='compact',portrait:layout==='portrait',landscapeFit:layout==='landscape-fit',...insets},location.origin), {layout,insets});
}
async function snapshot(frame) {
  return frame.evaluate(() => {
    const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    return { title:rect('portrait-title'), action:rect('start'), pixels:document.querySelector('#scene').toDataURL(), geometry:document.querySelector('#scene').dataset.geometry };
  });
}
async function trigger(page, frame, type) {
  await page.evaluate(type => window.notice=type, type);
  await frame.locator('#start').click();
  await frame.waitForFunction(() => window.coinDrawPresentation.phase === 'reminder');
}
let origin;
(async () => {try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox']});
  for (const [width,height,insets] of [[844,388,{}],[667,375,{}],[568,320,{}],[932,430,{safeLeft:44,safeRight:44,safeBottom:21}],[844,260,{safeLeft:44,safeRight:44,safeBottom:21}]]) {
    for (const type of ['insufficient','complete']) {
      const {context,page,frame,errors} = await setup(width,height,insets);
      const before = await snapshot(frame);
      await trigger(page,frame,type);
      const during = await snapshot(frame);
      assert.deepEqual(during.title,before.title,'title stays fixed');
      assert.equal(during.pixels,before.pixels,'machine, teacher and background stay pixel-identical');
      assert.equal(during.geometry,before.geometry,'scene geometry stays fixed');
      const notice = await frame.locator('#portrait-reminder').evaluate(el => {
        const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,opacity:getComputedStyle(el).opacity,lines:[...el.children].map(x=>x.textContent)};
      });
      assert.equal(notice.opacity,'1');
      assert(notice.scrollWidth<=notice.clientWidth,'notice text fits width');
      assert(notice.scrollHeight<=notice.clientHeight,'notice text fits height');
      assert(notice.x>= (insets.safeLeft||0) && notice.x+notice.width<=width-(insets.safeRight||0));
      assert(notice.y>= (insets.safeTop||0) && notice.y+notice.height+4<=height-(insets.safeBottom||0));
      assert(Math.abs(notice.x+notice.width/2-before.action.x-before.action.width/2)<1);
      assert(Math.abs(notice.y+notice.height/2-before.action.y-before.action.height/2)<1);
      if(type==='insufficient')assert.deepEqual(notice.lines,['探索幣仲差少少！','完成小測或遊戲，儲夠再嚟啦！']);
      await frame.evaluate(() => {for(let n=0;n<12;n++)document.querySelector('#start').click();});
      assert.equal(await page.evaluate(()=>attempts),1,'double taps cannot repeat request');
      await page.screenshot({path:path.join(output,`${width}x${height}-${type}.png`)});
      await frame.waitForFunction(()=>window.coinDrawPresentation.phase==='reminder-fading',{},{timeout:6000});
      await frame.waitForFunction(()=>window.coinDrawPresentation.phase==='idle');
      const times=await frame.evaluate(()=>times);
      const start=times.find(x=>x.phase==='reminder').time, fade=times.find(x=>x.phase==='reminder-fading').time, end=times.find(x=>x.phase==='idle').time;
      assert(fade-start>=3990&&fade-start<4400,'four full seconds before fade');
      assert(end-fade>=230&&end-fade<600,'240ms fade');
      const after=await snapshot(frame);
      assert.deepEqual(after,before,'return matches original scene and controls');
      assert.equal(await page.evaluate(()=>ends),1);
      assert.deepEqual(errors,[]);
      reports.push({width,height,type,visibleMs:fade-start,fadeMs:end-fade,notice});
      await trigger(page,frame,type); assert.equal(await page.evaluate(()=>attempts),2);
      await context.close();
    }
  }
  for(const layout of ['portrait','landscape','landscape-fit']){
    const {context,page,frame}=await setup(layout==='portrait'?390:1024,layout==='portrait'?844:768,{},layout);
    await trigger(page,frame,'insufficient');
    await frame.waitForFunction(()=>window.coinDrawPresentation.phase==='idle',{},{timeout:6000});
    const times=await frame.evaluate(()=>times);
    assert(!times.some(x=>x.phase==='reminder-fading'),'other layouts do not gain fade timing');
    const elapsed=times.find(x=>x.phase==='idle').time-times.find(x=>x.phase==='reminder').time;
    assert(elapsed>=3990&&elapsed<4400);
    reports.push({layout,visibleMs:elapsed});await context.close();
  }
  {
    const {context,page,frame}=await setup(844,388);
    await trigger(page,frame,'insufficient');
    await page.setViewportSize({width:390,height:844});await setLayout(page,'portrait');
    await frame.waitForFunction(()=>window.coinDrawPresentation.layout==='portrait');
    assert.equal(await frame.locator('#portrait-reminder').evaluate(el=>el.style.height),'');
    await page.setViewportSize({width:844,height:388});await setLayout(page,'compact');
    await frame.waitForFunction(()=>window.coinDrawPresentation.layout==='compact');
    assert.equal(await frame.locator('#portrait-reminder span').count(),2);
    await frame.waitForFunction(()=>window.coinDrawPresentation.phase==='idle',{},{timeout:6000});
    reports.push({rotation:'compact → portrait → compact during notice passed'});await context.close();
  }
  {
    const {context,page,frame}=await setup(844,388);
    await trigger(page,frame,'insufficient');
    await frame.waitForFunction(()=>window.coinDrawPresentation.phase==='reminder-fading',{},{timeout:6000});
    await page.setViewportSize({width:390,height:844});await setLayout(page,'portrait');
    await frame.waitForFunction(()=>window.coinDrawPresentation.phase==='idle');
    assert.equal(await frame.locator('#portrait-reminder').isVisible(),false);
    reports.push({rotation:'leaving compact during fade returns cleanly'});await context.close();
  }
  {
    const {context,page,frame}=await setup(844,388,{},'compact','reduce');
    await trigger(page,frame,'insufficient');await frame.waitForFunction(()=>window.coinDrawPresentation.phase==='idle',{},{timeout:6000});
    assert(!(await frame.evaluate(()=>times)).some(x=>x.phase==='reminder-fading'));
    reports.push({reducedMotion:'four-second hold, no fade'});await context.close();
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(reports,null,2));
  console.log(`Passed ${reports.length} presentation scenarios. Results: ${output}`);
} finally {await browser?.close();server.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
