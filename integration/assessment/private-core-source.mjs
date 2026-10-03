import {readFile} from 'node:fs/promises';
import path from 'node:path';
// Preparation only. Core planning, release approval and publication remain in
// the existing core-sync code. Public data is never used as an answer key.
export async function hydratePrivateCoreTasks(tasks,base){
  return Promise.all(tasks.map(async task=>{
    if(!task.assessmentVersion)return task;
    const id=`${task.task_id}--${task.assessmentVersion}`;
    let source;
    try{source=JSON.parse(await readFile(path.join(base,'private-assessments',`${id}.json`),'utf8'));}
    catch(e){if(e.code==='ENOENT')throw Error(`教材 ${task.task_id} 的私有版本未準備，核心同步已停止。`);throw e;}
    if(source.privateKey.taskId!==task.task_id||source.privateKey.version!==task.assessmentVersion||source.privateKey.questions.length!==task.questions.length)throw Error('私有核心題庫版本不符。');
    return{...task,question:undefined,questions:task.questions.map((q,i)=>{
      const key=source.privateKey.questions[i];if(key.id!==q.id)throw Error('私有核心題庫題目 ID 不符。');
      return{...q,...key};
    })};
  }));
}
