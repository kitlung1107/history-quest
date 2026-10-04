import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,Timestamp} from 'firebase/firestore';
import {makeAssessment,seedAssessment,seedIdentity} from './fixtures.mjs';
import {assessmentContentPlugin} from './public-content-plugin.mjs';
import path from 'node:path';
const projectId='demo-rules-rewards-app';
if(process.env.VITE_ASSESSMENT_EMULATORS==='0')throw Error('Local preview disabled.');
const root=process.cwd(),tasks=path.join(root,'client/src/content/tasks');
const topics=readdirSync('client/src/content/topics').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(`client/src/content/topics/${f}`,'utf8')));
const topic=topics.find(t=>t.visible&&t.grade===1);
const variants=[['mc-1',1,[]],['mc-3',3,[]],['mc-10',10,[]],['mc-30',30,[]],['mixed-3',3,[2]],['short-3',3,[0,1,2]]];
for(const [name,count,shortIndexes] of variants){const f=makeAssessment(name,count,{shortIndexes});
  const raw={task_id:`local-assessment-${name}`,topicId:topic.id,type:'quiz',title:`本機驗收 · ${name}`,label:'小測',description:'合成教材；只供本機原 App 流程驗收。',duration:3,difficulty:1,accent:'teal',image:'https://placehold.co/600x300/png',visible:true,featured:true,order:0,questions:f.meta.questions.map((q,i)=>q.type==='choice'?({...q,...f.key.questions[i]}):({...q,explanation:f.key.questions[i].explanation}))};
  if(name==='mc-3')raw.questions[0].prompt='圖片題幹：觀察下圖，選擇符合資料的選項。\n\n![歷史探索示意](/images/login-history.webp)';
  const target=path.join(tasks,`${raw.task_id}.json`);
  if(!(readFileSyncIfPresent(target)?.assessmentVersion))writeFileSync(target,JSON.stringify(raw,null,2));
}
const plugin=assessmentContentPlugin(root);
for(const f of readdirSync(tasks).filter(f=>f.endsWith('.json')))plugin.transform(readFileSync(path.join(tasks,f),'utf8'),path.join(tasks,f));
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8191,rules:readFileSync('integration/assessment/compatible.rules','utf8')}});
// Idempotent fixture preparation. Does not clear any project or submissions.
await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();await seedIdentity(db,{automation:false});
  if(!(await getDoc(doc(db,'rewardAutomation','status'))).exists())await setDoc(doc(db,'rewardAutomation','status'),{enabled:true,activatedAt:Timestamp.fromMillis(0)});
  const profile={className:'1A',studentNo:'1',name:'本機預覽學生',nickname:'小探索家',avatar:'studentBoy',configured:true,role:'studentBoy',cardId:'starter-explorer-boy',ownedCardIds:['starter-explorer-boy','nile-explorer-boy']};
  await setDoc(doc(db,'profiles','learner'),profile);await setDoc(doc(db,'profiles','teacher-uid'),{...profile,name:'本機教師',nickname:'老師'});
  await setDoc(doc(db,'access','kitlung1107@gmail.com'),{studentId:'teacher-uid',enabled:true,testing:true});
  let n=0;
  for(const file of readdirSync('private-assessments').filter(f=>f.endsWith('.json')&&!f.includes('state')&&!f.includes('legacy'))){
    const split=JSON.parse(readFileSync(path.join('private-assessments',file),'utf8'));if(!split.metadata||split.published)continue;
    const fixture={meta:{...split.metadata,acceptFrom:Timestamp.fromMillis(0)},key:split.privateKey};
    const existingRule=await getDoc(doc(db,'coinRules',fixture.meta.taskId));
    await seedAssessment(db,fixture,existingRule.exists()?existingRule.data():undefined);n++;
  }
  for(const file of readdirSync(tasks).filter(f=>f.endsWith('.json'))){const raw=JSON.parse(readFileSync(path.join(tasks,file),'utf8'));const grade=topics.find(t=>t.id===raw.topicId)?.grade??1;await setDoc(doc(db,'taskAccess',raw.task_id),{grade,enabled:raw.visible===true});}
  await setDoc(doc(db,'metadata','roster'),{revision:0});
  console.log(JSON.stringify({projectId,seededVersions:n,cleared:false,formalChanged:false}));
});
await env.cleanup();
function readFileSyncIfPresent(file){try{return JSON.parse(readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return undefined;throw e;}}
