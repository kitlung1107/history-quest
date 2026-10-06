import {doc,getDocFromServer,setDoc} from 'firebase/firestore';
import {db} from './firebase';
import {auth} from './firebase';
import {localMockIdentity,localIdentity} from './localAssessment';
import {assessmentActor,requireAssessmentActor} from './assessmentSession';
import {submitAndSettle,settleSealedAssessment,saveShortGrade,type PublicAssessment,type RulesGrade} from './rulesAssessment';
import {getQuestions,markAnswers,type Answer,type Question,type SubmissionRow} from './assessment';
import type {CloudProfile} from '@/contexts/StudentAccount';
import type {HistoryTask} from './historyQuest';
export const isRulesSubmission=(data:any)=>data.protocol==='rules-assessment/1';
export async function assessmentMetadata(taskId:string,version:string){
  const s=await getDocFromServer(doc(db,'assessmentVersions',`${taskId}--${version}`));
  if(!s.exists())throw Error('找不到已發布的題目版本，請通知老師。');
  return s.data() as PublicAssessment;
}
export async function privateQuestions(task:HistoryTask):Promise<Question[]>{
  if(!task.assessmentVersion)return getQuestions(task);
  const meta=await assessmentMetadata(task.id,task.assessmentVersion);
  const key=await getDocFromServer(doc(db,'assessmentKeys',`${task.id}--${task.assessmentVersion}`));
  if(!key.exists())throw Error('找不到私有標準答案。');
  return meta.questions.map((q,i)=>({...q,...key.data().questions[i]}));
}
export async function submitRulesCloud(sid:string,id:string,taskId:string,version:string,answers:Answer[]){
  await requireAssessmentActor(sid);
  // sealAnswers only needs the immutable identity. Settlement reads the public
  // version once from the server; Rules still validate it at every checkpoint.
  await submitAndSettle(db,id,sid,{taskId,version},answers);
}
export async function readRulesResult(id:string,data?:any,profile?:CloudProfile){
  const source=data??(await getDocFromServer(doc(db,'submissions',id))).data();
  const meta=await assessmentMetadata(source.taskId,source.version);
  const grade=source.grade as RulesGrade|undefined;
  let questions:Question[]=meta.questions;
  let answers:SubmissionRow['answers'];
  if(grade){
    // No key read occurs until the source has a completed, rule-checked grade.
    const key=await getDocFromServer(doc(db,'assessmentKeys',`${source.taskId}--${source.version}`));
    questions=meta.questions.map((q,i)=>({...q,...key.data()!.questions[i]}));
    answers=markAnswers(questions,source.answers).map((a,i)=>({...a,awarded:a.type==='short'?grade.shortMarks[i]:a.awarded}));
  }
  const review=(await getDocFromServer(doc(db,'assessmentReviews',id))).data();
  const currentReview=review?.revision===grade?.revision?review:undefined;
  if(answers)answers=answers.map(a=>({...a,feedback:currentReview?.questions[a.question_id]??''}));
  const p=profile??(await getDocFromServer(doc(db,'profiles',source.studentId))).data() as CloudProfile;
  const row:SubmissionRow={protocol:"rules-assessment/1",attempt_id:id,task_id:source.taskId,task_title:meta.title,timestamp:source.createdAt?.toDate().toISOString()??'',class_name:p?.className??'',student_name:p?.name??'',student_no:p?.studentNo??'',score:grade?.score??null,progress:100,status:grade?.status??'pending',revision:grade?.revision??0,answers,feedback:currentReview?.feedback??''};
  return{row,questions};
}
export async function resumeRulesSubmission(id:string){
  await requireAssessmentActor();
  await settleSealedAssessment(db,id);return (await readRulesResult(id)).row;
}
type Mark={question_id:string;awarded:number;feedback?:string};
type Edit={id:string;revision:number;marks:Mark[];feedback:string};
const outboxKey=()=>`hq.rules-grading.${db.app.options.projectId}.${localMockIdentity?localIdentity.uid:auth.currentUser?.uid??'signed-out'}`;
function outbox():Edit[]{try{return JSON.parse(sessionStorage.getItem(outboxKey())??'[]');}catch{return[];}}
async function completeEdit(edit:Edit){
  const source=(await getDocFromServer(doc(db,'submissions',edit.id))).data()!;
  const meta=await assessmentMetadata(source.taskId,source.version);
  const shortMarks=meta.questions.map(q=>q.type==='choice'?null:edit.marks.find(m=>m.question_id===q.id)?.awarded??null);
  let grade:RulesGrade;
  try{grade=await saveShortGrade(db,edit.id,edit.revision,shortMarks);}catch(error){if(error&&typeof error==='object'&&!('assessmentStage' in error))Object.assign(error,{assessmentStage:'saveShortGrade'});throw error;}
  try{await setDoc(doc(db,'assessmentReviews',edit.id),{revision:grade.revision,feedback:edit.feedback,questions:Object.fromEntries(edit.marks.map(m=>[m.question_id,m.feedback??'']))});}catch(error){if(error&&typeof error==='object')Object.assign(error,{assessmentStage:'saveAssessmentReview'});throw error;}
  let row:SubmissionRow;
  try{row=(await readRulesResult(edit.id)).row;}catch(error){if(error&&typeof error==='object')Object.assign(error,{assessmentStage:'readGradedResult'});throw error;}
  sessionStorage.setItem(outboxKey(),JSON.stringify(outbox().filter(e=>e.id!==edit.id)));
  return row;
}
export async function recoverGradingOutbox(){const edits=outbox();if(!edits.length)return;if(!(await assessmentActor()).teacher)return;for(const edit of edits)await completeEdit(edit);}
export async function saveRulesGrade(id:string,revision:number,marks:Mark[],feedback:string){
  await requireAssessmentActor(undefined,true);
  if(feedback.length>8000||marks.some(m=>(m.feedback??'').length>8000))throw Error('評語最多 8000 字。');
  const pending=outbox().find(e=>e.id===id);
  if(pending)return completeEdit(pending);
  const source=(await getDocFromServer(doc(db,'submissions',id))).data()!;
  const meta=await assessmentMetadata(source.taskId,source.version);
  const expectedMarks=meta.questions.map(q=>q.type==='choice'?null:marks.find(m=>m.question_id===q.id)?.awarded??null);
  if(source.grade?.revision===revision+1&&JSON.stringify(source.grade.shortMarks)===JSON.stringify(expectedMarks)){
    const review=(await getDocFromServer(doc(db,'assessmentReviews',id))).data();
    const expectedComments=Object.fromEntries(marks.map(m=>[m.question_id,m.feedback??'']));
    if(review&&review.revision===source.grade.revision&&review.feedback===feedback&&Object.keys(expectedComments).every(q=>review.questions[q]===expectedComments[q]))return (await readRulesResult(id)).row;
    // The grade/ledger may have committed before the review was saved. Resume
    // that exact revision; an existing conflicting review still fails below.
    if(!review){
      const edit={id,revision,marks,feedback};sessionStorage.setItem(outboxKey(),JSON.stringify([...outbox(),edit]));
      return completeEdit(edit);
    }
  }
  if(source.grade?.revision!==revision)throw Error('批改版本已更新，請重新整理。');
  if(meta.questions.some(q=>q.type==='short'&&(!marks.some(m=>m.question_id===q.id)||marks.some(m=>m.question_id===q.id&&(!Number.isFinite(m.awarded)||m.awarded<0||m.awarded>q.points)))))throw Error('請填妥每道短答的分數。');
  const edit={id,revision,marks,feedback};sessionStorage.setItem(outboxKey(),JSON.stringify([...outbox(),edit]));
  return completeEdit(edit);
}
