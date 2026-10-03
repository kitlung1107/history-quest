import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import {doc,getDocFromServer,writeBatch,serverTimestamp} from 'firebase/firestore';
import {db} from '@/lib/firebase';
import {HISTORY_TASKS} from '@/lib/historyQuest';
import {privateQuestions} from '@/lib/rulesAssessmentStore';
import {localAssessments} from '@/lib/localAssessment';
import type {Question} from '@/lib/assessment';
type AuthorQuestion=Question&{modelAnswer?:string;rubric?:string};
export default function AssessmentCMS(){
  const tasks=HISTORY_TASKS.filter(t=>t.type!=='game'&&t.assessmentVersion);
  const [id,setId]=useState(tasks[0]?.id??'');const task=tasks.find(t=>t.id===id);
  const [questions,setQuestions]=useState<AuthorQuestion[]>([]);const [title,setTitle]=useState('');const [description,setDescription]=useState('');
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  useEffect(()=>{let active=true;setNotice('');setQuestions([]);if(!task)return;setTitle(task.title);setDescription(task.description);setBusy(true);
    void privateQuestions(task).then(q=>{if(active)setQuestions(q);}).catch(e=>{if(active)setNotice(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
  },[id]);
  function update(i:number,change:Partial<AuthorQuestion>){setQuestions(q=>q.map((v,j)=>i===j?{...v,...change}:v));}
  async function publish(event:React.FormEvent){event.preventDefault();if(busy||!task)return;setBusy(true);setNotice('');
    try{
      if(!localAssessments)throw Error('此版本只開放本機預覽，正式發布須另外審核。');
      if(!questions.length||questions.length>30||!title.trim()||new Set(questions.map(q=>q.id)).size!==questions.length)throw Error('請填妥題目和標題，題數須為 1 至 30。');
      for(const q of questions){if(!q.prompt.trim()||q.prompt.length>2000||!Number.isInteger(q.points)||q.points<1||q.points>100)throw Error('題幹最多 2000 字，配分須為 1 至 100 的整數。');
        if(q.type==='choice'&&(!q.options||q.options.length<2||q.options.length>6||q.options.some(o=>!o.trim())||!Number.isInteger(q.answer)||q.answer!<0||q.answer!>=q.options.length))throw Error('選擇題須有 2 至 6 個選項及有效標準答案。');
        if((q.explanation??'').length>4000)throw Error('解說最多 4000 字。');}
      const version=crypto.randomUUID().replaceAll('-',''),versionId=`${task.id}--${version}`;
      // Whitelist public fields. Never place key fields in task JSON or metadata.
      const publicQuestions=questions.map(q=>({id:q.id,type:q.type,prompt:q.prompt,points:q.points,...(q.options?{options:q.options}:{}),...('image' in q?{image:(q as any).image}:{}),...('imagePosition' in q?{imagePosition:(q as any).imagePosition}:{})}));
      const privateKey={taskId:task.id,version,questions:questions.map(q=>({id:q.id,answer:q.type==='choice'?q.answer:null,explanation:q.explanation??'',modelAnswer:q.modelAnswer??'',rubric:q.rubric??''}))};
      const metadata={taskId:task.id,version,title,questions:publicQuestions,questionCount:questions.length,shortCount:questions.filter(q=>q.type==='short').length,totalPoints:questions.reduce((n,q)=>n+q.points,0),enabled:true,acceptFrom:serverTimestamp()};
      const batch=writeBatch(db);batch.set(doc(db,'assessmentKeys',versionId),privateKey);batch.set(doc(db,'assessmentVersions',versionId),metadata);await batch.commit();
      // The private key must exist before this public pointer can be exported.
      if(!(await getDocFromServer(doc(db,'assessmentVersions',versionId))).exists())throw Error('私有題庫尚未完成儲存。');
      const {id:ignoredId,question:ignoredQuestion,questions:ignoredQuestions,assessmentVersion:ignoredVersion,...publicFields}=task;
      const publicTask={...publicFields,task_id:task.id,title,description,assessmentVersion:version,questions:publicQuestions};
      const response=await fetch('/__assessment/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(publicTask)});
      if(!response.ok)throw Error(`私有版本已儲存，公開教材尚未匯出（${response.status}）；原教材仍可使用。`);
      setNotice('已儲存私有答案及匯出本機公開教材；未提交 Git 或發布正式網站。');
    }catch(e){setNotice(e instanceof Error?e.message:'儲存失敗，請重試。');}finally{setBusy(false);}
  }
  return <main className="paper-texture min-h-screen p-5 md:p-10"><div className="mx-auto max-w-4xl"><div className="flex flex-wrap gap-3"><Link href="/admin" className="pixel-button pixel-button-paper">返回教師工作室</Link><Link href="/" className="pixel-button pixel-button-paper">返回探索館</Link><a href="/cms/index.html?test=1" className="pixel-button pixel-button-paper">其他教材與卡片 CMS</a></div><h1 className="display-title my-6 text-3xl">教材與私有題庫管理</h1><p>標準答案及解說存入私有題庫。學生提交前只會讀取題幹和選項。修改後建立新版本，既有提交保留原版本。</p>
    <form onSubmit={publish} className="admin-panel my-5 space-y-5 p-5"><label className="block font-bold">教材<select className="comic-input mt-2 w-full" disabled={busy} value={id} onChange={e=>setId(e.target.value)}>{tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label><label className="block font-bold">標題<input className="comic-input mt-2 w-full" value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label><label className="block font-bold">簡介<textarea className="comic-input mt-2 w-full" value={description} disabled={busy} onChange={e=>setDescription(e.target.value)}/></label>
    {questions.map((q,i)=><fieldset key={q.id} disabled={busy} className="space-y-3 border-t-2 border-ink/20 pt-4"><legend className="font-black">第 {i+1} 題 · {q.type==='short'?'短答':'選擇題'}</legend><label className="block">題幹（可保留 Markdown 圖片）<textarea className="comic-input mt-1 min-h-24 w-full" aria-label={`第 ${i+1} 題題幹`} value={q.prompt} onChange={e=>update(i,{prompt:e.target.value})}/></label><label className="block">配分<input type="number" className="comic-input ml-2 w-24" min={1} max={100} value={q.points} onChange={e=>update(i,{points:Number(e.target.value)})}/></label>
      {q.type==='choice'?<><label className="block">選項（每行一個）<textarea className="comic-input mt-1 w-full" aria-label={`第 ${i+1} 題選項`} value={q.options?.join('\n')??''} onChange={e=>update(i,{options:e.target.value.split('\n')})}/></label><label className="block">標準答案<select className="comic-input ml-2" aria-label={`第 ${i+1} 題標準答案`} value={q.answer??''} onChange={e=>update(i,{answer:Number(e.target.value)})}><option value="" disabled>請選擇</option>{q.options?.map((o,n)=><option value={n} key={n}>{String.fromCharCode(65+n)}．{o}</option>)}</select></label></>:<><label className="block">參考答案<textarea className="comic-input mt-1 w-full" value={q.modelAnswer??''} onChange={e=>update(i,{modelAnswer:e.target.value})}/></label><label className="block">批改準則<textarea className="comic-input mt-1 w-full" value={q.rubric??''} onChange={e=>update(i,{rubric:e.target.value})}/></label></>}
      <label className="block">提交後解說<textarea className="comic-input mt-1 w-full" aria-label={`第 ${i+1} 題解說`} value={q.explanation??''} maxLength={4000} onChange={e=>update(i,{explanation:e.target.value})}/></label><button type="button" className="underline" onClick={()=>setQuestions(qs=>qs.filter((_,j)=>j!==i))}>移除此題</button></fieldset>)}
      <div className="flex flex-wrap gap-3"><button type="button" className="pixel-button pixel-button-paper" disabled={busy||questions.length>=30} onClick={()=>setQuestions(q=>[...q,{id:`q-${crypto.randomUUID().slice(0,8)}`,type:'choice',prompt:'',points:10,options:['',''],answer:0}])}>新增選擇題</button><button type="button" className="pixel-button pixel-button-paper" disabled={busy||questions.length>=30} onClick={()=>setQuestions(q=>[...q,{id:`q-${crypto.randomUUID().slice(0,8)}`,type:'short',prompt:'',points:10}])}>新增短答題</button><button type="submit" className="pixel-button pixel-button-teal" disabled={busy||!questions.length}>{busy?'儲存中…':'儲存私有答案及匯出公開教材'}</button></div>{notice&&<p role="status" className="whitespace-pre-wrap">{notice}</p>}</form>
  </div></main>;
}
