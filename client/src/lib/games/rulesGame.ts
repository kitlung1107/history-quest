import {doc,getDocFromServer,runTransaction,serverTimestamp,type Firestore} from 'firebase/firestore';
import {auth,db} from '../firebase';
import {coinAward,type CoinRule} from '../coinModel';
import {isCorrect,type Question} from './model';
import type {QueuedEvent} from './store';

export const RULES_GAME='rules-game/1';
export type TrustedMaze={id:string;width:number;height:number;start:number;finish:number;files:number[];floors:number[];doors:number[];shortcuts:number[];chests:number[];towers:number[]};
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function gameRewardQuote(rule:CoinRule,correct:number,attempts:number){
  if(!Number.isInteger(attempts)||attempts<1||!Number.isInteger(correct)||correct<0||correct>attempts)throw Error('場次作答紀錄無效');
  const score=Math.round(100*correct/attempts),amount=coinAward(rule,score,100)??0;
  const value=rule.metric==='score'?score:100;
  const tier=rule.mode==='tiers'?[...rule.tiers].filter(t=>t.minimum<=value).sort((a,b)=>b.minimum-a.minimum)[0]:undefined;
  return {score,amount,tierIndex:tier?rule.tiers.indexOf(tier):-1};
}
// Every successful state transition is independently checked by Firestore Rules.
// The client calculates proposed state; it cannot invent geometry or certify itself.
export async function submitRulesGameEvent(item:QueuedEvent){
  if(auth.currentUser?.uid!==item.uid)throw Error('登入身分已變更');
  const e=item.event,sessionRef=doc(db,'gameSessions',e.sessionId),runRef=doc(db,'gameRuns',e.sessionId);
  await runTransaction(db,async tx=>{
    if(auth.currentUser?.uid!==item.uid)throw Error('登入身分已變更');
    const session=(await tx.get(sessionRef)).data(),run=(await tx.get(runRef)).data();
    if(e.type==='start'){
      if(session){if(session.uid!==item.uid||session.studentId!==item.studentId||session.gameId!==item.gameId||session.version!==item.version||session.mazeVersion!==e.mazeVersion||session.mapId!==e.mapId||session.protocol!==RULES_GAME||!run)throw Error('場次身分或迷宮不符');return;}
      const manifest=(await tx.get(doc(db,'gameRulesVersions',e.mazeVersion!))).data();
      const map=(await tx.get(doc(db,'gameRulesVersions',e.mazeVersion!,'layouts',e.mapId!))).data() as TrustedMaze;
      if(!manifest?.enabled||manifest.gameId!==item.gameId||manifest.version!==item.version||!map)throw Error('可信迷宮版本尚未就緒');
      const identity={uid:item.uid,studentId:item.studentId,gameId:item.gameId,version:item.version,protocol:RULES_GAME,mazeVersion:e.mazeVersion,mapId:e.mapId};
      tx.set(sessionRef,{...identity,status:'open',attempts:0,correct:0,lastEventId:'',createdAt:serverTimestamp()});
      tx.set(runRef,{...identity,status:'open',position:map.start,files:[false,false,false],opened:[],step:0,lastEventId:'',action:'start',createdAt:serverTimestamp()});return;
    }
    if(!session||!run||run.uid!==item.uid||run.studentId!==item.studentId||run.gameId!==item.gameId||run.version!==item.version||run.protocol!==RULES_GAME)throw Error('找不到相符的通關場次');
    if(e.type==='answer'){
      const answerRef=doc(sessionRef,'answers',e.eventId),saved=(await tx.get(answerRef)).data();
      if(saved){if(saved.questionId!==e.questionId||saved.sequence!==e.attempt||saved.runStep!==e.sequence||!same(saved.answer,e.answer)||!same(saved.target,e.target))throw Error('重送作答內容不一致');return;}
      if(run.status!=='open'||run.step+1!==e.sequence||session.attempts+1!==e.attempt||!e.target)throw Error('等待前一步同步');
      const q=(await tx.get(doc(db,'gameCatalog',item.gameId,'versions',item.version,'questions',e.questionId))).data() as Question;
      if(!q)throw Error('題庫版本未發布');
      const correct=isCorrect(q,e.answer),opens=correct&&['door','shortcut'].includes(e.target.kind);
      const opened=opens?[...run.opened,e.target.cell]:run.opened;
      tx.set(answerRef,{questionId:e.questionId,answer:e.answer,correct,sequence:e.attempt,target:e.target,runStep:e.sequence,createdAt:serverTimestamp()});
      tx.update(sessionRef,{attempts:e.attempt,correct:session.correct+Number(correct),lastEventId:e.eventId});
      tx.update(runRef,{step:e.sequence,lastEventId:e.eventId,opened,action:'answer'});return;
    }
    const eventRef=doc(runRef,'events',e.eventId),saved=(await tx.get(eventRef)).data();
    const payload=e.type==='route'?{type:'route',sequence:e.sequence,path:e.path}:{type:'end',sequence:e.sequence,outcome:e.outcome,attempts:e.attempts};
    if(saved){if(!same(saved,payload))throw Error('重送通關內容不一致');return;}
    if(run.status!=='open'||run.step+1!==e.sequence)throw Error('等待前一步通關狀態同步');
    if(e.type==='route'){
      const map=(await tx.get(doc(db,'gameRulesVersions',run.mazeVersion,'layouts',run.mapId))).data() as TrustedMaze;
      const files=map.files.map((cell,i)=>run.files[i]||e.path.includes(cell));
      tx.set(eventRef,payload);tx.update(runRef,{position:e.path.at(-1),files,step:e.sequence,lastEventId:e.eventId,action:'route'});return;
    }
    if(e.type!=='end'||session.attempts!==e.attempts)throw Error('場次作答同步尚未完成');
    tx.set(eventRef,payload);
    tx.update(sessionRef,{status:e.outcome,completedAt:serverTimestamp()});
    tx.update(runRef,{status:e.outcome==='completed'?'verified':'abandoned',step:e.sequence,lastEventId:e.eventId,action:'end',completedAt:serverTimestamp()});
  });
  if(e.type==='end'&&e.outcome==='completed')await settleRulesGame(db,e.sessionId);
}

