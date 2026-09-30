import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countWrongAnswers, mergeWrongQuestions, correctAnswerLines, collectPages } from './records.ts';
const game = JSON.parse(readFileSync(new URL('./cold-war-maze.json', import.meta.url), 'utf8'));
const samples = Object.fromEntries(Object.values(game.questions).map((q: any) => [q.type, q])) as Record<string, any>;
test('every wrong event counts; later correct answers do not erase mistakes', () => {
  assert.deepEqual([...countWrongAnswers([{questionId:'a',correct:false},{questionId:'a',correct:false},{questionId:'a',correct:true},{questionId:'b',correct:true}])], [['a',2]]);
});
test('merges students and identical versions, separates changed content and games', () => {
  const row = {id:'a',gameId:'cold-war',version:'v1',count:2,question:samples.mc};
  const merged = mergeWrongQuestions([row,{...row,version:'v2',count:3},{...row,question:{...samples.mc,answer:[0]}},{...row,gameId:'other'}]);
  assert.equal(merged.length,3); assert.equal(merged[0].count,5);
  assert.equal(mergeWrongQuestions([{...row,question:null},{...row,version:'v2',question:null}]).length,2);
  assert.equal(row.count,2);
});
test('all pages, including the 31st and 61st sessions, contribute', async () => {
  const data = Array.from({length:61},(_,i)=>i);
  const calls: number[] = [];
  const rows = await collectPages<number,number>(async (cursor=0) => { calls.push(cursor); return {rows:data.slice(cursor,cursor+30),cursor:cursor+30,more:cursor+30<data.length}; });
  assert.deepEqual(rows,data); assert.deepEqual(calls,[0,30,60]);
  await assert.rejects(collectPages(async()=>({rows:[],more:true})),/游標/);
});
test('failed later page never returns an incomplete total', async () => {
  await assert.rejects(collectPages(async cursor => {if(cursor) throw Error('offline'); return {rows:[1],cursor:30,more:true};}),/offline/);
});
test('five answer types decode indexes to complete readable answers', () => {
  const base = {title:'題',prompt:'問',validator:'index-array/1',maxIndex:[],distinct:false};
  assert.deepEqual(correctAnswerLines({...base,type:'mc',choices:['甲','乙'],items:[],answer:[1]}),['乙']);
  assert.deepEqual(correctAnswerLines({...base,type:'order',choices:['甲','乙','丙'],items:['甲','乙','丙'],answer:[2,0,1]}),['1. 丙','2. 甲','3. 乙']);
  for(const type of ['match','classify']) assert.deepEqual(correctAnswerLines({...base,type,choices:['甲','乙'],items:['一','二'],answer:[1,0]}),['一 → 乙','二 → 甲']);
  assert.deepEqual(correctAnswerLines({...base,type:'correct',choices:['正'],items:['錯','句'],answer:[0,0]}),['錯誤片段：錯','改為：正','修正後：正句']);
  for(const q of Object.values(game.questions) as any[]) {
    assert.ok(['mc','order','match','classify','correct'].includes(q.type));
    assert.ok(correctAnswerLines(q).every(s => s && !s.includes('資料不完整') && !s.includes('undefined')));
  }
});
