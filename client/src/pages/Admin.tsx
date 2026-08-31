/**
 * 設計提醒：教師後台仍是一份歷史編輯室報紙，不變成普通企業儀表板；數據保護由 GAS PIN 真正執行。
 */
import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, BookOpenCheck, KeyRound, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GAS_WEB_APP_URL } from "@/lib/historyQuest";

type AdminRow = { timestamp: string; class_name: string; student_name: string; student_no: string; task_id: string; score: string; progress: string; attempt_id: string };
type TaskData = { task_id: string; count: number; rows: AdminRow[] };
type AdminData = { ok: boolean; generated_at: string; tasks: TaskData[]; message?: string };

export default function Admin() {
  const [pin, setPin] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState("");

  async function loadDashboard(event?: React.FormEvent) {
    event?.preventDefault();
    if (!/^\d{6,12}$/.test(pin)) { setError("請輸入 6 至 12 位數字教師 PIN。"); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch(`${GAS_WEB_APP_URL}?action=admin&pin=${encodeURIComponent(pin)}&_=${Date.now()}`, { cache: "no-store" });
      const result = (await response.json()) as AdminData;
      if (!result.ok) throw new Error(result.message || "PIN 不正確");
      setData(result); setActiveTask((current) => current || result.tasks[0]?.task_id || "");
    } catch (reason) {
      setData(null); setError(reason instanceof Error ? reason.message : "📡 歷史檔案修復中，訊號微弱，請稍後再試…");
    } finally { setLoading(false); }
  }

  const chartData = useMemo(() => (data?.tasks || []).map((task) => ({ name: task.task_id.replace(/_/g, " ").slice(0, 22), 完成人次: task.count, 平均分: task.rows.length ? Math.round(task.rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / task.rows.length) : 0 })), [data]);
  const selected = data?.tasks.find((task) => task.task_id === activeTask);
  const totalRows = data?.tasks.reduce((sum, task) => sum + task.count, 0) || 0;
  const uniqueStudents = new Set(data?.tasks.flatMap((task) => task.rows.map((row) => `${row.class_name}:${row.student_no}`)) || []).size;

  return <div className="admin-page min-h-screen p-4 md:p-7">
    <header className="admin-masthead mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
      <div><p className="comic-kicker">教師專用 · 編輯室</p><h1 className="display-title mt-2 text-3xl md:text-5xl">歷史探索數據報</h1></div>
      <div className="flex gap-2"><Link href="/" className="pixel-button pixel-button-paper"><ArrowLeft className="h-4 w-4" />返回探索館</Link><a href={`${import.meta.env.BASE_URL}cms/`} className="pixel-button pixel-button-gold"><BookOpenCheck className="h-4 w-4" />內容管理</a></div>
    </header>

    {!data ? <main className="admin-login mx-auto mt-10 max-w-2xl">
      <div className="grid md:grid-cols-[0.7fr_1.3fr]"><div className="admin-lock"><ShieldCheck className="h-20 w-20" /><p className="pixel-label mt-5">成績資料已上鎖</p></div><form onSubmit={loadDashboard} className="paper-texture p-7 md:p-9"><h2 className="display-title text-3xl">教師驗證</h2><p className="mt-2 text-sm leading-6 text-ink/70">PIN 不會寫入網站程式；每次讀取都由 GAS 驗證後才回傳全班數據。</p><label className="mt-6 block text-sm font-black" htmlFor="admin-pin">教師 PIN</label><div className="relative mt-2"><KeyRound className="absolute left-3 top-3.5 h-5 w-5 text-ink/55" /><input id="admin-pin" type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} className="comic-input h-12 w-full pl-11" placeholder="••••••••" autoComplete="current-password" /></div>{error && <p className="mt-4 border-2 border-red bg-red/10 p-3 text-sm font-black text-red">{error}</p>}<button disabled={loading} className="pixel-button pixel-button-teal mt-6 w-full">{loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <BarChart3 className="h-5 w-5" />}{loading ? "正在翻查檔案…" : "打開成績檔案"}</button></form></div>
    </main> : <main className="mx-auto mt-7 max-w-7xl">
      <section className="grid gap-4 md:grid-cols-3"><div className="admin-stat"><UsersRound /><span><small>不重複學生</small><strong>{uniqueStudents}</strong></span></div><div className="admin-stat"><BookOpenCheck /><span><small>完成紀錄</small><strong>{totalRows}</strong></span></div><div className="admin-stat"><BarChart3 /><span><small>任務分頁</small><strong>{data.tasks.length}</strong></span></div></section>
      <section className="admin-panel mt-5"><div className="flex flex-wrap items-center justify-between gap-3 border-b-3 border-ink p-5"><div><p className="pixel-label text-red">總覽</p><h2 className="display-title text-2xl">各任務完成情況</h2></div><button className="pixel-button pixel-button-paper" onClick={() => void loadDashboard()}><RefreshCw className="h-4 w-4" />重新整理</button></div><div className="h-[340px] p-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="4 4" stroke="#172A3A55" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "#172A3A" }} /><YAxis tick={{ fill: "#172A3A" }} /><Tooltip contentStyle={{ background: "#F6E7C1", border: "3px solid #172A3A", boxShadow: "4px 4px 0 #172A3A" }} /><Bar dataKey="完成人次" fill="#2A9D8F" stroke="#172A3A" strokeWidth={2} /><Bar dataKey="平均分" fill="#E3A72F" stroke="#172A3A" strokeWidth={2} /></BarChart></ResponsiveContainer></div></section>
      <section className="admin-panel mt-5"><div className="flex flex-wrap gap-2 border-b-3 border-ink p-4">{data.tasks.map((task) => <button key={task.task_id} className={`task-tab ${activeTask === task.task_id ? "active" : ""}`} onClick={() => setActiveTask(task.task_id)}>{task.task_id} <b>{task.count}</b></button>)}</div><div className="overflow-x-auto"><table className="score-table"><thead><tr><th>時間</th><th>班別</th><th>姓名</th><th>學號</th><th>分數</th><th>進度</th></tr></thead><tbody>{selected?.rows.map((row) => <tr key={row.attempt_id}><td>{row.timestamp}</td><td>{row.class_name}</td><td>{row.student_name}</td><td>{row.student_no}</td><td><b>{row.score}</b></td><td>{row.progress}%</td></tr>)}</tbody></table></div></section>
    </main>}
  </div>;
}
