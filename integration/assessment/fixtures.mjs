// Node-only synthetic fixtures. Never import into the browser bundle.
import {doc,setDoc,Timestamp} from 'firebase/firestore';
export const projectId='demo-rules-rewards';
export const ownerEmail='kitlung1107@gmail.com';
export const claims=email=>({email,email_verified:true,firebase:{sign_in_provider:'google.com'}});
export const acceptFrom=Timestamp.fromMillis(Date.now()-60_000);
export function makeAssessment(taskId,count,{shortIndexes=[],weights,correctAnswers}={}){
  const questions=Array.from({length:count},(_,i)=>({id:`q${i+1}`,type:shortIndexes.includes(i)?'short':'choice',prompt:shortIndexes.includes(i)?`短答 ${i+1}：請寫下你的歷史觀察。`:`選擇題 ${i+1}：哪一項符合課堂資料？`,points:weights?.[i]??10,...(shortIndexes.includes(i)?{}:{options:['選項甲','選項乙','選項丙']})}));
  const meta={taskId,version:'prototype-v1',title:taskId,questions,questionCount:count,shortCount:shortIndexes.length,totalPoints:questions.reduce((sum,q)=>sum+q.points,0),enabled:true,acceptFrom};
  const key={taskId,version:meta.version,questions:questions.map((q,i)=>({id:q.id,answer:q.type==='choice'?(correctAnswers?.[i]??i%3):null,explanation:'這是本機合成題的提交後解說。'}))};
  return{meta,key};
}
export async function seedIdentity(db,{automation=true}={}){
  if(automation)await setDoc(doc(db,'rewardAutomation','status'),{enabled:true,activatedAt:Timestamp.fromMillis(0)});
  for(const [email,sid,enabled] of [['learner@prototype.test','learner',true],['other@prototype.test','other',true],['disabled@prototype.test','disabled',false]]){
    await setDoc(doc(db,'access',email),{studentId:sid,enabled,testing:true});
    await setDoc(doc(db,'profiles',sid),{className:'1A',configured:true,name:'本機測試資料',studentNo:'1'});
  }
}
export async function seedAssessment(db,fixture,rule={mode:'tiers',amount:0,metric:'score',tiers:[{minimum:80,amount:80},{minimum:0,amount:10},{minimum:100,amount:100},{minimum:50,amount:50}]}){
  const{meta,key}=fixture,id=`${meta.taskId}--${meta.version}`;
  await setDoc(doc(db,'assessmentKeys',id),key);
  await setDoc(doc(db,'assessmentVersions',id),meta);
  await setDoc(doc(db,'taskAccess',meta.taskId),{grade:1,enabled:true});
  await setDoc(doc(db,'coinRules',meta.taskId),rule);
}
export const previewFixtures=[
  makeAssessment('mc-1',1),makeAssessment('mc-3',3),makeAssessment('mc-10',10),makeAssessment('mc-30',30),
  makeAssessment('mixed-10',10,{shortIndexes:[1,3,5,7,9]}),
  makeAssessment('short-3',3,{shortIndexes:[0,1,2]}),
  makeAssessment('short-30',30,{shortIndexes:Array.from({length:30},(_,i)=>i)}),
];

// Public synthetic image fixture; contains no answer or explanation.
previewFixtures.find(f=>f.meta.taskId==='mc-3').meta.questions[0].image='/fixture-question.svg';
