import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {hydratePrivateCoreTasks} from './private-core-source.mjs';
test('public publisher rejects private fields, unpublished versions, altered prompts and external origins without modifying content',async()=>{
  const origin='http://127.0.0.1:4201',file='client/src/content/tasks/local-assessment-mc-30.json',before=await readFile(file,'utf8'),task=JSON.parse(before);
  assert.ok(task.assessmentVersion,'Run actual local CMS save before this HTTP test.');
  const cases=[
    {value:{...task,questions:[{...task.questions[0],answer:1},...task.questions.slice(1)]},status:400},
    {value:{...task,assessmentVersion:'unpublished-version'},status:400},
    {value:{...task,questions:[{...task.questions[0],prompt:'Unreviewed changed prompt'},...task.questions.slice(1)]},status:400},
    {value:task,origin:'https://example.com',status:403},
  ];
  for(const c of cases){const response=await fetch(origin+'/__assessment/publish',{method:'POST',headers:{Origin:c.origin??origin,'Content-Type':'application/json'},body:JSON.stringify(c.value)});assert.equal(response.status,c.status);}
  assert.equal(await readFile(file,'utf8'),before);
});
test('public JSON, raw import, and @fs import all omit private values; private source cannot be read by HTTP',async()=>{
  const origin='http://127.0.0.1:4201',publicFile='/src/content/tasks/local-assessment-mc-30.json';
  for(const suffix of ['', '?raw', '?import']){const response=await fetch(origin+publicFile+suffix);assert.equal(response.status,200);const body=await response.text();assert.equal(body.includes('CMS 私有解說驗收'),false);assert.doesNotMatch(body,/\b(?:answer|explanation|modelAnswer|rubric):|"(?:answer|explanation|modelAnswer|rubric)"\s*:/);}
  const privatePath=process.cwd().replaceAll('\\','/')+'/private-assessments/version-state.json';
  assert.equal((await fetch(origin+'/@fs/'+privatePath)).status,403);
});
test('core planning hydrates exact private version; missing or mismatched private input stops safely',async()=>{
  const base=await mkdtemp(path.resolve('tmp/private-core-test-'));await mkdir(path.join(base,'private-assessments'));
  const task={task_id:'task-test',assessmentVersion:'opaque',questions:[{id:'q1',type:'choice',prompt:'Public',points:10,options:['A','B']}]};
  await assert.rejects(hydratePrivateCoreTasks([task],base),/私有版本未準備/);
  const file=path.join(base,'private-assessments','task-test--opaque.json');
  await writeFile(file,JSON.stringify({privateKey:{taskId:'task-test',version:'opaque',questions:[{id:'other',answer:1}]}}));
  await assert.rejects(hydratePrivateCoreTasks([task],base),/題目 ID 不符/);
  await writeFile(file,JSON.stringify({privateKey:{taskId:'task-test',version:'opaque',questions:[{id:'q1',answer:1,explanation:'Private'}]}}));
  const [hydrated]=await hydratePrivateCoreTasks([task],base);assert.equal(hydrated.questions[0].answer,1);assert.equal(task.questions[0].answer,undefined);
});
