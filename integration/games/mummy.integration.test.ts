import {beforeAll,afterAll,beforeEach,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
import {submitMummyCompletion,MUMMY_TASK,mummyCreditRule} from '../../client/src/lib/games/mummy';
import {validEvent} from '../../client/src/lib/games/model';
const game=JSON.parse(readFileSync('client/src/lib/games/mummy-workshop.json','utf8'));
let env:RulesTestEnvironment;
const uid='mummy-student',sid='mummy-s1',email='mummy@example.test';
const claims={email,email_verified:true,firebase:{sign_in_provider:'google.com'}};
const own=()=>env.authenticatedContext(uid,claims).firestore();
const entry=(db=own())=>doc(db,'coinAccounts',sid,'entries',MUMMY_TASK);
function item(answers=[0,0,0,0,0],id=crypto.randomUUID()){return{uid,studentId:sid,gameId:game.gameId,version:game.version,event:{protocol:'mummy-game/1' as const,type:'complete' as const,eventId:id,sessionId:id,sequence:1,answers,playedAt:'2026-11-17T12:00:00.000Z'}};}
beforeAll(async()=>{env=await initializeTestEnvironment({projectId:'demo-mummy-rules',firestore:{host:'127.0.0.1',port:8191,rules:readFileSync('integration/assessment/compatible.rules','utf8')}});});
afterAll(async()=>{await env?.cleanup();});
async function admin(path:string,data:any){await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),path),data));}
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),b=writeBatch(db);
  b.set(doc(db,'access',email),{studentId:sid,enabled:true});b.set(doc(db,'profiles',sid),{className:'1A'});
  b.set(doc(db,'taskAccess',MUMMY_TASK),{grade:1,enabled:true});
  b.set(doc(db,'gameCatalog',game.gameId,'versions',game.version),{enabled:true,title:game.title,taskId:MUMMY_TASK,questionCount:5,protocol:'mummy-game/1',answerKey:[0,0,0,0,0]});
  b.set(doc(db,'rewardPolicies',MUMMY_TASK),{enabled:true,source:'game'});b.set(doc(db,'rewardAutomation','status'),{enabled:true,activatedAt:Timestamp.fromMillis(1)});await b.commit();
 });
});
test('five final choices atomically save all correctness and award 20 per correct answer',async()=>{
 const a=item([0,1,0,2,0]);await submitMummyCompletion(own(),a);const s=(await getDoc(doc(own(),'gameSessions',a.event.sessionId))).data()!;
 expect(s.correctByQuestion).toEqual([true,false,true,false,true]);expect(s.score).toBe(60);expect(s.firstCompletion).toBe(true);expect(s.playedAt).toBe(a.event.playedAt);
 const credit=(await getDoc(entry())).data()!;expect(credit.amount).toBe(60);expect(credit.rule).toEqual(mummyCreditRule(60));
});
test('first zero consumes eligibility permanently; a perfect replay is saved without coins',async()=>{
 await submitMummyCompletion(own(),item([1,2,1,2,1]));const first=(await getDoc(entry())).data();expect(first?.amount).toBe(0);
 const replay=item();await submitMummyCompletion(own(),replay);expect((await getDoc(entry())).data()).toEqual(first);
 const saved=(await getDoc(doc(own(),'gameSessions',replay.event.sessionId))).data();expect(saved?.score).toBe(100);expect(saved?.rewardAmount).toBe(0);expect(saved?.firstCompletion).toBe(false);
 await assertFails(updateDoc(entry(),{amount:100,score:100,attemptId:replay.event.sessionId}));
});
test('identical retries and simultaneous drains produce one immutable session and credit',async()=>{
 const a=item();await Promise.all([submitMummyCompletion(own(),a),submitMummyCompletion(own(),a)]);const credit=(await getDoc(entry())).data();await submitMummyCompletion(own(),a);expect((await getDoc(entry())).data()).toEqual(credit);
 await expect(submitMummyCompletion(own(),{...a,event:{...a.event,answers:[1,1,1,1,1]}})).rejects.toThrow('重送');
});
test('two different simultaneous completions only award the transaction winner, including zero',async()=>{
 const a=item([1,1,1,1,1]),b=item();await Promise.all([submitMummyCompletion(own(),a),submitMummyCompletion(own(),b)]);
 const rows=await Promise.all([a,b].map(x=>getDoc(doc(own(),'gameSessions',x.event.sessionId))));const first=rows.map(x=>x.data()!).filter(x=>x.firstCompletion);expect(first).toHaveLength(1);expect(rows.map(x=>x.data()!.rewardAmount).reduce((a,b)=>a+b,0)).toBe((await getDoc(entry())).data()?.amount);
});
test('unsigned, unverified, other student, wrong grade and revoked accounts cannot save or mint',async()=>{
 const a=item();await assertFails(submitMummyCompletion(env.unauthenticatedContext().firestore(),a));
 await assertFails(submitMummyCompletion(env.authenticatedContext(uid,{...claims,email_verified:false}).firestore(),a));
 await assertFails(submitMummyCompletion(env.authenticatedContext('other',{...claims,email:'other@example.test'}).firestore(),a));
 await admin('profiles/'+sid,{className:'2A'});await assertFails(submitMummyCompletion(own(),a));
 await admin('profiles/'+sid,{className:'1A'});await admin('access/'+email,{studentId:sid,enabled:false});await assertFails(submitMummyCompletion(own(),a));
});
test('testing accounts retain the museum grade exception; ordinary higher grades stay locked',async()=>{
 await admin('profiles/'+sid,{className:'6A'});await assertFails(submitMummyCompletion(own(),item()));await admin('access/'+email,{studentId:sid,enabled:true,testing:true});await submitMummyCompletion(own(),item());
});
test('disabled task, reward policy and version stop new completion; no partial session is saved',async()=>{
 const a=item();await admin('taskAccess/'+MUMMY_TASK,{grade:1,enabled:false});await assertFails(submitMummyCompletion(own(),a));expect((await getDoc(doc(own(),'gameSessions',a.event.sessionId))).exists()).toBe(false);
 await admin('taskAccess/'+MUMMY_TASK,{grade:1,enabled:true});await admin('rewardPolicies/'+MUMMY_TASK,{enabled:false,source:'game'});await assertFails(submitMummyCompletion(own(),a));
 await admin('rewardPolicies/'+MUMMY_TASK,{enabled:true,source:'game'});await admin('gameCatalog/'+game.gameId+'/versions/'+game.version,{enabled:false});await expect(submitMummyCompletion(own(),a)).rejects.toThrow();
});
test('forged score, omitted first ledger, replay upgrade and browser-only award are rejected',async()=>{
 const a=item();await submitMummyCompletion(own(),a);const saved=(await getDoc(doc(own(),'gameSessions',a.event.sessionId))).data()!;
 await assertFails(updateDoc(doc(own(),'gameSessions',a.event.sessionId),{score:0}));
 const client=own(),b=writeBatch(client);b.set(doc(client,'gameSessions',crypto.randomUUID()),{...saved,answers:[1,1,1,1,1],firstCompletion:false,rewardAmount:0,createdAt:serverTimestamp(),completedAt:serverTimestamp()});await assertFails(b.commit());
 await assertFails(setDoc(doc(own(),'coinAccounts','someone-else','entries',MUMMY_TASK),{kind:'gameReward',taskId:MUMMY_TASK,attemptId:a.event.sessionId,amount:100,score:100,progress:100,rule:mummyCreditRule(100),createdAt:serverTimestamp()}));
});
test('complete protocol accepts exactly five valid choices; no legacy bypass or partial answers',()=>{
 const a=item();expect(validEvent(a.event,game)).toBe(true);for(const answers of [[],[0,0,0,0],[0,0,0,0,3],[0,0,0,0,0.5]])expect(validEvent({...a.event,answers},game)).toBe(false);
 expect(validEvent({...a.event,protocol:undefined},game)).toBe(false);expect(validEvent({type:'start',sequence:0,eventId:'start',sessionId:'round'},game)).toBe(false);
});

