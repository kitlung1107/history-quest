import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,updateDoc} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-rules-rewards-app',firestore:{host:'127.0.0.1',port:8191}});
let count=0;
await env.withSecurityRulesDisabled(async c=>{
  for(const file of readdirSync('private-assessments').filter(f=>f.endsWith('.json')&&!f.includes('state')&&!f.includes('legacy'))){const split=JSON.parse(readFileSync(`private-assessments/${file}`,'utf8'));if(split.publicTask?.type!=='game')continue;
    split.metadata.enabled=false;writeFileSync(`private-assessments/${file}`,JSON.stringify(split,null,2));
    await updateDoc(doc(c.firestore(),'assessmentVersions',`${split.metadata.taskId}--${split.metadata.version}`),{enabled:false});count++;
  }
});await env.cleanup();console.log(JSON.stringify({projectId:'demo-rules-rewards-app',excludedGameQuestionnaires:count,cleared:false}));
