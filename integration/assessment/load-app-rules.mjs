import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
const rules=readFileSync('integration/assessment/compatible.rules','utf8');
const env=await initializeTestEnvironment({projectId:'demo-rules-rewards-app',firestore:{host:'127.0.0.1',port:8191,rules}});
await env.cleanup();
console.log(JSON.stringify({projectId:'demo-rules-rewards-app',rulesSha256:createHash('sha256').update(rules).digest('hex'),cleared:false,seeded:false}));
