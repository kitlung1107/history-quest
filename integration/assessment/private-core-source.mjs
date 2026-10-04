import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {assertPublicSafe} from './export-content.mjs';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export function validatePrivateCoreInput(task,input){
  assertPublicSafe(task);
  const source=input.privateKey?input:{privateKey:input.keyDocument?.data,metadata:input.publicVersionDocument?.data};
  const key=source.privateKey,meta=source.metadata;
  if(!key||key.taskId!==task.task_id||key.version!==task.assessmentVersion||!Array.isArray(key.questions)||key.questions.length!==task.questions.length)throw Error('私有核心題庫版本不符。');
  if(!meta||meta.taskId!==task.task_id||meta.version!==task.assessmentVersion||JSON.stringify(canonical(meta.questions))!==JSON.stringify(canonical(task.questions)))throw Error('公開教材與已儲存私有版本不一致。');
  assertPublicSafe(meta);
  for(const [i,q] of task.questions.entries()){
    const k=key.questions[i];
    if(k.id!==q.id||Object.keys(k).some(f=>!['id','answer','explanation','modelAnswer','rubric'].includes(f)))throw Error('私有核心題庫題目 ID 或欄位不符。');
    if(q.type==='choice'&&(!Number.isInteger(k.answer)||k.answer<0||k.answer>=q.options.length))throw Error('私有核心題庫答案無效。');
    if(q.type==='short'&&k.answer!==null)throw Error('短答不可含客觀題答案序號。');
  }
  return source;
}
// Preparation only. Core planning, release approval and publication remain in
// the existing core-sync code. Public data is never used as an answer key.
export async function hydratePrivateCoreTasks(tasks,base,{resolvePrivate}={}){
  return Promise.all(tasks.map(async task=>{
    if(!task.assessmentVersion)return task;
    const id=`${task.task_id}--${task.assessmentVersion}`;
    let source;
    try{source=resolvePrivate?await resolvePrivate(task):JSON.parse(await readFile(path.join(base,'private-assessments',`${id}.json`),'utf8'));}
    catch(e){if(e.code==='ENOENT')throw Error(`教材 ${task.task_id} 的私有版本未準備，核心同步已停止。`);throw e;}
    source=validatePrivateCoreInput(task,source);
    return{...task,question:undefined,questions:task.questions.map((q,i)=>{
      const key=source.privateKey.questions[i];if(key.id!==q.id)throw Error('私有核心題庫題目 ID 不符。');
      return{...q,...key};
    })};
  }));
}
