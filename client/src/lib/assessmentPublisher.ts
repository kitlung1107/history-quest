import {doc,getDocFromServer,writeBatch,serverTimestamp} from 'firebase/firestore';
import {db} from './firebase';
import {requireAssessmentActor} from './assessmentSession';
import {assertPublicAssessment,prepareAssessmentVersion,type AuthorQuestion} from './assessmentPublication';
import type {HistoryTask} from './historyQuest';
import {validateCoinRule,type CoinRule} from './coinModel';
export async function saveAssessmentVersion(task:HistoryTask,questions:AuthorQuestion[],title:string,description:string,rule?:CoinRule){
  await requireAssessmentActor(undefined,true);
  if(rule)validateCoinRule(rule);
  const version=crypto.randomUUID().replaceAll('-','');
  const split=prepareAssessmentVersion(task,questions,title,description,version),id=`${task.id}--${version}`;
  const batch=writeBatch(db);
  batch.set(doc(db,'assessmentKeys',id),split.privateKey);
  batch.set(doc(db,'assessmentVersions',id),{...split.metadata,acceptFrom:serverTimestamp()});
  if(rule)batch.set(doc(db,'coinRules',task.id),rule);
  await batch.commit();
  const saved=await getDocFromServer(doc(db,'assessmentVersions',id));
  if(!saved.exists())throw Error('私有版本未能確認，未匯出公開教材。');
  assertPublicAssessment(saved.data());
  if(saved.data().version!==version||JSON.stringify(saved.data().questions)!==JSON.stringify(split.metadata.questions)){
    // Firestore map field order is not stable. Compare question fields directly.
    const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
    if(saved.data().version!==version||JSON.stringify(canonical(saved.data().questions))!==JSON.stringify(canonical(split.metadata.questions)))throw Error('儲存版本不符，未匯出公開教材。');
  }
  return split.publicTask;
}
