import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CLASS_OPTIONS } from "@/lib/historyQuest";
import { submitAccessRequest, type AccessRequest } from "@/lib/accessRequests";

export default function AccessRequestForm({ email }: { email: string }) {
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [name, setName] = useState(""), [className, setClassName] = useState(""), [studentNo, setStudentNo] = useState("");
  useEffect(() => onSnapshot(doc(db, "accessRequests", email), snapshot => {
    setRequest(snapshot.exists() ? snapshot.data() as AccessRequest : null); setLoaded(true); setError("");
  }, () => { setError("未能讀取申請，請重新檢查或聯絡老師。"); setLoaded(false); }), [email]);
  return <div className="my-4 text-left">
    <p className="break-all">{email} 尚未獲准使用。</p>
    {!loaded && !error && <p role="status">正在讀取申請…</p>}
    {request?.status === "pending" && <p role="status" className="my-3">申請已送到教師工作室，正在等待老師審批，無須重複提交。</p>}
    {request?.status === "approved" && <p role="status" className="my-3">申請已獲批准，請按「重新檢查」進入。如仍無法進入，請聯絡老師確認帳戶是否已停用。</p>}
    {request?.status === "rejected" && <p role="status" className="my-3">申請被拒絕：{request.reason}。請核對資料後重新提交。</p>}
    {loaded && (!request || request.status === "rejected") && <form className="my-4 grid gap-3" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { await submitAccessRequest(email, { name, className, studentNo }); } catch (e) { setError(e instanceof Error ? e.message : "提交失敗，請重試。"); } finally { setBusy(false); }
    }}>
      <p className="text-sm">填寫名冊上的資料，申請會在站內交給老師核對。</p>
      <label>班別<select required disabled={busy} className="comic-input block w-full" value={className} onChange={e => setClassName(e.target.value)}><option value="">選擇班別</option>{CLASS_OPTIONS.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>學號<input required disabled={busy} maxLength={12} pattern="[A-Za-z0-9-]{1,12}" className="comic-input block w-full" value={studentNo} onChange={e => setStudentNo(e.target.value)} /></label>
      <label>姓名<input required disabled={busy} minLength={2} maxLength={50} className="comic-input block w-full" value={name} onChange={e => setName(e.target.value)} /></label>
      <button disabled={busy} className="pixel-button pixel-button-gold">{busy ? "提交中…" : "提交准用申請"}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
