import { submissionExport } from "@/lib/teachingExport";
import { displayClass, matchesClass } from "@/lib/classOptions";
import { useEffect, useMemo, useState } from "react";
import { HISTORY_TASKS } from "@/lib/historyQuest";
import {
  missingStudents,
  filterSubmissions,
  type SubmissionRow,
  type RosterStudent,
  type AnswerRecord,
} from "@/lib/assessment";
import { downloadCsv, parseRoster } from "@/lib/csv";
import { teachingApi } from "@/lib/teachingApi";
import McFeedback from "./McFeedback";
import { getMcEncouragement } from "@/lib/mcEncouragement";

export type TeachingData = {
  rows: SubmissionRow[];
  roster: RosterStudent[];
  roster_revision: number;
};
const emptyFilters = {
  task: "",
  className: "",
  search: "",
  from: "",
  to: "",
  status: "",
};
export default function TeachingWorkspace({
  pin,
  initial,
  demo = false,
  legacy = false,
  onDataChange,
  loading = false,
}: {
  loading?: boolean;
  pin: string;
  initial: TeachingData;
  demo?: boolean;
  legacy?: boolean;
  onDataChange?: (data: TeachingData) => void;
}) {
  const [data, setData] = useState(initial);
  useEffect(() => setData(initial), [initial]);
  useEffect(() => {
    onDataChange?.(data);
  }, [data]);
  const [filters, setFilters] = useState(emptyFilters);
  const [panel, setPanel] = useState("submissions");
  const [selected, setSelected] = useState<SubmissionRow | null>(null);
  const [csv, setCsv] = useState("");
  const [importRows, setImportRows] = useState<RosterStudent[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const visible = useMemo(
    () => filterSubmissions(data.rows, filters),
    [data.rows, filters]
  );
  const classes = Array.from(
    new Set([...data.rows, ...data.roster].map(row => displayClass(row.class_name)))
  ).sort();
  const tasks = Array.from(
    new Map(
      [
        ...HISTORY_TASKS.map(t => [t.id, t.title] as const),
        ...data.rows
          .filter(r => !HISTORY_TASKS.some(t => t.id === r.task_id))
          .map(r => [r.task_id, r.task_title || r.task_id] as const),
      ].map(pair => pair)
    ).entries()
  );
  const missing = filters.task
    ? missingStudents(data.roster, data.rows, filters.task, filters.className)
    : [];
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "操作失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }
  function exportRows(detailed = false) {
    downloadCsv(detailed ? "逐題答案.csv" : "任務成績.csv", submissionExport(visible, detailed));
  }
  return (
    <section className="admin-panel mt-6 p-4 md:p-6">
      {demo && (
        <p className="mb-4 border-2 border-gold p-3 font-bold">
          示範模式：以下全部為虛構資料，操作只在這個頁面生效。
        </p>
      )}
      {legacy && (
        <p className="mb-4 border-2 border-gold p-3">
          目前連到舊版成績服務，可篩選及匯出舊分數。答案、名單及批改功能需先部署新版
          Apps Script。
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`pixel-button ${panel === "submissions" ? "pixel-button-teal" : "pixel-button-paper"}`}
          onClick={() => setPanel("submissions")}
        >
          答案收集箱（{data.rows.length}）
        </button>
        <button
          className={`pixel-button ${panel === "roster" ? "pixel-button-teal" : "pixel-button-paper"}`}
          onClick={() => setPanel("roster")}
        >
          班級名單與欠交
        </button>
      </div>
      <p className="mt-3 text-sm text-ink/70">
        開啟工作室、重新整理及載入更多提交時，系統會先同步題目版本，再核算本次載入的未核算提交，正式成績存入 Firestore。已有成績及評語會保留；短答仍需逐份手動批改。改題發佈後請重新載入網頁，以使用新網站版本。
      </p>
      <div className="my-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label>
          任務
          <select
            className="comic-input mt-1 w-full"
            value={filters.task}
            onChange={e => setFilters({ ...filters, task: e.target.value })}
          >
            <option value="">全部任務</option>
            {tasks.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <label>
          班別
          <select
            className="comic-input mt-1 w-full"
            value={filters.className}
            onChange={e =>
              setFilters({ ...filters, className: e.target.value })
            }
          >
            <option value="">全部班別</option>
            {classes.map(name => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {panel === "submissions" && (
          <>
            <label>
              姓名或學號
              <input
                className="comic-input mt-1 w-full"
                value={filters.search}
                onChange={e =>
                  setFilters({ ...filters, search: e.target.value })
                }
              />
            </label>
            <label>
              開始日期（香港時間）
              <input
                type="date"
                className="comic-input mt-1 w-full"
                value={filters.from}
                onChange={e => setFilters({ ...filters, from: e.target.value })}
              />
            </label>
            <label>
              結束日期（香港時間）
              <input
                type="date"
                className="comic-input mt-1 w-full"
                value={filters.to}
                onChange={e => setFilters({ ...filters, to: e.target.value })}
              />
            </label>
            <label>
              批改狀態
              <select
                className="comic-input mt-1 w-full"
                value={filters.status}
                onChange={e =>
                  setFilters({ ...filters, status: e.target.value })
                }
              >
                <option value="">全部狀態</option>
                <option value="pending">待批改</option>
                <option value="graded">已評分</option>
                <option value="legacy">舊紀錄</option>
              </select>
            </label>
          </>
        )}
      </div>
      {notice && (
        <p role="status" className="my-4 border-2 border-ink p-3">
          {notice}
        </p>
      )}
      {panel === "submissions" ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              className="pixel-button pixel-button-paper"
              onClick={() => exportRows()}
            >
              匯出篩選成績 CSV
            </button>
            <button
              className="pixel-button pixel-button-paper"
              disabled={!visible.some(r => r.answers?.length)}
              onClick={() => exportRows(true)}
            >
              匯出逐題答案 CSV
            </button>
            <button
              className="pixel-button pixel-button-paper"
              onClick={() => setFilters(emptyFilters)}
            >
              清除篩選
            </button>
          </div>
          <p className="mb-2">
            共 {visible.length} 份提交；重做會保留為獨立紀錄。
          </p>
          <div className="overflow-x-auto">
            <table className="score-table">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>班別／學號</th>
                  <th>姓名</th>
                  <th>任務</th>
                  <th>成績</th>
                  <th>答案</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(row => (
                  <tr key={row.attempt_id}>
                    <td>
                      {new Date(row.timestamp).toLocaleString("zh-HK", {
                        timeZone: "Asia/Hong_Kong",
                      })}
                    </td>
                    <td>
                      {displayClass(row.class_name)}／{row.student_no}
                    </td>
                    <td>{row.student_name}</td>
                    <td>
                      {row.task_title ||
                        tasks.find(([id]) => id === row.task_id)?.[1] ||
                        row.task_id}
                    </td>
                    <td>
                      {row.status === "pending"
                        ? "待批改"
                        : `${row.score ?? "—"}`}
                    </td>
                    <td>
                      <button
                        className="underline"
                        disabled={!row.answers?.length}
                        onClick={() => setSelected(row)}
                      >
                        {row.answers?.length
                          ? row.answers.some(answer => answer.type !== "choice") ? "查閱／批改" : "查閱 MC 回饋"
                          : "待核算選擇題"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <p className="p-6 text-center">目前沒有符合條件的提交。</p>
          )}
          {selected && (
            <Review
              key={`${selected.attempt_id}-${selected.revision}`}
              row={selected}
              busy={busy || loading}
              close={() => setSelected(null)}
              save={(answers, feedback) =>
                void perform(async () => {
                  let updated: SubmissionRow;
                  if (demo) {
                    const total = answers.reduce(
                      (n, a) => n + (a.awarded || 0),
                      0
                    );
                    const max = answers.reduce((n, a) => n + a.points, 0);
                    updated = {
                      ...selected,
                      answers,
                      feedback,
                      score: Math.round((total * 100) / max),
                      status: "graded",
                      revision: (selected.revision || 0) + 1,
                    };
                  } else {
                    const result = await teachingApi<{ row: SubmissionRow }>({
                      action: "grade",
                      pin,
                      attempt_id: selected.attempt_id,
                      revision: selected.revision,
                      marks: answers
                        .filter(a => a.type === "short")
                        .map(a => ({
                          question_id: a.question_id,
                          awarded: a.awarded,
                          feedback: a.feedback,
                        })),
                      feedback,
                    });
                    updated = result.row;
                  }
                  setData(current => ({
                    ...current,
                    rows: current.rows.map(r =>
                      r.attempt_id === updated.attempt_id ? updated : r
                    ),
                  }));
                  setSelected(null);
                  setNotice("批改已儲存，學生可用查閱碼查看評語。");
                })
              }
            />
          )}
        </>
      ) : (
        <>
          <h2 className="display-title text-2xl">
            班級名單（{data.roster.length} 人）
          </h2>
          <p className="my-2 text-sm">
            名單來自已核實的學生帳戶。請在下方「學生帳戶名單」匯入含 email 的 CSV，班別、學號和姓名會一起更新。
          </p>
          {demo && <><button
            className="pixel-button pixel-button-paper"
            onClick={() =>
              downloadCsv("班級名單範本.csv", [
                ["班別", "學號", "姓名"],
                ["3A", "01", "示例學生"],
              ])
            }
          >
            下載 CSV 範本
          </button>
          <label className="mt-3 block">
            讀取 CSV 檔案
            <input
              className="mt-1 block"
              type="file"
              accept=".csv,text/csv"
              disabled={legacy || busy}
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                void perform(async () => {
                  if (file.size > 1000000)
                    throw new Error("名單檔案不可超過 1 MB。");
                  const text = await file.text();
                  setCsv(text);
                  setImportRows([]);
                });
              }}
            />
          </label>
          <label className="mt-3 block">
            或貼上名單 CSV
            <textarea
              className="comic-input mt-1 min-h-28 w-full"
              value={csv}
              disabled={legacy}
              onChange={e => {
                setCsv(e.target.value);
                setImportRows([]);
              }}
              placeholder={"班別,學號,姓名\n3A,01,示例學生"}
            />
          </label>
          <button
            className="pixel-button pixel-button-paper mt-2"
            disabled={legacy || busy}
            onClick={() => {
              try {
                setImportRows(parseRoster(csv));
                setNotice("");
              } catch (e) {
                setImportRows([]);
                setNotice(String((e as Error).message));
              }
            }}
          >
            檢查匯入內容
          </button>
          {!!importRows.length && (
            <div className="my-4 border-2 border-ink p-4">
              <p>準備合併 {importRows.length} 位學生：</p>
              <ul className="max-h-48 overflow-auto">
                {importRows.map(s => (
                  <li key={`${s.class_name}:${s.student_no}`}>
                    {displayClass(s.class_name)} · {s.student_no} · {s.student_name}
                  </li>
                ))}
              </ul>
              <button
                className="pixel-button pixel-button-teal mt-3"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    if (demo) {
                      const merged = new Map(
                        data.roster.map(s => [
                          `${s.class_name}:${s.student_no}`,
                          s,
                        ])
                      );
                      importRows.forEach(s =>
                        merged.set(`${s.class_name}:${s.student_no}`, s)
                      );
                      setData({ ...data, roster: Array.from(merged.values()) });
                    } else {
                      const result = await teachingApi<{
                        roster: RosterStudent[];
                        roster_revision: number;
                      }>({
                        action: "roster",
                        pin,
                        students: importRows,
                        revision: data.roster_revision,
                      });
                      setData({ ...data, ...result });
                    }
                    setImportRows([]);
                    setCsv("");
                    setNotice("名單已匯入。");
                  })
                }
              >
                確認匯入名單
              </button>
            </div>
          )}
          </>}
          <div className="my-4 max-h-64 overflow-auto">
            <table className="score-table">
              <thead>
                <tr>
                  <th>班別</th>
                  <th>學號</th>
                  <th>姓名</th>
                </tr>
              </thead>
              <tbody>
                {data.roster
                  .filter(
                    s =>
                      matchesClass(s.class_name, filters.className)
                  )
                  .map(s => (
                    <tr key={`${s.class_name}:${s.student_no}`}>
                      <td>{displayClass(s.class_name)}</td>
                      <td>{s.student_no}</td>
                      <td>{s.student_name}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h3 className="display-title mt-6 text-2xl">欠交比對</h3>
          <p className="my-2">
            選擇上方任務及班別，按班級名單比對「從未提交」的學生；不套用日期或批改狀態篩選。待批改亦算已交。
          </p>
          {!filters.task ? (
            <p>請先選擇一個任務。</p>
          ) : !data.roster.length ? (
            <p>請先匯入班級名單。</p>
          ) : (
            <>
              <p>未交 {missing.length} 人</p>
              <ul className="my-3">
                {missing.map(s => (
                  <li key={`${s.class_name}:${s.student_no}`}>
                    {displayClass(s.class_name)} · {s.student_no} · {s.student_name}
                  </li>
                ))}
              </ul>
              <button
                className="pixel-button pixel-button-paper"
                onClick={() =>
                  downloadCsv("欠交名單.csv", [
                    ["班別", "學號", "姓名", "任務"],
                    ...missing.map(s => [
                      s.class_name,
                      s.student_no,
                      s.student_name,
                      filters.task,
                    ]),
                  ])
                }
              >
                匯出欠交名單
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Review({
  row,
  save,
  close,
  busy,
}: {
  row: SubmissionRow;
  save: (answers: AnswerRecord[], feedback: string) => void;
  close: () => void;
  busy: boolean;
}) {
  const [answers, setAnswers] = useState(row.answers || []);
  const [feedback, setFeedback] = useState(row.feedback || "");
  const [error, setError] = useState("");
  const hasManualQuestions = answers.some(answer => answer.type !== "choice");
  return (
    <form
      className="mt-6 border-4 border-ink bg-paper p-5"
      onSubmit={e => {
        e.preventDefault();
        if (!hasManualQuestions || busy) return;
        if (
          answers.some(
            a =>
              a.awarded === null ||
              !Number.isFinite(a.awarded) ||
              a.awarded < 0 ||
              a.awarded > a.points
          )
        ) {
          setError("請為每題填寫範圍內的分數。");
          return;
        }
        save(answers, feedback);
      }}
    >
      <h3 className="display-title text-2xl">
        {row.student_name} · {row.task_title || row.task_id}
      </h3>
      <McFeedback feedback={getMcEncouragement(row.attempt_id, answers)} />
      {answers.map((answer, i) => (
        <div
          key={answer.question_id}
          className="mt-5 border-t-2 border-ink/20 pt-3"
        >
          <p className="font-black">
            {i + 1}. {answer.prompt}
          </p>
          <p className="my-2 whitespace-pre-wrap">
            學生答案：{answer.response}
          </p>
          {answer.type === "short" ? (
            <>
              <label>
                得分（滿分 {answer.points}）
                <input
                  className="comic-input mx-2 w-24"
                  type="number"
                  required
                  min={0}
                  max={answer.points}
                  step={0.5}
                  disabled={busy}
                  value={answer.awarded ?? ""}
                  onChange={e =>
                    setAnswers(
                      answers.map((a, j) =>
                        j === i
                          ? {
                              ...a,
                              awarded:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : a
                      )
                    )
                  }
                />
              </label>
              <label className="mt-2 block">
                本題評語
                <textarea
                  className="comic-input mt-1 w-full"
                  maxLength={2000}
                  disabled={busy}
                  value={answer.feedback}
                  onChange={e =>
                    setAnswers(
                      answers.map((a, j) =>
                        j === i ? { ...a, feedback: e.target.value } : a
                      )
                    )
                  }
                />
              </label>
            </>
          ) : (
            <div><p>
              自動評分：{answer.awarded} / {answer.points}
            </p>{answer.feedback && <p>既有老師評語：{answer.feedback}</p>}</div>
          )}
        </div>
      ))}
      {hasManualQuestions ? <label className="mt-5 block">
        非 MC 題目總評語
        <textarea
          className="comic-input mt-1 w-full"
          maxLength={2000}
          disabled={busy}
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
        />
      </label> : feedback && <p className="mt-5 whitespace-pre-wrap">既有老師總評語：{feedback}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="mt-4 flex gap-3">
        {hasManualQuestions && <button className="pixel-button pixel-button-teal" disabled={busy}>
          儲存批改與評語
        </button>}
        <button
          type="button"
          className="pixel-button pixel-button-paper"
          disabled={busy}
          onClick={close}
        >
          關閉
        </button>
      </div>
    </form>
  );
}
