import {beforeAll,afterAll,beforeEach,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs,runTransaction,writeBatch,serverTimestamp,Timestamp,setLogLevel,disableNetwork,enableNetwork,type Firestore} from 'firebase/firestore';
import {claims,ownerEmail,makeAssessment,seedIdentity,seedAssessment} from './fixtures.mjs';
import {sealAnswers,verifyMC,finishAssessment,saveShortGrade,submitAndSettle,type PublicAssessment,type RawAnswer} from '../../client/src/lib/rulesAssessment';
import {submissionErrorMessage} from '../../client/src/lib/submissionError';
test('compatibility: legacy raw submission, teacher grade and reward remain usable',async()=>{
  await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'taskAccess','legacy'),{grade:1,enabled:true});});
  const batch=writeBatch(student);
  batch.set(doc(student,'submissions','legacy'),{studentId:'learner',taskId:'legacy',version:'old-fnv',answers:[{question_id:'q1',value:0}],createdAt:serverTimestamp()});
  batch.set(doc(student,'progress','learner','tasks','legacy'),{score:0,progress:100,attemptId:'legacy',syncedAt:serverTimestamp()});
  await assertSucceeds(batch.commit());
  const grade=writeBatch(teacher);grade.update(doc(teacher,'submissions','legacy'),{grade:{status:'graded',score:80,revision:1,answers:[],feedback:'保留舊流程'}});
  grade.set(doc(teacher,'coinAccounts','learner','entries','legacy'),{kind:'taskReward',taskId:'legacy',attemptId:'legacy',amount:80,score:80,progress:100,rule:{mode:'fixed',amount:80,metric:'score',tiers:[]},createdAt:serverTimestamp()});
  await assertSucceeds(grade.commit());
  await assertFails(updateDoc(doc(student,'submissions','legacy'),{grade:{status:'graded',score:100}}));
});
test('compatibility: original game completion reward route and catalogue access stay intact',async()=>{
  await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();await setDoc(doc(d,'gameSessions','game'),{studentId:'learner',status:'completed',attempts:3,correct:2,gameId:'game-id',version:'v1'});await setDoc(doc(d,'gameCatalog','game-id','versions','v1'),{taskId:'game-task',enabled:true});});
  const entry={kind:'gameReward',taskId:'game-task',attemptId:'game',amount:50,score:67,progress:100,rule:{mode:'fixed',amount:50,metric:'score',tiers:[]},createdAt:serverTimestamp()};
  await assertFails(setDoc(doc(student,'coinAccounts','learner','entries','game-task'),entry));
  await assertSucceeds(setDoc(doc(teacher,'coinAccounts','learner','entries','game-task'),entry));
  await assertSucceeds(setDoc(doc(teacher,'catalogue','retained-legacy-version'),{questions:[],title:'歷史版本'}));
  await assertFails(getDoc(doc(student,'catalogue','retained-legacy-version')));
  await assertFails(setDoc(doc(teacher,'cardCatalog','current'),{cards:{}}));
});
test('new assessment cannot downgrade to legacy schema or teacher-confirmed arbitrary rewards',async()=>{
  const f=await fixture('downgrade',1);
  await assertFails(setDoc(doc(student,'submissions','downgrade'),{studentId:'learner',taskId:'downgrade',version:f.meta.version,answers:answers(f),createdAt:serverTimestamp()}));
  await submitAndSettle(student,'new-attempt','learner',f.meta,answers(f,false));
  await assertFails(updateDoc(doc(teacher,'submissions','new-attempt'),{grade:{status:'graded',score:100,revision:2,answers:[]}}));
  await assertFails(setDoc(doc(teacher,'progress','learner','tasks','downgrade'),{score:100,progress:100,attemptId:'new-attempt',syncedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(teacher,'coinAccounts','learner','entries','downgrade'),{kind:'taskReward',taskId:'downgrade',attemptId:'new-attempt',amount:999,score:0,progress:100,rule:{mode:'fixed',amount:999,metric:'score',tiers:[]},createdAt:serverTimestamp()}));
});
test('mixed final grading uses float rounding, commits grade and award once, and preserves review isolation',async()=>{
  const f=await fixture('mixed-rounding',3,{shortIndexes:[2]});const raw=answers(f);raw[1].value=0;
  await submitAndSettle(student,'mixed-rounding','learner',f.meta,raw);
  expect((await ledger(student,f.meta.taskId)).exists()).toBe(false);
  const grade=await saveShortGrade(teacher,'mixed-rounding',1,[null,null,10]);
  expect(grade.score).toBe(67);expect((await ledger(student,f.meta.taskId)).data()?.amount).toBe(50);
  const review={revision:2,feedback:'老師總評語',questions:{q3:'有證據支持'}};
  await assertSucceeds(setDoc(doc(teacher,'assessmentReviews','mixed-rounding'),review));
  await assertSucceeds(getDoc(doc(student,'assessmentReviews','mixed-rounding')));
  await assertFails(getDoc(doc(other,'assessmentReviews','mixed-rounding')));
  await assertFails(setDoc(doc(student,'assessmentReviews','mixed-rounding'),{...review,feedback:'偽造評語'}));
  await assertFails(setDoc(doc(teacher,'assessmentReviews','mixed-rounding'),{...review,revision:1}));
  await saveShortGrade(teacher,'mixed-rounding',1,[null,null,10]);
  expect((await getDocs(collection(student,'coinAccounts','learner','entries'))).size).toBe(1);
});
test('CMS creates immutable private key and public version atomically; students cannot publish or list private keys',async()=>{
  const f=makeAssessment('cms-new',1),id=`cms-new--${f.meta.version}`;
  await assertFails(setDoc(doc(student,'assessmentKeys',id),f.key));
  const batch=writeBatch(teacher);batch.set(doc(teacher,'assessmentKeys',id),f.key);batch.set(doc(teacher,'assessmentVersions',id),{...f.meta,acceptFrom:serverTimestamp()});
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(doc(teacher,'assessmentKeys',id),{questions:[]}));
  await assertFails(updateDoc(doc(teacher,'assessmentVersions',id),{totalPoints:1000}));
  await assertFails(getDocs(collection(teacher,'assessmentKeys')));
  await assertFails(getDocs(collection(student,'assessmentKeys')));
  const leak=makeAssessment('cms-leak',1),leakId=`cms-leak--${leak.meta.version}`,unsafe=writeBatch(teacher);
  unsafe.set(doc(teacher,'assessmentKeys',leakId),leak.key);unsafe.set(doc(teacher,'assessmentVersions',leakId),{...leak.meta,acceptFrom:serverTimestamp(),questions:[{...leak.meta.questions[0],answer:0}]});
  await assertFails(unsafe.commit());
});
for(const count of [3,10,30])test(`CMS publishes ${count} public questions without exposing answer fields`,async()=>{
  const f=makeAssessment(`cms-${count}`,count),id=`${f.meta.taskId}--${f.meta.version}`;
  const batch=writeBatch(teacher);batch.set(doc(teacher,'assessmentKeys',id),f.key);batch.set(doc(teacher,'assessmentVersions',id),{...f.meta,acceptFrom:serverTimestamp()});
  await assertSucceeds(batch.commit());
  const publicVersion=(await getDoc(doc(teacher,'assessmentVersions',id))).data()!;
  expect(publicVersion.questions.length).toBe(count);expect(publicVersion.questions.some((q:any)=>'answer' in q||'explanation' in q)).toBe(false);
});
test('game questionnaire retained for core sync cannot enter automatic assessment settlement',async()=>{
  const f=await fixture('game-questionnaire',1);await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'assessmentVersions',`${f.meta.taskId}--${f.meta.version}`),{enabled:false}));
  await assertFails(sealAnswers(student,'game-questionnaire-attempt','learner',f.meta,answers(f)));
  expect((await ledger(teacher,f.meta.taskId)).exists()).toBe(false);
});
// Never reset the active preview project's submissions or user outbox.
const projectId='demo-rules-rewards-integration-tests';
let env:RulesTestEnvironment,student:Firestore,teacher:Firestore,other:Firestore;
setLogLevel('silent');
beforeAll(async()=>{env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8191,rules:readFileSync('integration/assessment/compatible.rules','utf8')}});});
afterAll(async()=>{await env?.cleanup();});
beforeEach(async()=>{
  await env.clearFirestore();await env.withSecurityRulesDisabled(c=>seedIdentity(c.firestore()));
  student=env.authenticatedContext('learner-uid',claims('learner@prototype.test')).firestore();
  teacher=env.authenticatedContext('teacher-uid',claims(ownerEmail)).firestore();
  other=env.authenticatedContext('other-uid',claims('other@prototype.test')).firestore();
});
async function fixture(task:string,count:number,options?:Parameters<typeof makeAssessment>[2],rule?:unknown){
  const f=makeAssessment(task,count,options);await env.withSecurityRulesDisabled(c=>seedAssessment(c.firestore(),f,rule));return f;
}
function answers(f:ReturnType<typeof makeAssessment>,correct=true):RawAnswer[]{return f.meta.questions.map((q:any,i:number)=>({question_id:q.id,value:q.type==='short'?'本機短答':correct?f.key.questions[i].answer:(f.key.questions[i].answer+1)%3}));}
const ledger=(db:Firestore,task:string)=>getDoc(doc(db,'coinAccounts','learner','entries',task));
const roundingCases=[
  {name:'2/3 rounds upward to 67',weights:[2,1],correctIndexes:[0],score:67,amount:50},
  {name:'1/6 rounds upward to 17',weights:[1,5],correctIndexes:[0],score:17,amount:10},
  {name:'half 49.5 rounds to 50 at reward threshold',weights:[99,100,1],correctIndexes:[0],score:50,amount:50},
  {name:'just below half rounds down to 49',weights:[49,50],correctIndexes:[0],score:49,amount:10},
  {name:'just above half rounds up to 50',weights:[50,51],correctIndexes:[0],score:50,amount:50},
  {name:'lower score boundary stays zero',weights:[1,5],correctIndexes:[],score:0,amount:10},
  {name:'upper score boundary stays 100',weights:[1,5],correctIndexes:[0,1],score:100,amount:100},
];
for(const c of roundingCases)test(`rounding regression: ${c.name}`,async()=>{
  const f=await fixture('rounding',c.weights.length,{weights:c.weights}),raw=answers(f,false);
  for(const i of c.correctIndexes)raw[i].value=f.key.questions[i].answer;
  const g=await submitAndSettle(student,'rounding-attempt','learner',f.meta,raw);
  expect(g.score).toBe(c.score);expect((await ledger(student,'rounding')).data()?.amount).toBe(c.amount);
  await submitAndSettle(student,'rounding-attempt','learner',f.meta,raw);
  expect((await ledger(student,'rounding')).data()?.amount).toBe(c.amount);
  expect((await getDocs(collection(student,'coinAccounts','learner','entries'))).size).toBe(1);
});
test('permission denial preserves submission and does not suggest a network recovery',()=>{
  const text=submissionErrorMessage({code:'permission-denied',message:'score mismatch'});
  expect(text).toContain('規則驗證拒絕');expect(text).toContain('提交 ID 已保留');expect(text).not.toContain('連線恢復');
});
test('offline failure retains the same-attempt reconnect guidance',()=>{
  const text=submissionErrorMessage({code:'unavailable',message:'offline'});
  expect(text).toContain('連線恢復');expect(text).toContain('同一提交');expect(text).not.toContain('規則驗證拒絕');
});
test('smoke atomic seal without transaction read',async()=>{
  const f=await fixture('smoke',1),batch=writeBatch(student);
  batch.set(doc(student,'submissions','smoke'),{protocol:'rules-assessment/1',studentId:'learner',taskId:'smoke',version:f.meta.version,answers:answers(f),createdAt:serverTimestamp()});
  batch.set(doc(student,'progress','learner','tasks','smoke'),{score:0,progress:100,attemptId:'smoke',syncedAt:serverTimestamp()});
  await assertSucceeds(batch.commit());
});
for(const count of [1,3,10,30])test(`MC ${count} questions: immutable private grading and automatic atomic tier award`,async()=>{
  const f=await fixture(`mc${count}`,count),stats={accepted:0,rejected:0};
  const grade=await submitAndSettle(student,'a1','learner',f.meta,answers(f),stats);
  expect(grade.score).toBe(100);expect(grade.status).toBe('graded');expect((await ledger(student,f.meta.taskId)).data()?.amount).toBe(100);
  expect(stats).toEqual({accepted:count,rejected:count});
  await submitAndSettle(student,'a1','learner',f.meta,answers(f));
  expect((await getDocs(collection(student,'coinAccounts','learner','entries'))).size).toBe(1);
});
test('students cannot read private keys or another student record, change answer, score, policy or balance',async()=>{
  const f=await fixture('private',3);await sealAnswers(student,'a1','learner',f.meta,answers(f));
  await assertFails(getDoc(doc(student,'assessmentKeys',`${f.meta.taskId}--${f.meta.version}`)));
  await assertFails(getDocs(collection(student,'assessmentKeys')));
  await assertFails(getDoc(doc(other,'submissions','a1')));
  await assertFails(updateDoc(doc(student,'submissions','a1'),{answers:answers(f,false)}));
  await assertFails(updateDoc(doc(student,'submissions','a1'),{grade:{score:100,status:'graded'}}));
  await assertFails(setDoc(doc(student,'coinRules','private'),{mode:'fixed',amount:100000}));
  await assertFails(setDoc(doc(student,'coinAccounts','learner','entries','private'),{amount:100000}));
  expect(JSON.stringify((await getDoc(doc(student,'assessmentVersions','private--prototype-v1'))).data())).not.toContain('"answer"');
});
test('mixed MC first, draft short remains pending, final teacher save automatically settles combined score',async()=>{
  const f=await fixture('mixed',3,{shortIndexes:[1],weights:[10,30,10]});
  const pending=await submitAndSettle(student,'a1','learner',f.meta,answers(f));
  expect(pending.mcPoints).toBe(20);expect(pending.score).toBeNull();expect((await ledger(student,'mixed')).exists()).toBe(false);
  const draft=await saveShortGrade(teacher,'a1',1,[null,null,null]);expect(draft.score).toBeNull();
  const final=await saveShortGrade(teacher,'a1',2,[null,20,null]);expect(final.score).toBe(80);expect((await ledger(student,'mixed')).data()?.amount).toBe(80);
  await assertFails(saveShortGrade(student,'a1',3,[null,30,null]));
  const changed=await saveShortGrade(teacher,'a1',3,[null,30,null]);expect(changed.score).toBe(100);expect((await ledger(student,'mixed')).data()?.amount).toBe(80);
});
for(const count of [3,30])test(`all short ${count}: no award until every mark, final zero permits fixed award`,async()=>{
  const f=await fixture(`short${count}`,count,{shortIndexes:Array.from({length:count},(_,i)=>i)},{mode:'fixed',amount:37,metric:'score',tiers:[]});
  const pending=await submitAndSettle(student,'a1','learner',f.meta,answers(f));expect(pending.score).toBeNull();
  const partial=Array<number|null>(count).fill(0);partial[count-1]=null;
  await saveShortGrade(teacher,'a1',1,partial);expect((await ledger(student,f.meta.taskId)).exists()).toBe(false);
  partial[count-1]=0;const final=await saveShortGrade(teacher,'a1',2,partial);
  expect(final.score).toBe(0);expect((await ledger(student,f.meta.taskId)).data()?.amount).toBe(37);
});
test('20 unsorted tiers verify highest threshold, nonmonotonic amounts and progress metric',async()=>{
  const tiers=Array.from({length:20},(_,i)=>({minimum:i*5,amount:101-i})).reverse();
  const f=await fixture('twenty-tiers',3,undefined,{mode:'tiers',amount:0,metric:'score',tiers});
  await submitAndSettle(student,'a1','learner',f.meta,answers(f));
  expect((await ledger(student,f.meta.taskId)).data()?.amount).toBe(82);
  const g=await fixture('progress-tiers',3,undefined,{mode:'tiers',amount:0,metric:'progress',tiers});
  await submitAndSettle(student,'a2','learner',g.meta,answers(g,false));
  expect((await ledger(student,g.meta.taskId)).data()?.amount).toBe(82);
});
test('off, absent rules, fixed zero and unmet threshold never lock future positive eligibility',async()=>{
  const f=await fixture('eligibility',1,undefined,{mode:'off',amount:0,metric:'score',tiers:[]});
  await submitAndSettle(student,'a1','learner',f.meta,answers(f));expect((await ledger(student,'eligibility')).exists()).toBe(false);
  await setDoc(doc(teacher,'coinRules','eligibility'),{mode:'fixed',amount:0,metric:'score',tiers:[]});
  await submitAndSettle(student,'a2','learner',f.meta,answers(f));expect((await ledger(student,'eligibility')).exists()).toBe(false);
  await setDoc(doc(teacher,'coinRules','eligibility'),{mode:'tiers',amount:0,metric:'score',tiers:[{minimum:80,amount:50}]});
  await submitAndSettle(student,'a3','learner',f.meta,answers(f,false));expect((await ledger(student,'eligibility')).exists()).toBe(false);
  await setDoc(doc(teacher,'coinRules','eligibility'),{mode:'fixed',amount:23,metric:'score',tiers:[]});
  await submitAndSettle(student,'a4','learner',f.meta,answers(f));expect((await ledger(student,'eligibility')).data()?.amount).toBe(23);
});
test('concurrent attempts and retries preserve one positive reward and current progress',async()=>{
  const f=await fixture('concurrent',3);
  await Promise.all([submitAndSettle(student,'a1','learner',f.meta,answers(f)),submitAndSettle(student,'a2','learner',f.meta,answers(f))]);
  await Promise.all([submitAndSettle(student,'a1','learner',f.meta,answers(f)),submitAndSettle(student,'a2','learner',f.meta,answers(f))]);
  expect((await getDocs(collection(student,'coinAccounts','learner','entries'))).size).toBe(1);
  expect((await ledger(student,'concurrent')).data()?.amount).toBe(100);
});
test('partial MC grading survives interrupted worker and resumes identical sealed attempt',async()=>{
  const f=await fixture('resume',3);await sealAnswers(student,'a1','learner',f.meta,answers(f));
  await env.withSecurityRulesDisabled(async c=>{
    await setDoc(doc(c.firestore(),'assessmentGrading','a1'),{studentId:'learner',taskId:'resume',version:f.meta.version,index:1,mcPoints:10});
    await setDoc(doc(c.firestore(),'assessmentMarks','a1','items','0'),{index:0,awarded:10,createdAt:Timestamp.now()});
  });
  const stats={accepted:0,rejected:0};await verifyMC(student,'a1',stats);expect(stats.accepted).toBe(2);
  await finishAssessment(student,'a1');expect((await ledger(student,'resume')).data()?.amount).toBe(100);
  await expect(sealAnswers(student,'a1','learner',f.meta,answers(f,false))).rejects.toThrow('已鎖定');
});
test('source versions, disabled access, cross identity and question limit are enforced',async()=>{
  const f=await fixture('limits',1);
  const disabled=env.authenticatedContext('disabled',claims('disabled@prototype.test')).firestore();
  await assertFails(sealAnswers(disabled,'a1','disabled',f.meta,answers(f)));
  await assertFails(sealAnswers(student,'a2','other',f.meta,answers(f)));
  await assertFails(sealAnswers(student,'a3','learner',{...f.meta,version:'unpublished'},answers(f)));
  await setDoc(doc(teacher,'taskAccess','limits'),{grade:1,enabled:false});
  await assertFails(sealAnswers(student,'a4','learner',f.meta,answers(f)));
  const tooMany=await fixture('too-many',31);await assertFails(sealAnswers(student,'a5','learner',tooMany.meta,answers(tooMany)));
});
test('malformed or incomplete raw answers cannot produce a grade or reward; raw answers remain sealed',async()=>{
  const f=await fixture('malformed',3);
  await assertFails(sealAnswers(student,'a1','learner',f.meta,answers(f).slice(0,2)));
  const bad=answers(f);bad[0]={question_id:'wrong-question',value:0};
  await sealAnswers(student,'a2','learner',f.meta,bad);await assertFails(verifyMC(student,'a2'));
  expect((await ledger(student,'malformed')).exists()).toBe(false);
  await assertFails(updateDoc(doc(student,'assessmentGrading','a2'),{index:3,mcPoints:30}));
});
test('forged final score, forged amount, tier, missing atomic ledger and immutable positive funds are rejected',async()=>{
  const f=await fixture('forgery',1);await sealAnswers(student,'a1','learner',f.meta,answers(f));await verifyMC(student,'a1');
  const base={status:'graded',score:100,mcPoints:10,shortMarks:[null],revision:1,rewardAmount:100,tierIndex:2};
  await assertFails(updateDoc(doc(student,'submissions','a1'),{grade:base})); // Ledger must be in the same transaction.
  for(const [score,amount,tierIndex] of [[0,100,2],[100,100000,2],[100,80,0]]){
    const batch=writeBatch(student);batch.update(doc(student,'submissions','a1'),{grade:{...base,score,rewardAmount:amount,tierIndex}});
    batch.set(doc(student,'coinAccounts','learner','entries','forgery'),{kind:'taskReward',taskId:'forgery',attemptId:'a1',amount,score,progress:100,rule:(await getDoc(doc(student,'coinRules','forgery'))).data(),createdAt:serverTimestamp(),tierIndex});
    await assertFails(batch.commit());
  }
  await finishAssessment(student,'a1');
  await assertFails(updateDoc(doc(teacher,'coinAccounts','learner','entries','forgery'),{amount:999}));
  await assertFails(deleteDoc(doc(teacher,'coinAccounts','learner','entries','forgery')));
});
test('historical records cannot be regraded or backfilled, rule changes and refresh do not mint',async()=>{
  const f=await fixture('historical',1);
  await env.withSecurityRulesDisabled(async c=>{
    await setDoc(doc(c.firestore(),'submissions','old'),{protocol:'rules-assessment/1',studentId:'learner',taskId:'historical',version:f.meta.version,answers:answers(f),createdAt:Timestamp.fromMillis(f.meta.acceptFrom.toMillis()-1),grade:{status:'graded',score:100,mcPoints:10,shortMarks:[null],revision:1,rewardAmount:0,tierIndex:-1}});
  });
  await assertFails(verifyMC(student,'old'));await setDoc(doc(teacher,'coinRules','historical'),{mode:'fixed',amount:123,metric:'score',tiers:[]});
  const existing=await finishAssessment(student,'old');expect(existing.score).toBe(100);expect((await ledger(student,'historical')).exists()).toBe(false);
});
test('legacy zero upgrades once; marks over maximum or stale revision cannot settle',async()=>{
  const f=await fixture('legacy',3,{shortIndexes:[1]});
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'coinAccounts','learner','entries','legacy'),{amount:0}));
  await submitAndSettle(student,'a1','learner',f.meta,answers(f));
  await expect(saveShortGrade(teacher,'a1',1,[null,11,null])).rejects.toThrow('配分無效');
  await saveShortGrade(teacher,'a1',1,[null,10,null]);expect((await ledger(student,'legacy')).data()?.amount).toBe(100);
  const repeated=await saveShortGrade(teacher,'a1',1,[null,10,null]);expect(repeated.revision).toBe(2);
  await expect(saveShortGrade(teacher,'a1',1,[null,5,null])).rejects.toThrow('版本已更新');
});
test('actual offline transaction fails safely, reconnect and fresh client retry mint once',async()=>{
  const f=await fixture('offline',3);await disableNetwork(student);
  await expect(submitAndSettle(student,'a1','learner',f.meta,answers(f))).rejects.toBeDefined();
  await enableNetwork(student);await submitAndSettle(student,'a1','learner',f.meta,answers(f));
  const restarted=env.authenticatedContext('learner-uid',claims('learner@prototype.test')).firestore();
  await submitAndSettle(restarted,'a1','learner',f.meta,answers(f));expect((await ledger(restarted,'offline')).data()?.amount).toBe(100);
});
test('ordinary non-testing student grade access and weighted MC rounding are verified',async()=>{
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'access','learner@prototype.test'),{studentId:'learner',enabled:true,testing:false}));
  const f=await fixture('weighted',3,{weights:[1,3,2]});const raw=answers(f);raw[0].value=1;
  const g=await submitAndSettle(student,'a1','learner',f.meta,raw);expect(g.score).toBe(83);expect((await ledger(student,'weighted')).data()?.amount).toBe(80);
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'profiles','learner'),{className:'2A'}));
  await assertFails(sealAnswers(student,'a2','learner',f.meta,answers(f)));
});
test('30 short questions with 20 tiers complete within Rules document and expression limits',async()=>{
  const tiers=Array.from({length:20},(_,i)=>({minimum:i*5,amount:i+1}));
  const f=await fixture('maximum',30,{shortIndexes:Array.from({length:30},(_,i)=>i)},{mode:'tiers',amount:0,metric:'score',tiers});
  await submitAndSettle(student,'a1','learner',f.meta,answers(f));
  const grade=await saveShortGrade(teacher,'a1',1,Array(30).fill(10));expect(grade.score).toBe(100);expect((await ledger(student,'maximum')).data()?.amount).toBe(20);
});
test('lower winning tier cannot bypass staged highest-threshold proof',async()=>{
  const rule={mode:'tiers',amount:0,metric:'score',tiers:[{minimum:0,amount:999},{minimum:100,amount:1}]};
  const f=await fixture('tier-forge',1,undefined,rule);await sealAnswers(student,'a1','learner',f.meta,answers(f));await verifyMC(student,'a1');
  const ref=doc(student,'assessmentRewardQuotes','a1--1');
  await setDoc(ref,{attemptId:'a1',revision:1,score:100,amount:999,tierIndex:0,rule,checked:0});
  await updateDoc(ref,{checked:1});await assertFails(updateDoc(ref,{checked:2}));
  expect((await ledger(student,'tier-forge')).exists()).toBe(false);
  await finishAssessment(student,'a1');expect((await ledger(student,'tier-forge')).data()?.amount).toBe(1);
});
test('feedback is denied before final submit, cannot be forged, and only exposes the submitted version afterwards',async()=>{
  const f=await fixture('feedback',3),another=await fixture('different',1);
  const key=doc(student,'assessmentKeys','feedback--prototype-v1');
  await assertFails(getDoc(key));await sealAnswers(student,'a1','learner',f.meta,answers(f));
  await assertFails(getDoc(key));
  await assertFails(setDoc(doc(student,'assessmentFeedbackAccess','learner','versions','feedback--prototype-v1'),{attemptId:'a1',studentId:'learner',taskId:'feedback',version:f.meta.version}));
  await verifyMC(student,'a1');await assertFails(getDoc(key));
  await finishAssessment(student,'a1');const feedback=await assertSucceeds(getDoc(key));
  expect(feedback.data()?.questions[0].explanation).toBe('這是本機合成題的提交後解說。');
  await assertFails(getDoc(doc(other,'assessmentKeys','feedback--prototype-v1')));
  await assertFails(getDoc(doc(student,'assessmentKeys','different--prototype-v1')));
  await assertFails(updateDoc(doc(student,'submissions','a1'),{answers:answers(f,false)}));
});
test('permission probes cannot change a sealed choice or receive marks without the stored answer',async()=>{
  const f=await fixture('probe',1);await sealAnswers(student,'a1','learner',f.meta,answers(f,false));
  await setDoc(doc(student,'assessmentGrading','a1'),{studentId:'learner',taskId:'probe',version:f.meta.version,index:0,mcPoints:0});
  const batch=writeBatch(student);batch.set(doc(student,'assessmentMarks','a1','items','0'),{index:0,awarded:10,createdAt:serverTimestamp()});batch.update(doc(student,'assessmentGrading','a1'),{index:1,mcPoints:10});
  await assertFails(batch.commit());await assertFails(updateDoc(doc(student,'submissions','a1'),{answers:answers(f,true)}));
  await verifyMC(student,'a1');expect((await getDoc(doc(student,'assessmentGrading','a1'))).data()?.mcPoints).toBe(0);
});
