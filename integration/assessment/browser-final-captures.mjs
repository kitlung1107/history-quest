import {writeFileSync,mkdirSync} from 'node:fs';
const origin='http://127.0.0.1:4201';mkdirSync('tmp/app-qa',{recursive:true});
for(const t of await(await fetch('http://127.0.0.1:9297/json/list')).json())if(t.type==='page')await fetch(`http://127.0.0.1:9297/json/close/${t.id}`);
const t=await(await fetch('http://127.0.0.1:9297/json/new?about:blank',{method:'PUT'})).json(),ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const requests=new Map();
await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.id){const p=requests.get(v.id);requests.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}});
function call(method,params={}){return new Promise((resolve,reject)=>{const n=++id;requests.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(exp){for(let i=0;i<250;i++){if(await evaluate(exp))return;await pause(200);}throw Error('Timeout '+exp);}
async function shot(name){await pause(550);const r=await call('Page.captureScreenshot',{format:'png'});writeFileSync(`tmp/app-qa/${name}.png`,Buffer.from(r.data,'base64'));}
async function navigate(url){await call('Page.navigate',{url:origin+url});await until(`document.body.innerText.includes('本機 App 預覽')`);}
const results=[];await call('Page.enable');
try{
  for(const [name,width,height] of [['mobile',390,844],['ipad',820,1180]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:name==='mobile'});await navigate('/?localRole=student&assessmentTask=local-assessment-mc-10');await until(`document.querySelector('[role=dialog]')!==null`);
    await evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()==='開始挑戰').click();void 0;`);await until(`document.querySelector('.quiz-panel')!==null`);
    const box=await evaluate(`(()=>{const p=document.querySelector('.quiz-panel'),dialog=document.querySelector('[role=dialog]'),next=document.querySelector('.quiz-next');return{clientWidth:p.clientWidth,scrollWidth:p.scrollWidth,dialogRight:dialog.getBoundingClientRect().right,nextRight:next.getBoundingClientRect().right,fieldsetCount:p.querySelectorAll('fieldset').length};})()`);
    if(box.scrollWidth>box.clientWidth+1||box.nextRight>box.dialogRight||box.fieldsetCount!==1)throw Error('Mobile clipping '+JSON.stringify(box));results.push({name,passed:true,...box});await shot(`${name}-question`);
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await navigate('/?localRole=student');
  await evaluate(`[...document.querySelectorAll('button[aria-label="開啟年級選單"]')].find(e=>e.getClientRects().length)?.click();void 0;`);await until(`document.querySelector('.coin-balance strong')?.innerText!=='載入中'&&document.querySelector('.coin-balance strong')?.innerText.length>0`);await shot('original-balance');
  results.push({name:'original balance visible in opened sidebar',passed:true,value:await evaluate(`document.querySelector('.coin-balance strong').innerText`)});
  writeFileSync('tmp/app-qa/final-capture-results.json',JSON.stringify({results},null,2));console.log(JSON.stringify(results));
}finally{ws.close();}
