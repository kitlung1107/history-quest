import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import {HISTORY_TASKS} from '@/lib/historyQuest';
import {privateQuestions} from '@/lib/rulesAssessmentStore';
import {localAssessments,localMockIdentity,assessmentTransportEnabled} from '@/lib/localAssessment';
import {saveAssessmentVersion} from '@/lib/assessmentPublisher';
import type {AuthorQuestion} from '@/lib/assessmentPublication';
export default function AssessmentCMS(){
  const tasks=HISTORY_TASKS.filter(t=>t.type!=='game'&&(t.assessmentVersion||t.questions?.length||t.question));
  const [id,setId]=useState(tasks[0]?.id??'');const task=tasks.find(t=>t.id===id);
  const [questions,setQuestions]=useState<AuthorQuestion[]>([]);const [title,setTitle]=useState('');const [description,setDescription]=useState('');
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const [publicExport,setPublicExport]=useState<{name:string;json:string}|null>(null);
  useEffect(()=>{let active=true;setNotice('');setQuestions([]);if(!task)return;setTitle(task.title);setDescription(task.description);setBusy(true);
    void privateQuestions(task).then(q=>{if(active)setQuestions(q);}).catch(e=>{if(active)setNotice(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
  },[id]);
  function update(i:number,change:Partial<AuthorQuestion>){setQuestions(q=>q.map((v,j)=>i===j?{...v,...change}:v));}
  async function publish(event:React.FormEvent){event.preventDefault();if(busy||!task)return;setBusy(true);setNotice('');
    try{
      const publicTask=await saveAssessmentVersion(task,questions,title,description);
      setPublicExport({name:`${task.id}.json`,json:JSON.stringify(publicTask,null,2)+'\n'});
      if(localMockIdentity){
        const response=await fetch('/__assessment/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(publicTask)});
        if(!response.ok)throw Error(`私有版本已儲存，公開教材尚未匯出（${response.status}）；可下載公開教材檔重試發布。`);
        setNotice('已儲存私有答案及匯出本機公開教材；未提交 Git 或發布正式網站。');
      }else setNotice('私有版本已儲存。請下載公開教材檔，審閱後交由原 Git 發布流程；目前網站仍使用原教材。');
    }catch(e){setNotice(e instanceof Error?e.message:'儲存失敗，請重試。');}finally{setBusy(false);}
  }
  function download(){if(!publicExport)return;const url=URL.createObjectURL(new Blob([publicExport.json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=publicExport.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <main className="paper-texture min-h-screen p-5 md:p-10"><div className="mx-auto max-w-4xl"><div className="flex flex-wrap gap-3"><Link href="/admin" className="pixel-button pixel-button-paper">返回教師工作室</Link><Link href="/" className="pixel-button pixel-button-paper">返回探索館</Link><a href={import.meta.env.BASE_URL+"cms/index.html"+(localAssessments?"?test=1":"")} className="pixel-button pixel-button-paper">其他教材與卡片 CMS</a></div><h1 className="display-title my-6 text-3xl">教材與私有題庫管理</h1><p>標準答案及解說存入私有題庫。學生提交前只會讀取題幹和選項。修改後建立新版本，既有提交保留原版本。</p>
    <form onSubmit={publish} className="admin-panel my-5 space-y-5 p-5"><label className="block font-bold">教材<select className="comic-input mt-2 w-full" disabled={busy} value={id} onChange={e=>setId(e.target.value)}>{tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label><label className="block font-bold">標題<input className="comic-input mt-2 w-full" value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label><label className="block font-bold">簡介<textarea className="comic-input mt-2 w-full" value={description} disabled={busy} onChange={e=>setDescription(e.target.value)}/></label>
    {questions.map((q,i)=><fieldset key={q.id} disabled={busy} className="space-y-3 border-t-2 border-ink/20 pt-4"><legend className="font-black">第 {i+1} 題 · {q.type==='short'?'短答':'選擇題'}</legend><label className="block">題幹（可保留 Markdown 圖片）<textarea className="comic-input mt-1 min-h-24 w-full" aria-label={`第 ${i+1} 題題幹`} value={q.prompt} onChange={e=>update(i,{prompt:e.target.value})}/></label><label className="block">配分<input type="number" className="comic-input ml-2 w-24" min={1} max={100} value={q.points} onChange={e=>update(i,{points:Number(e.target.value)})}/></label>
      {q.type==='choice'?<><label className="block">選項（每行一個）<textarea className="comic-input mt-1 w-full" aria-label={`第 ${i+1} 題選項`} value={q.options?.join('\n')??''} onChange={e=>update(i,{options:e.target.value.split('\n')})}/></label><label className="block">標準答案<select className="comic-input ml-2" aria-label={`第 ${i+1} 題標準答案`} value={q.answer??''} onChange={e=>update(i,{answer:Number(e.target.value)})}><option value="" disabled>請選擇</option>{q.options?.map((o,n)=><option value={n} key={n}>{String.fromCharCode(65+n)}．{o}</option>)}</select></label></>:<><label className="block">參考答案<textarea className="comic-input mt-1 w-full" value={q.modelAnswer??''} onChange={e=>update(i,{modelAnswer:e.target.value})}/></label><label className="block">批改準則<textarea className="comic-input mt-1 w-full" value={q.rubric??''} onChange={e=>update(i,{rubric:e.target.value})}/></label></>}
      <label className="block">提交後解說<textarea className="comic-input mt-1 w-full" aria-label={`第 ${i+1} 題解說`} value={q.explanation??''} maxLength={4000} onChange={e=>update(i,{explanation:e.target.value})}/></label><button type="button" className="underline" onClick={()=>setQuestions(qs=>qs.filter((_,j)=>j!==i))}>移除此題</button></fieldset>)}
      <div className="flex flex-wrap gap-3"><button type="button" className="pixel-button pixel-button-paper" disabled={busy||questions.length>=30} onClick={()=>setQuestions(q=>[...q,{id:`q-${crypto.randomUUID().slice(0,8)}`,type:'choice',prompt:'',points:10,options:['',''],answer:0}])}>新增選擇題</button><button type="button" className="pixel-button pixel-button-paper" disabled={busy||questions.length>=30} onClick={()=>setQuestions(q=>[...q,{id:`q-${crypto.randomUUID().slice(0,8)}`,type:'short',prompt:'',points:10}])}>新增短答題</button><button type="submit" className="pixel-button pixel-button-teal" disabled={busy||!questions.length||!assessmentTransportEnabled}>{busy?'儲存中…':'儲存私有答案及匯出公開教材'}</button></div>{publicExport&&<button type="button" className="pixel-button pixel-button-paper" onClick={download}>下載公開教材檔案</button>}{!assessmentTransportEnabled&&<p role="status">新版題庫儲存尚未正式啟用。</p>}{notice&&<p role="status" className="whitespace-pre-wrap">{notice}</p>}</form>
  </div></main>;
}
