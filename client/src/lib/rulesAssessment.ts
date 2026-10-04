import {doc,getDoc as firestoreGetDoc,getDocFromServer,runTransaction as firestoreRunTransaction,serverTimestamp,type Firestore} from 'firebase/firestore';
import {coinAward,defaultCoinRule,type CoinRule} from './coinModel.ts';
export type PublicQuestion={id:string;type:'choice'|'short';prompt:string;points:number;options?:string[];image?:string;imagePosition?:{x:number;y:number}};
export type PublicAssessment={taskId:string;version:string;title:string;questions:PublicQuestion[];questionCount:number;shortCount:number;totalPoints:number};
export type RawAnswer={question_id:string;value:number|string};
export type RulesGrade={status:'pending'|'graded';score:number|null;mcPoints:number;shortMarks:(number|null)[];revision:number;rewardAmount:number;tierIndex:number};
export type ProbeStats={accepted:number;rejected:number};
export type ClientAudit={documentReadCalls:number;transactionCalls:number;transactionAttempts:number;committedWrites:number;deniedTransactions:number};
const audits=new WeakMap<object,ClientAudit>();
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sameRule=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const emptyAudit=():ClientAudit=>({documentReadCalls:0,transactionCalls:0,transactionAttempts:0,committedWrites:0,deniedTransactions:0});
export function startAudit(db:Firestore){const audit=emptyAudit();audits.set(db,audit);audits.set((db as any)._delegate??db,audit);return audit;}
// Local measurement counts SDK calls, not billed/HTTP reads. Rules dependent
// reads, listeners, reconnects and transport RPCs are reported separately.
const getDoc:typeof firestoreGetDoc=async(ref:any)=>{
  const audit=audits.get(ref.firestore as object);if(audit)audit.documentReadCalls++;
  return firestoreGetDoc(ref) as any;
};
const runTransaction:typeof firestoreRunTransaction=async(db:any,callback:any,options?:any)=>{
  const audit=audits.get(db);if(audit)audit.transactionCalls++;
  let lastWrites=0;
  try{return await firestoreRunTransaction(db,async tx=>{
    lastWrites=0;if(audit)audit.transactionAttempts++;
    const proxy=new Proxy(tx,{get(target,key){
      const member=Reflect.get(target,key,target);
      if(key==='get')return(...args:any[])=>{if(audit)audit.documentReadCalls++;return member.apply(target,args);};
      if(['set','update','delete'].includes(String(key)))return(...args:any[])=>{lastWrites++;return member.apply(target,args);};
      return typeof member==='function'?member.bind(target):member;
    }});
    return callback(proxy);
  },options).then(result=>{if(audit)audit.committedWrites+=lastWrites;return result;});}
  catch(e){if(audit&&(e as {code?:string}).code==='permission-denied')audit.deniedTransactions++;throw e;}
};
// Demo transport is isolated; production needs an explicitly approved build.
export function requireLocal(db:Firestore){
  const delegate=(db as any)._delegate??db;
  const host=delegate._getSettings?.().host??delegate._settings?.host;
  const project=delegate.app.options.projectId;
  if(project?.startsWith('demo-rules-rewards')&&['127.0.0.1:8191','localhost:8191'].includes(host))return;
  if(['demo-browser-draw-preview','demo-browser-draw-tests','demo-teacher-sync-rewards'].includes(project)&&['127.0.0.1:8185','localhost:8185'].includes(host))return;
  if(import.meta.env?.VITE_RULES_ASSESSMENT_ENABLED==='1'&&project==='history-discovery-center'&&host==='firestore.googleapis.com')return;
  throw new Error('此評分傳輸尚未啟用；只容許本機 demo 或已批准的正式設定。');
}
function quote(rule:CoinRule,score:number|null){
  if(score===null)return{rewardAmount:0,tierIndex:-1};
  const rewardAmount=coinAward(rule,score,100)??0;
  const value=rule.metric==='score'?score:100;
  const winner=rule.mode==='tiers'?[...rule.tiers].filter(t=>t.minimum<=value).sort((a,b)=>b.minimum-a.minimum)[0]:undefined;
  return{rewardAmount,tierIndex:winner?rule.tiers.findIndex(t=>t.minimum===winner.minimum):-1};
}
export async function sealAnswers(db:Firestore,attemptId:string,studentId:string,meta:PublicAssessment,answers:RawAnswer[]){
  requireLocal(db);
  await runTransaction(db,async tx=>{
    const ref=doc(db,'submissions',attemptId),old=await tx.get(ref);
    if(old.exists()){
      const d=old.data();
      if(d.studentId!==studentId||d.taskId!==meta.taskId||d.version!==meta.version||JSON.stringify(d.answers)!==JSON.stringify(answers))
        throw new Error('提交 ID 已鎖定其他答案。');
      return;
    }
    tx.set(ref,{protocol:'rules-assessment/1',studentId,taskId:meta.taskId,version:meta.version,answers,createdAt:serverTimestamp()});
    tx.set(doc(db,'progress',studentId,'tasks',meta.taskId),{score:0,progress:100,attemptId,syncedAt:serverTimestamp()});
  });
}
export async function verifyMC(db:Firestore,attemptId:string,stats:ProbeStats={accepted:0,rejected:0}){
  requireLocal(db);
  const source=(await getDoc(doc(db,'submissions',attemptId))).data()!;
  const meta=(await getDoc(doc(db,'assessmentVersions',`${source.taskId}--${source.version}`))).data() as PublicAssessment;
  const aggregateRef=doc(db,'assessmentGrading',attemptId);
  await runTransaction(db,async tx=>{
    const existing=await tx.get(aggregateRef);if(existing.exists())return;
    tx.set(aggregateRef,{studentId:source.studentId,taskId:source.taskId,version:source.version,index:0,mcPoints:0});
  });
  for(;;){
    const current=(await getDoc(aggregateRef)).data()!;
    if(current.index===meta.questionCount)return stats;
    const index=current.index as number,q=meta.questions[index];
    const advance=async(awarded:number)=>runTransaction(db,async tx=>{
      const latest=(await tx.get(aggregateRef)).data()!;
      if(latest.index!==index)return false; // Another retry has already progressed.
      if(q.type==='choice')tx.set(doc(db,'assessmentMarks',attemptId,'items',String(index)),{index,awarded,createdAt:serverTimestamp()});
      tx.update(aggregateRef,{index:index+1,mcPoints:latest.mcPoints+awarded});
      return true;
    });
    if(q.type==='short'){await advance(0);continue;}
    // Rules are a boolean gate, not a computation endpoint. There are exactly
    // two possible awards for an immutable MC answer. Only one can be accepted.
    try{if(await advance(0))stats.accepted++;}
    catch(error){
      if((error as {code?:string}).code!=='permission-denied')throw error;
      stats.rejected++;
      if(await advance(q.points))stats.accepted++;
    }
  }
}
async function prepareRewardQuote(db:Firestore,attemptId:string,revision:number,score:number){
  const s=(await getDoc(doc(db,'submissions',attemptId))).data()!;
  const settings=await getDoc(doc(db,'coinRules',s.taskId)),rule=(settings.data()??defaultCoinRule) as CoinRule;
  const q=quote(rule,score),ref=doc(db,'assessmentRewardQuotes',`${attemptId}--${revision}`);
  try{await runTransaction(db,async tx=>{
    const existing=await tx.get(ref),old=existing.data();
    if(old&&sameRule(old.rule,rule)&&old.score===score&&old.amount===q.rewardAmount&&old.tierIndex===q.tierIndex)return;
    tx.set(ref,{attemptId,revision,score,amount:q.rewardAmount,tierIndex:q.tierIndex,rule,checked:0});
  });}catch(error){
    if((error as {code?:string}).code!=='permission-denied')throw error;
    const fresh=(await getDocFromServer(ref)).data();
    if(!fresh||fresh.attemptId!==attemptId||fresh.revision!==revision||fresh.score!==score||
      fresh.amount!==q.rewardAmount||fresh.tierIndex!==q.tierIndex||!sameRule(fresh.rule,rule))throw error;
  }
  if(rule.mode==='tiers')for(;;){
    if((await getDoc(ref)).data()!.checked===rule.tiers.length)break;
    let attempted:number|undefined;
    try{
      await runTransaction(db,async tx=>{
        const current=(await tx.get(ref)).data()!;
        if(current.checked===rule.tiers.length)return;
        attempted=current.checked;
        tx.update(ref,{checked:current.checked+1});
      });
    }catch(error){
      if((error as {code?:string}).code!=='permission-denied'||attempted===undefined)throw error;
      // A competing finalizer can advance this immutable proof before Rules
      // evaluate our checkpoint. Continue only when the server proves that race.
      const audit=audits.get(db as object);if(audit)audit.documentReadCalls++;
      const fresh=(await getDocFromServer(ref)).data();
      if(!fresh||fresh.checked<=attempted||fresh.attemptId!==attemptId||fresh.revision!==revision||
        fresh.score!==score||fresh.amount!==q.rewardAmount||fresh.tierIndex!==q.tierIndex||
        !sameRule(fresh.rule,rule))throw error;
    }
  }
}
async function commitGrade(db:Firestore,attemptId:string,edit?:{revision:number;shortMarks:(number|null)[]}){
  requireLocal(db);
  const current=(await getDoc(doc(db,'submissions',attemptId))).data()!;
  if(!edit&&current.grade)return current.grade as RulesGrade;
  if(edit&&current.grade?.revision===edit.revision+1&&JSON.stringify(current.grade.shortMarks)===JSON.stringify(edit.shortMarks))return current.grade as RulesGrade;
  const meta=(await getDoc(doc(db,'assessmentVersions',`${current.taskId}--${current.version}`))).data() as PublicAssessment;
  const aggregate=(await getDoc(doc(db,'assessmentGrading',attemptId))).data()!;
  const shorts=edit?(await getDoc(doc(db,'assessmentShortGrading',`${attemptId}--${edit.revision+1}`))).data():undefined;
  if(meta.shortCount===0||shorts?.markedCount===meta.shortCount){
    const score=Math.round(100*(aggregate.mcPoints+(shorts?.shortPoints??0))/meta.totalPoints);
    try{await prepareRewardQuote(db,attemptId,(current.grade?.revision??0)+1,score);}catch(error){if(error&&typeof error==='object')Object.assign(error,{assessmentStage:'prepareRewardQuote'});throw error;}
  }
  let attemptedGrade:RulesGrade|undefined;
  try{return await runTransaction(db,async tx=>{
    const ref=doc(db,'submissions',attemptId),s=(await tx.get(ref)).data()!;
    if(!edit&&s.grade)return s.grade as RulesGrade;
    if(edit&&s.grade?.revision===edit.revision+1&&JSON.stringify(s.grade.shortMarks)===JSON.stringify(edit.shortMarks))return s.grade as RulesGrade;
    if(edit&&s.grade?.revision!==edit.revision)throw new Error('批改版本已更新，請重新讀取。');
    const meta=(await tx.get(doc(db,'assessmentVersions',`${s.taskId}--${s.version}`))).data() as PublicAssessment;
    const aggregate=(await tx.get(doc(db,'assessmentGrading',attemptId))).data()!;
    if(aggregate.index!==meta.questionCount)throw new Error('MC 核驗尚未完成。');
    const settings=await tx.get(doc(db,'coinRules',s.taskId));
    const rule=(settings.data()??defaultCoinRule) as CoinRule;
    const entryRef=doc(db,'coinAccounts',s.studentId,'entries',s.taskId),entry=await tx.get(entryRef);
    const automation=(await tx.get(doc(db,'rewardAutomation','status'))).data();
    const rewardActive=automation?.enabled===true&&typeof automation.activatedAt?.toMillis==='function'&&s.createdAt.toMillis()>=automation.activatedAt.toMillis();
    const progressRef=doc(db,'progress',s.studentId,'tasks',s.taskId),progress=await tx.get(progressRef);
    const shortMarks=edit?.shortMarks??meta.questions.map(()=>null);
    if(shortMarks.length!==meta.questionCount)throw new Error('批改題數不符。');
    const complete=meta.questions.every((q,i)=>q.type==='choice'||shortMarks[i]!==null);
    const verifiedShort=edit?(await tx.get(doc(db,'assessmentShortGrading',`${attemptId}--${edit.revision+1}`))).data():undefined;
    const shortTotal=edit?verifiedShort!.shortPoints:0;
    const score=complete?Math.round(100*(aggregate.mcPoints+shortTotal)/meta.totalPoints):null;
    if(score!==null){const checked=(await tx.get(doc(db,'assessmentRewardQuotes',`${attemptId}--${(s.grade?.revision??0)+1}`))).data();
      if(!sameRule(checked?.rule,rule))throw new Error('獎勵設定剛更新，請重試同一提交。');}
    const grade:RulesGrade={status:complete?'graded':'pending',score,mcPoints:aggregate.mcPoints,shortMarks,revision:(s.grade?.revision??0)+1,...quote(rule,score)};
    attemptedGrade=grade;
    tx.update(ref,{grade});
    if(rewardActive&&grade.rewardAmount>0&&(!entry.exists()||entry.data().amount===0))tx.set(entryRef,{
      kind:'taskReward',taskId:s.taskId,attemptId,amount:grade.rewardAmount,score,progress:100,
      rule,createdAt:serverTimestamp(),tierIndex:grade.tierIndex,
    });
    if(progress.data()?.attemptId===attemptId)tx.update(progressRef,{score:score??0,syncedAt:serverTimestamp()});
    return grade;
  });}catch(error){
    if((error as {code?:string}).code!=='permission-denied'||!attemptedGrade)throw error;
    const audit=audits.get(db as object);if(audit)audit.documentReadCalls++;
    const saved=(await getDocFromServer(doc(db,'submissions',attemptId))).data()?.grade as RulesGrade|undefined;
    // The atomic grade/ledger may already have committed in another finalizer.
    // An unchanged, missing or different grade never turns a denial into success.
    if(!saved||(['status','score','mcPoints','revision','rewardAmount','tierIndex'] as const)
      .some(key=>saved[key]!==attemptedGrade![key])||JSON.stringify(saved.shortMarks)!==JSON.stringify(attemptedGrade.shortMarks))throw error;
    return saved;
  }
}
async function grantFeedback(db:Firestore,attemptId:string){
  const s=(await getDoc(doc(db,'submissions',attemptId))).data()!;
  if(s.protocol!=='rules-assessment/1')return;
  const meta=(await getDoc(doc(db,'assessmentVersions',`${s.taskId}--${s.version}`))).data()!;
  if(s.createdAt.toMillis()<meta.acceptFrom.toMillis())return;
  const ref=doc(db,'assessmentFeedbackAccess',s.studentId,'versions',`${s.taskId}--${s.version}`);
  try{await runTransaction(db,async tx=>{
    const existing=await tx.get(ref);if(existing.data()?.attemptId===attemptId)return;
    tx.set(ref,{attemptId,studentId:s.studentId,taskId:s.taskId,version:s.version});
  });}catch(error){
    if((error as {code?:string}).code!=='permission-denied')throw error;
    const saved=(await getDocFromServer(ref)).data();
    if(!saved||saved.attemptId!==attemptId||saved.studentId!==s.studentId||saved.taskId!==s.taskId||saved.version!==s.version)throw error;
  }
}
export async function finishAssessment(db:Firestore,attemptId:string){
  let grade:RulesGrade;
  try{grade=await commitGrade(db,attemptId);}catch(error){
    if((error as {code?:string}).code!=='permission-denied')throw error;
    // A peer may finish this sealed MC attempt while our proof transaction is
    // being evaluated. Return only a complete server-validated first grade;
    // pending/short/different revisions never turn a denial into success.
    const saved=(await getDocFromServer(doc(db,'submissions',attemptId))).data();
    if(!saved||saved.protocol!=='rules-assessment/1'||saved.grade?.status!=='graded'||saved.grade.revision!==1)throw error;
    const meta=(await getDocFromServer(doc(db,'assessmentVersions',`${saved.taskId}--${saved.version}`))).data();
    if(!meta||meta.shortCount!==0||saved.grade.shortMarks.length!==meta.questionCount||saved.grade.shortMarks.some((m:any)=>m!==null))throw error;
    grade=saved.grade;
  }
  try{await grantFeedback(db,attemptId);}catch(error){if(error&&typeof error==='object')Object.assign(error,{assessmentStage:'grantFeedback'});throw error;}return grade;
}
export async function saveShortGrade(db:Firestore,attemptId:string,revision:number,shortMarks:(number|null)[]){
  requireLocal(db);
  const id=`${attemptId}--${revision+1}`,draftRef=doc(db,'assessmentShortDrafts',id),aggregateRef=doc(db,'assessmentShortGrading',id);
  const s=(await getDoc(doc(db,'submissions',attemptId))).data()!;
  const meta=(await getDoc(doc(db,'assessmentVersions',`${s.taskId}--${s.version}`))).data() as PublicAssessment;
  if(s.grade?.revision===revision+1&&JSON.stringify(s.grade.shortMarks)===JSON.stringify(shortMarks)){await grantFeedback(db,attemptId);return s.grade as RulesGrade;}
  if(s.grade?.revision!==revision)throw new Error('批改版本已更新，請重新讀取。');
  if(shortMarks.length!==meta.questionCount||meta.questions.some((q,i)=>q.type==='choice'?shortMarks[i]!==null
    :shortMarks[i]!==null&&(!Number.isFinite(shortMarks[i])||shortMarks[i]!<0||shortMarks[i]!>q.points)))
    throw new Error('短答配分無效；批改未鎖定，請修正。');
  await runTransaction(db,async tx=>{
    const existing=await tx.get(draftRef);
    if(existing.exists()){
      if(JSON.stringify(existing.data().marks)!==JSON.stringify(shortMarks))throw new Error('這個批改版本已鎖定；請先重試原有批改。');
      return;
    }
    tx.set(draftRef,{attemptId,revision:revision+1,marks:shortMarks,createdAt:serverTimestamp()});
  });
  await runTransaction(db,async tx=>{if((await tx.get(aggregateRef)).exists())return;tx.set(aggregateRef,{index:0,shortPoints:0,markedCount:0});});
  for(;;){
    const aggregate=(await getDoc(aggregateRef)).data()!;if(aggregate.index===meta.questionCount)break;
    await runTransaction(db,async tx=>{
      const current=(await tx.get(aggregateRef)).data()!;if(current.index===meta.questionCount)return;
      const i=current.index,mark=shortMarks[i];
      tx.update(aggregateRef,{index:i+1,shortPoints:current.shortPoints+(mark??0),markedCount:current.markedCount+(meta.questions[i].type==='short'&&mark!==null?1:0)});
    });
  }
  const grade=await commitGrade(db,attemptId,{revision,shortMarks});await grantFeedback(db,attemptId);return grade;
}
export async function submitAndSettle(db:Firestore,attemptId:string,studentId:string,meta:PublicAssessment,answers:RawAnswer[],stats?:ProbeStats){
  await sealAnswers(db,attemptId,studentId,meta,answers);
  await verifyMC(db,attemptId,stats);
  return finishAssessment(db,attemptId);
}
