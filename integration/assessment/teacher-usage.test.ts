import {test,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import * as assessment from '../../client/src/lib/assessment';
import * as coinModel from '../../client/src/lib/coinModel';
import {submitAndSettle} from '../../client/src/lib/rulesAssessment';
import {claims,makeAssessment,seedAssessment,seedIdentity,ownerEmail} from './fixtures.mjs';
const base='60c6fc475837f02bfa0cc8d2b3ce769000a5041a';
function compile(file:string,before:boolean,modules:Record<string,any>){
  const source=(before?execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8'}):readFileSync(file,'utf8')).replaceAll('import.meta.env','{}');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('exports','require',js)(exports,(id:string)=>{if(!(id in modules))throw Error(id);return modules[id];});return exports as any;
}
test('teacher refresh baseline versus summary route; on-demand details preserve actual results',async()=>{
  sdk.setLogLevel('silent');const env=await initializeTestEnvironment({projectId:'demo-rules-rewards-teacher',firestore:{host:'127.0.0.1',port:8191,rules:readFileSync('integration/assessment/compatible.rules','utf8')}});
  const records=[];
  try{
    await env.clearFirestore();const f=makeAssessment('teacher-class',10);
    await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await seedIdentity(db);await seedAssessment(db,f,{mode:'fixed',amount:100,metric:'score',tiers:[]});for(let i=0;i<40;i++){
      await sdk.setDoc(sdk.doc(db,'access',`s${i}@prototype.test`),{studentId:`s${i}`,enabled:true,testing:false});
      await sdk.setDoc(sdk.doc(db,'profiles',`s${i}`),{className:'1A',name:`Synthetic ${i}`,studentNo:String(i+1),configured:true});
    }});
    await Promise.all(Array.from({length:40},(_,i)=>submitAndSettle(env.authenticatedContext(`uid${i}`,claims(`s${i}@prototype.test`)).firestore(),`attempt${i}`,`s${i}`,f.meta,f.meta.questions.map((q:any,j:number)=>({question_id:q.id,value:f.key.questions[j].answer})))));
    const db=env.authenticatedContext('teacher',claims(ownerEmail)).firestore();
    for(const before of [true,false]){
      const count={directDocumentGets:0,queryCalls:0,queryDocuments:0,transactionCalls:0,transactionAttempts:0,transactionGets:0};
      const measured={...sdk,
        getDoc:async(...args:any[])=>{count.directDocumentGets++;return (sdk.getDoc as any)(...args);},
        getDocFromServer:async(...args:any[])=>{count.directDocumentGets++;return (sdk.getDocFromServer as any)(...args);},
        getDocs:async(...args:any[])=>{count.queryCalls++;const s=await (sdk.getDocs as any)(...args);count.queryDocuments+=s.size;return s;},
        runTransaction:async(database:any,fn:any,options:any)=>{count.transactionCalls++;return sdk.runTransaction(database,async tx=>{count.transactionAttempts++;return fn(new Proxy(tx,{get(target,key){const member=Reflect.get(target,key,target);if(key==='get')return(...args:any[])=>{count.transactionGets++;return member.apply(target,args);};return typeof member==='function'?member.bind(target):member;}}));},options);},
      };
      const common={'firebase/firestore':measured,'./firebase':{db,auth:{currentUser:{uid:'teacher'}}},'./localAssessment':{assessmentTransportEnabled:true,localMockIdentity:true,localIdentity:{uid:'teacher'}},'./assessmentSession':{assessmentActor:async()=>({teacher:true}),requireAssessmentActor:async()=>{},requireAssessmentEnabled(){}},'./assessment':assessment};
      const protocol=compile('client/src/lib/rulesAssessment.ts',before,{'firebase/firestore':measured,'./coinModel.ts':coinModel});
      const store=compile('client/src/lib/rulesAssessmentStore.ts',before,{...common,'./rulesAssessment':protocol});
      const cloud=compile('client/src/lib/cloudStore.ts',before,{...common,'./rulesAssessmentStore':store,'./historyQuest':{HISTORY_TASKS:[]},'./coreCatalogueStore':{}});
      (globalThis as any).sessionStorage={getItem:()=>null};
      for(let refresh=0;refresh<2;refresh++){
        Object.keys(count).forEach(k=>(count as any)[k]=0);
        const profiles=await measured.getDocs(sdk.collection(db,'profiles'));
        const map=new Map(profiles.docs.map((s:any)=>[s.id,s.data()]));
        const page=await cloud.loadSubmissions();
        const rows=page.docs.map((s:any)=>cloud.asRow(s.id,s.data(),map.get(s.data().studentId)));
        // Exercise the exact existing/new Admin grade gate.
        for(const snapshot of page.docs)if(before?(!snapshot.data().grade||snapshot.data().grade.status==='graded'):!snapshot.data().grade)await cloud.markSubmission(snapshot.id);
        expect(rows.length).toBe(40);expect(rows.every((r:any)=>r.score===100)).toBe(true);
        records.push({phase:before?'before':'after',scenario:`refresh-${refresh+1}`,excluded:'catalogue sync, login, reward panels',...count});
        if(!before)expect(count.transactionCalls).toBe(0);
      }
      if(!before){
        Object.keys(count).forEach(k=>(count as any)[k]=0);
        const detail=await cloud.readSubmissionDetails('attempt0');expect(detail.answers.length).toBe(10);expect(detail.score).toBe(100);
        records.push({phase:'after',scenario:'one-detail',...count});
      }
    }
  }finally{delete (globalThis as any).sessionStorage;mkdirSync('tmp/usage',{recursive:true});writeFileSync('tmp/usage/teacher.json',JSON.stringify(records,null,2));await env.cleanup();}
});
