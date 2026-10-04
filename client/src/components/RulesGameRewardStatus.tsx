import {useEffect,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {db} from '@/lib/firebase';
import {useOptionalStudentAccount} from '@/contexts/StudentAccount';
import {RULES_GAME,settleRulesGame} from '@/lib/games/rulesGame';

export default function RulesGameRewardStatus({taskId,sourceId,studentId}:{taskId:string;sourceId:string;studentId?:string}){
  const account=useOptionalStudentAccount(),sid=account?.teacher&&studentId?studentId:account?.studentId;
  const scope=`${sid}:${taskId}:${sourceId}`;
  const [state,setState]=useState<{scope:string;earned?:number;source?:any;run?:any;policy?:any;automation?:any;error?:boolean}>({scope:''});
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{
    setState({scope});setNotice('');if(!sid)return;
    let live=true;
    const watch=(path:string[],field:string)=>onSnapshot(doc(db,...path as [string,...string[]]),{includeMetadataChanges:true},snapshot=>{
      if(live)setState(s=>s.scope===scope?{...s,[field]:!snapshot.metadata.fromCache?(field==='earned'?Number(snapshot.data()?.amount)||0:snapshot.data()):undefined}:s);
    },()=>{if(live)setState(s=>({...s,error:true}));});
    const stops=[watch(['coinAccounts',sid,'entries',taskId],'earned'),watch(['gameSessions',sourceId],'source'),watch(['gameRuns',sourceId],'run'),watch(['rewardPolicies',taskId],'policy'),watch(['rewardAutomation','status'],'automation')];
    return()=>{live=false;stops.forEach(stop=>stop());};
  },[scope]);
  const current=state.scope===scope?state:undefined,source=current?.source;
  const active=current?.policy?.enabled===true&&current.policy.source==='game'&&current.automation?.enabled===true;
  const historical=typeof source?.createdAt?.toMillis==='function'&&typeof current?.automation?.activatedAt?.toMillis==='function'&&source.createdAt.toMillis()<current.automation.activatedAt.toMillis();
  const mine=source?.uid===account?.user.uid;
  async function retry(){setBusy(true);setNotice('');try{const result=await settleRulesGame(db,sourceId);setNotice(result.status==='historical'?'這是啟用前的場次，未自動補派。':result.status==='not-qualified'?'本次沒有符合正數獎勵的條件。':result.status==='inactive'?'此遊戲獎勵尚未啟用。':'已核對獎勵；同一任務不會重複發放。');}catch{setNotice('核算暫未成功，請檢查連線後重試；不會重複領取。');}finally{setBusy(false);}}
  useEffect(()=>{if(mine&&active&&!historical&&!current?.error&&!current?.earned&&source?.protocol===RULES_GAME&&current?.run?.status==='verified')void retry();},[scope,mine,active,historical,current?.run?.status,current?.earned]);
  if(!current||!sid)return null;
  const message=current.earned?`此任務已獲得 ${current.earned.toLocaleString('zh-HK')} 探索幣；不會重複發放。`:current.error?'未能讀取獎勵狀態，請檢查連線。':!source?'正在核對場次…':source.protocol!==RULES_GAME?'這是舊版場次，未自動補派探索幣。':historical?'這是啟用前的場次，未自動補派探索幣。':!active?'此遊戲獎勵尚未啟用。':current.run?.status!=='verified'?'通關驗證尚未完成，暫未發放探索幣。':'正在核對通關獎勵，完成後會更新。';
  return <div className="my-3 text-sm leading-6" role="status" aria-live="polite"><p>{message}</p>{mine&&active&&!historical&&!current.earned&&source?.protocol===RULES_GAME&&current.run?.status==='verified'&&<button type="button" className="underline underline-offset-4" disabled={busy} onClick={()=>void retry()}>{busy?'核算中…':'重試獎勵核算'}</button>}{notice&&<p>{notice}</p>}</div>;
}
