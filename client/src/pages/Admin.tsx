import AccessRequestManager from "@/components/AccessRequestManager";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { collection, getDocs, type DocumentSnapshot } from "firebase/firestore";
import { db, googleLogout } from "@/lib/firebase";
import { loadSubmissions, asRow, markSubmission, syncCatalogue, type CloudSubmission } from "@/lib/cloudStore";
import TeachingWorkspace, { type TeachingData } from "@/components/TeachingWorkspace";
import AccountManager from "@/components/AccountManager";
import { type CloudProfile, useStudentAccount } from "@/contexts/StudentAccount";
export default function Admin() {
  const account=useStudentAccount();
  const [data,setData]=useState<TeachingData|null>(null);
  const [profiles,setProfiles]=useState(new Map<string,CloudProfile>());
  const [cursor,setCursor]=useState<DocumentSnapshot>();const [more,setMore]=useState(false);
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");
  async function run(action:()=>Promise<void>){setBusy(true);setNotice("");try{await action();}catch(e){setNotice(e instanceof Error?e.message:"操作失敗");}finally{setBusy(false);}}
  async function refresh() {
    const [ps,page]=await Promise.all([getDocs(collection(db,"profiles")),loadSubmissions()]);
    const map=new Map(ps.docs.map(d=>[d.id,d.data() as CloudProfile]));setProfiles(map);
    setData({rows:page.docs.map(d=>asRow(d.id,d.data() as CloudSubmission,map.get(d.data().studentId))),roster:Array.from(map.values()).map(p=>({class_name:p.className,student_no:p.studentNo,student_name:p.name})),roster_revision:0});setCursor(page.cursor);setMore(page.more);
  }
  useEffect(()=>{void run(refresh);},[]);
  return <main className="paper-texture min-h-screen p-5 md:p-10"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap gap-3"><Link href="/" className="pixel-button pixel-button-paper">返回探索館</Link><button className="pixel-button pixel-button-paper" onClick={()=>void googleLogout()}>登出</button><button disabled={busy} className="pixel-button pixel-button-paper" onClick={()=>void run(refresh)}>重新載入最新提交</button><a href={`${import.meta.env.BASE_URL}cms/index.html`} className="pixel-button pixel-button-gold text-center">教材與題目管理（CMS）</a></div>
    <h1 className="display-title my-6 text-3xl">教師工作室</h1><p>{account.user.email} · Firestore</p>
    <p className="my-3">每次載入 100 份提交；篩選、匯出及欠交比較只涵蓋已載入的紀錄。需要完整比較時請先載入更多。</p>
    <button className="pixel-button pixel-button-gold" disabled={busy} onClick={()=>void run(async()=>{await syncCatalogue();let count=0;const failures:string[]=[];for(const row of data?.rows||[])if(!row.revision){try{await markSubmission(row.attempt_id);count++;}catch(e){failures.push(`${row.task_title}: ${e instanceof Error?e.message:"無法核算"}`);}}await refresh();setNotice(`已核算 ${count} 份。短答請逐份批改。${failures.join("；")}`);})}>核算已載入的選擇題</button>
    <p className="mt-3 text-sm">學生交卷後先顯示練習參考分數；正式分數由此教師操作核算並儲存，不需付費 Cloud Functions。</p>
    {notice&&<p role="status" className="my-4 border-2 p-3">{notice}</p>}
    {data&&<TeachingWorkspace pin="" initial={data} onDataChange={setData}/>}
    {more&&<button disabled={busy} className="pixel-button pixel-button-paper my-4" onClick={()=>void run(async()=>{const page=await loadSubmissions(undefined,cursor);setData(current=>current?{...current,rows:[...current.rows,...page.docs.map(d=>asRow(d.id,d.data() as CloudSubmission,profiles.get(d.data().studentId)))].filter((r,i,all)=>all.findIndex(a=>a.attempt_id===r.attempt_id)===i)}:current);setCursor(page.cursor);setMore(page.more);})}>載入更早的 100 份</button>}
    <AccessRequestManager onChanged={refresh}/><AccountManager onChanged={refresh}/>
  </div></main>;
}
