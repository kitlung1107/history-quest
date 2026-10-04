import {beforeAll,afterAll,beforeEach,test,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,writeBatch,serverTimestamp,Timestamp,type Firestore} from 'firebase/firestore';
const state=vi.hoisted(()=>({db:null as any,auth:{currentUser:{uid:'student-one'}}}));
vi.mock('../../client/src/lib/firebase',()=>({get db(){return state.db;},auth:state.auth}));
import {submitRulesGameEvent,settleRulesGame,gameRewardQuote} from '../../client/src/lib/games/rulesGame';
import type {GameEvent} from '../../client/src/lib/games/model';
const release=JSON.parse(readFileSync('integration/games/trusted-mazes.json','utf8')),maze=release.layouts[0];
const taskId='S5_ColdWar_Maze',sid='s1',uid='student-one',projectId='demo-cold-war-rules';
const fixed={mode:'fixed',amount:100,metric:'progress',tiers:[]} as const;
let env:RulesTestEnvironment;
const claims=(email:string)=>({email,email_verified:true,firebase:{sign_in_provider:'google.com'}});
const own=(id=uid,email='student-one@example.test')=>env.authenticatedContext(id,claims(email)).firestore();
beforeAll(async()=>{env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8191,rules:readFileSync('integration/assessment/compatible.rules','utf8')}});});
afterAll(async()=>{await env?.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();state.db=own();state.auth.currentUser.uid=uid;
 await env.withSecurityRulesDisabled(async context=>{
  const b=writeBatch(context.firestore());
  for(const [email,studentId]of [['student-one@example.test',sid],['student-two@example.test','s2']]){b.set(doc(context.firestore(),'access',email),{studentId,enabled:true});b.set(doc(context.firestore(),'profiles',studentId),{className:'S5'});}
  b.set(doc(context.firestore(),'taskAccess',taskId),{grade:5,enabled:true});
  b.set(doc(context.firestore(),'coinRules',taskId),fixed);
  b.set(doc(context.firestore(),'rewardPolicies',taskId),{source:'game',enabled:true});
  b.set(doc(context.firestore(),'rewardAutomation','status'),{enabled:true,activatedAt:Timestamp.fromMillis(1)});
  b.set(doc(context.firestore(),'gameCatalog',release.gameId,'versions',release.questionVersion),{enabled:true,taskId,questionCount:400});
  b.set(doc(context.firestore(),'gameCatalog',release.gameId,'versions',release.questionVersion,'questions','1'),{validator:'index-array/1',answer:[1],maxIndex:[3],distinct:false});
  b.set(doc(context.firestore(),'gameRulesVersions',release.mazeVersion),{protocol:release.protocol,gameId:release.gameId,version:release.questionVersion,taskId,enabled:true,acceptFrom:Timestamp.fromMillis(1),mazeCount:128});
  b.set(doc(context.firestore(),'gameRulesVersions',release.mazeVersion,'layouts',maze.id),maze);
  await b.commit();
 });
});
const entryRef=(client=state.db)=>doc(client,'coinAccounts',sid,'entries',taskId);
async function admin(path:string,data:any){await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),path),data));}
function route(from:number,to:number){const parents=new Map([[from,from]]),queue=[from],floor=new Set<number>(maze.floors);for(let i=0;i<queue.length&&!parents.has(to);i++){const p=queue[i];for(const n of [p-21,p+1,p+21,p-1])if(floor.has(n)&&Math.abs(p%21-n%21)+Math.abs(Math.floor(p/21)-Math.floor(n/21))===1&&!parents.has(n)){parents.set(n,p);queue.push(n);}}const out=[to];while(out.at(-1)!==from)out.push(parents.get(out.at(-1)!)!);return out.reverse().slice(1);}
function round(id='round-'+crypto.randomUUID()){
 let step=0,attempt=0,position=maze.start;const opened=new Set<number>();
 const item=(event:GameEvent)=>({uid,studentId:sid,gameId:release.gameId,version:release.questionVersion,event});
 async function send(data:any){const event={protocol:release.protocol,eventId:crypto.randomUUID(),sessionId:id,...data};try{await submitRulesGameEvent(item(event));}catch(error){if(error instanceof Error)error.message='stage '+JSON.stringify({type:data.type,sequence:data.sequence,path:data.path,target:data.target})+' '+error.message;throw error;}step=data.sequence;if(data.type==='answer'){attempt=data.attempt;if(data.answer[0]===1&&['door','shortcut'].includes(data.target.kind))opened.add(data.target.cell);}}
 async function move(path:number[]){await send({type:'route',path,sequence:step+1});position=path.at(-1)!;}
 async function answer(cell:number,correct=true,kind='door'){await send({type:'answer',questionId:'1',answer:[correct?1:0],target:{kind,cell},attempt:attempt+1,sequence:step+1});}
 async function walk(to:number){let path:number[]=[];for(const cell of route(position,to)){if(maze.doors.includes(cell)&&!opened.has(cell)){if(path.length){await move(path);path=[];}await answer(cell);}path.push(cell);if(path.length===2){await move(path);path=[];}}if(path.length)await move(path);}
 return {id,start:()=>send({type:'start',sequence:0,mapId:maze.id,mazeVersion:release.mazeVersion}),move,answer,walk,end:(outcome='completed')=>send({type:'end',outcome,attempts:attempt,sequence:step+1}),async finish(){await this.start();for(const file of maze.files)await walk(file);await walk(maze.finish);await this.end();},get position(){return position;},get step(){return step;},get attempt(){return attempt;}};
}
test('valid checked route collects three distinct files and exits; automatic award uses the original task ledger key',async()=>{
 const r=round();await r.finish();const run=(await getDoc(doc(state.db,'gameRuns',r.id))).data();
 expect(run?.status).toBe('verified');expect(run?.files).toEqual([true,true,true]);expect(run?.position).toBe(maze.finish);
 const entry=(await getDoc(entryRef())).data();expect(entry?.amount).toBe(100);expect(entry?.kind).toBe('gameReward');expect(entry?.attemptId).toBe(r.id);expect(entry?.rule).toEqual(fixed);
 await assertFails(updateDoc(doc(state.db,'gameRuns',r.id),{position:maze.start}));
});
test('teleport, walls, invented files, invented open doors and a browser completion flag are rejected',async()=>{
 const r=round();await r.start();await assertFails(r.move([maze.finish]));
 await assertFails(updateDoc(doc(state.db,'gameRuns',r.id),{files:[true,true,true],step:1,lastEventId:'forge'}));
 await assertFails(updateDoc(doc(state.db,'gameRuns',r.id),{opened:maze.doors,step:1,lastEventId:'forge'}));
 await assertFails(updateDoc(doc(state.db,'gameSessions',r.id),{status:'completed',completedAt:serverTimestamp()}));
 await assertFails(r.end());expect((await getDoc(entryRef())).exists()).toBe(false);
 await expect(settleRulesGame(state.db,r.id)).rejects.toThrow('尚未完成');
});
test('a wrong answer leaves a door closed; the immutable answer must target the adjacent published door',async()=>{
 const r=round();await r.start();const door=route(maze.start,maze.files[0]).find(p=>maze.doors.includes(p))!;
 const before=route(maze.start,door).slice(0,-1);for(let i=0;i<before.length;i+=2)await r.move(before.slice(i,i+2));
 await r.answer(door,false);await assertFails(r.move([door]));await r.answer(door,true);await r.move([door]);
 await assertFails(r.answer(maze.finish,true));
 const b=writeBatch(state.db),event='forged-answer';const s=(await getDoc(doc(state.db,'gameSessions',r.id))).data()!;
 b.set(doc(state.db,'gameSessions',r.id,'answers',event),{questionId:'1',answer:[0],correct:true,sequence:s.attempts+1,runStep:r.step+1,target:{kind:'door',cell:door},createdAt:serverTimestamp()});
 b.update(doc(state.db,'gameSessions',r.id),{attempts:s.attempts+1,correct:s.correct+1,lastEventId:event});
 b.update(doc(state.db,'gameRuns',r.id),{opened:[door],step:r.step+1,lastEventId:event});await assertFails(b.commit());
});
test('reaching the exit without all three files cannot certify completion',async()=>{
 const r=round();await r.start();await r.walk(maze.finish);expect((await getDoc(doc(state.db,'gameRuns',r.id))).data()?.files).not.toEqual([true,true,true]);await assertFails(r.end());
});
test('two verified rounds and parallel retries mint exactly one positive entry',async()=>{
 await admin('rewardPolicies/'+taskId,{source:'game',enabled:false});const a=round(),b=round();await a.finish();await b.finish();expect((await getDoc(entryRef())).exists()).toBe(false);
 await admin('rewardPolicies/'+taskId,{source:'game',enabled:true});const results=await Promise.all(Array.from({length:12},(_,i)=>settleRulesGame(state.db,i%2?a.id:b.id)));
 const entry=(await getDoc(entryRef())).data()!;expect(entry.amount).toBe(100);expect([a.id,b.id]).toContain(entry.attemptId);expect(results.filter(r=>r.status==='awarded')).toHaveLength(1);
 const original=JSON.stringify(entry);await Promise.all([settleRulesGame(state.db,a.id),settleRulesGame(state.db,b.id)]);expect(JSON.stringify((await getDoc(entryRef())).data())).toBe(original);
});
test('previous real-style 100 credit is preserved; a legacy zero may receive its first valid positive reward',async()=>{
 const previous={kind:'gameReward',taskId,attemptId:'old-real-style-source',amount:100,score:94,progress:100,rule:fixed,createdAt:Timestamp.fromMillis(100)};
 await admin('coinAccounts/'+sid+'/entries/'+taskId,previous);const r=round();await r.finish();expect((await getDoc(entryRef())).data()).toEqual(previous);
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'coinAccounts',sid,'entries',taskId),{amount:0}));await settleRulesGame(state.db,r.id);expect((await getDoc(entryRef())).data()?.amount).toBe(100);
});
test('policy off, cutoff and disabled trusted version do not award; old browser-only sessions are not a new proof',async()=>{
 await admin('rewardAutomation/status',{enabled:true,activatedAt:Timestamp.fromMillis(Date.now()+86400000)});const r=round();await r.finish();expect((await getDoc(entryRef())).exists()).toBe(false);
 await admin('gameSessions/legacy',{uid,studentId:sid,gameId:release.gameId,version:release.questionVersion,status:'completed',attempts:1,correct:1,createdAt:Timestamp.now()});
 await expect(settleRulesGame(state.db,'legacy')).rejects.toThrow('尚未完成');
 const teacher=env.authenticatedContext('teacher',claims('kitlung1107@gmail.com')).firestore();await updateDoc(doc(teacher,'gameRulesVersions',release.mazeVersion),{enabled:false});await expect(round().start()).rejects.toThrow('可信迷宮版本尚未就緒');
});
test('another student cannot reuse a run or claim it; published geometry and identity cannot be changed by players',async()=>{
 const r=round();await r.start();const other=own('student-two','student-two@example.test');
 await assertFails(getDoc(doc(other,'gameRuns',r.id)));await assertFails(settleRulesGame(other,r.id));
 await assertFails(updateDoc(doc(state.db,'gameRuns',r.id),{studentId:'s2',step:1,lastEventId:'fake'}));
 await assertFails(updateDoc(doc(state.db,'gameRulesVersions',release.mazeVersion,'layouts',maze.id),{files:[maze.start,maze.start,maze.start]}));
 await assertFails(setDoc(doc(state.db,'gameRulesVersions','01234567890123456789012345678901'),{enabled:true}));
 await assertFails(setDoc(doc(state.db,'coinAccounts',sid,'entries',taskId),{kind:'gameReward',taskId,attemptId:r.id,amount:100,score:100,progress:100,rule:fixed,tierIndex:-1,createdAt:serverTimestamp()}));
});
test('amount and score tampering are denied; the actual highest eligible CMS tier is used',async()=>{
 await admin('rewardPolicies/'+taskId,{source:'game',enabled:false});const r=round();await r.finish();await admin('rewardPolicies/'+taskId,{source:'game',enabled:true});
 const payload={kind:'gameReward',taskId,attemptId:r.id,amount:101,score:100,progress:100,rule:fixed,tierIndex:-1,createdAt:serverTimestamp()};await assertFails(setDoc(entryRef(),payload));
 await assertFails(setDoc(entryRef(),{...payload,amount:100,score:99}));
 const tiers={mode:'tiers',amount:0,metric:'progress',tiers:[{minimum:90,amount:87},{minimum:0,amount:10},{minimum:70,amount:69}]};await admin('coinRules/'+taskId,tiers);
 await assertFails(setDoc(entryRef(),{...payload,amount:10,rule:tiers,tierIndex:1}));
 await settleRulesGame(state.db,r.id);expect((await getDoc(entryRef())).data()?.amount).toBe(87);
});
test('all 20 CMS reward tiers remain supported without choosing a lower eligible threshold',async()=>{
 await admin('rewardPolicies/'+taskId,{source:'game',enabled:false});const r=round();await r.finish();
 const tiers={mode:'tiers',amount:0,metric:'progress',tiers:Array.from({length:20},(_,i)=>({minimum:i*5,amount:i===19?100:i+1}))};await admin('coinRules/'+taskId,tiers);await admin('rewardPolicies/'+taskId,{source:'game',enabled:true});
 await settleRulesGame(state.db,r.id);expect((await getDoc(entryRef())).data()?.amount).toBe(100);
});
