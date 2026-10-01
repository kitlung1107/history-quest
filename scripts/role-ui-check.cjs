const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4180/__role-preview');
 await page.getByRole('heading',{name:'我的卡片'}).waitFor();
 assert.equal(await page.locator('input[name="role"]').count(),2);
 await page.locator('input[name="role"]').first().check();
 assert.equal(await page.locator('input[name="cardId"]').count(),2);
 await page.getByRole('button',{name:'儲存卡片',exact:true}).click(); 
 await page.getByRole('button',{name:'開啟年級選單',exact:true}).click(); await page.waitForTimeout(500); await page.getByRole('button',{name:'更換卡片及暱稱',exact:true}).waitFor();
 await page.locator('.explorer-card img').first().evaluate(i=>i.decode());
 assert.equal(await page.locator('.explorer-card-identity .explorer-card-label-text').first().textContent(),'可豪');
 await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({path:'tmp/role-preview-boy.png'});
 await page.getByRole('button',{name:'模擬重新登入'}).click(); await page.getByRole('button',{name:'開啟年級選單',exact:true}).click(); await page.waitForTimeout(500);
 await page.getByRole('button',{name:'更換卡片及暱稱',exact:true}).click();
 assert.equal(await page.locator('input[name="role"]').count(),0);
 await page.locator('input[value="nile-explorer-boy"]').check();
 await page.getByLabel('暱稱').fill('尼羅河小探員');
 await page.getByRole('button',{name:'儲存卡片',exact:true}).click(); 
 await page.getByRole('button',{name:'開啟年級選單',exact:true}).click(); await page.waitForTimeout(500); await page.getByRole('button',{name:'更換卡片及暱稱',exact:true}).waitFor();
 await page.reload(); await page.getByRole('button',{name:'開啟年級選單',exact:true}).click(); await page.waitForTimeout(500);
 await page.locator('.explorer-card img').first().evaluate(i=>i.decode());
 assert.ok((await page.locator('.explorer-card img').first().getAttribute('src')).includes('nile-explorer-boy'));
 for(const grade of ['2A','3A','S4','S5','S6']){
 await page.getByLabel('示範年級').selectOption(grade);
 await page.locator('input[name="role"]').last().check();
 assert.equal(await page.locator('input[name="cardId"]').count(),1);
 assert.equal(await page.locator('input[name="cardId"]').getAttribute('value'),'starter-explorer-girl');
 await page.getByRole('button',{name:'儲存卡片',exact:true}).click(); 
 await page.getByRole('button',{name:'開啟年級選單',exact:true}).click(); await page.waitForTimeout(500); await page.getByRole('button',{name:'更換卡片及暱稱',exact:true}).waitFor();
 }
 await page.getByLabel('示範年級').selectOption('1A');
 await page.getByRole('button',{name:'測試舊帳戶',exact:true}).click();
 await page.locator('input[name="role"]').last().check();
 assert.equal(await page.locator('input[name="cardId"]').count(),2);
 await page.getByRole('button',{name:'儲存卡片',exact:true}).click(); 
 await page.getByRole('button',{name:'開啟年級選單',exact:true}).click(); await page.waitForTimeout(500); await page.getByRole('button',{name:'更換卡片及暱稱',exact:true}).waitFor();
 await page.locator('.explorer-card img').first().evaluate(i=>i.decode());
 await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({path:'tmp/role-preview-girl.png'});
 await page.getByRole('button',{name:'測試長姓名與暱稱'}).click();
 await page.locator('.explorer-card-nickname').first().click();
 await page.getByRole('dialog').waitFor();
 await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.screenshot({path:'tmp/role-preview-long.png'});
 for(const width of [390,320]){
 await page.setViewportSize({width,height:844});
 await page.getByRole('button',{name:'開啟年級選單'}).click();
 await page.locator('.explorer-card:visible img').evaluate(i=>i.decode()); await page.waitForTimeout(500);
 assert.ok(await page.locator('.explorer-card:visible').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
 await page.locator('.explorer-card-identity:visible').click();
 await page.getByRole('dialog',{name:'完整姓名'}).waitFor();
 await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.screenshot({path:`tmp/role-preview-mobile-${width}.png`});
 await page.getByRole('button',{name:'關閉選單',exact:true}).click(); await page.waitForTimeout(400);
 }
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS: both roles; six grades; legacy selection; persisted reload; locked role; own-card switching; nickname; name-only label; long-name popovers; mobile 390/320.');
})().catch(e=>{console.error(e);process.exit(1)});






