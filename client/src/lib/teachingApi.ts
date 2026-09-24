import { collection, doc, getDoc, getDocs, runTransaction } from "firebase/firestore";
import { auth, db, OWNER_EMAIL } from "./firebase";
import { asRow, loadSubmissions, saveGrade, syncCatalogue, type CloudSubmission } from "./cloudStore";
import type { CloudProfile } from "@/contexts/StudentAccount";
import type { RosterStudent } from "./assessment";
export async function serviceReady() { if (!auth.currentUser) throw new Error("請先登入 Google 帳戶。"); }
export async function teachingApi<T>(body:Record<string,unknown>):Promise<T> {
  await serviceReady();
  if(auth.currentUser?.email!==OWNER_EMAIL) throw new Error("需要教師權限。");
  let result:unknown;
  if(body.action==="admin") {
    const [page,profiles]=await Promise.all([loadSubmissions(),getDocs(collection(db,"profiles"))]);
    const map=new Map(profiles.docs.map(d=>[d.id,d.data() as CloudProfile]));
    result={rows:page.docs.map(d=>asRow(d.id,d.data() as CloudSubmission,map.get(d.data().studentId))),roster:profiles.docs.map(d=>({class_name:d.data().className,student_no:d.data().studentNo,student_name:d.data().name})),roster_revision:0};
  } else if(body.action==="catalogue") {await syncCatalogue();result={};}
  else if(body.action==="grade") result={row:await saveGrade(String(body.attempt_id),Number(body.revision),body.marks as Parameters<typeof saveGrade>[2],String(body.feedback||""))};
  else if(body.action==="roster") {
    const students=body.students as RosterStudent[];
    if(!Array.isArray(students) || students.length>400) throw new Error("每次最多匯入 400 人。");
    await runTransaction(db,async tx=>{
      const ref=doc(db,"metadata","roster");const meta=await tx.get(ref);const revision=meta.data()?.revision||0;
      if(revision!==body.revision)throw new Error("名單已更新，請重新整理。");
      for(const student of students)tx.set(doc(db,"roster",encodeURIComponent(`${student.class_name}:${student.student_no}`)),student);
      tx.set(ref,{revision:revision+1});
    });
    const roster=await getDocs(collection(db,"roster"));result={roster:roster.docs.map(d=>d.data()),roster_revision:Number(body.revision)+1};
  } else throw new Error("不支援此操作。");
  return result as T;
}
