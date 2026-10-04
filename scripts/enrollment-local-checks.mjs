import fs from 'node:fs'; import path from 'node:path'; import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp/enrollment-draw-review'); fs.mkdirSync(out,{recursive:true});
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8185')throw Error('Synthetic emulator only');
const plans=[
 ['draw-and-legacy-qualification',['--experimental-strip-types','--test','functions/test/browserDraw.integration.test.ts','functions/test/drawQualification.integration.test.ts']],
 ['models-and-policy',['--experimental-strip-types','--test','client/src/lib/cardModel.test.ts','client/src/lib/fullCardAccess.test.ts','scripts/card-catalog.test.mjs']],
 ['client-types',['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']],
 ['ledger-audit-types',['node_modules/typescript/bin/tsc','-p','functions/tsconfig.json','--noEmit','--incremental','false']],
 ['build',['node_modules/vite/bin/vite.js','build','--config','vite.draw-preview.config.ts']],
];
function run([name,args]){return new Promise(resolve=>{const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,NODE_PATH:path.join(root,'tmp/preview-deps'),VITE_CARD_DRAW_ENABLED:'1'},stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',x=>text+=x);child.stderr.on('data',x=>text+=x);child.on('close',code=>{fs.writeFileSync(path.join(out,name+'.log'),text);const result={name,exitCode:code};console.log(JSON.stringify(result));resolve(result);});});}
const results=await Promise.all(plans.map(run)); fs.writeFileSync(path.join(out,'checks-status.json'),JSON.stringify(results,null,2));if(results.some(r=>r.exitCode!==0))process.exitCode=1;
