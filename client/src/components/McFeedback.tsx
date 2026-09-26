import type { McEncouragement } from "@/lib/mcEncouragement";

export default function McFeedback({
  feedback,
  provisional = false,
}: {
  feedback: McEncouragement | null;
  provisional?: boolean;
}) {
  if (!feedback) return null;
  return (
    <section className="my-4 border-2 border-teal p-3" aria-label="MC 自動回饋">
      <h3 className="font-bold">
        MC 自動回饋{provisional ? "（練習參考）" : ""}
      </h3>
      <p>
        MC 答中：{feedback.correct} / {feedback.total} 題 · MC 得分：
        {feedback.awarded} / {feedback.points}
      </p>
      <p className="mt-2">{feedback.message}</p>
      <p className="mt-2 text-sm">
        系統按 MC 答中率選取的鼓勵評語，只適用於 MC 部分。
      </p>
    </section>
  );
}