test('a single perfect first completion awards 100',async()=>{await submitMummyCompletion(own(),item());expect((await getDoc(entry())).data()?.amount).toBe(100);});

test('legacy game protocol cannot create a mummy session',async()=>{
 await assertFails(setDoc(doc(own(),'gameSessions','legacy-bypass'),{uid,studentId:sid,gameId:game.gameId,version:game.version,status:'open',attempts:0,correct:0,lastEventId:'',createdAt:serverTimestamp()}));
});
test('first session and credit must be atomic; forged credit amount and missing ledger fail',async()=>{
 const db=own(),a=item(),s={protocol:'mummy-game/1',uid,studentId:sid,gameId:game.gameId,version:game.version,status:'completed',attempts:5,correct:5,score:100,answers:[0,0,0,0,0],correctByQuestion:[true,true,true,true,true],lastEventId:a.event.eventId,firstCompletion:true,rewardAmount:100,playedAt:a.event.playedAt,createdAt:serverTimestamp(),completedAt:serverTimestamp()};
 await assertFails(setDoc(doc(db,'gameSessions',a.event.sessionId),s));
 const batch=writeBatch(db);batch.set(doc(db,'gameSessions',a.event.sessionId),s);batch.set(entry(db),{kind:'gameReward',taskId:MUMMY_TASK,attemptId:a.event.sessionId,amount:999,score:100,progress:100,rule:mummyCreditRule(100),createdAt:serverTimestamp()});await assertFails(batch.commit());
 expect((await getDoc(entry())).exists()).toBe(false);
});
test('zero credit cannot be upgraded through the legacy teacher confirmation path',async()=>{
 await submitMummyCompletion(own(),item([1,1,1,1,1]));const teacher=env.authenticatedContext('teacher',{...claims,email:'kitlung1107@gmail.com'}).firestore();
 await assertFails(updateDoc(entry(teacher),{amount:100,score:100,createdAt:serverTimestamp()}));
});
