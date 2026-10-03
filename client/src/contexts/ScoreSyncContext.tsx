import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { submissionErrorMessage } from "@/lib/submissionError";
import { canPlayGrade } from "@/lib/gradeAccess";
import { toast } from "sonner";
import { HISTORY_TASKS, type HistoryTask, type TaskProgress } from "@/lib/historyQuest";
import { getQuestions, taskAssessmentVersion, validatePublicAnswers, type Answer } from "@/lib/assessment";
import { loadCloudProgress, submitCloud } from "@/lib/cloudStore";
import { useOptionalStudentAccount } from "./StudentAccount";
type Pending={id:string;taskId:string;version:string;answers:Answer[]};
type Value={progress:TaskProgress;completeTask:(task:HistoryTask,answers:Answer[])=>Promise<Pending>;syncing:boolean;syncError:string;retry:()=>Promise<void>};
const Context=createContext<Value|null>(null);
export function ScoreSyncProvider({children}:{children:React.ReactNode}) {
  const account=useOptionalStudentAccount();
  const sid=account?.studentId;
  const key=`hdc.pending.${sid || "preview"}`;
  const read=():Pending[]=>{try{return JSON.parse(sessionStorage.getItem(key)||"[]");}catch{return [];}};
  const [progress,setProgress]=useState<TaskProgress>({});
  const [syncing,setSyncing]=useState(false);
  const [syncError,setError]=useState("");
  const active=useRef(false);
  const failure=useRef("");
  const retry=useCallback(async()=>{
    if(!sid || active.current) return;
    active.current=true; setSyncing(true); setError("");
    try {
      for(const pending of read()) {
        await submitCloud(sid,pending.id,pending.taskId,pending.version,pending.answers);
        sessionStorage.setItem(key,JSON.stringify(read().filter(p=>p.id!==pending.id)));
      }
      setProgress(await loadCloudProgress(sid));
    } catch(e) {failure.current=submissionErrorMessage(e);setError(failure.current); }
    finally{active.current=false;setSyncing(false);}
  },[sid,key]);
  useEffect(()=>{setProgress({});void retry();const online=()=>void retry();window.addEventListener("online",online);return()=>window.removeEventListener("online",online);},[retry]);
  async function completeTask(task:HistoryTask,answers:Answer[]) {
    if(!sid) throw new Error("請先登入。");
    if (!canPlayGrade(account, task.grade)) throw new Error("此年級尚未開放。");
    validatePublicAnswers(getQuestions(task),answers);
    const duplicate=read().find(p=>p.taskId===task.id);
    const pending=duplicate || {id:crypto.randomUUID(),taskId:task.id,version:taskAssessmentVersion(task),answers};
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
