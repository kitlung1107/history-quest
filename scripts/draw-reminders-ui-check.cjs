const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.DRAW_PREVIEW_URL||'http://127.0.0.1:4367/__draw-reminders-preview';
const output=path.resolve(__dirname,'../tmp/draw-reminders-review');fs.mkdirSync(output,{recursive:true});
const result={checks:[],timings:[],screenshots:[],errors:[],externalRequests:[],otherLocalRequests:[]};let browser;
const inspect=page=>page.evaluate(()=>window.drawReminderPreview?.inspect());
async function open(scenario,width=1440){
const context=await browser.newContext({viewport:{width,height:width<500?844:1050},serviceWorkers:'block'});
await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===new URL(base).origin)return route.continue();if(['localhost','127.0.0.1'].includes(url.hostname))result.otherLocalRequests.push(url.href);else result.externalRequests.push(url.hostname);return route.abort();});
const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));await page.goto(base+'?scenario='+scenario);
const frame=page.frameLocator('iframe.coin-draw-frame');await frame.locator('#scene[data-phase=idle]').waitFor({timeout:60000});await page.waitForFunction(()=>window.drawReminderPreview);
await page.evaluate(()=>document.fonts.ready);
const realFrame=await (await page.$('iframe.coin-draw-frame')).contentFrame();
await realFrame.evaluate(()=>{window.reminderTimes=[];new MutationObserver(()=>{const phase=document.querySelector('#scene').dataset.phase;if(window.reminderTimes.at(-1)?.phase!==phase)window.reminderTimes.push({phase,time:performance.now()});}).observe(document.querySelector('#scene'),{attributes:true,attributeFilter:['data-phase']});});
return{context,page,frame,realFrame};
}
async function shot(page,name){await page.screenshot({path:path.join(output,name),fullPage:true});result.screenshots.push(name);}
async function show(frame,type){await frame.locator('#start').click();await frame.locator('#scene[data-phase=reminder]').waitFor();assert.match(await frame.locator('#draw-reminder').getAttribute('src'),type==='complete'?/reminder-complete/:/reminder-insufficient/);}
async function waitReturned(frame,realFrame,label){
await frame.locator('#scene[data-phase=idle]').waitFor({timeout:7000});
const times=await realFrame.evaluate(()=>window.reminderTimes);const reminder=times.find(x=>x.phase==='reminder');const idle=times.find(x=>x.phase==='idle'&&x.time>reminder.time);const elapsed=idle.time-reminder.time;
assert(elapsed>=3950&&elapsed<4800,label+': '+elapsed);result.timings.push({label,milliseconds:Math.round(elapsed)});
assert.equal(await frame.locator('#draw-reminder').isVisible(),false);assert.equal(await frame.locator('#start').isVisible(),true);assert.equal(await frame.locator('#join').isVisible(),false);
}
(async()=>{try{
browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const scenario of ['poor','empty']){
const {context,page,frame,realFrame}=await open(scenario);const before=await inspect(page);const sidebar=page.locator('.desktop-sidebar');const sidebarBefore=await sidebar.screenshot();
await show(frame,scenario==='empty'?'complete':'insufficient');
assert(sidebarBefore.equals(await sidebar.screenshot()),'sidebar must not change');
await shot(page,'desktop-'+scenario+'.png');
assert.equal(await frame.locator('button:visible').count(),0,'no new return button or live art button');
await realFrame.evaluate(()=>{for(let i=0;i<12;i++)parent.postMessage({kind:'coin-draw-request'},location.origin);});
const stage=await frame.locator('#stage').boundingBox();await frame.locator('#stage').click({position:{x:stage.width*.48,y:stage.height*.88},clickCount:6,delay:20});
await page.waitForTimeout(200);assert.equal((await inspect(page)).attempts,1,'rapid clicks and duplicate request messages are ignored');
await waitReturned(frame,realFrame,'desktop '+scenario);
const after=await inspect(page);assert.equal(after.balance,before.balance);assert.deepEqual(after.ownedCardIds,before.ownedCardIds);assert.equal(after.purchases,0);
const phases=await realFrame.evaluate(()=>window.coinDrawPresentation.stats.poses.map(x=>x.phase));assert(!phases.some(x=>['approaching','pressing','pushing','revealing'].includes(x)));
await show(frame,scenario==='empty'?'complete':'insufficient');assert.equal((await inspect(page)).attempts,2,'next click works after auto return');
result.checks.push('desktop '+scenario+': 4 seconds; automatic return; zero balance/collection change; sidebar byte-identical; rapid clicks blocked; repeat works; no purchase animation');await context.close();
}
for(const scenario of ['poor','empty']){
const {context,page,frame,realFrame}=await open(scenario,390);const before=await inspect(page);await show(frame,scenario==='empty'?'complete':'insufficient');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
const sizes=await frame.locator('#draw-reminder').evaluate(img=>({natural:[img.naturalWidth,img.naturalHeight],rect:[img.getBoundingClientRect().width,img.getBoundingClientRect().height]}));assert.deepEqual(sizes.natural,[1205,960]);assert(Math.abs(sizes.rect[0]/sizes.rect[1]-1205/960)<.01);
await shot(page,'phone-'+scenario+'.png');await waitReturned(frame,realFrame,'phone '+scenario);assert.equal((await inspect(page)).balance,before.balance);assert.equal((await inspect(page)).purchases,0);
result.checks.push('phone '+scenario+': complete image, original aspect ratio, no horizontal overflow, four-second return and zero purchase');await context.close();
}
{
const {context,page,frame,realFrame}=await open('both');await show(frame,'complete');assert.equal((await inspect(page)).balance,0);await waitReturned(frame,realFrame,'both collected and poor');assert.equal((await inspect(page)).purchases,0);result.checks.push('both conditions: collection reminder takes priority');await context.close();
}
for(const scenario of ['loading','permission']){
const {context,page,frame}=await open(scenario);await frame.locator('#start').click();
if(scenario==='loading'){await frame.locator('#scene[data-phase=purchasing]').waitFor();await page.waitForTimeout(600);assert.equal(await frame.locator('#draw-reminder').isVisible(),false);}
await page.getByRole('alert').waitFor();await frame.locator('#scene[data-phase=idle]').waitFor();assert.equal(await frame.locator('#draw-reminder').isVisible(),false);assert.equal((await inspect(page)).purchases,0);result.checks.push(scenario+': error cannot become collected reminder or purchase');await context.close();
}
{
const {context,page,frame,realFrame}=await open('backend-poor');const before=await inspect(page);await show(frame,'insufficient');await waitReturned(frame,realFrame,'backend insufficient rejection');const after=await inspect(page);assert.equal(after.balance,before.balance);assert.deepEqual(after.ownedCardIds,before.ownedCardIds);assert.equal(after.purchases,0);result.checks.push('typed backend insufficient rejection shows reminder and no purchase');await context.close();
}
{
const {context,page,frame}=await open('poor');await show(frame,'insufficient');await page.locator('.desktop-sidebar .all-button').click();assert.equal(await page.locator('iframe.coin-draw-frame').count(),0);assert.equal(await inspect(page),undefined);
await page.locator('.desktop-sidebar .coin-draw-entry').click();await frame.locator('#scene[data-phase=idle]').waitFor();await show(frame,'insufficient');await page.waitForTimeout(3750);await frame.locator('#scene[data-phase=reminder]').waitFor();await frame.locator('#scene[data-phase=idle]').waitFor({timeout:2000});assert.equal((await inspect(page)).purchases,0);result.checks.push('leave during reminder and re-enter: old timer cannot reset new reminder; next return works');await context.close();
}
{
const {context,page,frame}=await open('loading');await frame.locator('#start').click();await frame.locator('#scene[data-phase=purchasing]').waitFor();await page.locator('.desktop-sidebar .all-button').click();
await page.evaluate(()=>history.replaceState(null,'','?scenario=poor'));await page.locator('.desktop-sidebar .coin-draw-entry').click();await frame.locator('#scene[data-phase=idle]').waitFor();await show(frame,'insufficient');await page.waitForTimeout(2200);assert.equal(await page.getByRole('alert').count(),0);assert.equal((await inspect(page)).purchases,0);assert.equal((await inspect(page)).attempts,1);result.checks.push('leave during pending read: abort prevents stale results/purchase affecting the new panel');await context.close();
}
{
const {context,page,frame,realFrame}=await open('poor');await show(frame,'insufficient');
await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
await realFrame.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
await frame.locator('#scene[data-phase=idle]').waitFor();
await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
await show(frame,'insufficient');assert.equal((await inspect(page)).purchases,0);result.checks.push('browser pagehide/pageshow restoration: timer cleared, original scene restored, fresh controller accepts next click');await context.close();
}
{
const {context,page,frame}=await open('poor');await context.route('**/reminder-insufficient.png',route=>route.abort());
await frame.locator('#start').click();await page.getByRole('alert').filter({hasText:'提醒圖片未能載入'}).waitFor();await frame.locator('#scene[data-phase=idle]').waitFor();assert.equal((await inspect(page)).purchases,0);
await context.unroute('**/reminder-insufficient.png');await show(frame,'insufficient');result.checks.push('reminder asset failure: zero purchase, return to idle, next attempt works');await context.close();
}
{
const {context,page,frame,realFrame}=await open('normal');await frame.locator('#start').click();await frame.locator('#scene[data-phase=revealed]').waitFor({timeout:30000});assert.equal((await inspect(page)).purchases,1);assert.equal((await inspect(page)).balance,1900);assert.equal(await frame.locator('#draw-reminder').isVisible(),false);assert.equal(await frame.locator('#result-card-host .explorer-card').count(),1);const phases=await realFrame.evaluate(()=>window.coinDrawPresentation.stats.poses.map(x=>x.phase));for(const p of ['approaching','reaching','pressing','pushing','falling','landing','growing','revealing'])assert(phases.includes(p),p);await frame.locator('#join').click();await frame.locator('#scene[data-phase=idle]').waitFor();assert.equal((await inspect(page)).purchases,1);result.checks.push('normal synthetic receipt: existing full animation/result/return path remains; one synthetic purchase only');await context.close();
}
assert.deepEqual(result.errors,[]);assert.deepEqual(result.otherLocalRequests,[]);assert(result.externalRequests.every(x=>x==='fonts.googleapis.com'||x==='fonts.gstatic.com'),'no account or Firebase network requests');
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();}
})().catch(e=>{fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({...result,failure:e.stack},null,2));console.error(e);process.exitCode=1;});
