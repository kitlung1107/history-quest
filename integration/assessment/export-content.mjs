// Local preparation only. This tool does not deploy, upload, or edit CMS input.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const taskFields=['task_id','title','topicId','grade','topic','type','label','description','duration','difficulty','accent','image','imagePosition','visible','featured','order','article','videoUrl','gameUrl'];
const questionFields=['id','type','prompt','points','options','image','imagePosition'];
const pick=(input,fields)=>Object.fromEntries(fields.filter(k=>input[k]!==undefined).map(k=>[k,structuredClone(input[k])]));
export function splitAssessment(raw,{version=randomUUID().replaceAll('-','')}={}){
  const taskId=raw.task_id??raw.id;
  if(typeof taskId!=='string'||!taskId||!version.match(/^[A-Za-z0-9_-]{1,100}$/))throw new Error('教材 ID／版本無效。');
  const questions=raw.questions??(raw.question?[{...raw.question,id:'q1',type:'choice',points:100}]:[]);
  if(!questions.length||questions.length>30||new Set(questions.map(q=>q.id)).size!==questions.length)throw new Error('題數須為 1 至 30，題目 ID 不可重複。');
  for(const q of questions){
    if(!['choice','short'].includes(q.type)||typeof q.prompt!=='string'||!Number.isInteger(q.points)||q.points<1||q.points>100)throw new Error('題目格式無效。');
    if(q.type==='choice'&&(!Array.isArray(q.options)||q.options.length<2||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length))throw new Error('MC 標準答案／選項無效。');
  }
  const publicQuestions=questions.map(q=>pick(q,questionFields));
  const publicTask={...pick(raw,taskFields),task_id:taskId,assessmentVersion:version,questions:publicQuestions};
  const metadata={taskId,version,title:raw.title??taskId,questions:publicQuestions,questionCount:questions.length,shortCount:questions.filter(q=>q.type==='short').length,totalPoints:questions.reduce((sum,q)=>sum+q.points,0),enabled:true};
  const privateKey={taskId,version,questions:questions.map(q=>({id:q.id,answer:q.type==='choice'?q.answer:null,explanation:q.explanation??'',...(q.modelAnswer!==undefined?{modelAnswer:q.modelAnswer}:{}),...(q.rubric!==undefined?{rubric:q.rubric}:{})}))};
  return{publicTask,metadata,privateKey};
}
export function assertPublicSafe(value){
  if(Array.isArray(value)){value.forEach(assertPublicSafe);return;}
  if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){
    if(['answer','explanation','correct','modelAnswer','rubric'].includes(k))throw new Error(`公開輸出含私有欄位：${k}`);
    assertPublicSafe(v);
  }
}
export async function exportDirectory(source,output){
  const sourcePath=path.resolve(source),outputPath=path.resolve(output),root=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
  if([path.join(root,'client','public'),path.join(root,'dist')].some(p=>outputPath===p||outputPath.startsWith(p+path.sep)))throw new Error('本機匯出不可寫入現有網站公開／部署目錄。');
  const privateDir=path.join(outputPath,'private'),publicDir=path.join(outputPath,'public');
  await mkdir(privateDir,{recursive:true});await mkdir(publicDir,{recursive:true});
  const statePath=path.join(privateDir,'version-state.json');
  let state={};try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const manifest=[];
  for(const file of (await readdir(sourcePath)).filter(f=>f.endsWith('.json')).sort()){
    const bytes=await readFile(path.join(sourcePath,file)),raw=JSON.parse(bytes);
    if(!(raw.type==='quiz'||['MC','小測','選擇題','測驗'].includes(raw.label)))continue;
    const digest=createHash('sha256').update(bytes).digest('hex');
    const version=state[digest]??randomUUID().replaceAll('-','');state[digest]=version;
    const split=splitAssessment(raw,{version});assertPublicSafe(split.publicTask);assertPublicSafe(split.metadata);
    const id=`${split.metadata.taskId}--${version}`;
    await writeFile(path.join(publicDir,`${split.metadata.taskId}.json`),JSON.stringify(split.publicTask,null,2));
    await writeFile(path.join(privateDir,`${id}.json`),JSON.stringify({keyDocument:{path:`assessmentKeys/${id}`,data:split.privateKey},publicVersionDocument:{path:`assessmentVersions/${id}`,data:split.metadata,acceptFrom:'SET_TIMESTAMP_AT_APPROVED_PUBLICATION'},sourceDigest:digest},null,2));
    manifest.push({taskId:split.metadata.taskId,version,questionCount:split.metadata.questionCount,publicFile:`${split.metadata.taskId}.json`});
  }
  assertPublicSafe(manifest);
  await writeFile(path.join(publicDir,'manifest.json'),JSON.stringify(manifest,null,2));
  await writeFile(statePath,JSON.stringify(state,null,2));
  return{localOnly:true,assessments:manifest.length,questions:manifest.reduce((sum,m)=>sum+m.questionCount,0),publicDir,privateDir,sourceEdited:false,uploaded:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),source=args[args.indexOf('--source')+1],output=args[args.indexOf('--out')+1];
  if(!args.includes('--source')||!args.includes('--out'))throw new Error('Usage: node export-content.mjs --source PRIVATE_CMS_INPUT --out LOCAL_REVIEW_DIRECTORY');
  console.log(JSON.stringify(await exportDirectory(source,output),null,2));
}
