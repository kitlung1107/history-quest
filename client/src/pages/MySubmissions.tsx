import McFeedback from "@/components/McFeedback";
import {
  getSubmissionMcEncouragement,
  type McEncouragement,
} from "@/lib/mcEncouragement";
import { HISTORY_TASKS } from "@/lib/historyQuest";
import { getQuestions } from "@/lib/assessment";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { DocumentSnapshot } from "firebase/firestore";
import { asRow, loadSubmissions, type CloudSubmission } from "@/lib/cloudStore";
import { useStudentAccount } from "@/contexts/StudentAccount";
import type { SubmissionRow } from "@/lib/assessment";
export default function MySubmissions() {
  const { studentId, profile } = useStudentAccount();
  const [rows, setRows] = useState<
    (SubmissionRow & { mcFeedback: McEncouragement | null })[]
  >([]);
  const [cursor, setCursor] = useState<DocumentSnapshot>();
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(next = false) {
    setBusy(true);
    setError("");
    try {
      const page = await loadSubmissions(studentId, next ? cursor : undefined);
      const incoming = page.docs.map(d => {
        const submission = d.data() as CloudSubmission;
        const task = HISTORY_TASKS.find(t => t.id === submission.taskId);
        return {
          ...asRow(d.id, submission, profile!),
          mcFeedback: getSubmissionMcEncouragement(
            d.id,
            submission,
            task ? getQuestions(task) : undefined
          ),
        };
      });
      setRows(old => (next ? [...old, ...incoming] : incoming));
      setCursor(page.cursor);
      setMore(page.more);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(
        code === "failed-precondition"
          ? "提交紀錄暫時無法載入，請稍後按「重新整理」；若持續出現，請通知老師。"
          : code === "permission-denied"
            ? "無法存取提交紀錄，請重新登入或聯絡老師。"
            : "未能載入提交紀錄，請檢查網絡後再試。"
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [studentId]);
  return (
    <main className="paper-texture min-h-screen p-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="pixel-button pixel-button-paper">
          返回探索館
        </Link>
        <h1 className="display-title my-6 text-3xl">我的提交與評語</h1>
        <p>這裡顯示此帳戶的雲端提交，換裝置登入也能查閱。</p>
        <button
          className="pixel-button pixel-button-paper my-4"
          disabled={busy}
          onClick={() => void load()}
        >
          重新整理
        </button>
        {error && <p role="alert">{error}</p>}
        {!busy && !rows.length && !error && <p>尚未提交任務。</p>}
        {rows.map(r => (
          <section key={r.attempt_id} className="admin-panel my-5 p-5">
            <h2 className="display-title text-xl">{r.task_title}</h2>
            <p>
              {r.timestamp ? new Date(r.timestamp).toLocaleString("zh-HK") : ""}
            </p>
            <p className="my-3 font-bold">
              {r.status === "graded"
                ? `正式成績：${r.score} / 100`
                : "已收到答案，待教師核算或批改"}
            </p>
            <McFeedback feedback={r.mcFeedback} provisional={!r.revision} />
            {r.answers?.map(a => (
              <div key={a.question_id} className="mt-3 border-t p-3">
                <strong>{a.prompt}</strong>
                <p className="whitespace-pre-wrap">你的答案：{a.response}</p>
                <p>
                  得分：{a.awarded ?? "待批改"} / {a.points}
                </p>
                {a.feedback && (
                  <p>
                    {a.type === "choice" ? "既有老師評語" : "老師評語"}：
                    {a.feedback}
                  </p>
                )}
              </div>
            ))}
            {r.feedback && (
              <section className="mt-4 border-t p-3">
                <h3 className="font-bold">
                  {r.answers?.some(a => a.type !== "choice")
                    ? "非 MC 題目老師總評語"
                    : "既有老師總評語"}
                </h3>
                <p className="whitespace-pre-wrap">{r.feedback}</p>
              </section>
            )}
          </section>
        ))}
        {more && (
          <button
            disabled={busy}
            className="pixel-button pixel-button-paper"
            onClick={() => void load(true)}
          >
            載入更多
          </button>
        )}
      </div>
    </main>
  );
}
