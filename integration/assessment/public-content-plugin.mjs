import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {splitAssessment,assertPublicSafe} from './export-content.mjs';
export function assessmentContentPlugin(root){
  const envPath=path.join(root,'.env.local');
  const enabled=(process.env.VITE_ASSESSMENT_EMULATORS??(fs.existsSync(envPath)&&/VITE_ASSESSMENT_EMULATORS=1/.test(fs.readFileSync(envPath,'utf8'))?'1':'0'))==='1';
  const tasks=path.join(root,'client/src/content/tasks'),privateDir=path.join(root,'private-assessments');
  const statePath=path.join(privateDir,'version-state.json');
  function project(raw){
    if(!enabled||(!raw.questions?.length&&!raw.question))return raw;
    if(raw.assessmentVersion){assertPublicSafe(raw);return raw;}
    const digest=createHash('sha256').update(JSON.stringify(raw)).digest('hex');
    fs.mkdirSync(path.join(privateDir,'digests'),{recursive:true});
    const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{};
    const versionPath=path.join(privateDir,'digests',`${digest}.json`);
    // Exclusive creation makes seed and Vite agree even when both run at once.
    try{fs.writeFileSync(versionPath,JSON.stringify({version:state[digest]??randomUUID().replaceAll('-','')}),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
    const {version}=JSON.parse(fs.readFileSync(versionPath,'utf8'));
    const split=splitAssessment(raw,{version});
    // Existing game questionnaires still support private core hydration, but
    // they never enter the assessment reward protocol.
    split.metadata.enabled=raw.type!=='game';
    fs.writeFileSync(path.join(privateDir,`${raw.task_id}--${version}.json`),JSON.stringify(split,null,2));
    return split.publicTask;
  }
  return{name:'local-assessment-public-content',enforce:'pre',
    transform(code,id){if(enabled&&id.replaceAll('\\','/').includes('/content/tasks/')&&id.split('?')[0].endsWith('.json'))return JSON.stringify(project(JSON.parse(code)));},
    configureServer(server){if(!enabled)return;
      server.middlewares.use(async(req,res,next)=>{
        const decoded=decodeURIComponent(req.url??'');
        if(decoded.includes('private-assessments')||decoded.includes('/integration/assessment/')||decoded.includes('/tmp/')){res.writeHead(403);res.end('Private authoring files are unavailable.');return;}
        // Raw query and @fs requests must use the same public projection.
        if(decoded.includes('/content/tasks/')&&decoded.includes('.json')){
          const file=path.basename(decoded.split('?')[0]);
          if(fs.existsSync(path.join(tasks,file))){const value=project(JSON.parse(fs.readFileSync(path.join(tasks,file),'utf8')));
            if(decoded.includes('?raw')||!decoded.includes('?import')){res.setHeader('Cache-Control','no-store');
              if(decoded.includes('?raw')){res.setHeader('Content-Type','text/javascript');res.end(`export default ${JSON.stringify(JSON.stringify(value))}`);}
              else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}return;}
          }
        }
        if(decoded.split('?')[0]!=='/__assessment/publish'){next();return;}
        if(req.method!=='POST'||!['http://127.0.0.1:4201','http://localhost:4201'].includes(req.headers.origin)){res.writeHead(403);res.end('Local publication only.');return;}
        try{
          let body='';for await(const chunk of req){body+=chunk;if(body.length>300000)throw Error('教材過大。');}
          const value=JSON.parse(body);assertPublicSafe(value);
          if(!/^[a-zA-Z0-9_-]{1,150}$/.test(value.task_id)||!/^[a-zA-Z0-9_-]{1,100}$/.test(value.assessmentVersion)||!Array.isArray(value.questions)||!value.questions.length||value.questions.length>30)throw Error('公開教材格式無效。');
          const versionId=`${value.task_id}--${value.assessmentVersion}`;
          const documents=await Promise.all(['assessmentVersions','assessmentKeys'].map(async collection=>{
            // Fixed synthetic project/loopback only; this route never has live credentials.
            const response=await fetch(`http://127.0.0.1:8191/v1/projects/demo-rules-rewards-app/databases/(default)/documents/${collection}/${versionId}`,{headers:{Authorization:'Bearer owner'}});
            if(!response.ok)throw Error('私有題庫版本尚未儲存，未匯出公開教材。');
            return Object.fromEntries(Object.entries((await response.json()).fields).map(([k,v])=>[k,decodeFirestore(v)]));
          }));
          const [metadata,privateKey]=documents;assertPublicSafe(metadata);
          if(value.type==='game'||metadata.enabled!==true)throw Error('此版本未開放小測發布，遊戲流程保持原有設定。');
          if(metadata.taskId!==value.task_id||metadata.version!==value.assessmentVersion||JSON.stringify(metadata.questions)!==JSON.stringify(value.questions)){
            // REST map field order is unspecified; compare canonical structures.
            if(metadata.taskId!==value.task_id||metadata.version!==value.assessmentVersion||JSON.stringify(canonical(metadata.questions))!==JSON.stringify(canonical(value.questions)))throw Error('公開題目與私有版本不一致，未匯出。');
          }
          fs.mkdirSync(privateDir,{recursive:true});fs.writeFileSync(path.join(privateDir,`${versionId}.json`),JSON.stringify({publicTask:value,metadata,privateKey,published:true},null,2));
          const target=path.join(tasks,`${value.task_id}.json`);
          // Preserve legacy private input locally; never place it in HTTP output.
          if(fs.existsSync(target)){const old=JSON.parse(fs.readFileSync(target,'utf8'));if(!old.assessmentVersion){fs.mkdirSync(privateDir,{recursive:true});fs.writeFileSync(path.join(privateDir,`${value.task_id}-legacy-source.json`),JSON.stringify(old,null,2));}}
          fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n');
          server.ws.send({type:'full-reload'});
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify({saved:true,taskId:value.task_id,version:value.assessmentVersion,localOnly:true}));
        }catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
      });
    }
  };
}
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;}
function decodeFirestore(value){
  if('stringValue' in value)return value.stringValue;if('integerValue' in value)return Number(value.integerValue);if('doubleValue' in value)return value.doubleValue;
  if('booleanValue' in value)return value.booleanValue;if('nullValue' in value)return null;if('timestampValue' in value)return value.timestampValue;
  if('arrayValue' in value)return(value.arrayValue.values??[]).map(decodeFirestore);
  if('mapValue' in value)return Object.fromEntries(Object.entries(value.mapValue.fields??{}).map(([k,v])=>[k,decodeFirestore(v)]));
  throw Error('私有匯出含未支援的資料格式。');
}
