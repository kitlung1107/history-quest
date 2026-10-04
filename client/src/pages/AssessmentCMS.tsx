import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import {HISTORY_TASKS,CMS_TASK_SOURCES,type HistoryTask} from '@/lib/historyQuest';
import {PUBLIC_TOPICS} from '@/lib/siteSettings';
import {doc,getDocFromServer} from 'firebase/firestore';
import {db} from '@/lib/firebase';
import {defaultCoinRule,validateCoinRule,type CoinRule} from '@/lib/coinModel';
import {readGitAssessment,publishGitAssessment,samePublishedTask} from '@/lib/assessmentGitPublisher';
import {privateQuestions} from '@/lib/rulesAssessmentStore';
import {localAssessments,localMockIdentity,assessmentTransportEnabled} from '@/lib/localAssessment';
import {saveAssessmentVersion} from '@/lib/assessmentPublisher';
import type {AuthorQuestion} from '@/lib/assessmentPublication';
export default function AssessmentCMS(){
  const [added,setAdded]=useState<HistoryTask[]>([]);
  const tasks=[...HISTORY_TASKS.filter(t=>t.type!=='game'),...added];
  const [id,setId]=useState(tasks.find(t=>t.type==='quiz')?.id??tasks[0]?.id??'');const task=tasks.find(t=>t.id===id);
  const [questions,setQuestions]=useState<AuthorQuestion[]>([]);const [title,setTitle]=useState('');const [description,setDescription]=useState('');
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
  const [publicExport,setPublicExport]=useState<{name:string;json:string}|null>(null);
  const [rule,setRule]=useState<CoinRule>(defaultCoinRule),[token,setToken]=useState('');
  const [ready,setReady]=useState(false),[sha,setSha]=useState<string|null>(null);
  const [pending,setPending]=useState<Record<string,any>|null>(null);
  const [details,setDetails]=useState<Partial<HistoryTask>>({});
  const source=task&&CMS_TASK_SOURCES[task.id],path=source?.path??`client/src/content/tasks/${task?.id}.json`;
  useEffect(()=>{let active=true;setNotice('');setQuestions([]);setPending(null);setPublicExport(null);setReady(false);if(!task)return;setTitle(task.title);setDescription(task.description);setDetails({image:task.image,article:task.article,visible:task.visible,featured:task.featured,order:task.order,duration:task.duration,difficulty:task.difficulty});setBusy(true);
    void Promise.all([
      privateQuestions(task),getDocFromServer(doc(db,'coinRules',task.id)),
      !localAssessments?readGitAssessment(path):Promise.resolve(null),
    ]).then(([q,settings,current])=>{
      if(!active)return;
      if(!localAssessments&&source&&(!current||!samePublishedTask(current.task,source.raw)))throw Error('教材已有新發布版本，請重新載入網站後再編輯。');
      setQuestions(q);setRule(settings.exists()?settings.data() as CoinRule:defaultCoinRule);setSha(current?.sha??null);setReady(true);
    }).catch(e=>{if(active)setNotice(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
  },[id]);
  function create(){if(busy)return;const first=PUBLIC_TOPICS[0],newTask:HistoryTask={id:`task-${crypto.randomUUID()}`,type:'quiz',topicId:first.id,grade:first.grade,topic:first.title,title:'新小測',description:'',visible:true,featured:false,order:100,duration:10,difficulty:2,image:tasks.find(t=>t.type==='quiz')?.image??'',accent:'gold',questions:[]};setAdded(a=>[...a,newTask]);setId(newTask.id);}
  function update(i:number,change:Partial<AuthorQuestion>){setQuestions(q=>q.map((v,j)=>i===j?{...v,...change}:v));}
  async function publish(event:React.FormEvent){event.preventDefault();if(busy||!task||!ready)return;setBusy(true);setNotice('');
    try{
      validateCoinRule(rule);
      if(!localAssessments&&!token.trim())throw Error('請在此頁安全輸入現有 GitHub CMS 權杖；毋須建立新服務。');
      const publicTask=pending??await saveAssessmentVersion({...task,...source?.raw,...Object.fromEntries(Object.entries(details).filter(([,v])=>v!==undefined)),id:task.id} as HistoryTask,questions,title,description,rule);
      setPending(publicTask);
      setPublicExport({name:`${task.id}.json`,json:JSON.stringify(publicTask,null,2)+'\n'});
      if(localMockIdentity){
        const response=await fetch('/__assessment/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(publicTask)});
        if(!response.ok)throw Error(`私有版本已儲存，公開教材尚未匯出（${response.status}）；可下載公開教材檔重試發布。`);
        setNotice('已儲存私有答案及匯出本機公開教材；未提交 Git 或發布正式網站。');
      }else if(localAssessments)setNotice('私有版本已儲存。請下載公開教材檔，審閱後交由原 Git 發布流程；目前網站仍使用原教材。');
      else{
        const result=await publishGitAssessment(path,publicTask,sha,token);
        setSha(result.blobSha);setPending(null);
        setNotice(`題庫與探索幣設定已儲存，公開教材已${result.alreadyPublished?'確認發布':'提交發布'}。原有 core／Pages 流程會自動同步；完成後重新載入網站。${'url' in result?'\n'+result.url:''}`);
      }
    }catch(e){setNotice(e instanceof Error?e.message:'儲存失敗，請重試。');}finally{setBusy(false);}
  }
  function download(){if(!publicExport)return;const url=URL.createObjectURL(new Blob([publicExport.json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=publicExport.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <main className="paper-texture min-h-screen p-5 md:p-10"><div className="mx-auto max-w-4xl"><div className="flex flex-wrap gap-3"><Link href="/admin" className="pixel-button pixel-button-paper">返回教師工作室</Link><Link href="/" className="pixel-button pixel-button-paper">返回探索館</Link><a href={import.meta.env.BASE_URL+"cms/index.html"+(localAssessments?"?test=1":"")} className="pixel-button pixel-button-paper">其他教材與卡片 CMS</a></div><h1 className="display-title my-6 text-3xl">教材與私有題庫管理</h1><p>標準答案及解說存入私有題庫。學生提交前只會讀取題幹和選項。修改後建立新版本，既有提交保留原版本。</p>
    {!localAssessments&&<label className="block font-bold">GitHub CMS 發布連接<input type="password" autoComplete="off" className="comic-input mt-2 w-full" value={token} onChange={e=>setToken(e.target.value)} placeholder="沿用只授權此儲存庫內容讀寫的現有 CMS 權杖"/><span className="block text-sm font-normal">只保留於此頁記憶體，不寫入 Git 或 Firestore；請勿貼到聊天。私有答案不會傳送 GitHub。</span></label>}
    <form onSubmit={publish} className="admin-panel my-5 space-y-5 p-5"><label className="block font-bold">教材<select className="comic-input mt-2 w-full" disabled={busy} value={id} onChange={e=>setId(e.target.value)}>{tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label><button type="button" className="pixel-button pixel-button-paper" disabled={busy} onClick={create}>建立新小測</button><label className="block font-bold">標題<input className="comic-input mt-2 w-full" value={title} disabled={busy||!!pending} onChange={e=>setTitle(e.target.value)}/></label><label className="block font-bold">簡介<textarea className="comic-input mt-2 w-full" value={description} disabled={busy||!!pending} onChange={e=>setDescription(e.target.value)}/></label>
    {!source&&<label className="block">課題<select className="comic-input ml-2" disabled={busy||!!pending} value={task?.topicId} onChange={e=>{const topic=PUBLIC_TOPICS.find(t=>t.id===e.target.value)!;setAdded(a=>a.map(t=>t.id===id?{...t,topicId:topic.id,topic:topic.title,grade:topic.grade}:t));}}>{PUBLIC_TOPICS.map(t=><option value={t.id} key={t.id}>中{t.grade} · {t.title}</option>)}</select></label>}
    <div className="space-y-3"><label className="block">封面圖片網址<input className="comic-input mt-1 w-full" disabled={busy||!!pending} value={details.image??''} onChange={e=>setDetails({...details,image:e.target.value})}/></label><label className="block">教材正文／小測說明（Markdown）<textarea className="comic-input mt-1 min-h-32 w-full" disabled={busy||!!pending} value={details.article??''} onChange={e=>setDetails({...details,article:e.target.value})}/></label><label className="mr-4"><input type="checkbox" disabled={busy||!!pending} checked={details.visible??false} onChange={e=>setDetails({...details,visible:e.target.checked})}/> 公開顯示</label><label><input type="checkbox" disabled={busy||!!pending} checked={details.featured??false} onChange={e=>setDetails({...details,featured:e.target.checked})}/> 首頁精選</label></div>
    <fieldset disabled={busy||!ready||!!pending} className="space-y-3 border-2 border-ink/20 p-3"><legend className="font-bold">本小測探索幣設定</legend><label className="block">獎勵方式<select className="comic-input ml-2" value={rule.mode} onChange={e=>setRule({...rule,mode:e.target.value as CoinRule['mode']})}><option value="off">不派探索幣</option><option value="fixed">固定獎勵</option><option value="tiers">分級獎勵</option></select></label>{rule.mode==='fixed'&&<label className="block">探索幣<input aria-label="固定探索幣" type="number" min={0} max={100000} className="comic-input ml-2 w-28" value={rule.amount} onChange={e=>setRule({...rule,amount:Number(e.target.value)})}/></label>}{rule.mode==='tiers'&&<><label className="block">分級依據<select className="comic-input ml-2" value={rule.metric} onChange={e=>setRule({...rule,metric:e.target.value as CoinRule['metric']})}><option value="score">正式總分百分比</option><option value="progress">完成程度</option></select></label>{rule.tiers.map((tier,i)=><div key={i} className="flex flex-wrap gap-2"><label>最低百分比<input aria-label={`級別 ${i+1} 最低百分比`} type="number" min={0} max={100} className="comic-input ml-2 w-24" value={tier.minimum} onChange={e=>setRule({...rule,tiers:rule.tiers.map((t,j)=>j===i?{...t,minimum:Number(e.target.value)}:t)})}/></label><label>探索幣<input aria-label={`級別 ${i+1} 探索幣`} type="number" min={0} max={100000} className="comic-input ml-2 w-24" value={tier.amount} onChange={e=>setRule({...rule,tiers:rule.tiers.map((t,j)=>j===i?{...t,amount:Number(e.target.value)}:t)})}/></label><button type="button" onClick={()=>setRule({...rule,tiers:rule.tiers.filter((_,j)=>j!==i)})}>移除此級</button></div>)}<button type="button" disabled={rule.tiers.length>=20} onClick={()=>setRule({...rule,tiers:[...rule.tiers,{minimum:0,amount:0}]})}>新增獎勵級別</button></>}<p className="text-sm">純 MC 即時按正式分數派幣；短答／混合須全部批改後按總分結算。每人每任務只領一次正數獎勵。</p></fieldset>
    {questions.map((q,i)=><fieldset data-assessment-question key={q.id} disabled={busy||!!pending} className="space-y-3 border-t-2 border-ink/20 pt-4"><legend className="font-black">第 {i+1} 題 · {q.type==='short'?'短答':'選擇題'}</legend><label className="block">題幹（可保留 Markdown 圖片）<textarea className="comic-input mt-1 min-h-24 w-full" aria-label={`第 ${i+1} 題題幹`} value={q.prompt} onChange={e=>update(i,{prompt:e.target.value})}/></label><label className="block">配分<input type="number" className="comic-input ml-2 w-24" min={1} max={100} value={q.points} onChange={e=>update(i,{points:Number(e.target.value)})}/></label>
      {q.type==='choice'?<><label className="block">選項（每行一個）<textarea className="comic-input mt-1 w-full" aria-label={`第 ${i+1} 題選項`} value={q.options?.join('\n')??''} onChange={e=>update(i,{options:e.target.value.split('\n')})}/></label><label className="block">標準答案<select className="comic-input ml-2" aria-label={`第 ${i+1} 題標準答案`} value={q.answer??''} onChange={e=>update(i,{answer:Number(e.target.value)})}><option value="" disabled>請選擇</option>{q.options?.map((o,n)=><option value={n} key={n}>{String.fromCharCode(65+n)}．{o}</option>)}</select></label></>:<><label className="block">參考答案<textarea className="comic-input mt-1 w-full" value={q.modelAnswer??''} onChange={e=>update(i,{modelAnswer:e.target.value})}/></label><label className="block">批改準則<textarea className="comic-input mt-1 w-full" value={q.rubric??''} onChange={e=>update(i,{rubric:e.target.value})}/></label></>}
      <label className="block">提交後解說<textarea className="comic-input mt-1 w-full" aria-label={`第 ${i+1} 題解說`} value={q.explanation??''} maxLength={4000} onChange={e=>update(i,{explanation:e.target.value})}/></label><button type="button" className="underline" onClick={()=>setQuestions(qs=>qs.filter((_,j)=>j!==i))}>移除此題</button></fieldset>)}
      <div className="flex flex-wrap gap-3"><button type="button" className="pixel-button pixel-button-paper" disabled={busy||!!pending||questions.length>=30} onClick={()=>setQuestions(q=>[...q,{id:`q-${crypto.randomUUID().slice(0,8)}`,type:'choice',prompt:'',points:10,options:['',''],answer:0}])}>新增選擇題</button><button type="button" className="pixel-button pixel-button-paper" disabled={busy||!!pending||questions.length>=30} onClick={()=>setQuestions(q=>[...q,{id:`q-${crypto.randomUUID().slice(0,8)}`,type:'short',prompt:'',points:10}])}>新增短答題</button><button type="submit" className="pixel-button pixel-button-teal" disabled={busy||!ready||!questions.length||!assessmentTransportEnabled}>{busy?'儲存中…':localAssessments?'儲存私有答案及匯出公開教材':pending?'重試發布同一版本':'儲存題庫、獎勵並發布'}</button>{pending&&!busy&&<button type="button" className="pixel-button pixel-button-paper" onClick={()=>setPending(null)}>重新編輯並建立新版本</button>}</div>{publicExport&&<button type="button" className="pixel-button pixel-button-paper" onClick={download}>下載公開教材檔案</button>}{!assessmentTransportEnabled&&<p role="status">新版題庫儲存尚未正式啟用。</p>}{notice&&<p role="status" className="whitespace-pre-wrap">{notice}</p>}</form>
  </div></main>;
}
