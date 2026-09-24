import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAccountRoster } from './csv.ts';
test('account import selects four fields and retains leading zeroes',()=>{
 const rows=parseAccountRoster('姓名,email,班別,學號,unused\n測試學生,STUDENT@ctshkpcc.edu.hk,1a,01,ignore');
 assert.deepEqual(rows,[{email:'student@ctshkpcc.edu.hk',className:'1A',studentNo:'01',name:'測試學生'}]);
});
test('reject duplicate email or class/student number',()=>{
 assert.throws(()=>parseAccountRoster('email,班別,學號,姓名\na@gmail.com,1A,01,測試甲\na@gmail.com,1B,02,測試乙'));
 assert.throws(()=>parseAccountRoster('email,班別,學號,姓名\na@gmail.com,1A,01,測試甲\nb@gmail.com,1A,01,測試乙'));
});
test('reject other domains and missing required fields',()=>{
 assert.throws(()=>parseAccountRoster('email,班別,學號,姓名\na@example.com,1A,01,測試甲'));
 assert.throws(()=>parseAccountRoster('班別,學號,姓名\n1A,01,測試甲'));
});

test('accept a 435-account intake without splitting the CSV',()=>{
 const csv=['email,班別,學號,姓名',...Array.from({length:435},(_,i)=>`student${i}@ctshkpcc.edu.hk,1A,${i+1},測試學生`) ].join('\n');
 assert.equal(parseAccountRoster(csv).length,435);
});
