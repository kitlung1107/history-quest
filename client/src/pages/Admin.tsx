import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { collection, getDocs, type DocumentSnapshot } from "firebase/firestore";
import { db, googleLogout } from "@/lib/firebase";
import { loadSubmissions, asRow, markSubmission, syncCatalogue, type CloudSubmission } from "@/lib/cloudStore";
import TeachingWorkspace, { type TeachingData } from "@/components/TeachingWorkspace";
import AccountManager from "@/components/AccountManager";
import { type CloudProfile, useStudentAccount } from "@/contexts/StudentAccount";

export default function Admin() {
  const account = useStudentAccount();
  const [data, setData] = useState<TeachingData | null>(null);
  const [cursor, setCursor] = useState<DocumentSnapshot>();
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [catalogueNotice, setCatalogueNotice] = useState("");
  // The ref also guards rapid clicks and React's repeated effect setup.
  const running = useRef(false);
  const pagesLoaded = useRef(1);

  async function refreshWorkspace(append = false) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setNotice("");
    setCatalogueNotice("正在同步目前網站的題目設定……");
    try {
      // Keep submissions readable when catalogue synchronization fails.
      const [catalogue, loaded] = await Promise.allSettled([
        syncCatalogue(),
        (async () => {
          const ps = await getDocs(collection(db, "profiles"));
          const profiles = new Map(ps.docs.map(d => [d.id, d.data() as CloudProfile]));
          const docs: Awaited<ReturnType<typeof loadSubmissions>>["docs"] = [];
          let pageCursor = append ? cursor : undefined;
          let hasMore = false;
          let pageCount = 0;
          const targetPages = append ? 1 : pagesLoaded.current;
          for (let i = 0; i < targetPages; i++) {
            const page = await loadSubmissions(undefined, pageCursor);
            docs.push(...page.docs);
            pageCursor = page.cursor;
            hasMore = page.more;
            pageCount++;
            if (!hasMore) break;
          }
          return { profiles, docs, pageCursor, hasMore, pageCount };
        })(),
      ]);
      if (catalogue.status === "rejected") {
        setCatalogueNotice("題目設定同步失敗，本次未核算任何提交。請按「重新整理」重試。" + errorMessage(catalogue.reason));
      } else {
        setCatalogueNotice("目前網站的題目、標準答案、配分及版本已同步至 Firestore。");
      }
      if (loaded.status === "rejected") throw loaded.reason;
      const { profiles, docs, pageCursor, hasMore, pageCount } = loaded.value;
      const rows = docs.map(d => asRow(d.id, d.data() as CloudSubmission, profiles.get(d.data().studentId)));
      const roster = Array.from(profiles.values()).map(p => ({ class_name: p.className, student_no: p.studentNo, student_name: p.name }));
      setData(current => ({
        rows: append ? [...(current?.rows || []), ...rows].filter((r, i, all) => all.findIndex(a => a.attempt_id === r.attempt_id) === i) : rows,
        roster,
        roster_revision: 0,
      }));
      setCursor(pageCursor);
      setMore(hasMore);
      pagesLoaded.current = append ? pagesLoaded.current + pageCount : pageCount;
      if (catalogue.status === "rejected") return;

      let processed = 0;
      const failures: string[] = [];
      for (const snapshot of docs) {
        // Short answers with a pending grade already exist; never regrade them.
        if (snapshot.data().grade) continue;
        try {
          const grade = await markSubmission(snapshot.id);
          setData(current => current ? {
            ...current,
            rows: current.rows.map(row => row.attempt_id === snapshot.id ? grade : row),
          } : current);
          processed++;
        } catch (error) {
          const row = rows.find(r => r.attempt_id === snapshot.id)!;
          failures.push(row.class_name + "／" + row.student_no + " " + row.student_name + " · " + row.task_title + "（提交 " + snapshot.id + "）：" + errorMessage(error));
        }
      }
      setNotice(
        (append ? "本次新增載入 " : "本次重新載入 ") + rows.length + " 份提交；已確認核算 " + processed + " 份原先未核算的提交。既有成績及評語保留，短答仍需逐份手動批改。" +
        (hasMore ? "尚有未載入的提交，未包含在本次核算內。" : "") +
        (failures.length ? "\n" + failures.length + " 份核算失敗，請按「重新整理」重試：\n" + failures.join("\n") : "")
      );
    } catch (error) {
      setNotice("載入提交或名單失敗，請按「重新整理」重試。" + errorMessage(error));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  useEffect(() => { void refreshWorkspace(); }, []);
  return <main className="paper-texture min-h-screen p-5 md:p-10"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap gap-3">
      <Link href="/" className="pixel-button pixel-button-paper">返回探索館</Link>
      <button className="pixel-button pixel-button-paper" onClick={() => void googleLogout()}>登出</button>
      <button disabled={busy} className="pixel-button pixel-button-paper" onClick={() => void refreshWorkspace()}>{busy ? "正在整理與核算……" : "重新整理"}</button>
      <a href={import.meta.env.BASE_URL + "cms/index.html"} className="pixel-button pixel-button-gold text-center">教材與題目管理（CMS）</a>
    </div>
    <h1 className="display-title my-6 text-3xl">教師工作室</h1><p>{account.user.email} · Firestore</p>
    <p className="my-3">首次載入最新 100 份提交；「載入更早的 100 份」會同步題目並核算新增載入的未核算提交。「重新整理」會重新讀取目前已載入的頁數並重試核算。篩選、匯出及欠交比較只涵蓋已載入紀錄，需要完整比較時請先載入更多。</p>
    <p className="mt-3 text-sm">開啟工作室及重新整理時，先同步題目版本，再核算本次載入且未核算的提交。學生交卷流程不變；短答仍需教師評分，不會重新批改已有成績或評語的提交。</p>
    {notice && <p role="status" className="my-4 whitespace-pre-wrap border-2 p-3">{notice}</p>}
    {catalogueNotice && <p role="status" className="my-4 border-2 p-3">{catalogueNotice}</p>}
    {data && <TeachingWorkspace pin="" initial={data} onDataChange={setData} loading={busy} />}
    {more && <button disabled={busy} className="pixel-button pixel-button-paper my-4" onClick={() => void refreshWorkspace(true)}>載入更早的 100 份</button>}
    <AccountManager onChanged={() => refreshWorkspace()} />
  </div></main>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失敗，請檢查網絡連線。";
}
