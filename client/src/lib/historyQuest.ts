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
  1: [
    "人類的需要—古與今",
    "歐洲文明的發展",
    "伊斯蘭文明的興起與中古時代歐亞的文化交流",
    "早期香港地區的歷史、文化與傳承",
  ],
  2: [
    "近代歐洲的興起",
    "歐洲國家的殖民擴張",
    "美國的成立及發展",
    "香港直至19世紀末的成長與發展",
  ],
  3: [
    "兩次世界大戰",
    "冷戰及後冷戰時代",
    "20世紀以來的國際合作",
    "20世紀香港的成長與蛻變",
  ],
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
  { grade: 1, title: "中一主題", icon: "𓂀", accent: "gold", caption: "古今文明、文化交流與早期香港" },
  { grade: 2, title: "中二主題", icon: "⛵", accent: "teal", caption: "近代歐洲、美國與十九世紀香港" },
  { grade: 3, title: "中三主題", icon: "✦", accent: "red", caption: "世界大戰、冷戰、國際合作與香港" },
] as const;
