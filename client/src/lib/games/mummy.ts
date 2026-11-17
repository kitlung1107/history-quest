import {doc,getDocFromServer,runTransaction,serverTimestamp,type Firestore} from 'firebase/firestore';
import type {QueuedEvent} from './store';

export const MUMMY_PROTOCOL='mummy-game/1';
export const MUMMY_TASK='S1_Mummy_Workshop';
export const mummyCreditRule=(score:number)=>({mode:'fixed',amount:score,metric:'score',tiers:[]});
export function validMummyAnswers(a:unknown):a is number[]{return Array.isArray(a)&&a.length===5&&a.every(n=>Number.isInteger(n)&&n>=0&&n<=2);}
export async function submitMummyCompletion(client:Firestore,item:QueuedEvent){
  const e=item.event;
  if(e.type!=='complete'||e.protocol!==MUMMY_PROTOCOL||item.gameId!=='mummy-workshop'||!validMummyAnswers(e.answers))throw Error('木乃伊答案無效');
  const sessionRef=doc(client,'gameSessions',e.sessionId),entryRef=doc(client,'coinAccounts',item.studentId,'entries',MUMMY_TASK);
  const commit=()=>runTransaction(client,async tx=>{
    const [saved,entry,manifest]=await Promise.all([tx.get(sessionRef),tx.get(entryRef),tx.get(doc(client,'gameCatalog',item.gameId,'versions',item.version))]);
    if(saved.exists()){
      const s=saved.data();
      if(s.uid!==item.uid||s.studentId!==item.studentId||s.gameId!==item.gameId||s.version!==item.version||s.lastEventId!==e.eventId||JSON.stringify(s.answers)!==JSON.stringify(e.answers))throw Error('重送場次內容不一致');
      return;
    }
    const m=manifest.data();
    if(m?.protocol!==MUMMY_PROTOCOL||!m.enabled||m.taskId!==MUMMY_TASK||!validMummyAnswers(m.answerKey))throw Error('木乃伊題庫版本尚未啟用');
    const correctByQuestion=e.answers.map((a,i)=>a===m.answerKey[i]),correct=correctByQuestion.filter(Boolean).length,score=correct*20;
    const firstCompletion=!entry.exists();
    tx.set(sessionRef,{protocol:MUMMY_PROTOCOL,uid:item.uid,studentId:item.studentId,gameId:item.gameId,version:item.version,status:'completed',attempts:5,correct,score,answers:e.answers,correctByQuestion,lastEventId:e.eventId,firstCompletion,rewardAmount:firstCompletion?score:0,playedAt:e.playedAt,createdAt:serverTimestamp(),completedAt:serverTimestamp()});
    // A zero entry deliberately consumes the first completion too. Never upgrade it.
    if(firstCompletion)tx.set(entryRef,{kind:'gameReward',taskId:MUMMY_TASK,attemptId:e.sessionId,amount:score,score,progress:100,rule:mummyCreditRule(score),createdAt:serverTimestamp()});
  });
  for(let retry=0;;retry++){
    try{return await commit();}catch(error){
      if(retry>=2||(error as {code?:string}).code!=='permission-denied')throw error;
      // Another tab may have consumed the first credit between evaluation and commit.
      // Only retry after a fresh server read proves a completion/credit now exists.
      const [saved,claimed]=await Promise.all([getDocFromServer(sessionRef),getDocFromServer(entryRef)]);
      if(!saved.exists()&&!claimed.exists())throw error;
    }
  }
}
