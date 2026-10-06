import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { submissionErrorMessage,isQuotaError } from "@/lib/submissionError";
import {db} from '@/lib/firebase';
import {requireAssessmentEnabled} from '@/lib/assessmentSession';
import { canPlayGrade } from "@/lib/gradeAccess";
import { toast } from "sonner";
import { HISTORY_TASKS, type HistoryTask, type TaskProgress } from "@/lib/historyQuest";
import { getQuestions, taskAssessmentVersion, validatePublicAnswers, type Answer } from "@/lib/assessment";
import { loadCloudProgress, submitCloud } from "@/lib/cloudStore";
import { useOptionalStudentAccount } from "./StudentAccount";
type Pending={id:string;taskId:string;version:string;answers:Answer[];protocol?:'rules-assessment/1';uploaded?:boolean};
type Value={progress:TaskProgress;completeTask:(task:HistoryTask,answers:Answer[])=>Promise<Pending>;syncing:boolean;syncError:string;retry:()=>Promise<void>};
const Context=createContext<Value|null>(null);
export function ScoreSyncProvider({children}:{children:React.ReactNode}) {
  const account=useOptionalStudentAccount();
  const sid=account?.studentId;
  const key=`hdc.pending.v2.${db.app.options.projectId}.${account?.user.uid??'signed-out'}.${sid??'preview'}`;
  // Move existing production attempts once; demo data never shares this namespace.
  if(sid&&db.app.options.projectId==='history-discovery-center')try{
    const legacy=`hdc.pending.${sid}`,saved=sessionStorage.getItem(legacy);
    if(saved&&!sessionStorage.getItem(key)){sessionStorage.setItem(key,saved);sessionStorage.removeItem(legacy);}
  }catch{/* Storage failure is reported when saving an attempt. */}
  const read=():Pending[]=>{try{return JSON.parse(sessionStorage.getItem(key)||"[]");}catch{return [];}};
  const [progress,setProgress]=useState<TaskProgress>({});
  const [syncing,setSyncing]=useState(false);
  const [syncError,setError]=useState("");
  const active=useRef(new Set<string>());
  const scope=useRef(key);scope.current=key;
  const lastKey=useRef(key);
  const quotaBlocked=useRef(false);
  const failure=useRef("");
  const retry=useCallback(async()=>{
    if(!sid || active.current.has(key)) return;
    active.current.add(key); setSyncing(true); setError("");failure.current='';quotaBlocked.current=false;
    try {
      for(const pending of read()) {
        if(scope.current!==key)return;
        try{await submitCloud(sid,pending.id,pending.taskId,pending.version,pending.answers,pending.protocol);}catch(error){
          if(scope.current===key&&(error as {submissionUploaded?:boolean})?.submissionUploaded)
            sessionStorage.setItem(key,JSON.stringify(read().map(p=>p.id===pending.id?{...p,uploaded:true}:p)));
          throw error;
        }
        if(scope.current!==key)return;
        sessionStorage.setItem(key,JSON.stringify(read().filter(p=>p.id!==pending.id)));
      }
      const progress=await loadCloudProgress(sid);if(scope.current===key)setProgress(progress);
    } catch(e) {if(scope.current===key){quotaBlocked.current=isQuotaError(e);const uploaded=read().some(p=>p.uploaded);failure.current=(uploaded?'答案已上載，待核算。':'答案未確認上載。')+submissionErrorMessage(e);setError(failure.current);} }
    finally{active.current.delete(key);if(scope.current===key)setSyncing(false);}
  },[sid,key]);
  useEffect(()=>{if(lastKey.current!==key){sessionStorage.removeItem(lastKey.current);lastKey.current=key;}setProgress({});quotaBlocked.current=false;void retry();const online=()=>{if(!quotaBlocked.current)void retry();};window.addEventListener("online",online);return()=>window.removeEventListener("online",online);},[retry,key]);
  async function completeTask(task:HistoryTask,answers:Answer[]) {
    if(!sid) throw new Error("請先登入。");
    if(task.assessmentVersion)requireAssessmentEnabled();
    if (!canPlayGrade(account, task.grade)) throw new Error("此年級尚未開放。");
    validatePublicAnswers(getQuestions(task),answers);
    const duplicate=read().find(p=>p.taskId===task.id);
    const pending=duplicate || {id:crypto.randomUUID(),taskId:task.id,version:taskAssessmentVersion(task),answers,...(task.assessmentVersion?{protocol:'rules-assessment/1' as const}:{})};
    if(!duplicate) sessionStorage.setItem(key,JSON.stringify([...read(),pending]));
    await retry();
    if(read().some(p=>p.id===pending.id)) throw new Error(failure.current || "答案尚未傳送；請保持此分頁開啟，按重試同步。");
    toast.success("答案已儲存；客觀題由系統核算，短答待老師批改。");
    return pending;
  }
  return <Context.Provider value={{progress,completeTask,syncing,syncError,retry}}>{children}</Context.Provider>;
}
export function useScoreSync(){const value=useContext(Context);if(!value)throw new Error("Missing ScoreSyncProvider");return value;}
export function completedTaskCount(progress:TaskProgress){return HISTORY_TASKS.filter(t=>progress[t.id]?.progress===100).length;}
