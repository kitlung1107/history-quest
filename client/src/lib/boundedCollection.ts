import {collection,documentId,getDocs,limit,orderBy,query,startAfter,type Firestore,type QueryDocumentSnapshot} from 'firebase/firestore';
// Enrollment edits/imports need a complete roster for duplicate identity checks.
// Fetch only when opened, in bounded pages; do not silently validate a partial roster.
export async function readCompleteCollection(db:Firestore,path:string,pageSize=100){
  const docs:QueryDocumentSnapshot[]=[];
  let cursor:QueryDocumentSnapshot|undefined;
  for(;;){
    const page=await getDocs(query(collection(db,path),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(pageSize)));
    docs.push(...page.docs);
    if(page.size<pageSize)return{docs};
    cursor=page.docs.at(-1);
  }
}
