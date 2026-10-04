import {test,expect,vi,afterEach} from 'vitest';
import {prepareAssessmentVersion,assertPublicAssessment} from '../../client/src/lib/assessmentPublication';
import {verifiedAssessmentIdentity} from '../../client/src/lib/assessmentIdentity';
import {requireLocal} from '../../client/src/lib/rulesAssessment';
import {publishedPrivateInput,publicCoreBackup} from './published-private-input.mjs';
import {fields} from '../../scripts/core-catalogue-rest.mjs';
import {assessmentCutoverPlan} from './cutover-plan.mjs';
import {readFileSync} from 'node:fs';
import {planCoreCatalogue} from '../../client/src/lib/coreCatalogue';
const task:any={id:'task-quiz',type:'quiz',title:'合成教材',description:'測試',visible:true,topicId:'topic',grade:1,questions:[]};
const questions:any=[{id:'q1',type:'choice',prompt:'Public',points:10,options:['A','B'],answer:1,explanation:'Private key explanation',image:'/images/login-history.webp'},{id:'q2',type:'short',prompt:'Short',points:20,modelAnswer:'Private model',rubric:'Private rubric'}];
const split=()=>prepareAssessmentVersion(task,questions,'合成教材','測試','opaque-v1');
afterEach(()=>vi.unstubAllEnvs());
test('publication exports public fields only, preserves images, and rejects nested private data',()=>{
  const s=split();expect(s.publicTask.questions[0].image).toBe(questions[0].image);expect(s.privateKey.questions[0].answer).toBe(1);
  expect(()=>assertPublicAssessment(s.publicTask)).not.toThrow();expect(JSON.stringify(s.publicTask)).not.toContain('Private');
  expect(()=>assertPublicAssessment({nested:[{modelAnswer:'secret'}]})).toThrow();
  expect(()=>prepareAssessmentVersion({...task,studentId:'leak'},questions,'Title','Desc','v')).toThrow();
  expect(()=>prepareAssessmentVersion({...task,type:'game'},questions,'Title','Desc','v')).toThrow();
});
test('verified Google transport maps access.studentId and cannot trust localRole or claimed student identity',()=>{
  const token={claims:{email:'student@test',email_verified:true},signInProvider:'google.com'};
  expect(verifiedAssessmentIdentity('firebase-uid',token,{enabled:true,studentId:'registered-student'},'teacher@test').studentId).toBe('registered-student');
  expect(()=>verifiedAssessmentIdentity('u',{...token,signInProvider:'password'},{enabled:true,studentId:'s'},'teacher@test')).toThrow();
  expect(()=>verifiedAssessmentIdentity('u',{...token,claims:{...token.claims,email_verified:false}},{enabled:true,studentId:'s'},'teacher@test')).toThrow();
  expect(()=>verifiedAssessmentIdentity('u',token,{enabled:false,studentId:'s'},'teacher@test')).toThrow();
  expect(()=>verifiedAssessmentIdentity('u',token,undefined,'teacher@test')).toThrow();
  const teacher={...token,claims:{email:'teacher@test',email_verified:true}};
  expect(verifiedAssessmentIdentity('teacher-uid',teacher,undefined,'teacher@test').teacher).toBe(true);
});
test('production writer stays off and cannot redirect to another project or emulator',()=>{
  const database=(project:string,host:string)=>({app:{options:{projectId:project}},_settings:{host}} as any);
  vi.stubEnv('VITE_RULES_ASSESSMENT_ENABLED','0');expect(()=>requireLocal(database('history-discovery-center','firestore.googleapis.com'))).toThrow();
  vi.stubEnv('VITE_RULES_ASSESSMENT_ENABLED','1');expect(()=>requireLocal(database('history-discovery-center','firestore.googleapis.com'))).not.toThrow();
  expect(()=>requireLocal(database('another-project','firestore.googleapis.com'))).toThrow();expect(()=>requireLocal(database('history-discovery-center','localhost:8191'))).toThrow();
});
test('protected resolver GETs only exact published versions, validates binding, and stops before writes',async()=>{
  const s=split(),raw={...s.publicTask};let calls:string[]=[];
  const request=async(method:string,p:string)=>{calls.push(method+' '+p);return{fields:fields(p.includes('/assessmentKeys/')?s.privateKey:s.metadata)};};
  await expect(publishedPrivateInput(raw,{project:'demo-readiness',request})).rejects.toThrow('尚未獲批准');expect(calls).toHaveLength(0);
  const key=await publishedPrivateInput(raw,{project:'demo-readiness',request,approved:true});expect(key.privateKey.questions[0].answer).toBe(1);expect(calls).toHaveLength(2);expect(calls.every(p=>p.startsWith('GET ')&&p.endsWith('/task-quiz--opaque-v1'))).toBe(true);
  await expect(publishedPrivateInput({...raw,questions:[{...raw.questions[0],prompt:'altered'},raw.questions[1]]},{project:'demo-readiness',request,approved:true})).rejects.toThrow('不一致');
  await expect(publishedPrivateInput(raw,{project:'demo-readiness',request:async()=>null,approved:true})).rejects.toThrow('未發布');
});
test('ordinary release receipts omit private answers and keep grant/index rollback data',()=>{
  const changes=[{path:'catalogue/task--hash',before:undefined,after:{questions}},{path:'taskAccess/task',before:{fields:fields({grade:1,enabled:false})},after:{grade:1,enabled:true}}];
  const backup=publicCoreBackup(changes);expect(JSON.stringify(backup)).not.toContain('Private');expect(JSON.stringify(backup)).not.toContain('answer');expect(backup[0].privatePayloadOmitted).toBe(true);expect(backup[1].after.enabled).toBe(true);
});
test('cutover review keeps pending legacy attempts and immutable positive ledgers; never backfills or touches games',()=>{
  const p=assessmentCutoverPlan({tasks:[{taskId:'task',version:'v2'}],submissions:[{id:'old',studentId:'s',taskId:'task',grade:{status:'pending'}},{id:'new',studentId:'s',taskId:'task',protocol:'rules-assessment/1'}],entries:[{studentId:'already',taskId:'task',amount:100}],policies:{task:{source:'assessment',enabled:true}}});
  expect(p.writes).toBe(false);expect(p.backfill).toBe(false);expect(p.tasks[0].legacyReviewAttemptIds).toEqual(['old']);expect(p.tasks[0].existingPositiveEntries).toBe(1);
  expect(()=>assessmentCutoverPlan({tasks:[{taskId:'game',version:'v',type:'game'}]})).toThrow();
});
test('formal build and workflow remain disabled, with public-only build planning and protected key read approval',()=>{
  const workflow=readFileSync('.github/workflows/deploy-pages.yml','utf8');expect(workflow).toContain('VITE_RULES_ASSESSMENT_ENABLED: "0"');expect(workflow).toContain('VITE_ASSESSMENT_EMULATORS: "0"');expect(workflow).toContain('--public-plan');expect(workflow).toContain('ASSESSMENT_PRIVATE_INPUT_APPROVED');
});
test('new core versions use the published opaque version and protocol tag while legacy hashes remain unchanged',()=>{
  const legacy=planCoreCatalogue([{...task,questions}],[])[0].documents.find(d=>d.path.startsWith('catalogue/'))!;
  const current=planCoreCatalogue([{...task,assessmentVersion:'opaque-v1',questions}],[])[0].documents.find(d=>d.path.startsWith('catalogue/'))!;
  expect(legacy.path).not.toBe('catalogue/task-quiz--opaque-v1');expect(legacy.data.protocol).toBeUndefined();
  expect(current.path).toBe('catalogue/task-quiz--opaque-v1');expect(current.data.protocol).toBe('rules-assessment/1');
});
