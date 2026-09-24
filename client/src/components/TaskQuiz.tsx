import { useState } from "react";
import {
  getQuestions,
  markAnswers,
  percentage,
  type Answer,
  type AnswerRecord,
} from "@/lib/assessment";
import type { HistoryTask } from "@/lib/historyQuest";
import { useScoreSync } from "@/contexts/ScoreSyncContext";
export default function TaskQuiz({
  task,
  preview = false,
}: {
  task: HistoryTask;
  preview?: boolean;
}) {
  const questions = getQuestions(task);
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [result, setResult] = useState<AnswerRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { completeTask, syncError, retry, syncing } = useScoreSync();
  const count = questions.filter(q =>
    q.type === "choice"
      ? typeof values[q.id] === "number"
      : String(values[q.id] || "").trim()
  ).length;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || result) return;
    setError("");
    setBusy(true);
    try {
      const answers: Answer[] = questions.map(q => ({
        question_id: q.id,
        value: values[q.id],
      }));
      const marked = markAnswers(questions, answers);
      if (!preview) await completeTask(task, answers);
      setResult(marked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能儲存，請重試。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="quiz-panel mt-9" onSubmit={submit}>
      <p className="comic-kicker">
        {preview ? "試答預覽 · 不會提交成績" : "讀畢測驗 · 即時分數為練習參考，正式成績以教師核算為準"}
      </p>
      <p className="mt-2 text-sm">
        已填 {count} / {questions.length} 題 · 共{" "}
        {questions.reduce((n, q) => n + q.points, 0)} 分。短答由老師批改。
      </p>
      {questions.map((q, index) => (
        <fieldset
          key={q.id}
          disabled={Boolean(result) || busy}
          className="mt-6 border-t-2 border-ink/20 pt-4"
        >
          <legend className="font-black">
            {index + 1}. {q.prompt}（{q.points} 分）
          </legend>
          {q.type === "short" ? (
            <textarea
              aria-label={`第 ${index + 1} 題答案`}
              className="comic-input mt-3 min-h-28 w-full"
              maxLength={4000}
              required
              value={values[q.id] || ""}
              onChange={e => setValues({ ...values, [q.id]: e.target.value })}
            />
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {q.options?.map((option, i) => (
                <label
                  key={i}
                  className={`answer-tile ${values[q.id] === i ? "bg-gold/30" : ""}`}
                >
                  <input
                    type="radio"
                    required
                    name={`${task.id}-${q.id}`}
                    checked={values[q.id] === i}
                    onChange={() => setValues({ ...values, [q.id]: i })}
                  />
                  <span>{String.fromCharCode(65 + i)}</span>
                  {option}
                </label>
              ))}
            </div>
          )}
          {result && (
            <p className="mt-3 text-sm leading-6">
              {result[index].awarded === null
                ? "待老師批改"
                : `本題 ${result[index].awarded} / ${q.points} 分`}{" "}
              · {q.explanation}
            </p>
          )}
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="mt-4 text-red">
          {error}
        </p>
      )}
      {!result ? (
        <button
          disabled={busy || !questions.length}
          className="pixel-button pixel-button-teal mt-6"
        >
          {busy ? "儲存中…" : preview ? "試算成績" : "提交全部答案"}
        </button>
      ) : (
        <div className="result-strip mt-6">
          <strong>
            {percentage(result) === null
              ? "選擇題已評分，短答等待老師批改。"
              : `暫計成績：${percentage(result)} / 100`}
          </strong>
          <p>
            {preview
              ? "這是預覽，沒有儲存或傳送學生資料。"
              : "答案已保留。正式成績與老師評語可在「我的提交」查看。"}
          </p>
        </div>
      )}
      {!preview && syncError && (
        <div className="mt-4" role="status">
          <p>{syncError}</p>
          <button
            type="button"
            disabled={syncing}
            className="pixel-button pixel-button-paper mt-2"
            onClick={() => void retry()}
          >
            重新傳送
          </button>
        </div>
      )}
    </form>
  );
}
