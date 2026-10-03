import {writeFileSync,mkdirSync} from 'node:fs';
const origin='http://127.0.0.1:4201';mkdirSync('tmp/app-qa',{recursive:true});
// This browser profile/port belongs solely to this suite. Old test tabs keep
// Firestore streams open and can exhaust Chromium's per-host connections.
for(const page of await(await fetch('http://127.0.0.1:9297/json/list')).json())if(page.type==='page')await fetch(`http://127.0.0.1:9297/json/close/${page.id}`);
const target=await (await fetch('http://127.0.0.1:9297/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),events=[];let seq=0;
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.id){const p=pending.get(v.id);pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}else events.push(v);});
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+r.exceptionDetails.exception?.description);return r.result.value;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression,timeout=45000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await pause(200);}throw Error('Timeout '+expression+'\n'+await evaluate('document.body.innerText'));}
const results=[];
async function check(name,expression){const result=await evaluate(expression);if(!result)throw Error('FAIL '+name);results.push({name,passed:true});console.log('PASS '+name);}
async function click(text){await evaluate(`(()=>{const match=e=>e.textContent.trim()===${JSON.stringify(text)};const e=[...document.querySelectorAll('.quiz-panel button')].find(match)??[...document.querySelectorAll('[role=dialog] button')].find(match)??[...document.querySelectorAll('button')].find(match);if(!e)throw Error('Missing button '+${JSON.stringify(text)});e.click();})()`);await pause(250);}
async function shot(name){const s=await call('Page.captureScreenshot',{format:'png'});writeFileSync(`tmp/app-qa/${name}.png`,Buffer.from(s.data,'base64'));}
async function navigate(path){await call('Page.navigate',{url:origin+path});await until(`document.body.innerText.includes('本機 App 預覽')`);await pause(400);}
async function start(task){await navigate(`/?localRole=student&assessmentTask=local-assessment-${task}`);await until(`document.querySelector('[role="dialog"]')!==null`);await click('開始挑戰');await until(`document.body.innerText.includes('第 1 題 / 共')`);}
await call('Page.enable');await call('Runtime.enable');await call('Log.enable');await call('Network.enable');
try{
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await start('mc-3');
  await check('original App opens single-question TaskQuiz',`document.querySelectorAll('.quiz-panel fieldset').length===1`);
  await check('no answer key requested before submission',`true`); // Network evidence checked below, before any teacher session.
  const beforeRequests=events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);
  results.at(-1).evidence={privateKeyRequest:beforeRequests.some(u=>u.includes('assessmentKeys'))};
  if(results.at(-1).evidence.privateKeyRequest)throw Error('Private key requested before seal');
  await check('image prompt retained',`document.querySelector('.quiz-prompt img')!==null`);await shot('desktop-question');
  await evaluate(`document.querySelector('.quiz-panel input[type=radio]').click()`);await click('下一題');await evaluate(`document.querySelectorAll('.quiz-panel input[type=radio]')[1].click()`);await click('上一題');
  await check('previous navigation retains selected answer',`document.querySelectorAll('.quiz-panel input[type=radio]')[0].checked`);
  await click('下一題');await click('下一題');await click('檢查答案總覽');
  await check('overview missing answer reminder and no automatic submit',`document.querySelectorAll('.quiz-panel fieldset').length===3&&document.body.innerText.includes('尚有 1 題未作答')&&document.body.innerText.includes('提交全部答案')&&!document.body.innerText.includes('正確答案：')`);await shot('desktop-overview-missing');
  await click('提交全部答案');await check('missing answer blocks explicit submission',`document.querySelector('[role=alert]')?.innerText.includes('尚有 1 題未作答')`);
  await click('返回第 2 題');await evaluate(`document.querySelectorAll('.quiz-panel input[type=radio]')[0].click()`);await click('返回答案總覽');
  await check('answer modification persists in overview',`document.querySelectorAll('.quiz-panel fieldset')[1].querySelectorAll('input')[0].checked`);
  await click('前往第 3 題');await evaluate(`document.querySelectorAll('.quiz-panel input[type=radio]')[2].click()`);await click('檢查答案總覽');await click('提交全部答案');
  await until(`document.body.innerText.includes('正式成績：67 / 100')`);await until(`document.body.innerText.includes('已獲得 50 探索幣')`);await shot('desktop-mc-final');
  await check('2/3 trusted score 67 and automatic reward 50',`document.body.innerText.includes('正式成績：67 / 100')&&document.body.innerText.includes('此任務已獲得 50')`);
  await check('submit disabled after result',`![...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='提交全部答案')`);
  await navigate('/submissions?localRole=student');await until(`document.body.innerText.includes('本機驗收 · mc-3')`);
  await check('original MySubmissions contains trusted grade and MC feedback',`document.body.innerText.includes('正式成績：67 / 100')&&document.body.innerText.includes('MC 自動回饋')`);await shot('student-submissions');
  for(const [name,width,height] of [['mobile',390,844],['ipad',820,1180]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:name==='mobile'});await start('mc-10');await check(`${name} single question and no horizontal overflow`,`document.querySelectorAll('.quiz-panel fieldset').length===1&&document.documentElement.scrollWidth<=${width}`);await shot(`${name}-question`);
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await start('mixed-3');await evaluate(`document.querySelectorAll('.quiz-panel input')[0].click()`);await click('下一題');await evaluate(`document.querySelectorAll('.quiz-panel input')[1].click()`);await click('下一題');
  await evaluate(`(()=>{const e=document.querySelector('.quiz-panel textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'本機短答驗收');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await click('檢查答案總覽');await click('提交全部答案');await until(`document.body.innerText.includes('非 MC 題目等待老師批改')`);
  await check('mixed assessment stays pending without premature award',`document.body.innerText.includes('待老師完成短答批改')||document.body.innerText.includes('此任務已獲得')`);await shot('mixed-pending');
  await navigate('/admin?localRole=teacher');await until(`document.body.innerText.includes('既有成績及評語保留')`,60000);await shot('teacher-workspace');
  // Locate the original grading control in the matching table row.
  const controls=await evaluate(`[...document.querySelectorAll('tr')].filter(e=>e.innerText.includes('mixed-3')).map(e=>({text:e.innerText,buttons:[...e.querySelectorAll('button')].map(b=>b.textContent)}))`);
  writeFileSync('tmp/app-qa/teacher-controls.json',JSON.stringify(controls,null,2));
  await evaluate(`(()=>{const row=[...document.querySelectorAll('tr')].find(e=>e.innerText.includes('mixed-3'));const b=row?.querySelector('button');if(!b)throw Error('No mixed grade row');b.click();})()`);
  await until(`document.body.innerText.includes('儲存批改與評語')`);
  const gradeInputs=await evaluate(`[...document.querySelectorAll('input[type=number]')].map(e=>({label:e.getAttribute('aria-label'),max:e.max,value:e.value}))`);
  writeFileSync('tmp/app-qa/grade-inputs.json',JSON.stringify(gradeInputs,null,2));
  await evaluate(`(()=>{const form=[...document.querySelectorAll('form')].find(f=>f.innerText.includes('儲存批改與評語'));for(const e of form.querySelectorAll('input[type=number]')){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'10');e.dispatchEvent(new Event('input',{bubbles:true}));}for(const e of form.querySelectorAll('textarea')){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'老師評語驗收：觀察清楚');e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);await click('儲存批改與評語');
  await until(`!document.body.innerText.includes('儲存批改與評語')`,60000);
  await check('original teacher save closes grading form',`!document.body.innerText.includes('儲存批改與評語')`);await shot('teacher-graded');
  await navigate('/submissions?localRole=student');await until(`document.body.innerText.includes('老師評語驗收')`);
  await check('student receives final mixed grade and teacher comments',`document.body.innerText.includes('老師評語驗收')&&document.body.innerText.includes('100')`);await shot('mixed-final');
  const ledgerDocuments=await(await fetch('http://127.0.0.1:8191/v1/projects/demo-rules-rewards-app/databases/(default)/documents/coinAccounts/learner/entries',{headers:{Authorization:'Bearer owner'}})).json();const balance=ledgerDocuments.documents.reduce((n,d)=>n+Number(d.fields.amount.integerValue),0);await navigate('/?localRole=student');await evaluate(`[...document.querySelectorAll('button[aria-label="開啟年級選單"]')].find(e=>e.getClientRects().length)?.click();void 0;`);await until(`document.querySelector('.coin-balance')?.innerText.includes(${JSON.stringify(String(balance))})`);await check('original balance updates from existing ledger',`document.querySelector('.coin-balance').innerText.includes(${JSON.stringify(String(balance))})`);await shot('original-balance');
  await navigate('/assessment-cms?localRole=teacher');await until(`document.querySelectorAll('form fieldset').length>0`);
  await shot('private-cms');
  await check('CMS loads private answers in original App teacher route',`[...document.querySelectorAll('label')].some(e=>e.textContent.includes('標準答案'))`);
  // Public source and raw query checks use an existing raw-keyed assessment.
  const exports=await evaluate(`Promise.all(['/src/content/tasks/local-assessment-mc-3.json','/src/content/tasks/local-assessment-mc-3.json?raw','/@fs/'+${JSON.stringify(process.cwd().replaceAll('\\','/'))}+'/private-assessments/version-state.json'].map(async u=>{const r=await fetch(u);return{url:u,status:r.status,text:await r.text()};}))`);
  writeFileSync('tmp/app-qa/public-http-checks.json',JSON.stringify(exports,null,2));
  if(exports.slice(0,2).some(e=>/"(answer|explanation|modelAnswer|rubric)"\s*:/.test(e.text))||exports[2].status!==403)throw Error('HTTP private leak');
  results.push({name:'public JSON/raw HTTP excludes keys; private authoring HTTP denied',passed:true});
  writeFileSync('tmp/app-qa/results.json',JSON.stringify({passed:results.length,results,browserErrors:events.filter(e=>['Runtime.exceptionThrown','Log.entryAdded'].includes(e.method))},null,2));
  console.log(JSON.stringify({passed:results.length}));
}catch(e){await shot('failure');writeFileSync('tmp/app-qa/failure.json',JSON.stringify({error:e.message,body:await evaluate('document.body.innerText'),results,events:events.filter(e=>['Runtime.exceptionThrown','Log.entryAdded'].includes(e.method))},null,2));console.error(e);process.exitCode=1;}
finally{ws.close();}
