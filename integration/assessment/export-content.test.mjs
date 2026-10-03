import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {splitAssessment,assertPublicSafe,exportDirectory} from './export-content.mjs';
for(const count of [1,3,10,30])test(`split ${count} preserves public prompts/options/images and keeps answer/explanation private`,()=>{
  const raw={task_id:`test-${count}`,title:'本機題庫',type:'quiz',image:'/hero.png',questions:Array.from({length:count},(_,i)=>({id:`q${i}`,type:i%3===2?'short':'choice',prompt:`題幹 ${i} ![圖片](/question.png)`,points:10,options:['甲','乙'],answer:1,explanation:`私有解說 ${i}`,modelAnswer:'私有短答參考',rubric:'私有評分標準',image:'/question.png'}))};
  const before=JSON.stringify(raw),result=splitAssessment(raw);
  assert.equal(JSON.stringify(raw),before);assertPublicSafe(result.publicTask);assertPublicSafe(result.metadata);
  assert.equal(result.metadata.questionCount,count);assert.equal(result.metadata.totalPoints,count*10);
  assert.match(result.metadata.version,/^[0-9a-f]{32}$/);
  raw.questions.forEach((q,i)=>{assert.equal(result.publicTask.questions[i].prompt,q.prompt);assert.equal(result.publicTask.questions[i].image,q.image);assert.deepEqual(result.publicTask.questions[i].options,q.options);assert.equal(result.privateKey.questions[i].explanation,q.explanation);});
});
test('export preserves input bytes, opaque version persists, private fields never enter public package',async()=>{
  const base=await mkdtemp(path.resolve('tmp/source-split-')),source=path.join(base,'input');
  const{mkdir}=await import('node:fs/promises');await mkdir(source);
  const input=JSON.stringify({task_id:'single',title:'保留題目',type:'quiz',questions:[{id:'q1',type:'choice',prompt:'公開題幹',points:100,options:['甲','乙'],answer:0,explanation:'不可公開的標準解說'}]});
  const file=path.join(source,'task.json');await writeFile(file,input);const before=(await stat(file)).mtimeMs;
  const out=path.join(base,'export');await exportDirectory(source,out);const first=await readFile(path.join(out,'public','single.json'),'utf8');
  await exportDirectory(source,out);assert.equal(await readFile(path.join(out,'public','single.json'),'utf8'),first);assert.equal(await readFile(file,'utf8'),input);assert.equal((await stat(file)).mtimeMs,before);
  assert.equal(first.includes('不可公開的標準解說'),false);assertPublicSafe(JSON.parse(first));
});
test('invalid oversized question sets and unsafe public payloads stop preparation',()=>{
  assert.throws(()=>splitAssessment({task_id:'bad',questions:Array(31).fill({id:'x'})}));
  assert.throws(()=>assertPublicSafe({nested:{answer:0}}));assert.throws(()=>assertPublicSafe({questions:[{explanation:'secret'}]}));
});
