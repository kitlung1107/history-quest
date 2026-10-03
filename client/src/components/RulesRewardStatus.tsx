import {useEffect,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {db} from '@/lib/firebase';
import {useOptionalStudentAccount} from '@/contexts/StudentAccount';
export default function RulesRewardStatus({taskId,sourceId,studentId}:{taskId:string;sourceId:string;studentId?:string}){
  const account=useOptionalStudentAccount();const sid=account?.teacher&&studentId?studentId:account?.studentId;
  const [earned,setEarned]=useState<number|undefined>();const [status,setStatus]=useState('');const [error,setError]=useState(false);
  useEffect(()=>{setEarned(undefined);setStatus('');setError(false);if(!sid)return;
    const fail=()=>setError(true);const stops=[onSnapshot(doc(db,'coinAccounts',sid,'entries',taskId),s=>setEarned(Number(s.data()?.amount)||0),fail),onSnapshot(doc(db,'submissions',sourceId),s=>setStatus(s.data()?.grade?.status??'verifying'),fail)];return()=>stops.forEach(s=>s());
  },[sid,taskId,sourceId]);
  if(!sid)return null;
  return <p className="my-3 text-sm leading-6" role="status" aria-live="polite">{error?'未能讀取探索幣狀態，請重新整理。':earned===undefined?'正在讀取探索幣狀態…':earned>0?`此任務已獲得 ${earned.toLocaleString('zh-HK')} 探索幣；不會重複發放。`:status==='pending'?'待老師完成短答批改；儲存全部分數後自動結算探索幣。':status==='graded'?'本次沒有符合正數獎勵的條件。':'正在核驗答案；請保持分頁開啟，未完成的提交可續傳。'}</p>;
}
