import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8191';
process.env.METADATA_SERVER_DETECTION='none';
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const project='demo-rules-rewards-app',app=initializeApp({projectId:project},'auth-browser-qa'),db=getFirestore(app);
const previous=process.argv.includes('--resume')?JSON.parse(readFileSync('tmp/auth-qa/failure.json','utf8')):null;
const stamp=previous?Number(previous.results[0].evidence.studentId.slice('transport-'.length)):Date.now(),studentId=`transport-${stamp}`,studentEmail=`transport.${stamp}@prototype.test`,studentSub=`transport-student-${stamp}`,teacherEmail='kitlung1107@gmail.com';
const profile=(await db.doc('profiles/learner').get()).data();
await db.doc(`profiles/${studentId}`).set({...profile,className:'1A',studentNo:'T1',name:'正式接線驗收學生'});
await db.doc(`access/${studentEmail}`).set({studentId,enabled:true,testing:false});
if(!(await db.doc('rewardAutomation/status').get()).exists)await db.doc('rewardAutomation/status').set({enabled:true,activatedAt:Timestamp.fromMillis(0)});
const origin='http://127.0.0.1:4202',folder='tmp/auth-qa';mkdirSync(folder,{recursive:true});
for(const p of await(await fetch('http://127.0.0.1:9297/json/list')).json())if(p.type==='page')await fetch(`http://127.0.0.1:9297/json/close/${p.id}`);
const target=await(await fetch('http://127.0.0.1:9297/json/new?about:blank',{method:'PUT'})).json(),ws=new WebSocket(target.webSocketDebuggerUrl),requests=new Map(),exceptions=[];let seq=0;
await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.id){const p=requests.get(v.id);requests.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}else if(v.method==='Runtime.exceptionThrown')exceptions.push(v.params.exceptionDetails?.text);});
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;requests.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(expression,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await pause(200);}throw Error('Timeout '+expression+'\n'+await evaluate('document.body.innerText'));}
async function navigate(path){await call('Page.navigate',{url:origin+path});await until(`location.href===${JSON.stringify(origin+path)}&&document.readyState==='complete'`);await pause(600);}
async function actor(){return evaluate(`(async()=>{const s=await import('/src/lib/assessmentSession.ts');return s.assessmentActor();})()`);}
async function login(email,sub){
  await evaluate(`(async()=>{const f=await import('/src/lib/firebase.ts');const source=await(await fetch('/src/lib/firebase.ts')).text();const url=source.match(/from "([^"\\n]*firebase_auth[^"\\n]*)"/)[1];const sdk=await import(url);await sdk.signInWithCredential(f.auth,sdk.GoogleAuthProvider.credential(${JSON.stringify(JSON.stringify({sub,email,email_verified:true}))}));return f.auth.currentUser.uid;})()`);
  await until(`(async()=>{try{return (await(await import('/src/lib/assessmentSession.ts')).assessmentActor()).email===${JSON.stringify(email)};}catch{return false;}})()`);
}
async function click(label){await evaluate(`(()=>{const e=[...document.querySelectorAll('.quiz-panel button')].find(e=>e.textContent.trim()===${JSON.stringify(label)})??[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()===${JSON.stringify(label)})??[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Missing '+${JSON.stringify(label)});e.click();})()`);await pause(220);}
async function shot(name){const s=await call('Page.captureScreenshot',{format:'png'});writeFileSync(`${folder}/${name}.png`,Buffer.from(s.data,'base64'));}
const results=previous?.results??[],proofs=previous?.proofs??[];function check(name,pass,evidence){if(!pass)throw Error('FAIL '+name);results.push({name,passed:true,evidence});console.log('PASS '+name);}
async function fixture(name){const task=await(await fetch(origin+`/src/content/tasks/local-assessment-${name}.json`)).json();const meta=(await db.doc(`assessmentVersions/${task.task_id}--${task.assessmentVersion}`).get()).data(),key=(await db.doc(`assessmentKeys/${task.task_id}--${task.assessmentVersion}`).get()).data();return{task,meta,key};}
async function latest(taskId){const rows=(await db.collection('submissions').where('studentId','==',studentId).get()).docs.filter(d=>d.data().taskId===taskId);return rows.sort((a,b)=>b.data().createdAt.toMillis()-a.data().createdAt.toMillis())[0];}
async function ledger(taskId){return db.doc(`coinAccounts/${studentId}/entries/${taskId}`).get();}
async function answer(name){
  const f=await fixture(name);await navigate(`/?localRole=teacher&assessmentTask=${f.task.task_id}`);await until(`document.querySelector('[role=dialog]')!==null`);await click('開始挑戰');
  check(`${name}: private explanation absent before submit`,!(await evaluate('document.body.innerText')).includes('CMS 私有解說驗收'));
  for(const [i,q] of f.meta.questions.entries()){
    if(q.type==='choice')await evaluate(`document.querySelectorAll('.quiz-panel input[type=radio]')[${f.key.questions[i].answer}].click()`);
    else await evaluate(`(()=>{const e=document.querySelector('.quiz-panel textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'合成 Google 帳戶短答');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await click(i===f.meta.questionCount-1?'檢查答案總覽':'下一題');
  }
  await click('提交全部答案');await until(`document.body.innerText.includes('正式成績：')||document.body.innerText.includes('非 MC 題目等待老師批改')`);
  return{...f,source:await latest(f.task.task_id)};
}
await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
try{
  await navigate('/?localRole=teacher');await login(studentEmail,studentSub);
  let mc;
  if(!previous){
  const identity=await actor();check('Google Auth emulator uses verified token and access studentId; localRole cannot grant teacher',identity.studentId===studentId&&identity.uid!==studentId&&!identity.teacher,identity);
  await shot('google-student-session');
  mc=await answer('mc-3');const mcEntry=await ledger(mc.task.task_id);check('ordinary approved MC gets immediate trusted 100 and first-positive coins',mc.source.data().grade.score===100&&mcEntry.data().amount>0);await shot('google-mc-final');
  const before=mcEntry.updateTime.toMillis();await evaluate(`(async()=>{const s=await import('/src/lib/cloudStore.ts');await Promise.all(Array.from({length:3},()=>s.submitCloud(${JSON.stringify(studentId)},${JSON.stringify(mc.source.id)},${JSON.stringify(mc.task.task_id)},${JSON.stringify(mc.meta.version)},${JSON.stringify(mc.source.data().answers)},'rules-assessment/1')));return true;})()`);
  check('same-attempt concurrent retries preserve ledger and grade revision',(await ledger(mc.task.task_id)).updateTime.toMillis()===before&&(await mc.source.ref.get()).data().grade.revision===1);
  const fresh=await fixture('mc-1'),ids=[crypto.randomUUID(),crypto.randomUUID()];const raw=fresh.meta.questions.map((q,i)=>({question_id:q.id,value:fresh.key.questions[i].answer}));
  await evaluate(`(async()=>{const s=await import('/src/lib/cloudStore.ts');await Promise.all(${JSON.stringify(ids)}.map(id=>s.submitCloud(${JSON.stringify(studentId)},id,${JSON.stringify(fresh.task.task_id)},${JSON.stringify(fresh.meta.version)},${JSON.stringify(raw)},'rules-assessment/1')));return true;})()`);
  check('different concurrent fresh attempts share one task ledger',(await ledger(fresh.task.task_id)).exists&&(await Promise.all(ids.map(id=>db.doc('submissions/'+id).get()))).every(d=>d.data().grade.score===100));
  }else {const f=await fixture('mc-3');mc={...f,source:await latest(f.task.task_id)};}
  for(const name of ['mixed-3','short-3']){
    if(results.some(r=>r.name===`${name}: repeated authenticated saves do not revise or mint twice`))continue;
    const f=await answer(name),id=f.source.id;check(`${name}: incomplete manual grading has no ledger`,f.source.data().grade.status==='pending'&&!(await ledger(f.task.task_id)).exists);await shot(`google-${name}-pending`);
    await login(teacherEmail,'transport-teacher');await navigate('/admin');await until(`document.body.innerText.includes('既有成績及評語保留')`);
    check('teacher token reaches original workspace',(await actor()).teacher===true);
    await evaluate(`(()=>{const row=[...document.querySelectorAll('tr')].find(r=>r.innerText.includes('正式接線驗收學生')&&r.innerText.includes(${JSON.stringify(name)}));if(!row)throw Error('No teacher row');row.querySelector('button').click();})()`);await until(`document.body.innerText.includes('儲存批改與評語')`);
    await evaluate(`window.qaForm=[...document.querySelectorAll('form')].find(f=>f.innerText.includes('儲存批改與評語'));void 0;`);
    if(name==='short-3'){
      await evaluate(`(()=>{for(const e of [...window.qaForm.querySelectorAll('input[type=number]')].slice(0,-1)){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'10');e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);await click('儲存批改與評語');
      check('missing final short mark blocks original teacher save',(await f.source.ref.get()).data().grade.revision===1&&!(await ledger(f.task.task_id)).exists);
    }
    await evaluate(`(()=>{for(const e of window.qaForm.querySelectorAll('input[type=number]')){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'10');e.dispatchEvent(new Event('input',{bubbles:true}));}for(const e of window.qaForm.querySelectorAll('textarea')){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Google 教師批改驗收');e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await click('儲存批改與評語');await until(`!document.body.innerText.includes('儲存批改與評語')`);
    const graded=await f.source.ref.get(),entry=await ledger(f.task.task_id);check(`${name}: final teacher total and first ledger commit atomically`,graded.data().grade.score===100&&entry.data().amount>0&&graded.updateTime.isEqual(entry.updateTime));
    const marks=f.meta.questions.filter(q=>q.type==='short').map(q=>({question_id:q.id,awarded:q.points,feedback:'Google 教師批改驗收'}));
    await evaluate(`(async()=>{const s=await import('/src/lib/cloudStore.ts');return Promise.all([s.saveGrade(${JSON.stringify(id)},1,${JSON.stringify(marks)},'Google 教師批改驗收'),s.saveGrade(${JSON.stringify(id)},1,${JSON.stringify(marks)},'Google 教師批改驗收')]);})()`);
    check(`${name}: repeated authenticated saves do not revise or mint twice`,(await f.source.ref.get()).data().grade.revision===2&&(await ledger(f.task.task_id)).updateTime.isEqual(entry.updateTime));
    proofs.push({name,id,sourceUpdateTime:graded.updateTime.toDate().toISOString(),ledgerUpdateTime:entry.updateTime.toDate().toISOString(),amount:entry.data().amount});await shot(`google-${name}-teacher-final`);
    await login(studentEmail,studentSub);await navigate('/submissions');await until(`document.body.innerText.includes('Google 教師批改驗收')`);await shot(`google-${name}-student-final`);
  }
  await db.doc(`access/${studentEmail}`).update({enabled:false});
  const revokedId='revoked-'+crypto.randomUUID();
  const rejected=await evaluate(`(async()=>{try{const s=await import('/src/lib/cloudStore.ts');await s.submitCloud(${JSON.stringify(studentId)},${JSON.stringify(revokedId)},${JSON.stringify(mc.task.task_id)},${JSON.stringify(mc.meta.version)},${JSON.stringify(mc.source.data().answers)},'rules-assessment/1');return {blocked:false};}catch(e){return {blocked:true,message:e.message,code:e.code};}})()`);check('revoked access stops transport before any new submission',rejected.blocked&&!(await db.doc('submissions/'+revokedId).get()).exists,rejected);await db.doc(`access/${studentEmail}`).update({enabled:true});
  await login(teacherEmail,'transport-teacher');await navigate('/assessment-cms');await until(`document.querySelectorAll('form fieldset[data-assessment-question]').length>0`);await shot('google-private-cms');
  await evaluate(`(()=>{const e=document.querySelector('form>label select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'local-assessment-mc-1');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await until(`document.querySelectorAll('form fieldset[data-assessment-question]').length===1&&!document.querySelector('form fieldset[data-assessment-question]').disabled`);
  await evaluate(`(()=>{const e=document.querySelector('textarea[aria-label="第 1 題解說"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'正式接線私有解說，只存本機 emulator。');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('儲存私有答案及匯出公開教材');await until(`document.body.innerText.includes('私有版本已儲存。請下載公開教材檔')`);await shot('google-private-cms-published');
  const downloadDir=path.resolve(folder,`downloads-${stamp}`);mkdirSync(downloadDir,{recursive:true});await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});await click('下載公開教材檔案');
  let pub;for(let i=0;i<50;i++){try{pub=JSON.parse(readFileSync(path.join(downloadDir,'local-assessment-mc-1.json'),'utf8'));break;}catch{await pause(100);}}if(!pub)throw Error('Public download missing');
  const publishedKey=(await db.doc(`assessmentKeys/${pub.task_id}--${pub.assessmentVersion}`).get()).data();check('authenticated private CMS publisher stores key and exports only public JSON',publishedKey.questions[0].explanation.includes('正式接線私有解說')&&!JSON.stringify(pub).includes('正式接線私有解說')&&!Object.hasOwn(pub.questions[0],'answer'));writeFileSync(`${folder}/public-export.json`,JSON.stringify(pub,null,2));
  const entries=await db.collection(`coinAccounts/${studentId}/entries`).get();check('original ledger holds exactly one entry per tested task',entries.size===4,{balance:entries.docs.reduce((n,d)=>n+d.data().amount,0)});
  await login(studentEmail,studentSub);
  for(const [name,width,height] of [['mobile',390,844],['ipad',820,1180]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:name==='mobile'});await navigate('/?assessmentTask=local-assessment-mc-10');await until(`document.querySelector('[role=dialog]')!==null`);await click('開始挑戰');await until(`document.querySelector('.quiz-panel')!==null`);
    const box=await evaluate(`(()=>{const p=document.querySelector('.quiz-panel');return{width:p.clientWidth,scroll:p.scrollWidth,count:p.querySelectorAll('fieldset').length};})()`);check(`${name}: authenticated single-question panel fits`,box.scroll<=box.width+1&&box.count===1,box);await shot(`google-${name}-question`);
  }
  writeFileSync(`${folder}/results.json`,JSON.stringify({passed:results.length,studentId,results,proofs,browserExceptions:exceptions},null,2));console.log(JSON.stringify({passed:results.length,browserExceptions:exceptions.length}));
}catch(e){await shot('failure');writeFileSync(`${folder}/failure.json`,JSON.stringify({error:e.message,body:await evaluate('document.body.innerText'),results,proofs,browserExceptions:exceptions},null,2));console.error(e.message);process.exitCode=1;}
finally{ws.close();await deleteApp(app);}
