import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLASS_OPTIONS } from "@/lib/historyQuest";
import { reviewAccessRequest, type AccessRequest } from "@/lib/accessRequests";
import type { CloudProfile } from "@/contexts/StudentAccount";

export default function AccessRequestManager({ onChanged }: { onChanged: () => Promise<void> }) {
  const [requests, setRequests] = useState<(AccessRequest & { email: string })[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; profile: CloudProfile }[]>([]);
  const [selected, setSelected] = useState(""), [sid, setSid] = useState(""), [mode, setMode] = useState("link");
  const [name, setName] = useState(""), [className, setClassName] = useState(""), [studentNo, setStudentNo] = useState(""), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  async function refresh() {
    const [rs, ps] = await Promise.all([getDocs(collection(db, "accessRequests")), getDocs(collection(db, "profiles"))]);
    setRequests(rs.docs.map(d => ({ ...d.data() as AccessRequest, email: d.id })).sort((a,b) => (b.submittedAt?.toMillis() || 0) - (a.submittedAt?.toMillis() || 0)));
    setProfiles(ps.docs.map(d => ({ id: d.id, profile: d.data() as CloudProfile })));
  }
  async function run(action: () => Promise<void>) { setBusy(true); setNotice(""); try { await action(); } catch (e) { setNotice(e instanceof Error ? e.message : "操作失敗"); } finally { setBusy(false); } }
  useEffect(() => { void run(refresh); }, []);
  async function review(approve: boolean) {
    let profile: CloudProfile | undefined;
    if (approve && mode === "new") {
      const cleanName = name.trim(), cleanNo = studentNo.trim().toUpperCase();
      if (cleanName.length < 2 || cleanName.length > 50 || !/^[1-6][A-E]$/.test(className) || !/^[A-Z0-9-]{1,12}$/.test(cleanNo)) throw new Error("請填齊有效的學生名冊資料。");
      profile = { name: cleanName, className, studentNo: cleanNo, nickname: cleanName.slice(0,20), avatar: "explorer", configured: false };
    }
    if (approve && mode === "link" && !sid) throw new Error("請選擇對應學生。");
    await reviewAccessRequest(selected, approve ? (profile ? crypto.randomUUID() : sid) : null, reason, profile);
    setSelected(""); await refresh(); await onChanged(); setNotice(approve ? "已批准申請，學生可按重新檢查進入。" : "已拒絕申請，學生可查看原因並修正資料。");
  }
  return <section className="admin-panel my-8 p-6"><h2 className="display-title text-2xl">准用電郵申請</h2>
    <p className="my-3">請核對申請人的身分。連結現有學生會沿用其角色及所有成績；建立新帳號會新增學生紀錄。</p>
    <button disabled={busy} className="pixel-button pixel-button-paper" onClick={() => void run(refresh)}>重新載入申請</button>
    <ul className="my-4 max-h-96 overflow-auto">{requests.map(r => <li key={r.email} className="my-3 border-b pb-3"><p className="break-all">{r.email} · {r.className} · {r.studentNo} · {r.name}</p><p>{r.status === "pending" ? "待審批" : r.status === "approved" ? "已批准" : `已拒絕：${r.reason}`}</p>{r.status === "pending" && <button disabled={busy} className="underline" onClick={() => { setSelected(r.email); setSid(""); setMode("link"); setName(r.name); setClassName(r.className); setStudentNo(r.studentNo); setReason(""); }}>核對及審批</button>}</li>)}</ul>
    {!requests.length && <p>目前沒有申請。</p>}
    {selected && <div className="grid gap-3 border-2 p-4"><h3 className="break-all">正在審批：{selected}</h3>
      <label>批准方式<select disabled={busy} className="comic-input block w-full" value={mode} onChange={e => setMode(e.target.value)}><option value="link">連結現有學生帳號</option><option value="new">建立新學生帳號</option></select></label>
      {mode === "link" ? <label>對應學生<select disabled={busy} className="comic-input block w-full" value={sid} onChange={e => setSid(e.target.value)}><option value="">請核對並選擇學生</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.profile.className} · {p.profile.studentNo} · {p.profile.name}</option>)}</select></label> : <>
        <label>班別<select disabled={busy} className="comic-input block w-full" value={className} onChange={e => setClassName(e.target.value)}><option value="">選擇班別</option>{CLASS_OPTIONS.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>學號<input disabled={busy} maxLength={12} className="comic-input block w-full" value={studentNo} onChange={e => setStudentNo(e.target.value)} /></label>
        <label>姓名<input disabled={busy} maxLength={50} className="comic-input block w-full" value={name} onChange={e => setName(e.target.value)} /></label>
      </>}
      <button disabled={busy} className="pixel-button pixel-button-gold" onClick={() => void run(() => review(true))}>批准並{mode === "link" ? "連結所選學生" : "建立新帳號"}</button>
      <label>拒絕原因（拒絕時必填）<textarea disabled={busy} maxLength={200} className="comic-input block w-full" value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button disabled={busy} className="pixel-button pixel-button-paper" onClick={() => void run(() => review(false))}>拒絕申請</button>
    </div>}
    {notice && <p className="my-3" role="status">{notice}</p>}
  </section>;
}
