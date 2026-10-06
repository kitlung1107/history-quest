import {useEffect,useState} from 'react';
import {doc} from 'firebase/firestore';
import {db} from '@/lib/firebase';
import {subscribeRewardDocument} from '@/lib/rewardSubscriptions';
import {useOptionalStudentAccount} from '@/contexts/StudentAccount';
export default function RulesRewardStatus({taskId,sourceId,studentId}:{taskId:string;sourceId:string;studentId?:string}){
  const account=useOptionalStudentAccount();
  const sid=account?.teacher&&studentId?studentId:account?.studentId;
  const actor=JSON.stringify([account?.user.uid,sid,account?.profile?.className,account?.testingAccount]);
  const scope=JSON.stringify([actor,taskId,sourceId]);
  const [state,setState]=useState<{scope:string;earned?:number;status?:string;error?:boolean}>({scope:''});
  useEffect(()=>{
    setState({scope});if(!sid)return;
    let active=true,failed=false;
    const update=(patch:Partial<typeof state>)=>{if(active)setState(previous=>previous.scope===scope?{...previous,...patch}:previous);};
    const fail=()=>{failed=true;update({error:true,earned:undefined,status:undefined});};
    const stops=[
      subscribeRewardDocument(doc(db,'coinAccounts',sid,'entries',taskId),actor,s=>{if(!failed)update({earned:s.metadata.fromCache?undefined:Number(s.data()?.amount)||0});},fail),
      subscribeRewardDocument(doc(db,'submissions',sourceId),actor,s=>{if(!failed)update({status:s.metadata.fromCache?undefined:s.data()?.grade?.status??'verifying'});},fail),
    ];
    return()=>{active=false;stops.forEach(stop=>stop());};
  },[scope]);
  if(!sid||state.scope!==scope)return null;
  return <p className="my-3 text-sm leading-6" role="status" aria-live="polite">{state.error?'未能讀取探究幣狀態，請重新整理。':state.earned===undefined?'正在讀取探究幣狀態…':state.earned>0?`此任務已獲得 ${state.earned.toLocaleString('zh-HK')} 探究幣；不會重複發放。`:state.status==='pending'?'待老師確認短答分數；儲存完整總分後自動結算探究幣。':state.status==='graded'?'此任務沒有符合正數獎勵的條件。':'正在驗證答案；請保持分頁開啟，失敗時可用原提交重試。'}</p>;
}
