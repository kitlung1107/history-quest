import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HISTORY_TASKS, type HistoryTask, type TaskProgress } from "@/lib/historyQuest";
import { getQuestions, assessmentVersion, markAnswers, type Answer } from "@/lib/assessment";
import { loadCloudProgress, submitCloud } from "@/lib/cloudStore";
import { useOptionalStudentAccount } from "./StudentAccount";
type Pending={id:string;taskId:string;version:string;answers:Answer[]};
type Value={progress:TaskProgress;completeTask:(task:HistoryTask,answers:Answer[])=>Promise<void>;syncing:boolean;syncError:string;retry:()=>Promise<void>};
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
  const retry=useCallback(async()=>{
    if(!sid || active.current) return;
    active.current=true; setSyncing(true); setError("");
    try {
      for(const pending of read()) {
        await submitCloud(sid,pending.id,pending.taskId,pending.version,pending.answers);
        sessionStorage.setItem(key,JSON.stringify(read().filter(p=>p.id!==pending.id)));
      }
      setProgress(await loadCloudProgress(sid));
    } catch(e) {setError(e instanceof Error?e.message:"未能同步，請重試。");}
    finally{active.current=false;setSyncing(false);}
  },[sid,key]);
  useEffect(()=>{setProgress({});void retry();const online=()=>void retry();window.addEventListener("online",online);return()=>window.removeEventListener("online",online);},[retry]);
  async function completeTask(task:HistoryTask,answers:Answer[]) {
    if(!sid) throw new Error("請先登入。");
    markAnswers(getQuestions(task),answers);
    const duplicate=read().find(p=>p.taskId===task.id);
    const pending=duplicate || {id:crypto.randomUUID(),taskId:task.id,version:assessmentVersion(getQuestions(task)),answers};
    if(!duplicate) sessionStorage.setItem(key,JSON.stringify([...read(),pending]));
    await retry();
    if(read().some(p=>p.id===pending.id)) throw new Error("答案尚未傳送；請保持此分頁開啟，按重試同步。");
    toast.success("答案已存入 Firestore，正式成績待教師確認。");
  }
  return <Context.Provider value={{progress,completeTask,syncing,syncError,retry}}>{children}</Context.Provider>;
}
export function useScoreSync(){const value=useContext(Context);if(!value)throw new Error("Missing ScoreSyncProvider");return value;}
export function completedTaskCount(progress:TaskProgress){return HISTORY_TASKS.filter(t=>progress[t.id]?.progress===100).length;}
