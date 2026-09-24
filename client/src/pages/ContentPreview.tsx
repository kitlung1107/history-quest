import { useEffect, useState } from "react";
import Home from "./Home";
import TaskModal from "@/components/TaskModal";
import { SITE_SETTINGS, PUBLIC_TOPICS } from "@/lib/siteSettings";
import type { HistoryTask } from "@/lib/historyQuest";

export default function ContentPreview() {
  const [draft, setDraft] = useState<{
    kind: string;
    data: Record<string, any>;
  } | null>(null);
  const [view, setView] = useState("card");
  useEffect(() => {
    const token = location.hash.slice(1);
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        (event.source !== window.parent && event.source !== window.top)
      )
        return;
      if (
        event.data?.type !== "hq-preview" ||
        event.data.token !== token ||
        !event.data.data ||
        typeof event.data.data !== "object"
      )
        return;
      setDraft({ kind: event.data.kind, data: event.data.data });
    };
    window.addEventListener("message", receive);
    window.top?.postMessage(
      { type: "hq-preview-ready", token },
      location.origin
    );
    return () => window.removeEventListener("message", receive);
  }, []);
  if (!draft)
    return (
      <p className="p-6">請從 CMS 編輯器開啟預覽。預覽不會儲存或提交成績。</p>
    );
  const data = Object.fromEntries(
    Object.entries(draft.data).filter(
      ([, value]) => value !== null && value !== undefined
    )
  );
  const topic = PUBLIC_TOPICS.find(t => t.id === data.topicId);
  const task = {
    id: data.task_id || "draft",
    title: "未命名任務",
    description: "",
    article: "",
    label: "教材預覽",
    image: "",
    duration: 10,
    accent: "gold",
    type: "quiz",
    visible: false,
    featured: false,
    order: 0,
    ...data,
    topic: topic?.title || "未選課題",
    grade: topic?.grade || 1,
    difficulty: Math.max(1, Math.min(5, Number(data.difficulty) || 1)),
    questions: (Array.isArray(data.questions) ? data.questions : []).map(
      (q: any, i: number) => ({
        id: q.id || `draft-${i}`,
        prompt: q.prompt || "未填題目",
        type: q.type || "choice",
        points: Number(q.points) || 10,
        options: q.options || [],
        answer: q.answer ?? 0,
        explanation: q.explanation || "",
      })
    ),
  } as HistoryTask;
  return (
    <div>
      <div className="border-b-2 border-ink bg-gold p-3 text-sm font-bold">
        未發佈預覽 · 試答不會記錄成績
      </div>
      <div>
        {draft.kind === "site" ? (
          <Home previewSettings={{ ...SITE_SETTINGS, ...data }} />
        ) : (
          <>
            <div className="flex gap-3 bg-paper p-3">
              <button
                className="pixel-button pixel-button-paper"
                onClick={() => setView("card")}
              >
                首頁卡片預覽
              </button>
              <button
                className="pixel-button pixel-button-paper"
                onClick={() => setView("task")}
              >
                教材全文與試答
              </button>
            </div>
            {view === "card" ? (
              <Home
                previewSettings={SITE_SETTINGS}
                previewTasks={[{ ...task, visible: true, featured: true }]}
              />
            ) : (
              <TaskModal
                key={JSON.stringify(data)}
                task={task}
                open
                preview
                onOpenChange={open => {
                  if (!open) setView("card");
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
