/**
 * 設計提醒：同步狀態像街機存檔提示一樣輕巧、清楚；錯誤不阻斷學生探索。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  GAS_WEB_APP_URL,
  HISTORY_TASKS,
  PROGRESS_STORAGE_KEY,
  SYNC_QUEUE_KEY,
  loadProgress,
  loadStudent,
  makeAttemptId,
  saveProgress,
  type HistoryTask,
  type TaskProgress,
} from "@/lib/historyQuest";

type Submission = {
  class_name: string;
  student_name: string;
  student_no: string;
  task_id: string;
  score: number;
  progress: number;
  attempt_id: string;
  client_time: string;
  content_type: HistoryTask["type"];
};

type SyncContextValue = {
  progress: TaskProgress;
  completeTask: (task: HistoryTask, score: number) => Promise<void>;
  syncing: boolean;
};

const ScoreSyncContext = createContext<SyncContextValue | null>(null);

function readQueue(): Submission[] {
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || "[]") as Submission[];
  } catch {
    return [];
  }
}

function writeQueue(queue: Submission[]) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

async function postSubmission(submission: Submission) {
  const response = await fetch(GAS_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(submission),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = (await response.json()) as { ok?: boolean; message?: string };
  if (!result.ok) throw new Error(result.message || "SYNC_FAILED");
}

export function ScoreSyncProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<TaskProgress>(() => loadProgress());
  const [syncing, setSyncing] = useState(false);

  const flushQueue = useCallback(async () => {
    const queue = readQueue();
    if (!queue.length || !navigator.onLine) return;
    setSyncing(true);
    const remaining: Submission[] = [];
    for (const submission of queue) {
      try {
        await postSubmission(submission);
        setProgress((current) => {
          const next = {
            ...current,
            [submission.task_id]: {
              score: submission.score,
              progress: submission.progress,
              syncedAt: new Date().toISOString(),
            },
          };
          saveProgress(next);
          return next;
        });
      } catch {
        remaining.push(submission);
      }
    }
    writeQueue(remaining);
    setSyncing(false);
    if (remaining.length === 0) {
      toast.success("成績已自動儲存", { className: "pixel-toast pixel-toast-success" });
    }
  }, []);

  useEffect(() => {
    const retry = () => void flushQueue();
    window.addEventListener("online", retry);
    const timer = window.setInterval(retry, 30_000);
    void flushQueue();
    return () => {
      window.removeEventListener("online", retry);
      window.clearInterval(timer);
    };
  }, [flushQueue]);

  const completeTask = useCallback(
    async (task: HistoryTask, score: number) => {
      const student = loadStudent();
      if (!student) return;
      const submission: Submission = {
        class_name: student.className,
        student_name: student.name,
        student_no: student.studentNo,
        task_id: task.id,
        score,
        progress: 100,
        attempt_id: makeAttemptId(task.id, student.studentNo),
        client_time: new Date().toISOString(),
        content_type: task.type,
      };
      const nextProgress = { ...progress, [task.id]: { score, progress: 100 } };
      setProgress(nextProgress);
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(nextProgress));
      writeQueue([...readQueue(), submission]);
      try {
        await flushQueue();
      } catch {
        toast.warning("儲存失敗，將於網路恢復後重試", { className: "pixel-toast pixel-toast-warning" });
      }
      if (!navigator.onLine || readQueue().length > 0) {
        toast.warning("儲存失敗，將於網路恢復後重試", { className: "pixel-toast pixel-toast-warning" });
      }
    },
    [flushQueue, progress],
  );

  const value = useMemo(() => ({ progress, completeTask, syncing }), [completeTask, progress, syncing]);
  return <ScoreSyncContext.Provider value={value}>{children}</ScoreSyncContext.Provider>;
}

export function useScoreSync() {
  const value = useContext(ScoreSyncContext);
  if (!value) throw new Error("useScoreSync must be used inside ScoreSyncProvider");
  return value;
}

export function completedTaskCount(progress: TaskProgress) {
  return HISTORY_TASKS.filter((task) => progress[task.id]?.progress === 100).length;
}
