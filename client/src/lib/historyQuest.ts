import { SITE_SETTINGS, PUBLIC_TOPICS, GRADES } from "./siteSettings";
import { publicTasks } from "./contentModel";
import type { ImagePosition } from "./imagePosition";
import type { Question } from "./assessment";
/**
 * 設計提醒：資料命名與微文案都服務於「可操作的香港歷史漫畫報紙」，避免一般 LMS 的冷冰冰術語。
 */
export const GAS_WEB_APP_URL =
  import.meta.env.VITE_GAS_WEB_APP_URL ||
  "https://script.google.com/macros/s/AKfycbymowbPxS3_LxAcfOP546HahoNKV1S-8Uwatj0-0Uw3Rz4oYMVMK0VeJAiG17BCzmWG/exec";

export const ASSETS = {
  hero: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663927088869/AHoOEYFsvjjBELVv.png",
  logo: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663927088869/fQwdjGMwUojWUNVd.png",
  harbour:
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663927088869/UKcrbrknsGwZLUyU.png",
  battle:
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663927088869/dGmZCgNJcIGuefbW.png",
  ancient:
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663927088869/rqkulCuDciZdHjhL.png",
} as const;

export const STUDENT_STORAGE_KEY = "historyQuest.student.v1";
export const PROGRESS_STORAGE_KEY = "historyQuest.progress.v1";
export const SYNC_QUEUE_KEY = "historyQuest.syncQueue.v1";

export { CLASS_OPTIONS } from "./classOptions.ts";

export type StudentProfile = {
  className: string;
  name: string;
  studentNo: string;
};

export type QuizQuestion = {
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type HistoryTask = {
  id: string;
  topicId: string;
  visible: boolean;
  featured: boolean;
  order: number;
  grade: number;
  topic: string;
  type: "article" | "game" | "quiz";
  label: string;
  title: string;
  description: string;
  duration: number;
  difficulty: number;
  image: string;
  imagePosition?: ImagePosition;
  accent: "teal" | "red" | "gold";
  article: string;
  videoUrl?: string;
  gameUrl?: string;
  question?: QuizQuestion;
  questions?: Question[];
};

type CmsTask = Omit<HistoryTask, "id" | "grade" | "topic"> & {
  task_id: string;
};

const taskModules = import.meta.glob("../content/tasks/*.json", {
  eager: true,
  import: "default",
}) as Record<string, CmsTask>;

// Only publicly visible tasks enter student navigation and progress counts.
export const HISTORY_TASKS: HistoryTask[] = publicTasks(
  Object.values(taskModules),
  PUBLIC_TOPICS
);

export type TaskProgress = Record<
  string,
  { score: number; progress: number; syncedAt?: string; attemptId?: string }
>;

export function loadStudent(): StudentProfile | null {
  try {
    return JSON.parse(
      localStorage.getItem(STUDENT_STORAGE_KEY) || "null"
    ) as StudentProfile | null;
  } catch {
    return null;
  }
}

export function saveStudent(profile: StudentProfile) {
  localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(profile));
}

export function loadProgress(): TaskProgress {
  try {
    return JSON.parse(
      localStorage.getItem(PROGRESS_STORAGE_KEY) || "{}"
    ) as TaskProgress;
  } catch {
    return {};
  }
}

export function saveProgress(progress: TaskProgress) {
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function makeAttemptId(taskId: string, studentNo: string) {
  const entropy =
    globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${taskId}-${studentNo}-${Date.now()}-${entropy}`;
}

export const topicCards = SITE_SETTINGS.topicCards.filter(
  card => card.visible && GRADES.some(grade => grade.grade === card.grade)
);
