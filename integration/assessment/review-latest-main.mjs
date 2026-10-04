import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='17144db47aa2d41d3986ccb3afac0d898af63292',main='f172efdee05700db75a1bc87a6983a3e843e91f6';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}),lines=s=>s.trim().split(/\r?\n/).filter(Boolean);
const normalized=value=>String(value).replaceAll('\r\n','\n');
const mainFiles=lines(git('diff','--name-only',base,main));
const branchFiles=new Set([...lines(git('diff','--name-only',base,'HEAD')),...lines(git('diff','--name-only'))]);
const overlaps=mainFiles.filter(p=>branchFiles.has(p));mkdirSync('tmp/latest-main-review',{recursive:true});
const checks=[];
for(const file of overlaps){const prefix='tmp/latest-main-review/'+file.replaceAll('/','--');
  writeFileSync(prefix+'.base',normalized(git('show',base+':'+file)));writeFileSync(prefix+'.main',normalized(git('show',main+':'+file)));writeFileSync(prefix+'.branch',normalized(readFileSync(file,'utf8')));
  let merged,status=0;try{merged=git('merge-file','-p','--',prefix+'.branch',prefix+'.base',prefix+'.main');}catch(e){if(e.status<1||e.status>127)throw e;status=e.status;merged=e.stdout;}
  writeFileSync(prefix+'.review',merged);
  checks.push({file,textConflict:status!==0,reviewFile:prefix+'.review',containsAssessmentCMS:file.endsWith('App.tsx')?merged.includes('AssessmentCMS'):undefined,containsCoinDraw:file.endsWith('App.tsx')?merged.includes('coin-draw.css'):merged.includes('CoinDrawPanel')});
}
const sha=v=>createHash('sha256').update(v).digest('hex');
const rulesSame=sha(normalized(readFileSync('firestore.rules','utf8')))===sha(normalized(git('show',main+':firestore.rules')));
const result={reviewedMain:main,publishedBranchCommit:git('rev-parse','HEAD').trim(),checkoutChanged:false,merged:false,mainChangedFiles:mainFiles,overlaps:checks,formalRulesMatchReviewedMain:rulesSame,latestMainIntegrationTested:false};
writeFileSync('tmp/latest-main-review/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
