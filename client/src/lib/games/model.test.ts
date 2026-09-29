import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarize, validAnswer, validEvent, type Question, type Game } from './model.ts';
const q: Question = { title:'配對',prompt:'例子',type:'match',validator:'index-array/1',answer:[2,0,1],maxIndex:[2,2,2],distinct:true,items:[],choices:[] };
test('each submit counts; wrong IDs are a per-round union', () => {
  assert.deepEqual(summarize([{questionId:'q',correct:false},{questionId:'q',correct:false},{questionId:'q',correct:true}]), {attempts:3,correct:1,wrongIds:['q']});
  assert.deepEqual(summarize([{questionId:'q',correct:true}]), {attempts:1,correct:1,wrongIds:[]});
});
test('raw answer shape, bounds, types and event ordering are validated', () => {
  assert.ok(validAnswer(q,[2,0,1]));
  for (const bad of [[0,0,0],[3,0,1],['2',0,1],2,{a:2},[2,0]]) assert.equal(validAnswer(q,bad),false);
  const game: Game = {gameId:'g',version:'v',title:'g',taskId:'t',url:'https://example.com',questions:{q}};
  assert.ok(validEvent({type:'answer',eventId:'e',sessionId:'s',sequence:1,questionId:'q',answer:[2,0,1]},game));
  assert.equal(validEvent({type:'end',eventId:'e',sessionId:'s',sequence:2,attempts:3,outcome:'completed'},game),false);
});
test('all 400 exported questions preserve valid answer shapes and readable content', () => {
  const game = JSON.parse(readFileSync(new URL('./cold-war-maze.json', import.meta.url), 'utf8')) as Game;
  assert.equal(Object.keys(game.questions).length, 400);
  const types = new Set<string>();
  for (const question of Object.values(game.questions)) {
    assert.ok(question.prompt.length > 0 && question.title.length > 0);
    assert.ok(validAnswer(question, question.answer), question.title);
    assert.equal(validAnswer(question, question.answer.map(() => -1)), false);
    types.add(question.type);
  }
  assert.deepEqual(Array.from(types).sort(), ['classify','correct','match','mc','order']);
});
