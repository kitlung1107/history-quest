/**
 * 設計提醒：資料命名與微文案都服務於「可操作的香港歷史漫畫報紙」，避免一般 LMS 的冷冰冰術語。
 */
export const GAS_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbymowbPxS3_LxAcfOP546HahoNKV1S-8Uwatj0-0Uw3Rz4oYMVMK0VeJAiG17BCzmWG/exec";

export const ASSETS = {
  hero: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663927088869/AHoOEYFsvjjBELVv.png",
  logo: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663927088869/fQwdjGMwUojWUNVd.png",
  harbour: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663927088869/UKcrbrknsGwZLUyU.png",
  battle: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663927088869/dGmZCgNJcIGuefbW.png",
  ancient: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663927088869/rqkulCuDciZdHjhL.png",
} as const;

export const STUDENT_STORAGE_KEY = "historyQuest.student.v1";
export const PROGRESS_STORAGE_KEY = "historyQuest.progress.v1";
export const SYNC_QUEUE_KEY = "historyQuest.syncQueue.v1";

export const CLASS_OPTIONS = Array.from({ length: 6 }, (_, level) =>
  ["A", "B", "C", "D", "E"].map((letter) => `${level + 1}${letter}`),
).flat();

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
  grade: number;
  topic: string;
  type: "article" | "game" | "quiz";
  label: string;
  title: string;
  description: string;
  duration: number;
  difficulty: number;
  image: string;
  accent: "teal" | "red" | "gold";
  article: string;
  videoUrl?: string;
  gameUrl?: string;
  question: QuizQuestion;
};

type CmsTask = Omit<HistoryTask, "id"> & { task_id: string };

const taskModules = import.meta.glob("../content/tasks/*.json", {
  eager: true,
  import: "default",
}) as Record<string, CmsTask>;

export const HISTORY_TASKS: HistoryTask[] = Object.values(taskModules)
  .map(({ task_id, ...task }) => ({ ...task, id: task_id }))
  .sort((left, right) => left.grade - right.grade || left.title.localeCompare(right.title, "zh-Hant"));

export const GRADE_TOPICS: Record<number, string[]> = {
  1: ["古代文明", "希臘與羅馬", "中世紀生活"],
  2: ["文藝復興", "宗教改革", "大航海時代"],
  3: ["香港史", "工業革命", "世界大戰"],
  4: ["二十世紀國際衝突", "香港現代化", "改革與革命"],
  5: ["中國近現代史", "冷戰世界", "東亞發展"],
  6: ["公開試研習", "史料分析", "歷史論證"],
};

export type TaskProgress = Record<string, { score: number; progress: number; syncedAt?: string }>;

export function loadStudent(): StudentProfile | null {
  try {
    return JSON.parse(localStorage.getItem(STUDENT_STORAGE_KEY) || "null") as StudentProfile | null;
  } catch {
    return null;
  }
}

export function saveStudent(profile: StudentProfile) {
  localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(profile));
}

export function loadProgress(): TaskProgress {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || "{}") as TaskProgress;
  } catch {
    return {};
  }
}

export function saveProgress(progress: TaskProgress) {
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function makeAttemptId(taskId: string, studentNo: string) {
  const entropy = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${taskId}-${studentNo}-${Date.now()}-${entropy}`;
}

export const topicCards = [
  { title: "古代文明", icon: "𓂀", accent: "gold", caption: "由兩河流域走到羅馬街頭" },
  { title: "香港近代史", icon: "⛵", accent: "teal", caption: "細讀城市、港口與社會轉變" },
  { title: "世界大戰", icon: "✦", accent: "red", caption: "從戰場地圖理解世界秩序" },
] as const;
