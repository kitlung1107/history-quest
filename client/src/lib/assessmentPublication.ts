import type {HistoryTask} from './historyQuest';
import type {Question} from './assessment';
export type AuthorQuestion=Question&{modelAnswer?:string;rubric?:string;image?:string;imagePosition?:{x:number;y:number}};
const privateFields=new Set(['answer','answers','explanation','modelanswer','rubric','correctanswer','privatekey','keydocument','studentid','amount','score','balance','rewardamount']);
export function assertPublicAssessment(value:unknown){
  if(Array.isArray(value)){value.forEach(assertPublicAssessment);return;}
  if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){
    if(privateFields.has(key.toLowerCase())||(key.toLowerCase()==='grade'&&typeof child!=='number'))throw Error('公開教材不可包含標準答案、評語、帳戶或獎勵資料。');
    assertPublicAssessment(child);
  }
}
export function prepareAssessmentVersion(task:HistoryTask,questions:AuthorQuestion[],title:string,description:string,version:string){
  if(task.type==='game')throw Error('遊戲問卷沿用原流程。');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(task.id)||!/^[A-Za-z0-9_-]{1,100}$/.test(version))throw Error('教材或版本識別碼無效。');
  if(!questions.length||questions.length>30||!title.trim()||new Set(questions.map(q=>q.id)).size!==questions.length)throw Error('請填妥題目和標題，題數須為 1 至 30。');
  for(const q of questions){
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(q.id)||!['choice','short'].includes(q.type)||!q.prompt.trim()||q.prompt.length>2000||!Number.isInteger(q.points)||q.points<1||q.points>100)throw Error('題目識別碼、題型、題幹或配分無效。');
    if(q.type==='choice'&&(!q.options||q.options.length<2||q.options.length>6||q.options.some(o=>!o.trim()||o.length>1000)||!Number.isInteger(q.answer)||q.answer!<0||q.answer!>=q.options.length))throw Error('選擇題須有 2 至 6 個選項及有效標準答案。');
    if((q.explanation??'').length>4000||(q.modelAnswer??'').length>8000||(q.rubric??'').length>8000)throw Error('解說或批改資料過長。');
  }
  const publicQuestions=questions.map(q=>({id:q.id,type:q.type,prompt:q.prompt,points:q.points,...(q.type==='choice'?{options:q.options}:{}),...(q.image?{image:q.image}:{}),...(q.imagePosition?{imagePosition:q.imagePosition}:{})}));
  const privateKey={taskId:task.id,version,questions:questions.map(q=>({id:q.id,answer:q.type==='choice'?q.answer:null,explanation:q.explanation??'',modelAnswer:q.modelAnswer??'',rubric:q.rubric??''}))};
  const metadata={taskId:task.id,version,title,questions:publicQuestions,questionCount:questions.length,shortCount:questions.filter(q=>q.type==='short').length,totalPoints:questions.reduce((n,q)=>n+q.points,0),enabled:true};
  const {id,question,questions:oldQuestions,assessmentVersion,...publicFields}=task;
  const publicTask={...publicFields,task_id:id,title,description,assessmentVersion:version,questions:publicQuestions};
  assertPublicAssessment(publicTask);assertPublicAssessment(metadata);
  return{privateKey,metadata,publicTask};
}
