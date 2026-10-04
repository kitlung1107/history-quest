import {assertPublicAssessment} from './assessmentPublication';
const repository='kitlung1107/history-quest';
const endpoint=`https://api.github.com/repos/${repository}/contents/`;
const pathOK=(path:string)=>/^client\/src\/content\/tasks\/[A-Za-z0-9_.-]+\.json$/.test(path);
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const samePublishedTask=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
type Request=typeof fetch;
function headers(token:string){return{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{})};}
function decode(content:string){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content.replaceAll('\n','')),c=>c.charCodeAt(0))));}
function encode(task:unknown){const bytes=new TextEncoder().encode(JSON.stringify(task,null,2)+'\n');return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));}
export async function readGitAssessment(path:string,token='',request:Request=fetch){
  if(!pathOK(path))throw Error('教材檔案路徑無效。');
  const response=await request(endpoint+path+'?ref=main',{headers:headers(token)});
  if(response.status===404)return null;
  if(!response.ok)throw Error(`未能讀取教材發布版本（${response.status}）。`);
  const result=await response.json();
  if(result.type!=='file'||typeof result.sha!=='string'||typeof result.content!=='string')throw Error('教材檔案回應無效。');
  return{sha:result.sha,task:decode(result.content)};
}
export async function publishGitAssessment(path:string,task:Record<string,any>,expectedSha:string|null,token:string,request:Request=fetch){
  if(!token.trim())throw Error('請先使用既有 GitHub CMS 權杖連接教材發布。');
  if(!pathOK(path)||!task.assessmentVersion)throw Error('只能發布已儲存的公開題庫版本。');
  assertPublicAssessment(task);
  const current=await readGitAssessment(path,token,request);
  // A lost response can be retried without creating another public commit.
  if(current&&samePublishedTask(current.task,task))return{verified:true,alreadyPublished:true,blobSha:current.sha};
  if((current?.sha??null)!==expectedSha)throw Error('教材已由另一位編輯者更新；請重新讀取後再發布。私有版本已保留。');
  const response=await request(endpoint+path,{method:'PUT',headers:{...headers(token),'Content-Type':'application/json'},body:JSON.stringify({message:`發布小測：${task.title}`,branch:'main',content:encode(task),...(current?{sha:current.sha}:{})})});
  if(!response.ok)throw Error(`公開教材發布未完成（${response.status}）；私有版本已保留，可重試同一版本。`);
  const result=await response.json(),saved=await readGitAssessment(path,token,request);
  if(!saved||!samePublishedTask(saved.task,task))throw Error('公開教材讀回不符；請檢查發布結果。');
  return{verified:true,alreadyPublished:false,blobSha:saved.sha,commitSha:result.commit.sha,url:result.commit.html_url};
}
