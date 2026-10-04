import {readFileSync,writeFileSync} from 'node:fs';
import {addGameRules} from '../games/build-rules.mjs';
const base=readFileSync('firestore.rules','utf8');
const protocol=readFileSync('integration/assessment/protocol.rules','utf8');
function block(text,label){
  const start=text.indexOf(`    match /${label} {`);if(start<0)throw Error(label);
  // Path parameters contain braces; start counting at the block's final brace.
  let i=text.indexOf(' {',start)+1,depth=0;
  for(;i<text.length;i++){if(text[i]==='{')depth++;if(text[i]==='}'&&!--depth&&text[i]==='}')break;}
  return text.slice(start,i+1);
}
let output=base;
const oldSub=block(base,'submissions/{attempt}'),newSub=block(protocol,'submissions/{attempt}');
let merged=oldSub.replace('allow create: if (teacher() || owns(request.resource.data.studentId))',"allow create: if request.resource.data.get('protocol','') != 'rules-assessment/1'\n        && !exists(/databases/$(database)/documents/assessmentVersions/$(request.resource.data.taskId + '--' + request.resource.data.version))\n        && (teacher() || owns(request.resource.data.studentId))");
merged=merged.replace('allow update: if teacher()',"allow update: if resource.data.get('protocol','') != 'rules-assessment/1' && teacher()");
merged=merged.slice(0,-1)+newSub.slice(newSub.indexOf('      allow create:')).replace('allow create: if attempt.',"allow create: if request.resource.data.get('protocol','') == 'rules-assessment/1' && attempt.").replace('allow update: if request.resource',"allow update: if resource.data.get('protocol','') == 'rules-assessment/1' && request.resource");
output=output.replace(oldSub,merged);
const oldProgress=block(base,'progress/{sid}/tasks/{taskId}'),newProgress=block(protocol,'progress/{sid}/tasks/{taskId}');
const source="getAfter(/databases/$(database)/documents/submissions/$(request.resource.data.attemptId)).data";
const legacyProgress=oldProgress.replace('allow create, update: if',`allow create, update: if ${source}.get('protocol','') != 'rules-assessment/1' && (`).replace('data.taskId == taskId);','data.taskId == taskId));');
output=output.replace(oldProgress,legacyProgress.slice(0,-1)+newProgress.slice(newProgress.indexOf('      allow create, update:')).replace('allow create, update: if',`allow create, update: if ${source}.get('protocol','') == 'rules-assessment/1' &&`));
const oldLedger=block(base,'coinAccounts/{sid}/entries/{entry}'),newLedger=block(protocol,'coinAccounts/{sid}/entries/{entry}');
let ledger=oldLedger.replace('return s.studentId == sid && s.taskId == entry',"return s.get('protocol','') != 'rules-assessment/1' && s.studentId == sid && s.taskId == entry");
ledger=ledger.slice(0,-1)+newLedger.slice(newLedger.indexOf('      function positiveReward()')).replaceAll('positiveReward()','rulesReward()').replace('return rrApproved(sid,entry)',"return s.get('protocol','') == 'rules-assessment/1' && rrApproved(sid,entry)");
output=output.replace(oldLedger,ledger);
let additions=protocol;
for(const label of ['submissions/{attempt}','progress/{sid}/tasks/{taskId}','coinRules/{task}','coinAccounts/{sid}/entries/{entry}'])additions=additions.replace(block(additions,label),'');
additions+=`\n    match /assessmentReviews/{attempt} {
      function source() { return get(/databases/$(database)/documents/submissions/$(attempt)).data; }
      allow get: if teacher() || owns(source().studentId);
      allow create, update: if teacher() && source().protocol == 'rules-assessment/1'
        && request.resource.data.keys().hasOnly(['revision','feedback','questions'])
        && request.resource.data.revision == source().grade.revision
        && request.resource.data.feedback is string && request.resource.data.feedback.size() <= 8000
        && request.resource.data.questions is map && request.resource.data.questions.size() <= 30;
      allow list, delete: if false;
    }\n`;
output=output.replace(/  }\s*}\s*$/,additions+'  }\n}\n');
writeFileSync('integration/assessment/compatible.rules',addGameRules(output));
console.log('Generated compatible rules; formal firestore.rules unchanged.');
