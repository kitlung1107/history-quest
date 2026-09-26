import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, where, writeBatch, type DocumentSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { HISTORY_TASKS, type TaskProgress } from "./historyQuest";
import { assessmentVersion, getQuestions, markAnswers, percentage, type Answer, type Question, type SubmissionRow } from "./assessment";
import type { CloudProfile } from "@/contexts/StudentAccount";
export type CloudSubmission = { studentId: string; taskId: string; version: string; answers: Answer[]; createdAt: { toDate: () => Date } | null; grade?: SubmissionRow };
export async function submitCloud(sid: string, attemptId: string, taskId: string, version: string, answers: Answer[]) {
  const ref = doc(db,"submissions",attemptId);
  await runTransaction(db, async tx => {
    const previous = await tx.get(ref);
    if (previous.exists()) return;
    tx.set(ref, { studentId:sid, taskId, version, answers, createdAt:serverTimestamp() });
    tx.set(doc(db,"progress",sid,"tasks",taskId), { score:0, progress:100, attemptId, syncedAt:serverTimestamp() });
  });
}
export async function loadCloudProgress(sid:string): Promise<TaskProgress> {
  const snapshot = await getDocs(collection(db,"progress",sid,"tasks"));
  return Object.fromEntries(snapshot.docs.map(d=>[d.id,{...d.data(),syncedAt:d.data().syncedAt?.toDate().toISOString()}])) as TaskProgress;
}
export async function loadSubmissions(sid?:string, cursor?:DocumentSnapshot) {
  const constraints = [...(sid ? [where("studentId","==",sid)] : []), orderBy("createdAt","desc"), ...(cursor ? [startAfter(cursor)] : []), limit(100)];
  const snapshot = await getDocs(query(collection(db,"submissions"),...constraints));
  return { docs:snapshot.docs, cursor:snapshot.docs.at(-1), more:snapshot.size===100 };
}
export function asRow(id:string, data:CloudSubmission, profile?:CloudProfile):SubmissionRow {
  if (data.grade) return data.grade;
  const task = HISTORY_TASKS.find(t=>t.id===data.taskId);
  return {attempt_id:id, task_id:data.taskId, task_title:task?.title || data.taskId, timestamp:data.createdAt?.toDate().toISOString() || "", class_name:profile?.className || "", student_name:profile?.name || "", student_no:profile?.studentNo || "", score:null, progress:100, status:"pending", revision:0};
}
export async function syncCatalogue() {
  const batch = writeBatch(db);
  for (const task of HISTORY_TASKS) {
    const questions = getQuestions(task);
    batch.set(doc(db,"catalogue",`${task.id}--${assessmentVersion(questions)}`), {questions,title:task.title});
  }
  await batch.commit();
}
export async function markSubmission(id:string) {
  const ref = doc(db,"submissions",id);
  await runTransaction(db,async tx=>{
    const snapshot = await tx.get(ref);
    const data = snapshot.data() as CloudSubmission;
    if (!data || data.grade) return;
    const catalogue = await tx.get(doc(db,"catalogue",`${data.taskId}--${data.version}`));
    if (!catalogue.exists()) throw new Error(`找不到 ${data.taskId} 的原版題目。請按教師工作室頂部「重新整理」重試；若仍失敗，需由網站管理員補回該提交版本的題目設定。`);
    const profile = await tx.get(doc(db,"profiles",data.studentId));
    const progressRef = doc(db,"progress",data.studentId,"tasks",data.taskId);
    const progress = await tx.get(progressRef);
    const answers = markAnswers(catalogue.data().questions as Question[],data.answers);
    const score = percentage(answers);
    const grade:SubmissionRow = {...asRow(id,data,profile.data() as CloudProfile),task_title:catalogue.data().title,answers,score,status:score===null?"pending":"graded",revision:1,feedback:""};
    tx.update(ref,{grade});
    if (progress.data()?.attemptId===id) tx.update(progressRef,{score:score || 0});
  });
}
export async function saveGrade(id:string, revision:number, marks:{question_id:string;awarded:number;feedback?:string}[], feedback:string) {
  await runTransaction(db,async tx=>{
    const ref=doc(db,"submissions",id);
    const snapshot=await tx.get(ref);
    const data=snapshot.data() as CloudSubmission;
    if (!data?.grade || data.grade.revision!==revision) throw new Error("資料已更新，請重新整理再批改。");
    const progressRef=doc(db,"progress",data.studentId,"tasks",data.taskId);
    const progress=await tx.get(progressRef);
    const answers=data.grade.answers!.map(a=>{
      const mark=marks.find(m=>m.question_id===a.question_id);
      if (!mark || a.type!=="short") return a;
      if (!Number.isFinite(mark.awarded) || mark.awarded<0 || mark.awarded>a.points) throw new Error("分數超出範圍。");
      return {...a,awarded:mark.awarded,feedback:mark.feedback || ""};
    });
    const score=percentage(answers);
    tx.update(ref,{grade:{...data.grade,answers,score,feedback,status:score===null?"pending":"graded",revision:revision+1}});
    if(progress.data()?.attemptId===id) tx.update(progressRef,{score:score || 0});
  });
  return (await getDoc(doc(db,"submissions",id))).data()!.grade as SubmissionRow;
}
