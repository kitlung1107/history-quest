import { createPortraitLayout, COURTYARD_ART } from './portrait-layout.js';
// Animation is a presentation client. Integrated local mode waits for a committed server receipt.
const $=id=>document.getElementById(id),canvas=$('scene'),ctx=canvas.getContext('2d');
const demo=['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('mode')==='demo';
const integrated=new URLSearchParams(location.search).get('mode')==='integrated';
const active=demo||integrated;
const W=1205,H=960,AX={x:630,y:550},START=-55*Math.PI/180;
const art={},names=['scene-no-tray',...(active?['scene-present','card-back','card-white','card-art']:[])];
const portrait=createPortraitLayout(canvas,ctx,art);
let current=null,phase='loading',token=0,locked=false,speed=1,model=initialModel();
const media=matchMedia('(prefers-reduced-motion: reduce)'),reduced=()=>media.matches;
const stats={paintedFrames:0,angles:[],growth:[],push:[],poses:[],fall:[]};
const easing=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
$('feature-status').textContent=integrated?'交易成功後自動播放；加入卡片庫只會返回':demo?'效果示範，不扣探索幣或派發卡片':'抽卡功能尚未啟用，不會扣探索幣或派發卡片';
function say(s){$('caption').textContent=s;}
function controls(){$('start').hidden=phase!=='idle';$('start').disabled=!active||locked||((portrait.enabled||portrait.compact)&&!portrait.ready);$('join').hidden=phase!=='revealed';$('resume').hidden=phase!=='paused';}
async function savePhase(){} // Deliberately no result saving or transaction in a UI-only effect.
function halt(){if(!active||!current)return;token++;locked=false;model.pageGlow=0;phase='paused';controls();paint();say('效果示範已暫停。');}
function initialModel(){return {angle:0,push:0,fall:0,land:0,grow:0,pageGlow:0,cardGlow:1,reveal:0,approach:0,reach:0,grip:0,shakeX:0,shakeY:0};}
const reminderAssets={
 complete:{src:'./assets/reminder-complete.png',text:'恭喜你！目前可以抽到嘅卡片，你已經集齊晒！等新卡登場，再嚟探索啦！'},
 insufficient:{src:'./assets/reminder-insufficient.png',text:'探索幣仲差少少！完成小測或遊戲，儲夠再嚟抽卡啦！'}
};
const REMINDER_MS=4000,COMPACT_REMINDER_FADE_MS=240;
let reminderTimer,reminderDeadline=0;
function finishReminder(message){
 if(!['reminder','reminder-loading','reminder-fading'].includes(phase))return;
 clearTimeout(reminderTimer);reminderTimer=undefined;reminderDeadline=0;token++;
 $('draw-reminder').hidden=true;phase='idle';locked=false;model=initialModel();controls();paint();say(message||'');
 parent.postMessage({kind:'coin-draw-reminder-ended',message},location.origin);
}
function expireReminder(){
 if(phase!=='reminder')return;
 // Other layouts retain their existing four-second immediate return.
 if(!portrait.compact||reduced()){finishReminder();return;}
 phase='reminder-fading';controls();paint();
 reminderTimer=setTimeout(()=>finishReminder(),COMPACT_REMINDER_FADE_MS);
}
async function showReminder(type){
 const asset=reminderAssets[type];if(!asset)return;
 const id=++token;phase='reminder-loading';locked=true;controls();paint();
 const image=$('draw-reminder');image.alt=asset.text;image.src=asset.src;
 try{
  await image.decode();if(id!==token||phase!=='reminder-loading')return;
  phase='reminder';image.hidden=false;portrait.reminder(asset.text,type);controls();paint();say(asset.text);
  reminderDeadline=performance.now()+REMINDER_MS;
  reminderTimer=setTimeout(expireReminder,REMINDER_MS);
 }catch{if(id===token)finishReminder('提醒圖片未能載入；未扣探索幣，請重新整理。');}
}
function isPresent(){return ['screenfade','cardfade','revealing','revealed'].includes(phase)||(phase==='growing'&&model.grow>.965);}
function background(){if(portrait.background(isPresent(),phase,model))return;ctx.drawImage(art[isPresent()?'scene-present':'scene-no-tray'],0,0,W,H);if(!isPresent()&&(model.shakeX||model.shakeY)){ctx.save();ctx.beginPath();ctx.roundRect(185,150,510,615,25);ctx.clip();ctx.translate(model.shakeX||0,model.shakeY||0);ctx.drawImage(art['scene-no-tray'],0,0,W,H);ctx.restore();}}
function strokeLine(x1,y1,x2,y2,color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function teacher(){
 const x=AX.x+(model.shakeX||0),y=AX.y+(model.shakeY||0),down=phase==='pressing'?Math.sin(Math.PI*(model.press||0)):0;
 ctx.save();ctx.fillStyle='#cf9532';ctx.strokeStyle='#111627';ctx.lineWidth=5;ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.fillStyle=down>.2?'#ee9d25':'#ffd56b';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x-3*down,y,22-1.5*down,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
}
function updateActor(){const actor=$('teacher-actor');actor.hidden=isPresent()||phase==='collection';let shift=0,pose='ready';
 if(phase==='approaching')shift=-64*(model.approach||0);
 else if(['reaching','gripping','pressing'].includes(phase)){shift=-64;pose=phase==='pressing'?'press':'reach';}
 else if(phase==='releasing'){shift=-64*(model.reach||0);pose=(model.reach||0)>.45?'reach':'ready';}
 actor.dataset.pose=pose;portrait.actor(actor,shift);stats.poses.push({phase,pose,shift,wholePerson:true});
}
const resultCardLayers={'effect-sample':'card-art'};
function resultCardImage(){return art[resultCardLayers[current?.cardId]||'card-art'];}
const finalRect={x:137,y:3,w:532,h:780};
function emittedCard(p){return {cx:498+3*p,cy:590+137*p,w:74,h:108*Math.sin((25+65*p)*Math.PI/180),angle:.025+.055*p};}
function fallenCard(p){const base=emittedCard(1);return {...base,cx:base.cx+9*p+7*p*p,cy:base.cy+15*p+100*p*p,angle:.08+.22*p*p};}
function landedCard(p){const r=fallenCard(1);return {...r,cy:r.cy-6*Math.sin(Math.PI*p),angle:r.angle-.06*Math.sin(Math.PI*p)};}
function cardRect(){const p=model.grow;if(['screenfade','cardfade','revealing','revealed'].includes(phase))return {...portrait.result(finalRect)};const target=portrait.result(finalRect),start=fallenCard(1),u=easing(clamp((p-.08)/.92)),w=mix(74,target.w,p),h=mix(108,target.h,p),cx=mix(start.cx,target.x+target.w/2,u),cy=mix(start.cy,target.y+target.h/2,u);return {x:cx-w/2,y:cy-h/2,w,h,angle:.3*(1-p)};}
function drawCard(image,r,scale=1,glow=0){ctx.save();ctx.translate(r.x+r.w/2,r.y+r.h/2);ctx.rotate(r.angle||0);ctx.scale(Math.max(.012,Math.abs(scale)),1);if(glow){ctx.shadowColor='rgba(255,255,255,'+glow+')';ctx.shadowBlur=20+35*glow;}ctx.drawImage(image,-r.w/2,-r.h/2,r.w,r.h);ctx.restore();}
function littleCard(r){ctx.save();ctx.translate(r.cx,r.cy);ctx.rotate(r.angle);ctx.shadowColor='rgba(25,25,30,.22)';ctx.shadowBlur=4;ctx.shadowOffsetX=2;ctx.shadowOffsetY=3;ctx.drawImage(art['card-back'],-r.w/2,-r.h/2,r.w,r.h);ctx.restore();}
function floorShadow(p){ctx.save();ctx.fillStyle='rgba(35,45,55,'+(.04+.12*p)+')';ctx.beginPath();ctx.ellipse(517,901,30+18*p,4+3*p,0,0,Math.PI*2);ctx.fill();ctx.restore();}
function paint(){
 ctx.clearRect(0,0,canvas.width,canvas.height);
 if(portrait.paint(phase,model,integrated)){
  if(!['growing','screenfade','cardfade'].includes(phase))model.pageGlow=0;
  $('white-overlay').style.opacity=String(model.pageGlow);stats.paintedFrames++;canvas.dataset.layout=portrait.compact?'compact':'portrait';canvas.dataset.phase=phase;canvas.dataset.pageGlow=String(model.pageGlow);return;
 }
 background();portrait.phase(phase,model);if(!isPresent())teacher();updateActor();
 if(phase==='pushing'){const p=model.push,r=emittedCard(p);ctx.save();ctx.beginPath();ctx.rect(424,619,161,335);ctx.clip();littleCard(r);ctx.restore();if(p<.7){ctx.save();ctx.globalAlpha=1-easing(p/.7);ctx.drawImage(art['scene-no-tray'],420,658,163,13,420,658,163,13);ctx.restore();}}
 if(phase==='falling'){floorShadow(model.fall);littleCard(fallenCard(model.fall));}
 if(phase==='landing'){floorShadow(1);littleCard(landedCard(model.land));const a=Math.sin(Math.PI*model.land);ctx.save();ctx.globalAlpha=a;strokeLine(474,896,463-8*a,888,'#e8ab34',3);strokeLine(558,897,568+8*a,890,'#e8ab34',3);ctx.restore();}
 if(phase==='growing'){const r=cardRect(),flip=clamp(model.grow/.19),cos=Math.cos(flip*Math.PI);drawCard(flip<.5?art['card-back']:art['card-white'],r,cos,flip>=.5?1:0);}
 if(phase==='screenfade'||phase==='cardfade')drawCard(art['card-white'],portrait.result(finalRect),1,model.cardGlow);
 if(phase==='revealing'||phase==='revealed'){drawCard(art['card-white'],portrait.result(finalRect));ctx.save();ctx.globalAlpha=model.reveal;if(!integrated)drawCard(resultCardImage(),portrait.result(finalRect));ctx.restore();}
 portrait.restore();if(!['growing','screenfade','cardfade'].includes(phase))model.pageGlow=0;$('white-overlay').style.opacity=String(model.pageGlow);stats.paintedFrames++;canvas.dataset.layout=portrait.compact?'compact':portrait.landscapeFit?'landscape-fit':'landscape';canvas.dataset.phase=phase;canvas.dataset.angle=String(model.angle);canvas.dataset.card=JSON.stringify(cardRect());canvas.dataset.pageGlow=String(model.pageGlow);
}

function animate(duration,update,id=token){return new Promise(resolve=>{const start=performance.now();function tick(now){if(id!==token){resolve(false);return;}const t=clamp((now-start)/(duration/speed));update(t);paint();if(t<1)requestAnimationFrame(tick);else resolve(true);}requestAnimationFrame(tick);});}
async function movePhase(name,duration,update,id,message){phase=name;controls();say(message);if(reduced()){update(1);paint();return id===token;}return animate(duration,update,id);}
async function dispense(id){
 locked=true;model.angle=1;
 if(!await movePhase('releasing',250,t=>{model.grip=1-easing(clamp(t/.4));model.reach=1-easing(clamp((t-.3)/.7));},id,'老師收回手，等待卡片……'))return;
 if(!await movePhase('shaking',180,t=>{const e=Math.sin(Math.PI*t);model.shakeX=1.8*Math.sin(t*Math.PI*6)*e;model.shakeY=.7*Math.sin(t*Math.PI*8)*e;},id,'機台輕輕回應……'))return;
 model.shakeX=0;model.shakeY=0;
 if(!await movePhase('pushing',700,t=>{model.push=easing(t);model.approach=1-.55*model.push;stats.push.push({p:model.push,...emittedCard(model.push)});},id,'小卡正從出口推出……'))return;
 if(id!==token)return;model.push=1;locked=false;await reveal();
}
async function playButton(){
 const id=++token;locked=true;model=initialModel();
 if(!await movePhase('approaching',600,t=>model.approach=easing(t),id,'老師移近機台……'))return;
 if(!await movePhase('reaching',450,t=>model.reach=easing(t),id,'老師伸手到按鍵……'))return;
 if(!await movePhase('pressing',280,t=>model.press=t,id,'按下按鍵一次。'))return;
 if(id!==token)return;await savePhase('dispensing');if(id!==token)return;await dispense(id);
}
async function reveal(){
 if(locked||phase!=='pushing')return;locked=true;const id=++token;await savePhase('reveal');if(id!==token)return;
 if(reduced()){model.grow=1;model.cardGlow=0;model.pageGlow=0;model.reveal=1;return completeReveal();}
 if(!await movePhase('falling',650,t=>{model.fall=t;model.approach=.45*(1-easing(t));stats.fall.push({p:t,...fallenCard(t)});},id,'卡片離開出口，向下跌落……'))return;
 if(!await movePhase('landing',140,t=>model.land=t,id,'卡片輕輕落下，光開始亮起。'))return;
 if(!await movePhase('growing',1200,t=>{model.grow=easing(t);model.pageGlow=easing(clamp((model.grow-.68)/.26));stats.growth.push({p:model.grow,rect:cardRect()});},id,'卡片翻面放大，正面仍由白光遮住。'))return;
 model.grow=1;model.pageGlow=1;
 if(!await movePhase('screenfade',320,t=>model.pageGlow=1-easing(t),id,'全頁白光散去……'))return;
 model.pageGlow=0;
 if(!await movePhase('cardfade',200,t=>model.cardGlow=1-easing(t),id,'卡片上的光最後退去……'))return;
 model.cardGlow=0;model.reveal=0;
 if(!await movePhase('revealing',160,t=>model.reveal=t,id,'新卡揭曉。'))return;
 await completeReveal();
}

async function completeReveal(){if(!active)return;phase='revealed';locked=false;model.grow=1;model.reveal=1;model.pageGlow=0;model.cardGlow=0;controls();paint();if(integrated){$('result-card-host').dataset.revealed='true';say('新卡已保存；加入卡片庫只返回，不會再次派卡或更換展示卡。');}else say('示範揭卡效果；沒有派發卡片。');$('join').focus({preventScroll:true});}
async function start(){if(!active||locked||phase!=='idle')return;
 if(integrated){locked=true;phase='purchasing';controls();paint();say('正在確認抽卡，成功後才播放……');parent.postMessage({kind:'coin-draw-request'},location.origin);return;}
 current={cardId:'effect-sample'};await playButton();}
function join(){if(!active||phase!=='revealed'||locked)return;if(integrated){$('result-card-host').dataset.revealed='false';parent.postMessage({kind:'coin-draw-return'},location.origin);}token++;current=null;phase='idle';model=initialModel();controls();paint();say('');$('start').focus({preventScroll:true});}
const overlay=document.createElement('div');overlay.id='white-overlay';overlay.setAttribute('aria-hidden','true');document.body.append(overlay);
$('start').onclick=start;$('join').onclick=join;$('resume').onclick=()=>{if(active&&phase==='paused')playButton();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!['idle','loading','paused','revealed'].includes(phase))halt();});
document.addEventListener('visibilitychange',()=>{
 if(phase==='reminder'){if(!document.hidden&&performance.now()>=reminderDeadline)expireReminder();return;}
 if(document.hidden&&!['idle','loading','paused','revealed','reminder-loading','reminder-fading'].includes(phase))halt();
});
window.addEventListener('pagehide',()=>{
 if(['reminder','reminder-loading','reminder-fading'].includes(phase))finishReminder();
 else if(phase==='purchasing'){locked=false;phase='idle';controls();paint();}
 clearTimeout(reminderTimer);reminderTimer=undefined;token++;
});
media.addEventListener('change',()=>{if(reduced()&&current&&!['idle','loading','paused','revealed'].includes(phase)){token++;model.shakeX=0;model.shakeY=0;completeReveal();}});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent)return;
 if(event.data?.kind==='coin-draw-layout'){portrait.insets(event.data.safeTop,event.data.safeBottom,event.data.safeLeft,event.data.safeRight);portrait.update(event.data.portrait===true,event.data.compact===true,event.data.landscapeFit===true);if(phase==='reminder-fading'&&!portrait.compact)finishReminder();if(portrait.enabled||portrait.compact)void loadPortraitArt();controls();if(art['scene-no-tray'])paint();return;}
 if(event.data?.kind==='coin-draw-profile'&&event.data.profile){portrait.identity(event.data.profile);return;}
 if(!integrated)return;
 if(event.data?.kind==='coin-draw-committed'&&['idle','purchasing'].includes(phase)){
   if(typeof event.data.cardId!=='string'||typeof event.data.requestId!=='string')return;
   current={cardId:event.data.cardId,requestId:event.data.requestId};void playButton();
 }
 if(event.data?.kind==='coin-draw-error'&&phase==='purchasing'){
   if(['complete','insufficient'].includes(event.data.reminder))void showReminder(event.data.reminder);
   else{locked=false;phase='idle';controls();paint();say(String(event.data.message||'請重試。'));}
 }
 if(event.data?.kind==='coin-draw-config'&&Number.isSafeInteger(event.data.price)&&event.data.price>0){
   const label=event.data.price+'探索幣一次';$('start').setAttribute('aria-label',label);
   if(event.data.price!==100){$('start').querySelector('img').hidden=true;const span=document.createElement('span');span.textContent=label;$('start').replaceChildren(span);}
 }
});
let portraitLoad;
function loadPortraitArt(){return portraitLoad??=Promise.all(COURTYARD_ART.map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{art[name]=img;resolve();};img.onerror=()=>reject(new Error('庭院場景未能載入，請重新整理。'));img.src='./assets/'+name+'.webp';}))).then(()=>{const title=$('portrait-title').querySelector('img');title.src='./assets/courtyard-title.webp';controls();if(art['scene-no-tray'])paint();}).catch(error=>{say(error.message);$('start').disabled=true;});}
window.coinDrawPresentation={get phase(){return phase;},get mode(){return integrated?'integrated':demo?'demo':'unavailable';},get stats(){return stats;},get model(){return {...model};},get layout(){return portrait.enabled?'portrait':portrait.compact?'compact':portrait.landscapeFit?'landscape-fit':'landscape';}};
try{await Promise.all(names.map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{art[name]=img;resolve();};img.onerror=()=>reject(new Error('抽卡畫面未能載入，請重新整理。'));img.src='./assets/'+(name==='card-back'?'card-back-clean':name)+'.png';})));await Promise.all([...document.querySelectorAll('#teacher-actor img')].map(img=>img.decode()));phase='idle';controls();paint();}catch(e){say(e.message);$('start').disabled=true;}
const reportSize=()=>parent.postMessage({kind:'coin-draw-size',height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin);new ResizeObserver(reportSize).observe(document.body);reportSize();

new ResizeObserver(()=>{portrait.update(portrait.enabled,portrait.compact);if(art['scene-no-tray'])paint();}).observe(document.getElementById('stage'));
