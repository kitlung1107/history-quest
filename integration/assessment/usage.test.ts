import {beforeAll,afterAll,test,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {initializeTestEnvironment,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,setLogLevel,disableNetwork,enableNetwork} from 'firebase/firestore';
import {claims,makeAssessment,seedIdentity,seedAssessment,ownerEmail} from './fixtures.mjs';
import * as optimized from '../../client/src/lib/rulesAssessment';
import * as firestore from 'firebase/firestore';
import * as coinModel from '../../client/src/lib/coinModel';
import ts from 'typescript';
const phase=process.env.USAGE_PHASE||'after';
// For additional baseline cases, replay the exact checked HEAD source. The
// original class baseline was captured before implementation changes.
function baseline(){
  const source=execFileSync('git',['show','60c6fc475837f02bfa0cc8d2b3ce769000a5041a:client/src/lib/rulesAssessment.ts'],{encoding:'utf8'}).replaceAll('import.meta.env','{}');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const context={exports:{},require:(id:string)=>id==='firebase/firestore'?firestore:id==='./coinModel.ts'?coinModel:(()=>{throw Error(id);})()};
  // Run in the same JS realm: Firebase rejects plain objects from a separate VM.
  new Function('exports','require',js)(context.exports,context.require);return context.exports as typeof optimized;
}
const {startAudit,submitAndSettle,verifyMC,finishAssessment,saveShortGrade}=phase.startsWith('before-')?baseline():optimized;
let env:RulesTestEnvironment;
const results:any[]=[];
setLogLevel('silent');
beforeAll(async()=>{env=await initializeTestEnvironment({projectId:'demo-rules-rewards-usage',firestore:{host:'127.0.0.1',port:8191,rules:readFileSync('integration/assessment/compatible.rules','utf8')}});});
afterAll(async()=>{mkdirSync('tmp/usage',{recursive:true});writeFileSync(`tmp/usage/${process.env.USAGE_PHASE||'after'}.json`,JSON.stringify(results,null,2));await env?.cleanup();});
// Class sizes are synthetic load assumptions, not actual school enrolment.
for(const size of process.env.USAGE_EXTENDED||process.env.USAGE_CONCURRENT?[]:[40,80]) test(`${size} synthetic students log in and submit ten MC concurrently`,async()=>{
  await env.clearFirestore();const f=makeAssessment(`class-${size}`,10);
  await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await seedIdentity(db);await seedAssessment(db,f,{mode:'fixed',amount:100,metric:'score',tiers:[]});
    await Promise.all(Array.from({length:size},(_,i)=>Promise.all([
      setDoc(doc(db,'access',`student${i}@prototype.test`),{studentId:`student${i}`,enabled:true,testing:false}),
      setDoc(doc(db,'profiles',`student${i}`),{className:i<40?'1A':'1B',configured:true,name:`Synthetic ${i}`,studentNo:String(i+1)})])));});
  const started=Date.now();
  const audits=await Promise.all(Array.from({length:size},async(_,i)=>{
    const db=env.authenticatedContext(`uid-${i}`,claims(`student${i}@prototype.test`)).firestore();
    // Explicit login access/profile reads are measured separately from settlement.
    await getDoc(doc(db,'access',`student${i}@prototype.test`));await getDoc(doc(db,'profiles',`student${i}`));
    const audit=startAudit(db);const raw=f.meta.questions.map((q:any,j:number)=>({question_id:q.id,value:f.key.questions[j].answer}));
    expect((await submitAndSettle(db,`attempt-${i}`,`student${i}`,f.meta,raw)).score).toBe(100);return audit;
  }));
  const total=Object.fromEntries(Object.keys(audits[0]).map(k=>[k,audits.reduce((n,a)=>n+(a as any)[k],0)]));
  const teacher=env.authenticatedContext('teacher',claims(ownerEmail)).firestore();
  const saved=await getDocs(collection(teacher,'submissions'));expect(saved.size).toBe(size);
  for(const s of saved.docs)expect(s.data().grade.revision).toBe(1);
  results.push({scenario:`class-${size}`,synthetic:true,loginDocumentReads:size*2,...total,elapsedMs:Date.now()-started});
  // Baseline teacher refresh route: a graded item still invokes verify + finish.
  const audit=startAudit(teacher);
  for(const s of saved.docs){await verifyMC(teacher,s.id);await finishAssessment(teacher,s.id);}
  results.push({scenario:`completed-resettlement-${size}`,...audit});
  const reconnect=env.authenticatedContext('uid-0',claims('student0@prototype.test')).firestore();
  await disableNetwork(reconnect);await enableNetwork(reconnect);
  const retry=startAudit(reconnect);const raw=f.meta.questions.map((q:any,j:number)=>({question_id:q.id,value:f.key.questions[j].answer}));
  expect((await submitAndSettle(reconnect,'attempt-0','student0',f.meta,raw)).revision).toBe(1);
  expect((await getDocs(collection(reconnect,'coinAccounts','student0','entries'))).size).toBe(1);
  results.push({scenario:`reconnect-${size}`,...retry});
});
if(process.env.USAGE_CONCURRENT)test('eight independent clients retry the same ten-question attempt concurrently',async()=>{
  await env.clearFirestore();const f=makeAssessment('parallel-ten',10);
  await env.withSecurityRulesDisabled(async c=>{await seedIdentity(c.firestore());await seedAssessment(c.firestore(),f);});
  const raw=f.meta.questions.map((q:any,i:number)=>({question_id:q.id,value:f.key.questions[i].answer}));
  const workers=Array.from({length:8},()=>env.authenticatedContext('learner-uid',claims('learner@prototype.test')).firestore());
  const audits=workers.map(startAudit);
  const settled=await Promise.allSettled(workers.map(db=>submitAndSettle(db,'same-attempt','learner',f.meta,raw)));
  const failures=settled.filter(r=>r.status==='rejected').map((r:any)=>({code:r.reason.code,message:r.reason.message,stage:r.reason.assessmentStage,uploaded:r.reason.submissionUploaded}));
  if(failures.length){results.push({scenario:'eight-parallel-first-failure',failures,audits});throw Error(JSON.stringify(failures));}
  expect(settled.every((r:any)=>r.value.score===100&&r.value.revision===1)).toBe(true);
  expect((await getDocs(collection(workers[0],'coinAccounts','learner','entries'))).size).toBe(1);
  results.push({scenario:'eight-parallel-retries',...Object.fromEntries(Object.keys(audits[0]).map(k=>[k,audits.reduce((n,a)=>n+(a as any)[k],0)]))});
});
for(const c of process.env.USAGE_EXTENDED?[
  {name:'mc10-all-wrong',count:10,correct:false,shortIndexes:[],tiers:false},
  {name:'mc30-all-wrong',count:30,correct:false,shortIndexes:[],tiers:false},
  {name:'mc30-all-correct-tiers',count:30,correct:true,shortIndexes:[],tiers:true},
  {name:'mixed10',count:10,correct:true,shortIndexes:[1,3,5,7,9],tiers:true},
  {name:'short30',count:30,correct:true,shortIndexes:Array.from({length:30},(_,i)=>i),tiers:true},
]:[])test(c.name,async()=>{
  await env.clearFirestore();const f=makeAssessment(c.name,c.count,{shortIndexes:c.shortIndexes});
  await env.withSecurityRulesDisabled(async ctx=>{await seedIdentity(ctx.firestore());await seedAssessment(ctx.firestore(),f,c.tiers?undefined:{mode:'fixed',amount:100,metric:'score',tiers:[]});});
  const student=env.authenticatedContext('learner-uid',claims('learner@prototype.test')).firestore();
  const raw=f.meta.questions.map((q:any,i:number)=>({question_id:q.id,value:q.type==='short'?'Synthetic answer':c.correct?f.key.questions[i].answer:(f.key.questions[i].answer+1)%3}));
  const audit=startAudit(student);const grade=await submitAndSettle(student,'attempt','learner',f.meta,raw);
  results.push({scenario:c.name,stage:'submit',...audit});
  expect(grade.status).toBe(c.shortIndexes.length?'pending':'graded');
  if(c.shortIndexes.length){
    expect((await getDocs(collection(student,'coinAccounts','learner','entries'))).size).toBe(0);
    const teacher=env.authenticatedContext('teacher',claims(ownerEmail)).firestore();const marking=startAudit(teacher);
    const final=await saveShortGrade(teacher,'attempt',1,f.meta.questions.map((q:any)=>q.type==='short'?q.points:null));
    expect(final.score).toBe(100);expect(final.revision).toBe(2);
    results.push({scenario:c.name,stage:'teacher-final',...marking});
  }else expect(grade.score).toBe(c.correct?100:0);
  expect((await getDocs(collection(student,'coinAccounts','learner','entries'))).size).toBe(1);
});
