import { useState } from "react";
import { createRoot } from "react-dom/client";
import TaskModal from "./components/TaskModal";
import { ScoreSyncProvider } from "./contexts/ScoreSyncContext";
import { HISTORY_TASKS, type HistoryTask } from "./lib/historyQuest";
import "./index.css";
import "./home.css";

const original = HISTORY_TASKS.find(
  task => task.title === "石器時代・課堂重溫(1)"
)!;
const mixed: HistoryTask = {
  ...original,
  id: "local-mixed",
  title: "本機測試：圖片 MC 與短答（3 題）",
  description: "僅用於檢查不同題數與圖片題幹，並非正式教材。",
  questions: [
    {
      id: "image",
      type: "choice",
      points: 10,
      prompt:
        "觀察圖片後選擇答案。\n\n![史料圖片](/uploads/home-history-hero.webp)",
      options: ["示範選項甲", "示範選項乙"],
      answer: 0,
      explanation: "測試用解說，只在提交後出現。",
    },
    {
      id: "short",
      type: "short",
      points: 10,
      prompt: "以一句話描述你的觀察。",
    },
    {
      id: "choice",
      type: "choice",
      points: 10,
      prompt: "選擇一項作為測試答案。",
      options: ["選項甲", "選項乙"],
      answer: 1,
    },
  ],
};
const legacy: HistoryTask = {
  ...original,
  id: "local-legacy",
  title: "本機測試：舊格式單題 MC",
  questions: undefined,
  question: {
    prompt: "舊格式單題 MC 亦須先經總覽。",
    options: ["甲", "乙"],
    answer: 0,
    explanation: "測試用解說。",
  },
};
const tasks = [
  original,
  mixed,
  legacy,
  {
    ...original,
    id: "local-empty",
    title: "本機測試：沒有題目",
    questions: [],
  },
];
function Preview() {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <ScoreSyncProvider>
      <main className="paper-texture min-h-screen p-6">
        <div className="mx-auto max-w-3xl">
          <p className="comic-kicker">逐題小測 · 本機審核預覽</p>
          <h1 className="display-title mt-4 text-3xl">歷史互動探索館</h1>
          <p className="my-4">
            既有石器時代測驗沿用原題庫。試答不會傳送成績或派發獎勵。
          </p>
          <label className="font-bold" htmlFor="preview-task">
            預覽教材
          </label>
          <select
            id="preview-task"
            className="comic-input my-3 w-full"
            value={selected}
            onChange={event => setSelected(Number(event.target.value))}
          >
            {tasks.map((task, index) => (
              <option key={task.id} value={index}>
                {task.title}
              </option>
            ))}
          </select>
          <button
            className="pixel-button pixel-button-teal"
            onClick={() => setOpen(true)}
          >
            開啟教材預覽
          </button>
        </div>
        <TaskModal
          key={tasks[selected].id}
          task={tasks[selected]}
          open={open}
          onOpenChange={setOpen}
          preview
        />
      </main>
    </ScoreSyncProvider>
  );
}
if (import.meta.env.DEV)
  createRoot(document.getElementById("root")!).render(<Preview />);