export async function settleRulesGame(client:Firestore,sessionId:string){
  const source=(await getDocFromServer(doc(client,'gameSessions',sessionId))).data();
  if(!source||source.protocol!==RULES_GAME||source.status!=='completed')throw Error('尚未完成可核驗通關');
  const v=(await getDocFromServer(doc(client,'gameRulesVersions',source.mazeVersion))).data();
  if(typeof v?.taskId!=='string')throw Error('通關版本尚未就緒');
  const existing=(await getDocFromServer(doc(client,'coinAccounts',source.studentId,'entries',v.taskId))).data();
  if(typeof existing?.amount==='number'&&existing.amount>0)return{status:'already-awarded',amount:existing.amount};
  await prepareGameRewardQuote(client,sessionId);
  return runTransaction(client,async tx=>{
    const s=(await tx.get(doc(client,'gameSessions',sessionId))).data();
    const run=(await tx.get(doc(client,'gameRuns',sessionId))).data();
    if(!s||s.protocol!==RULES_GAME||s.status!=='completed'||run?.status!=='verified')throw Error('尚未完成可核驗通關');
    const manifest=(await tx.get(doc(client,'gameRulesVersions',s.mazeVersion))).data();
    const taskId=manifest?.taskId;if(typeof taskId!=='string')throw Error('通關版本沒有對應任務');
    const entryRef=doc(client,'coinAccounts',s.studentId,'entries',taskId),entry=(await tx.get(entryRef)).data();
    if(typeof entry?.amount==='number'&&entry.amount>0)return {status:'already-awarded',amount:entry.amount};
    if(entry?.amount!==undefined&&entry.amount!==0)throw Error('既有帳本無效，未改寫');
    const policy=(await tx.get(doc(client,'rewardPolicies',taskId))).data();
    const automation=(await tx.get(doc(client,'rewardAutomation','status'))).data();
    const rule=(await tx.get(doc(client,'coinRules',taskId))).data() as CoinRule|undefined;
    if(!rule||!manifest?.enabled||policy?.enabled!==true||policy.source!=='game'||automation?.enabled!==true)return {status:'inactive',amount:0};
    if(typeof automation.activatedAt?.toMillis!=='function'||typeof manifest.acceptFrom?.toMillis!=='function'||s.createdAt.toMillis()<automation.activatedAt.toMillis()||s.createdAt.toMillis()<manifest.acceptFrom.toMillis())return{status:'historical',amount:0};
    const q=gameRewardQuote(rule,s.correct,s.attempts);
    if(q.amount<=0)return{status:'not-qualified',amount:0};
    const checked=(await tx.get(doc(client,'gameRewardQuotes',sessionId))).data();
    if(!same(checked?.rule,rule)||checked?.checked!==(rule.mode==='tiers'?rule.tiers.length:0))throw Error('獎勵設定剛更新，請重試同一場次');
    tx.set(entryRef,{kind:'gameReward',taskId,attemptId:sessionId,amount:q.amount,score:q.score,progress:100,rule,tierIndex:q.tierIndex,createdAt:serverTimestamp()});
    return{status:'awarded',amount:q.amount};
  });
}

export async function prepareGameRewardQuote(client:Firestore,sessionId:string){
 const s=(await getDocFromServer(doc(client,'gameSessions',sessionId))).data()!;
 const v=(await getDocFromServer(doc(client,'gameRulesVersions',s.mazeVersion))).data()!;
 const rule=(await getDocFromServer(doc(client,'coinRules',v.taskId))).data() as CoinRule;
 const q=gameRewardQuote(rule,s.correct,s.attempts),ref=doc(client,'gameRewardQuotes',sessionId);
 await runTransaction(client,async tx=>{const old=(await tx.get(ref)).data();if(!same(old?.rule,rule)||old?.score!==q.score||old?.amount!==q.amount||old?.tierIndex!==q.tierIndex)tx.set(ref,{sessionId,rule,...q,checked:0});});
 const total=rule.mode==='tiers'?rule.tiers.length:0;
 for(let i=0;i<total;i++)await runTransaction(client,async tx=>{
   const current=(await tx.get(ref)).data()!;
   if(!same(current.rule,rule))throw Error('獎勵設定剛更新，請重試同一場次');
   if(current.checked<total)tx.update(ref,{checked:current.checked+1});
 });
 return q;
}
