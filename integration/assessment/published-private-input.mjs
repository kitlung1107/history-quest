import {values} from '../../scripts/core-catalogue-rest.mjs';
import {validatePrivateCoreInput} from './private-core-source.mjs';
// Exact published version GETs only. No enumeration, persistence or key writes.
export async function publishedPrivateInput(task,{project,request,approved=false}){
  if(!approved)throw Error('私有題庫讀取尚未獲批准，核心同步已停止。');
  if(project!=='history-discovery-center'&&!/^demo-[A-Za-z0-9_-]+$/.test(project))throw Error('私有題庫專案不受支援。');
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(task.task_id)||!/^[A-Za-z0-9_-]{1,100}$/.test(task.assessmentVersion))throw Error('題庫版本識別碼無效。');
  const id=`${task.task_id}--${task.assessmentVersion}`,base=`projects/${project}/databases/(default)/documents`;
  const [key,meta]=await Promise.all(['assessmentKeys','assessmentVersions'].map(c=>request('GET',`${base}/${c}/${id}`)));
  if(!key||!meta)throw Error(`教材 ${task.task_id} 的私有版本未發布，核心同步已停止。`);
  return validatePrivateCoreInput(task,{privateKey:values(key.fields??{}),metadata:values(meta.fields??{})});
}
export function publicCoreBackup(changes){
  return changes.map(change=>{
    const sensitive=Object.hasOwn(change.after??{},'questions')||Object.hasOwn(change.after??{},'answer')||Object.hasOwn(change.before?.fields??{},'questions')||Object.hasOwn(change.before?.fields??{},'answer');
    return sensitive?{path:change.path,privatePayloadOmitted:true,previousExists:Boolean(change.before),previousUpdateTime:change.before?.updateTime??null}:change;
  });
}
