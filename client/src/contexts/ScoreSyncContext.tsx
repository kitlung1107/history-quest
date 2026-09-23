import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  HISTORY_TASKS,
  SYNC_QUEUE_KEY,
  loadProgress,
  loadStudent,
  makeAttemptId,
  saveProgress,
  type HistoryTask,
  type TaskProgress,
} from "@/lib/historyQuest";
import {
  getQuestions,
  assessmentVersion,
  markAnswers,
  percentage,
  type Answer,
} from "@/lib/assessment";
import { teachingApi } from "@/lib/teachingApi";

type Submission = {
  class_name: string;
  student_name: string;
  student_no: string;
  task_id: string;
  score: number;
  progress: number;
  attempt_id: string;
  client_time: string;
  content_type: string;
  answers?: Answer[];
  assessment_version?: string;
  receipt?: string;
};
export type Receipt = {
  attempt_id: string;
  receipt: string;
  task_title: string;
  class_name: string;
  student_no: string;
};
const RECEIPTS_KEY = "historyQuest.receipts.v2";
export function readReceipts(): Receipt[] {
  try {
    return JSON.parse(localStorage.getItem(RECEIPTS_KEY) || "[]");
  } catch {
    return [];
  }
}
const readQueue = (): Submission[] => {
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
};
const writeQueue = (queue: Submission[]) =>
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
type SyncContextValue = {
  progress: TaskProgress;
  completeTask: (task: HistoryTask, answers: Answer[]) => Promise<void>;
  syncing: boolean;
  syncError: string;
  retry: () => Promise<void>;
};
const ScoreSyncContext = createContext<SyncContextValue | null>(null);

export function ScoreSyncProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<TaskProgress>(() => loadProgress());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const active = useRef<Promise<void> | null>(null);
  const flushQueue = useCallback((): Promise<void> => {
    if (active.current) return active.current;
    if (
      location.pathname.endsWith("/preview") ||
      new URLSearchParams(location.search).has("preview")
    )
      return Promise.resolve();
    if (!readQueue().length || !navigator.onLine) return Promise.resolve();
    const run = async () => {
      setSyncing(true);
      setSyncError("");
      try {
        for (const submission of readQueue()) {
          await teachingApi({
            action: submission.answers ? "submit" : "legacy_submit",
            ...submission,
          });
          writeQueue(
            readQueue().filter(
              item => item.attempt_id !== submission.attempt_id
            )
          );
          const student = loadStudent();
          if (
            student?.className === submission.class_name &&
            student.studentNo === submission.student_no
          ) {
            setProgress(current => {
              if (
                current[submission.task_id]?.attemptId &&
                current[submission.task_id].attemptId !== submission.attempt_id
              )
                return current;
              const next = {
                ...current,
                [submission.task_id]: {
                  ...(current[submission.task_id] || {
                    score: submission.score,
                    progress: 100,
                  }),
                  syncedAt: new Date().toISOString(),
                },
              };
              saveProgress(next);
              return next;
            });
          }
        }
      } catch (error) {
        setSyncError(
          error instanceof Error
            ? error.message
            : "未能同步；答案已保留，請稍後重試。"
        );
      } finally {
        setSyncing(false);
        active.current = null;
      }
    };
    active.current = run();
    return active.current;
  }, []);
  useEffect(() => {
    const retry = () => void flushQueue();
    window.addEventListener("online", retry);
    const timer = window.setInterval(retry, 30000);
    retry();
    return () => {
      window.removeEventListener("online", retry);
      window.clearInterval(timer);
    };
  }, [flushQueue]);
  const completeTask = useCallback(
    async (task: HistoryTask, answers: Answer[]) => {
      const student = loadStudent();
      if (!student) throw new Error("請先完成學生報到。");
      const questions = getQuestions(task);
      const score = percentage(markAnswers(questions, answers)) ?? 0;
      const attempt = makeAttemptId(task.id, student.studentNo);
      const receipt = crypto.randomUUID() + crypto.randomUUID();
      const submission: Submission = {
        class_name: student.className,
        student_name: student.name,
        student_no: student.studentNo,
        task_id: task.id,
        score,
        progress: 100,
        attempt_id: attempt,
        client_time: new Date().toISOString(),
        content_type: task.type,
        answers,
        assessment_version: assessmentVersion(questions),
        receipt,
      };
      writeQueue([...readQueue(), submission]);
      localStorage.setItem(
        RECEIPTS_KEY,
        JSON.stringify([
          ...readReceipts(),
          {
            attempt_id: attempt,
            receipt,
            task_title: task.title,
            class_name: student.className,
            student_no: student.studentNo,
          },
        ])
      );
      setProgress(current => {
        const next = {
          ...current,
          [task.id]: { score, progress: 100, attemptId: attempt },
        };
        saveProgress(next);
        return next;
      });
      toast.success("答案已保存在本機，正在傳送給老師。");
      await flushQueue();
    },
    [flushQueue]
  );
  const value = useMemo(
    () => ({ progress, completeTask, syncing, syncError, retry: flushQueue }),
    [progress, completeTask, syncing, syncError, flushQueue]
  );
  return (
    <ScoreSyncContext.Provider value={value}>
      {children}
    </ScoreSyncContext.Provider>
  );
}
export function useScoreSync() {
  const value = useContext(ScoreSyncContext);
  if (!value) throw new Error("Missing ScoreSyncProvider");
  return value;
}
export function completedTaskCount(progress: TaskProgress) {
  return HISTORY_TASKS.filter(task => progress[task.id]?.progress === 100)
    .length;
}
