import {onSnapshot,type DocumentReference,type DocumentSnapshot,type FirestoreError} from 'firebase/firestore';
type Observer={next:(s:DocumentSnapshot)=>void;error:(e:FirestoreError)=>void};
type Shared={observers:Set<Observer>;stop:()=>void;last?:DocumentSnapshot;failure?:FirestoreError};
const subscriptions=new Map<string,Shared>();
export function subscribeRewardDocument(ref:DocumentReference,scope:string,next:Observer['next'],error:Observer['error']){
  const key=JSON.stringify([ref.firestore.app.options.projectId,scope,ref.path]);
  let shared=subscriptions.get(key);
  const observer={next,error};
  if(!shared){
    shared={observers:new Set(),stop:()=>{}};subscriptions.set(key,shared);
    const entry=shared;
    entry.stop=onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
      entry.last=snapshot;entry.failure=undefined;entry.observers.forEach(listener=>listener.next(snapshot));
    },failure=>{entry.last=undefined;entry.failure=failure;entry.observers.forEach(listener=>listener.error(failure));});
  }
  shared.observers.add(observer);
  if(shared.last)next(shared.last);
  if(shared.failure)error(shared.failure);
  return()=>{
    shared!.observers.delete(observer);
    if(!shared!.observers.size){shared!.stop();subscriptions.delete(key);}
  };
}
if(import.meta.hot)import.meta.hot.dispose(()=>{subscriptions.forEach(entry=>entry.stop());subscriptions.clear();});
