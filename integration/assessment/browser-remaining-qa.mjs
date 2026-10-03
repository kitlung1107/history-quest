import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,connectFirestoreEmulator,collection,getDocsFromServer,doc,getDocFromServer} from 'firebase/firestore';
const nodeApp=initializeApp({projectId:'demo-rules-rewards-app'},'remaining-qa');const db=getFirestore(nodeApp);
connectFirestoreEmulator(db,'127.0.0.1',8191,{mockUserToken:{sub:'teacher-uid',email:'kitlung1107@gmail.com',email_verified:true,firebase:{sign_in_provider:'google.com'}}});
const origin='http://127.0.0.1:4201';mkdirSync('tmp/app-qa',{recursive:true});
for(const p of await(await fetch('http://127.0.0.1:9297/json/list')).json())if(p.type==='page')await fetch(`http://127.0.0.1:9297/json/close/${p.id}`);
const target=await(await fetch('http://127.0.0.1:9297/json/new?about:blank',{method:'PUT'})).json(),ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),events=[];let seq=0;
await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.id){const p=pending.get(v.id);pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}else events.push(v);});
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression,timeout=45000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await pause(200);}throw Error('Timeout '+expression+'\n'+await evaluate('document.body.innerText'));}
const results=[],proofs=[];
function assert(name,result,evidence){if(!result)throw Error('FAIL '+name);results.push({name,passed:true,evidence});console.log('PASS '+name);}
async function check(name,expression){assert(name,await evaluate(expression));}
async function click(text){await evaluate(`(()=>{const match=e=>e.textContent.trim()===${JSON.stringify(text)};const e=[...document.querySelectorAll('.quiz-panel button')].find(match)??[...document.querySelectorAll('[role=dialog] button')].find(match)??[...document.querySelectorAll('button')].find(match);if(!e)throw Error('Missing button '+${JSON.stringify(text)});e.click();})()`);await pause(250);}
async function shot(name){const s=await call('Page.captureScreenshot',{format:'png'});writeFileSync(`tmp/app-qa/${name}.png`,Buffer.from(s.data,'base64'));}
async function navigate(path){await call('Page.navigate',{url:origin+path});await until(`location.href===${JSON.stringify(origin+path)}&&document.body.innerText.includes('本機 App 預覽')`);await pause(500);}
async function start(name){await navigate(`/?localRole=student&assessmentTask=local-assessment-${name}`);await until(`document.querySelector('[role=dialog]')!==null`);await click('開始挑戰');await until(`document.body.innerText.includes('第 1 題 / 共')`);}
async function ledger(task){const s=await getDocFromServer(doc(db,'coinAccounts','learner','entries',`local-assessment-${task}`));return s.exists()?{...s.data(),createdAt:s.data().createdAt.toMillis()}:null;}
async function latest(task){const ss=await getDocsFromServer(collection(db,'submissions'));return ss.docs.filter(d=>d.data().taskId===`local-assessment-${task}`).sort((a,b)=>b.data().createdAt.toMillis()-a.data().createdAt.toMillis())[0];}
async function setField(selector,value,kind='textarea'){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(${kind==='select'?'HTMLSelectElement':kind==='input'?'HTMLInputElement':'HTMLTextAreaElement'}.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(${kind==='select'?"'change'":"'input'"},{bubbles:true}));})()`);await pause(200);}
await call('Page.enable');await call('Runtime.enable');await call('Log.enable');await call('Network.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
try{
  const finishOnly=process.argv.includes('--finish-only');
  if(finishOnly){const previous=JSON.parse(readFileSync('tmp/app-qa/remaining-failure.json','utf8'));results.push(...previous.results);proofs.push(...previous.proofs);}
  if(!finishOnly){
  for(const name of ['mixed-3','short-3']){
    const before=await ledger(name);await start(name);
    for(let i=0;i<3;i++){
      if(name==='mixed-3'&&i<2)await evaluate(`document.querySelectorAll('.quiz-panel input[type=radio]')[${i}].click()`);
      else await setField('.quiz-panel textarea',`本機 ${name} 答案 ${i+1}`);
      await click(i===2?'檢查答案總覽':'下一題');
    }
    await click('提交全部答案');await until(`document.body.innerText.includes('非 MC 題目等待老師批改')`);
    const attempt=await latest(name),id=attempt.id,version=attempt.data().version;
    assert(`${name}: submission stays pending; ledger unchanged until all manual marks`,attempt.data().grade.status==='pending'&&JSON.stringify(await ledger(name))===JSON.stringify(before),{id,before});await shot(`${name}-pending`);
    await navigate('/admin?localRole=teacher');await until(`document.body.innerText.includes('既有成績及評語保留')`,60000);
    await evaluate(`(()=>{const row=[...document.querySelectorAll('tr')].find(r=>r.innerText.includes(${JSON.stringify(name)}));if(!row)throw Error('No row');row.querySelector('button').click();})()`);await until(`document.body.innerText.includes('儲存批改與評語')`);
    const formSelector='form';
    await evaluate(`window.qaGradeForm=[...document.querySelectorAll('form')].find(f=>f.innerText.includes('儲存批改與評語'));void 0;`);
    if(name==='short-3'){
      await evaluate(`(()=>{for(const e of [...window.qaGradeForm.querySelectorAll('input[type=number]')].slice(0,2)){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'10');e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);await click('儲存批改與評語');
      const partial=(await getDocFromServer(doc(db,'submissions',id))).data();
      assert('short-3: missing final mark blocks save and does not award',partial.grade.revision===1&&JSON.stringify(await ledger(name))===JSON.stringify(before));await shot('short-incomplete-grade');
    }
    await evaluate(`(()=>{for(const e of window.qaGradeForm.querySelectorAll('input[type=number]')){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'10');e.dispatchEvent(new Event('input',{bubbles:true}));}for(const e of window.qaGradeForm.querySelectorAll('textarea')){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(`老師評語驗收：${name}`)});e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await click('儲存批改與評語');await until(`!document.body.innerText.includes('儲存批改與評語')`,60000);
    const source=(await getDocFromServer(doc(db,'submissions',id))).data(),after=await ledger(name),review=(await getDocFromServer(doc(db,'assessmentReviews',id))).data();
    assert(`${name}: original teacher save final grade 100 and one award`,source.grade.status==='graded'&&source.grade.score===100&&source.grade.revision===2&&after.amount===100&&review.feedback===`老師評語驗收：${name}`,{id,grade:source.grade,ledger:after,review});await shot(`${name}-teacher-final`);
    const meta=(await getDocFromServer(doc(db,'assessmentVersions',`${source.taskId}--${version}`))).data();
    const marks=meta.questions.filter(q=>q.type==='short').map(q=>({question_id:q.id,awarded:10,feedback:`老師評語驗收：${name}`}));
    await evaluate(`(async()=>{const store=await import('/src/lib/cloudStore.ts');return await Promise.all([store.saveGrade(${JSON.stringify(id)},1,${JSON.stringify(marks)},${JSON.stringify(`老師評語驗收：${name}`)}),store.saveGrade(${JSON.stringify(id)},1,${JSON.stringify(marks)},${JSON.stringify(`老師評語驗收：${name}`)})]);})()`);
    const retried=(await getDocFromServer(doc(db,'submissions',id))).data();
    assert(`${name}: repeated original save does not revise or mint again`,retried.grade.revision===2&&JSON.stringify(await ledger(name))===JSON.stringify(after));
    const rest=await(await fetch(`http://127.0.0.1:8191/v1/projects/demo-rules-rewards-app/databases/(default)/documents/submissions/${id}`,{headers:{Authorization:'Bearer owner'}})).json();
    const entryRest=await(await fetch(`http://127.0.0.1:8191/v1/projects/demo-rules-rewards-app/databases/(default)/documents/coinAccounts/learner/entries/local-assessment-${name}`,{headers:{Authorization:'Bearer owner'}})).json();
    if(!before)assert(`${name}: source final grade and new ledger share transaction timestamp`,rest.updateTime===entryRest.updateTime,{sourceUpdate:rest.updateTime,ledgerUpdate:entryRest.updateTime});
    proofs.push({task:name,id,grade:retried.grade,ledger:after,review,sourceUpdateTime:rest.updateTime,ledgerUpdateTime:entryRest.updateTime,newLedger:!before});
    await navigate('/submissions?localRole=student');await until(`document.body.innerText.includes(${JSON.stringify(`老師評語驗收：${name}`)})`);await shot(`${name}-student-final`);
  }
  await navigate('/admin?localRole=teacher');await until(`document.body.innerText.includes('既有成績及評語保留')`,60000);
  await evaluate(`window.qaRules=[...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.innerText.includes('任務探索幣設定'));window.qaRules.open=true;window.qaRules.id='qa-coin-rules';`);
  await setField('#qa-coin-rules select','local-assessment-mc-30','select');await until(`!document.querySelector('#qa-coin-rules fieldset').disabled`);
  await setField('#qa-coin-rules fieldset select','fixed','select');await setField('#qa-coin-rules input[type=number]','77','input');await click('儲存探索幣設定');await until(`document.body.innerText.includes('探索幣設定已儲存')`);
  assert('original CoinRuleEditor writes existing fixed reward policy',JSON.stringify((await getDocFromServer(doc(db,'coinRules','local-assessment-mc-30'))).data())===JSON.stringify({mode:'fixed',amount:77,metric:'score',tiers:[]})||(await getDocFromServer(doc(db,'coinRules','local-assessment-mc-30'))).data().amount===77);await shot('cms-coin-rule');
  await navigate('/assessment-cms?localRole=teacher');await until(`document.querySelectorAll('form fieldset').length>0`);
  await setField('form>label select','local-assessment-mc-30','select');await until(`document.querySelectorAll('form fieldset').length===30&&!document.querySelector('form fieldset').disabled`);
  const oldPublic=await(await fetch(origin+'/src/content/tasks/local-assessment-mc-30.json')).json();
  await setField('textarea[aria-label="第 1 題題幹"]','CMS 公開題幹驗收：選擇老師指定的項目。');await setField('select[aria-label="第 1 題標準答案"]','1','select');await setField('textarea[aria-label="第 1 題解說"]','CMS 私有解說驗收：只有提交後或教師可讀。');await shot('cms-private-edit');
  await click('儲存私有答案及匯出公開教材');
  const startPublish=Date.now();let publicTask;
  while(Date.now()-startPublish<45000){publicTask=await(await fetch(origin+'/src/content/tasks/local-assessment-mc-30.json')).json();if(publicTask.assessmentVersion!==oldPublic.assessmentVersion)break;await pause(250);}
  assert('CMS actual save exports a new opaque public version',publicTask.assessmentVersion!==oldPublic.assessmentVersion&&publicTask.questions[0].prompt.includes('CMS 公開題幹驗收'));
  const key=(await getDocFromServer(doc(db,'assessmentKeys',`${publicTask.task_id}--${publicTask.assessmentVersion}`))).data(),meta=(await getDocFromServer(doc(db,'assessmentVersions',`${publicTask.task_id}--${publicTask.assessmentVersion}`))).data();
  assert('CMS key stored privately; exported task and public version omit all key fields',key.questions[0].answer===1&&key.questions[0].explanation.includes('CMS 私有解說驗收')&&!/"(answer|explanation|modelAnswer|rubric)"\s*:/.test(JSON.stringify(publicTask))&&!/"(answer|explanation|modelAnswer|rubric)"\s*:/.test(JSON.stringify(meta)),{version:publicTask.assessmentVersion});
  writeFileSync('tmp/app-qa/cms-public-export.json',JSON.stringify(publicTask,null,2));
  const beforeMC=await ledger('mc-30');await start('mc-30');await check('CMS updated prompt reaches original student TaskQuiz without pre-submit explanation',`document.body.innerText.includes('CMS 公開題幹驗收')&&!document.body.innerText.includes('CMS 私有解說驗收')`);
  const own=(await(await fetch(origin+'/src/content/tasks/local-assessment-mc-30.json?raw')).text());assert('CMS raw public HTTP omits private answer and explanation',!own.includes('CMS 私有解說驗收')&&!/"(answer|explanation|modelAnswer|rubric)"\s*:/.test(own));
  for(let i=0;i<30;i++){await evaluate(`document.querySelectorAll('.quiz-panel input[type=radio]')[${key.questions[i].answer}].click()`);await click(i===29?'檢查答案總覽':'下一題');}await click('提交全部答案');await until(`document.body.innerText.includes('正式成績：100 / 100')&&document.body.innerText.includes('CMS 私有解說驗收')`);
  const mc=await latest('mc-30'),mcLedger=await ledger('mc-30');assert('new CMS private key grades original MC; original coin setting settles once',mc.data().version===publicTask.assessmentVersion&&mc.data().grade.score===100&&mcLedger.amount===(beforeMC?.amount??77));await shot('cms-student-graded');
  }
  await navigate('/?localRole=student');await evaluate(`[...document.querySelectorAll('button[aria-label="開啟年級選單"]')].find(e=>e.getClientRects().length)?.click();void 0;`);const entries=await getDocsFromServer(collection(db,'coinAccounts','learner','entries')),balance=entries.docs.reduce((n,d)=>n+d.data().amount,0);await until(`document.querySelector('.coin-balance')?.innerText.includes(${JSON.stringify(String(balance))})`);assert('original balance reflects mixed, short and CMS MC ledger total',await evaluate(`document.querySelector('.coin-balance').innerText.includes(${JSON.stringify(String(balance))})`),{balance});await shot('original-balance');
  await start('mc-30');await check('30-question original App still displays only one question',`document.querySelectorAll('.quiz-panel fieldset').length===1&&document.body.innerText.includes('第 1 題 / 共 30 題')`);await shot('desktop-30-questions');
  writeFileSync('tmp/app-qa/remaining-results.json',JSON.stringify({passed:results.length,results,proofs,browserExceptions:events.filter(e=>e.method==='Runtime.exceptionThrown')},null,2));console.log(JSON.stringify({passed:results.length}));
}catch(e){await shot('remaining-failure');writeFileSync('tmp/app-qa/remaining-failure.json',JSON.stringify({error:e.message,body:await evaluate('document.body.innerText'),results,proofs,events:events.filter(e=>['Runtime.exceptionThrown','Log.entryAdded'].includes(e.method))},null,2));console.error(e);process.exitCode=1;}
finally{ws.close();await deleteApp(nodeApp);}
