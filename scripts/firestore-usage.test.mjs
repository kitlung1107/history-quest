import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
function compile(file,modules,globals={},sourceOverride){
  const source=(sourceOverride??fs.readFileSync(new URL(file,import.meta.url),'utf8')).replaceAll('import.meta.hot','undefined');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const context={exports:{},require:id=>{assert.ok(id in modules,id);return modules[id];},...globals};
  vm.runInNewContext(js,context);return context.exports;
}
test('shared reward documents replay server state, separate accounts and detach the last observer',()=>{
  const streams=[];let stops=0;
  const {subscribeRewardDocument:subscribe}=compile('../client/src/lib/rewardSubscriptions.ts',{'firebase/firestore':{onSnapshot(ref,options,next,error){streams.push({next,error});return()=>stops++;}}});
  const ref={firestore:{app:{options:{projectId:'demo'}}},path:'rewardAutomation/status'};
  const a=[],b=[];const stopA=subscribe(ref,'uid/sid',s=>a.push(s),e=>a.push(e));
  const snapshot={metadata:{fromCache:false}};streams[0].next(snapshot);
  const stopB=subscribe(ref,'uid/sid',s=>b.push(s),e=>b.push(e));
  assert.equal(streams.length,1);assert.equal(b[0],snapshot);
  const stopOther=subscribe(ref,'other/other',()=>{},()=>{});assert.equal(streams.length,2);
  streams[0].error('revoked');assert.equal(a.at(-1),'revoked');assert.equal(b.at(-1),'revoked');
  stopA();assert.equal(stops,0);stopB();assert.equal(stops,1);stopOther();assert.equal(stops,2);
  const stopAgain=subscribe(ref,'uid/sid',s=>b.push(s),()=>{});assert.equal(streams.length,3);stopAgain();
});
test('reward hint listeners omit unused policy and empty-task subscriptions',()=>{
  const original=execFileSync('git',['show','60c6fc475837f02bfa0cc8d2b3ce769000a5041a:client/src/hooks/useTaskCoinRewards.ts'],{encoding:'utf8'});
  const results=[];
  for(const before of [true,false])for(const tasks of [[{id:'t',grade:1,type:'quiz',assessmentVersion:'v1'}],[]]){
    const paths=[];let cleanup,stopped=0;
    const listen=(ref)=>{paths.push(ref);return()=>stopped++;};
    const modules={react:{useState:()=>[{},()=>{}],useEffect:fn=>cleanup=fn()},'firebase/firestore':{doc:(_, ...parts)=>parts.join('/'),onSnapshot:listen},'@/lib/rewardSubscriptions':{subscribeRewardDocument:listen},'@/lib/localAssessment':{rulesAssessmentEnabled:()=>true},'@/contexts/StudentAccount':{useOptionalStudentAccount:()=>({user:{uid:'u'},studentId:'s',profile:{className:'1A'}})},'@/lib/assessment':{getQuestions:()=>[{type:'choice',points:10}]},'@/lib/gradeAccess':{canPlayGrade:()=>true},'@/lib/games/registry':{gameForTask:()=>null},'@/lib/firebase':{db:{}},'@/lib/coinRewardHint':{}};
    compile('../client/src/hooks/useTaskCoinRewards.ts',modules,{},before?original:undefined).useTaskCoinRewards(tasks);
    if(cleanup)cleanup();assert.equal(stopped,paths.length);assert.equal(paths.length,before?(tasks.length?4:1):(tasks.length?3:0));
    if(!before)assert.ok(!paths.some(path=>path.startsWith('rewardPolicies/')));
    results.push({phase:before?'before':'after',scenario:tasks.length?'one-rules-assessment-task':'empty-readable-tasks',listenerRegistrations:paths.length,unsubscribed:stopped,paths});
  }
  fs.mkdirSync('tmp/usage',{recursive:true});fs.writeFileSync('tmp/usage/subscriptions.json',JSON.stringify({interpretation:'Application listener registrations, not transport targets, Firestore billing or snapshot document reads',results},null,2));
});
test('teacher list reads summaries without result/detail reads or per-item transactions',async()=>{
  let reads=0,details=0;
  const grade={status:'graded',score:100,revision:1};
  const source={protocol:'rules-assessment/1',studentId:'s',taskId:'task',grade,createdAt:{toDate:()=>new Date(0)}};
  const modules={
    './localAssessment':{assessmentTransportEnabled:true},'./assessmentSession':{},
    './rulesAssessmentStore':{isRulesSubmission:d=>d?.protocol==='rules-assessment/1',recoverGradingOutbox:async()=>{},readRulesResult:()=>{details++;throw Error('Unexpected detail read');}},
    'firebase/firestore':{collection:()=>{},where:()=>{},orderBy:()=>{},limit:()=>{},query:()=>{},getDocs:async()=>{reads++;return{docs:[{id:'a',data:()=>source}],size:1};}},
    './firebase':{db:{}},'./historyQuest':{HISTORY_TASKS:[{id:'task',title:'History'}]},'./assessment':{},'./coreCatalogueStore':{}
  };
  const {loadSubmissions,asRow}=compile('../client/src/lib/cloudStore.ts',modules);
  const page=await loadSubmissions();const row=asRow('a',page.docs[0].data(),{name:'Synthetic',className:'1A',studentNo:'1'});
  assert.equal(reads,1);assert.equal(details,0);assert.equal(row.score,100);assert.equal(row.timestamp,'1970-01-01T00:00:00.000Z');assert.equal(row.answers,undefined);
});
test('reward status clears confirmed data on denial and ignores later peer-listener snapshots',()=>{
  const state=[],refs=[],listeners=[];let index=0,effect;
  const modules={react:{useState:v=>{const i=index++;if(!(i in state))state[i]=v;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useEffect:fn=>effect=fn},
    'react/jsx-runtime':{jsx:(_,props)=>props},'firebase/firestore':{doc:(_, ...parts)=>parts.join('/')},'@/lib/firebase':{db:{}},'@/lib/rewardSubscriptions':{subscribeRewardDocument:(ref,scope,next,error)=>{listeners.push({ref,next,error});return()=>{};}},'@/contexts/StudentAccount':{useOptionalStudentAccount:()=>({user:{uid:'u'},studentId:'s',profile:{className:'1A'}})}};
  const Reward=compile('../client/src/components/RulesRewardStatus.tsx',modules).default;
  Reward({taskId:'t',sourceId:'a'});effect();
  listeners[0].next({metadata:{fromCache:false},data:()=>({amount:100})});listeners[1].next({metadata:{fromCache:false},data:()=>({grade:{status:'graded'}})});
  assert.equal(state[0].earned,100);listeners[1].error({code:'permission-denied'});assert.equal(state[0].earned,undefined);assert.equal(state[0].error,true);
  listeners[0].next({metadata:{fromCache:false},data:()=>({amount:100})});assert.equal(state[0].earned,undefined);assert.equal(state[0].error,true);
});
test('complete roster uses bounded cursors without losing duplicate-check coverage',async()=>{
  const pages=[Array.from({length:100},(_,i)=>({id:String(i)})),[{id:'100'}]],calls=[];
  const {readCompleteCollection}=compile('../client/src/lib/boundedCollection.ts',{'firebase/firestore':{
    collection:(_,path)=>path,documentId:()=> '__name__',orderBy:x=>x,limit:n=>({limit:n}),startAfter:x=>({cursor:x.id}),query:(...args)=>args,
    getDocs:async q=>{calls.push(q);const docs=pages.shift();return{docs,size:docs.length};}
  }});
  const result=await readCompleteCollection({},'profiles');assert.equal(result.docs.length,101);assert.equal(calls.length,2);assert.ok(calls[1].some(x=>x.cursor==='99'));assert.ok(calls.every(q=>q.some(x=>x.limit===100)));
});
function syncHarness(project='demo-rules-rewards-app'){
  const values=new Map(),events=new Map(),state=[],refs=[];let index=0,refIndex=0,effect;
  const account={user:{uid:'uid'},studentId:'s'},calls=[];let failure,gate;
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const errors=compile('../client/src/lib/submissionError.ts',{});
  const modules={react:{createContext:()=>({Provider:'provider'}),useContext:()=>{},useState:v=>{const i=index++;if(!(i in state))state[i]=v;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef:v=>{const i=refIndex++;return refs[i]??=( {current:v});},useCallback:fn=>fn,useEffect:fn=>{effect=fn;}},
    'react/jsx-runtime':{jsx:(_,props)=>props},'@/lib/submissionError':errors,'@/lib/firebase':{db:{app:{options:{projectId:project}}}},'@/lib/assessmentSession':{requireAssessmentEnabled(){}},'@/lib/gradeAccess':{canPlayGrade:()=>true},sonner:{toast:{success(){}}},'@/lib/historyQuest':{HISTORY_TASKS:[]},'@/lib/assessment':{getQuestions:()=>[],taskAssessmentVersion:()=> 'v1',validatePublicAnswers(){}},'@/lib/cloudStore':{loadCloudProgress:async()=>({}),submitCloud:async(...args)=>{calls.push(args);if(gate)await gate;if(failure)throw failure;}},'./StudentAccount':{useOptionalStudentAccount:()=>account}};
  const {ScoreSyncProvider}=compile('../client/src/contexts/ScoreSyncContext.tsx',modules,{sessionStorage:storage,crypto:{randomUUID:()=> 'original-attempt'},window:{addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}});
  const render=()=>{index=refIndex=0;return ScoreSyncProvider({children:null}).value;};
  return{values,events,state,account,calls,render,mount:()=>effect(),setFailure:e=>failure=e,setGate:g=>gate=g,key:()=>`hdc.pending.v2.${project}.${account.user.uid}.${account.studentId}`};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('quota stops automatic online retry; manual recovery reuses original answers and attempt',async()=>{
  const h=syncHarness();let value=h.render();h.mount();await settle();
  h.setFailure({code:'resource-exhausted'});const answers=[{question_id:'q1',value:1}];
  await assert.rejects(value.completeTask({id:'task',grade:1},answers));
  assert.equal(h.calls.length,1);assert.equal(JSON.parse(h.values.get(h.key()))[0].id,'original-attempt');
  h.events.get('online')();await settle();assert.equal(h.calls.length,1);assert.ok(h.state.some(v=>typeof v==='string'&&v.includes('停止自動重試')));
  h.setFailure(undefined);value=h.render();await value.retry();assert.equal(h.calls.length,2);assert.equal(h.calls[1][1],'original-attempt');assert.equal(JSON.stringify(h.calls[1][4]),JSON.stringify(answers));assert.equal(h.values.get(h.key()),'[]');
});
test('sealed answers retain uploaded status until settlement; switching identity clears old pending data',async()=>{
  const h=syncHarness();let value=h.render();h.mount();await settle();
  h.setFailure({code:'unavailable',submissionUploaded:true});await assert.rejects(value.completeTask({id:'task',grade:1},[{question_id:'q1',value:0}]));
  const oldKey=h.key();assert.equal(JSON.parse(h.values.get(oldKey))[0].uploaded,true);assert.ok(h.state.some(v=>typeof v==='string'&&v.includes('已上載')));
  h.account.user.uid='other';h.account.studentId='other';h.render();h.mount();await settle();assert.equal(h.values.has(oldKey),false);assert.equal(h.calls.length,1);
});
test('parallel clicks preserve one attempt and immutable first answers',async()=>{
  const h=syncHarness();const value=h.render();h.mount();await settle();let release;h.setGate(new Promise(r=>release=r));
  const first=value.completeTask({id:'task',grade:1},[{question_id:'q1',value:0}]);const second=value.completeTask({id:'task',grade:1},[{question_id:'q1',value:1}]).catch(e=>e);
  await settle();assert.equal(h.calls.length,1);assert.equal(JSON.parse(h.values.get(h.key()))[0].answers[0].value,0);release();await first;await second;
});
test('existing session attempts migrate once only in production namespace',()=>{
  const h=syncHarness('history-discovery-center');const saved=JSON.stringify([{id:'saved',taskId:'task',version:'v1',answers:[]}]);h.values.set('hdc.pending.s',saved);h.render();assert.equal(h.values.get(h.key()),saved);assert.equal(h.values.has('hdc.pending.s'),false);
  const demo=syncHarness();demo.values.set('hdc.pending.s',saved);demo.render();assert.equal(demo.values.has(demo.key()),false);
});
