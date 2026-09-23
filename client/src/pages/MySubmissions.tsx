import { useState } from "react";
import { Link } from "wouter";
import { readReceipts, useScoreSync } from "@/contexts/ScoreSyncContext";
import { loadStudent } from "@/lib/historyQuest";
import { teachingApi } from "@/lib/teachingApi";
import type { SubmissionRow } from "@/lib/assessment";
export default function MySubmissions() {
  const student = loadStudent();
  const receipts = readReceipts()
    .filter(
      r =>
        r.class_name === student?.className &&
        r.student_no === student?.studentNo
    )
    .reverse();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<SubmissionRow | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { syncError, syncing, retry } = useScoreSync();
  async function lookup(value: string) {
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const [attempt_id, receipt] = value.trim().split("|");
      if (!attempt_id || !receipt) throw new Error("請輸入完整查閱碼。");
      const response = await teachingApi<{ row: SubmissionRow }>({
        action: "result",
        attempt_id,
        receipt,
      });
      setResult(response.row);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "未能讀取提交。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="paper-texture min-h-screen p-5 md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="pixel-button pixel-button-paper">
          返回探索館
        </Link>
        <h1 className="display-title my-6 text-3xl">我的提交與老師評語</h1>
        <p>
          這部裝置保留了目前學生的提交查閱碼。換裝置時可貼上查閱碼查詢；請勿分享自己的查閱碼。
        </p>
        {(syncError || syncing) && (
          <div className="my-4 border-2 border-ink p-3">
            <p>{syncing ? "正在傳送答案…" : syncError}</p>
            <button
              className="pixel-button pixel-button-paper mt-2"
              disabled={syncing}
              onClick={() => void retry()}
            >
              重試尚未傳送的答案
            </button>
          </div>
        )}
        <div className="my-5 space-y-3">
          {receipts.map(r => (
            <div
              key={r.attempt_id}
              className="flex flex-wrap items-center gap-3 border-2 border-ink p-3"
            >
              <strong className="flex-1">{r.task_title}</strong>
              <button
                disabled={busy}
                className="pixel-button pixel-button-teal"
                onClick={() => void lookup(`${r.attempt_id}|${r.receipt}`)}
              >
                查看成績／評語
              </button>
              <button
                className="pixel-button pixel-button-paper"
                onClick={() => {
                  setCode(`${r.attempt_id}|${r.receipt}`);
                  setMessage("查閱碼已填在下方，可自行複製保存。");
                }}
              >
                顯示查閱碼
              </button>
            </div>
          ))}
        </div>
        {!receipts.length && (
          <p className="my-4">這部裝置尚未保留目前學生的提交。</p>
        )}
        <form
          onSubmit={e => {
            e.preventDefault();
            void lookup(code);
          }}
        >
          <label>
            提交查閱碼
            <input
              className="comic-input my-2 w-full"
              value={code}
              onChange={e => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button className="pixel-button pixel-button-gold" disabled={busy}>
            {busy ? "讀取中…" : "查詢"}
          </button>
        </form>
        {message && (
          <p className="my-4" role="status">
            {message}
          </p>
        )}
        {result && (
          <section className="admin-panel mt-6 p-5">
            <h2 className="display-title text-2xl">
              {result.task_title || result.task_id}
            </h2>
            <p className="my-3 font-black">
              {result.status === "pending"
                ? "待老師批改"
                : `成績：${result.score} / 100`}
            </p>
            {result.answers?.map((answer, i) => (
              <div
                key={answer.question_id}
                className="mt-4 border-t-2 border-ink/20 pt-3"
              >
                <strong>
                  {i + 1}. {answer.prompt}
                </strong>
                <p className="whitespace-pre-wrap">
                  你的答案：{answer.response}
                </p>
                <p>
                  得分：
                  {answer.awarded === null
                    ? "待批改"
                    : `${answer.awarded} / ${answer.points}`}
                </p>
                {answer.feedback && <p>老師評語：{answer.feedback}</p>}
              </div>
            ))}
            {result.feedback && (
              <p className="mt-5 font-bold">總評語：{result.feedback}</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
