// Audit the real release build without reading Firestore or private answer keys.
// Authoritative private-version binding remains the protected core-sync CI gate.
import {readFileSync,readdirSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import path from 'node:path';
import assert from 'node:assert/strict';
import {assertPublicSafe} from '../integration/assessment/export-content.mjs';
const {values:options}=parseArgs({options:{directory:{type:'string',default:'dist/public'},output:{type:'string',default:'tmp/release/public-artifact-audit.json'},'expected-commit':{type:'string'}}});
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(options['expected-commit'])assert.equal(sha,options['expected-commit'],'Unexpected release commit');
assert.equal(process.env.VITE_ASSESSMENT_EMULATORS,'0','Release requires emulator mode off');
assert.equal(process.env.VITE_RULES_ASSESSMENT_ENABLED,'1','Keep approved Rules assessments enabled');
assert.equal(process.env.VITE_CARD_DRAW_ENABLED,'1','Keep approved card draw enabled');
const directory=path.resolve(options.directory),files=[];
function walk(dir){for(const name of readdirSync(dir)){const f=path.join(dir,name);statSync(f).isDirectory()?walk(f):files.push(f);}}
walk(directory);
const tracked=execFileSync('git',['ls-files','client/src/content/tasks'],{encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.json'));
const publicExports=tracked.map(file=>{
  const task=JSON.parse(readFileSync(file,'utf8'));
  assert.deepEqual(task,JSON.parse(execFileSync('git',['show',`${sha}:${file}`],{encoding:'utf8'})),'Public CMS input differs from audited commit');
  if(task.assessmentVersion){assertPublicSafe(task);return{file,task};}
}).filter(Boolean);
assert.ok(publicExports.length,'Expected published private assessment public inputs');
const textFiles=files.filter(f=>/\.(js|json|html|map|css|txt|yml)$/.test(f));
const texts=textFiles.map(f=>({file:f,text:readFileSync(f,'utf8')}));
const leaks=[];
for(const f of files){const relative=path.relative(directory,f);if(/(?:private-assessments|(^|[\\/])tmp[\\/]|(^|[\\/])integration[\\/])/.test(relative))leaks.push({file:relative,kind:'private-path'});}
for(const {file,text} of texts)for(const needle of ['local-assessment-mc-','local-assessment-mixed-','local-assessment-short-','synthetic-cms-audit-','SYNTHETIC_CMS_PRIVATE_ONLY_','demo-rules-rewards-app','demo-game-sync'])if(text.includes(needle))leaks.push({file:path.relative(directory,file),kind:'synthetic-or-emulator-value',needle});
assert.deepEqual(leaks,[],'Synthetic/private files entered the release artifact');
assert.ok(texts.some(f=>f.text.includes('history-discovery-center')),'Production Firebase project is absent');
for(const {task} of publicExports)assert.ok(texts.some(f=>f.text.includes(task.assessmentVersion)),`Published version missing from artifact: ${task.task_id}`);
const html=readFileSync(path.join(directory,'index.html'),'utf8');
const assets=[...html.matchAll(/(?:src|href)="(\/history-quest\/assets\/[^"?]+)"/g)].map(m=>m[1]);
assert.ok(assets.some(f=>f.endsWith('.js'))&&assets.some(f=>f.endsWith('.css')),'Pages base or entry assets missing');
const entryAssets=assets.map(url=>{const f=path.join(directory,url.replace('/history-quest/',''));assert.ok(statSync(f).isFile());return{url,sha256:createHash('sha256').update(readFileSync(f)).digest('hex'),bytes:statSync(f).size};});
const result={passed:true,synthetic:false,commit:sha,networkRequests:0,artifactDirectory:options.directory,scannedFiles:files.length,leaks,productionFirebaseProject:'history-discovery-center',releaseFlags:{assessmentEmulators:false,rulesAssessment:true,cardDraw:true},publicExports,entryAssets,indexSha256:createHash('sha256').update(html).digest('hex'),privateKeyReads:0,protectedPrivateBinding:'Requires successful exact-commit protected core-sync CI step; this offline scan does not claim private key validation.',legacyPublicAnswers:'Existing legacy public answers remain outside the private-assessment confidentiality scope.'};
mkdirSync(path.dirname(options.output),{recursive:true});writeFileSync(options.output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,publicExports:publicExports.map(({file,task})=>({file,taskId:task.task_id,version:task.assessmentVersion,questions:task.questions.length}))}));
