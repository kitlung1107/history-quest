import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {publishedPrivateInput} from './published-private-input.mjs';
import {hydratePrivateCoreTasks} from './private-core-source.mjs';
import {assertPublicSafe} from './export-content.mjs';

// Read-only audit of the built public artifact and the exact version published
// by the authenticated CMS browser test. Never query a production project.
const root=process.cwd(),json=p=>JSON.parse(readFileSync(p,'utf8'));
const files=[];
function walk(dir){for(const name of readdirSync(dir)){const p=path.join(dir,name);statSync(p).isDirectory()?walk(p):files.push(p);}}
walk('dist/public');
const publicTask=json('tmp/auth-qa/public-export.json');
assertPublicSafe(publicTask);
const requests=[];
const published=await publishedPrivateInput(publicTask,{project:'demo-rules-rewards-app',approved:true,request:async(method,p)=>{
  if(method!=='GET'||!/^projects\/demo-rules-rewards-app\/databases\/\(default\)\/documents\/(assessmentKeys|assessmentVersions)\//.test(p))throw Error('Audit permits exact local GETs only.');
  requests.push({method,path:p});
  const response=await fetch('http://127.0.0.1:8191/v1/'+p,{headers:{Authorization:'Bearer owner'}});
  if(!response.ok)throw Error('Published local version is unavailable: '+response.status);
  return response.json();
}});
const hydrated=await hydratePrivateCoreTasks([publicTask],root,{resolvePrivate:async()=>published});
if(requests.length!==2||hydrated[0].questions[0].answer!==published.privateKey.questions[0].answer)throw Error('Protected private-input binding failed.');
const needles=new Set(['正式接線私有解說，只存本機 emulator。','CMS 私有解說驗收：只有提交後或教師可讀。']);
const addPrivate=source=>{for(const q of source.privateKey?.questions??source.keyDocument?.data?.questions??[])for(const f of ['explanation','modelAnswer','rubric'])if(typeof q[f]==='string'&&q[f].length>15)needles.add(q[f]);};
addPrivate(published);
const sourceTasks=readdirSync('client/src/content/tasks').filter(f=>f.endsWith('.json')).map(f=>json(path.join('client/src/content/tasks',f)));
const privateTaskIds=new Set(sourceTasks.filter(t=>t.assessmentVersion||t.task_id.startsWith('local-assessment-')).map(t=>t.task_id));
for(const f of readdirSync('private-assessments').filter(f=>f.endsWith('.json'))){
  const source=json(path.join('private-assessments',f));
  if(privateTaskIds.has(source.privateKey?.taskId??source.keyDocument?.data?.taskId))addPrivate(source);
}
const fixtureIds=sourceTasks.filter(t=>t.task_id.startsWith('local-assessment-')).map(t=>t.task_id);
const leaks=[];
for(const f of files){
  if(/(?:private-assessments|(^|[\\/])tmp[\\/]|(^|[\\/])integration[\\/])/.test(f))leaks.push({file:f,kind:'private-path'});
  if(!/\.(?:js|json|html|map|css|txt|yml)$/.test(f))continue;
  const text=readFileSync(f,'utf8');
  for(const n of needles)if(text.includes(n)||text.includes(JSON.stringify(n).slice(1,-1)))leaks.push({file:f,kind:'private-value'});
  for(const id of fixtureIds)if(text.includes(id))leaks.push({file:f,kind:'local-fixture',id});
}
if(leaks.length)throw Error('Public artifact audit failed: '+JSON.stringify(leaks));
const normalized=s=>s.replaceAll('\r\n','\n');
const formalRules=normalized(readFileSync('firestore.rules','utf8'));
if(formalRules!==normalized(execFileSync('git',['show','HEAD:firestore.rules'],{encoding:'utf8'})))throw Error('Formal Rules working file changed.');
let rulesDiff;try{rulesDiff=execFileSync('git',['diff','--no-index','--','firestore.rules','integration/assessment/compatible.rules'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch(e){if(e.status!==1)throw e;rulesDiff=e.stdout;}
writeFileSync('integration/assessment/rules-compatibility.diff',rulesDiff);
const result={passed:true,scannedFiles:files.length,privateValuesChecked:needles.size,localFixtureIdsChecked:fixtureIds.length,leaks,authenticatedCMSPublicExport:true,protectedResolver:{project:'demo-rules-rewards-app',exactGetCount:requests.length,versionBindingPassed:true,hydrationPassed:true,writes:0},formalRulesChanged:false,productionActions:0,scope:'New private assessment versions only. Previously public legacy answers remain public.'};
writeFileSync('tmp/formal-artifact-audit.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
