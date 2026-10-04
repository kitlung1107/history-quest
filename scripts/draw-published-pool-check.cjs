const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),output=process.env.DRAW_REVIEW_DIR?path.resolve(process.env.DRAW_REVIEW_DIR):path.join(root,'tmp/browser-draw-a0df-review');
fs.mkdirSync(output,{recursive:true});
const base=process.env.DRAW_PREVIEW_URL||'http://127.0.0.1:4342/__coin-draw-demo';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8185';
const admin=createRequire(path.join(root,'functions/package.json'));
const {initializeApp}=admin('firebase-admin/app'),{getFirestore}=admin('firebase-admin/firestore');
const db=getFirestore(initializeApp({projectId:'demo-browser-draw-preview'},'published-pool-qa'));
const source=path.join(root,'client/src/content/settings/cards.json'),original=fs.readFileSync(source),cms=JSON.parse(original);
const results={checks:[],screenshots:[],errors:[],blockedExternal:[],ports:[]};let browser,changed=false;
function publish(){return execFileSync(process.execPath,['scripts/sync-card-catalog.mjs','--apply','--project','demo-browser-draw-preview'],{cwd:root,env:process.env,encoding:'utf8'}).trim();}
async function pageFor(query,width=1440,stale=false){
  const context=await browser.newContext({viewport:{width,height:width<500?844:1050},serviceWorkers:'block'});
  if(stale)await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(['127.0.0.1','localhost'].includes(url.hostname)){results.ports.push(url.port);return route.continue();}results.blockedExternal.push(url.hostname);return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));
  await page.goto(base+query);
  const frame=page.frameLocator('iframe.coin-draw-frame');await frame.locator('#scene[data-phase=idle]').waitFor({timeout:60000});
  await page.getByText(/示範探索幣：\d+/).waitFor();return{context,page,frame};
}
async function shot(page,name){await page.screenshot({path:path.join(output,name),fullPage:true});results.screenshots.push(name);}
(async()=>{try{
  browser=await chromium.launch({headless:true,channel:'msedge'});
  let {context,page,frame}=await pageFor('?scenario=earn&slot=0',390);
  await page.getByText('示範探索幣：0；不使用正式帳戶或真餘額。').waitFor();
  const fields=page.locator('section.paper-texture fieldset');await fields.first().waitFor();assert.equal(await fields.count(),3);
  for(const [i,index] of [0,1,2].entries())await fields.nth(i).getByRole('radio').nth(index).check();
  await page.getByRole('button',{name:'提交答案並核算探索幣'}).click();
  await page.getByText('已核實派 120 幣；同一任務不會再派。').waitFor({timeout:30000});
  await page.getByText('示範探索幣：120；不使用正式帳戶或真餘額。').waitFor();
  await shot(page,'a0df-phone-earned-120.png');results.checks.push('actual main assessment grading/quote settles immutable +120 reward through combined Rules');
  await frame.locator('#start').click();await frame.locator('#scene[data-phase=revealed]').waitFor({timeout:30000});
  await page.getByText('示範探索幣：20；不使用正式帳戶或真餘額。').waitFor();
  assert.equal(await page.locator('.card-choice').count(),2);
  assert.equal(await frame.locator('.explorer-card-identity').innerText(),'3A(12) 陳小明（示範）');
  assert.equal(await frame.locator('.explorer-card-nickname').innerText(),'歷史小探險');
  assert.equal(await page.locator('.card-choice input:checked').getAttribute('value'),'starter-explorer-boy');
  assert(await frame.locator('#result-card-host .explorer-card-figure').getAttribute('data-card-image'));
  const sid='demo-boy-3A-earn-0',rootWallet=(await db.doc('coinAccounts/'+sid).get()).data();assert.equal(rootWallet.balance,20);assert.equal(rootWallet.drawRevision,1);
  assert.equal((await db.collection('coinAccounts/'+sid+'/entries').get()).size,2);
  assert.equal((await db.collection('cardDrawReceipts/'+sid+'/requests').get()).size,1);
  await shot(page,'a0df-phone-earned-card-reveal.png');results.checks.push('earned120 -> atomic100 debit/owned/receipt/wallet -> full automatic reveal of real card; balance20');
  await frame.locator('#join').click();await frame.locator('#scene[data-phase=idle]').waitFor();await page.reload();
  await page.getByText('示範探索幣：20；不使用正式帳戶或真餘額。').waitFor();assert(await page.getByRole('button',{name:'提交答案並核算探索幣'}).isDisabled());
  assert.equal((await db.collection('coinAccounts/'+sid+'/entries').get()).size,2);results.checks.push('return and reload preserve same earned task, no second award/grant and no auto selected-card replacement');await context.close();
  // Fixed synthetic preview fixture; do not inspect or alter any real inventory.
  const updateSid='demo-boy-3A-normal-1';const owned=cms.cards.filter(c=>c.role==='studentBoy').map(c=>c.id);
  await db.doc('profiles/'+updateSid).update({ownedCardIds:owned});
  ({context,page,frame}=await pageFor('?slot=1',1440,true));
  const newCard={...cms.cards.find(c=>c.id==='nile-explorer-boy'),id:'local-publish-only-boy',name:'本機 CMS 新卡驗證'};
  cms.cards.push(newCard);fs.writeFileSync(source,JSON.stringify(cms,null,2)+'\n');changed=true;
  results.catalogPublication=publish();
  await frame.locator('#start').click();await page.getByRole('alert').filter({hasText:'卡庫已更新'}).waitFor({timeout:30000});
  await frame.locator('#scene[data-phase=idle]').waitFor();
  assert.equal(await frame.locator('#result-card-host .explorer-card').count(),0);
  assert.equal((await db.doc('coinAccounts/'+updateSid).get()).exists,false);
  assert.equal((await db.collection('cardDrawReceipts/'+updateSid+'/requests').get()).size,0);
  await page.getByRole('button',{name:'重新整理卡庫'}).waitFor();await shot(page,'a0df-stale-page-no-charge.png');
  results.checks.push('CMS publishes newly configured card with existing guarded publisher; stale loaded tab rejects before wallet/receipt/debit/animation');await context.close();
  ({context,page,frame}=await pageFor('?slot=1'));
  await frame.locator('#start').click();await frame.locator('#scene[data-phase=revealed]').waitFor({timeout:30000});
  assert.equal((await db.collection('cardDrawReceipts/'+updateSid+'/requests').get()).docs[0].data().cardId,newCard.id);
  assert.equal((await db.doc('coinAccounts/'+updateSid).get()).data().balance,1900);
  assert.equal(await page.locator('.card-choice').count(),owned.length+1);
  assert((await frame.locator('#result-card-host .explorer-card-figure').getAttribute('data-card-image')).includes('nile-explorer-boy'));
  await shot(page,'a0df-published-new-card-reveal.png');results.checks.push('fresh page automatically includes new CMS card, draws sole remaining new ID, saves actual receipt and renders existing edition art without hardcoded pool');await context.close();
  assert.deepEqual(results.errors,[]);assert(results.blockedExternal.every(h=>h==='fonts.googleapis.com'));results.ports=[...new Set(results.ports)];
}finally{if(changed){fs.writeFileSync(source,original);results.catalogRestore=publish();}await browser?.close();await db.terminate();}
fs.writeFileSync(path.join(output,'published-pool-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{fs.writeFileSync(path.join(output,'published-pool-failure.json'),JSON.stringify({...results,failure:e.stack},null,2));console.error(e);process.exitCode=1;});
