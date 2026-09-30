import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, serverTimestamp, writeBatch, runTransaction } from 'firebase/firestore';
let env;
const claims = email => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
const student = () => env.authenticatedContext('u1', claims('one@school.test')).firestore();
const teacher = () => env.authenticatedContext('teacher', claims('kitlung1107@gmail.com')).firestore();
const version = 'version-one';
const questions = {
  mc: { answer: [1], maxIndex: [3], distinct: false },
  order: { answer: [1,3,2,0], maxIndex: [3,3,3,3], distinct: true },
  match: { answer: [2,0,1], maxIndex: [2,2,2], distinct: true },
  classify: { answer: [0,1,0,1], maxIndex: [1,1,1,1], distinct: false },
  correct: { answer: [2,2], maxIndex: [3,3], distinct: false },
};
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-game-rules', firestore: { host: '127.0.0.1', port: 8086, rules: await readFile('firestore.rules','utf8') } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db,'access','one@school.test'), { studentId:'s1', enabled:true });
  await setDoc(doc(db,'access','two@school.test'), { studentId:'s2', enabled:true });
  await setDoc(doc(db,'profiles','s1'), {name:'同學一',className:'S6'});
  await setDoc(doc(db,'profiles','s2'), {name:'同學二'});
  await setDoc(doc(db,'gameCatalog','cold-war-maze','versions',version), {enabled:true,taskId:'cold-war-task'});
  await setDoc(doc(db,'taskAccess','cold-war-task'),{grade:6,enabled:true});
  for (const [id,q] of Object.entries(questions)) await setDoc(doc(db,'gameCatalog','cold-war-maze','versions',version,'questions',id), { ...q, validator:'index-array/1', title:id, prompt:`可讀題目 ${id}` });
}); });
async function start(db = student(), id = 'round-one', extra = {}) {
  return setDoc(doc(db,'gameSessions',id), { uid:'u1', studentId:'s1', gameId:'cold-war-maze', version, status:'open', attempts:0, correct:0, lastEventId:'', createdAt:serverTimestamp(), ...extra });
}
async function answer(db, eventId, questionId, raw, forceCorrect, session = 'round-one') {
  try { return await runTransaction(db, async tx => {
    const ref = doc(db,'gameSessions',session), event = doc(ref,'answers',eventId);
    const old = await tx.get(event); if (old.exists()) return;
    const state = (await tx.get(ref)).data();
    const correct = forceCorrect ?? (JSON.stringify(raw) === JSON.stringify(questions[questionId]?.answer));
    tx.set(event, {questionId,answer:raw,correct,sequence:state.attempts+1,createdAt:serverTimestamp()});
    tx.update(ref,{ attempts:state.attempts+1,correct:state.correct+Number(correct),lastEventId:eventId });
  }); } catch (error) {
    const saved = await getDoc(doc(db,'gameSessions',session,'answers',eventId));
    if (saved.exists() && saved.data().questionId === questionId && JSON.stringify(saved.data().answer) === JSON.stringify(raw)) return;
    throw error;
  }
}
test('five answer shapes are rule-graded, repeated submits count and wrong-then-right stays wrong in that round', async () => {
  const db = student(); await start(db);
  await assertSucceeds(answer(db,'wrong1','mc',[0]));
  await assertSucceeds(answer(db,'wrong2','mc',[0]));
  for (const [id,q] of Object.entries(questions)) await assertSucceeds(answer(db,`right-${id}`,id,q.answer));
  await assertSucceeds(updateDoc(doc(db,'gameSessions','round-one'),{status:'completed',completedAt:serverTimestamp()}));
  const result = (await getDoc(doc(db,'gameSessions','round-one'))).data();
  assert.equal(result.attempts,7); assert.equal(result.correct,5);
  const wrong = await getDocs(query(collection(db,'gameSessions','round-one','answers'),where('correct','==',false)));
  assert.deepEqual([...new Set(wrong.docs.map(d=>d.data().questionId))],['mc']);
  const readable = await getDoc(doc(db,'gameCatalog','cold-war-maze','versions',version,'questions','mc'));
  assert.equal(readable.data().prompt,'可讀題目 mc');
});
test('idempotent concurrent retry counts once, immutable events and closed rounds reject additions', async () => {
  const db = student(); await start(db);
  await Promise.all([answer(db,'same','mc',[1]),answer(db,'same','mc',[1])]);
  assert.equal((await getDoc(doc(db,'gameSessions','round-one'))).data().attempts,1);
  await assertFails(updateDoc(doc(db,'gameSessions','round-one','answers','same'),{answer:[0]}));
  await updateDoc(doc(db,'gameSessions','round-one'),{status:'completed',completedAt:serverTimestamp()});
  await assertFails(answer(db,'late','mc',[1]));
  await assertFails(updateDoc(doc(db,'gameSessions','round-one'),{status:'open'}));
});
test('forged score, unknown question, malformed arrays and missing atomic event fail', async () => {
  const db = student(); await start(db);
  for (const [id, raw, correct] of [['mc',[0],true],['mc',[1],false],['mc',[99],false],['mc',['1'],false],['mc',[],false],['order',[0,0,0,0],false],['missing',[1],true]]) await assertFails(answer(db,`bad-${Math.random()}`.replace('.','-'),id,raw,correct));
  await assertFails(updateDoc(doc(db,'gameSessions','round-one'),{attempts:10,correct:10}));
  await assertFails(setDoc(doc(db,'gameSessions','round-one','answers','alone'),{questionId:'mc',answer:[1],correct:true,sequence:1,createdAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(db,'gameSessions','round-one'),{status:'completed',completedAt:serverTimestamp(),correct:100}));
});
test('anonymous, wrong student, wrong uid, revoked account and unknown versions cannot write', async () => {
  await assertFails(start(env.unauthenticatedContext().firestore()));
  await assertFails(start(student(),'bad-sid',{studentId:'s2'}));
  await assertFails(start(student(),'bad-uid',{uid:'u2'}));
  await assertFails(start(student(),'bad-version',{version:'unknown'}));
  await start();
  const other = env.authenticatedContext('u2',claims('two@school.test')).firestore();
  await assertFails(getDoc(doc(other,'gameSessions','round-one')));
  await assertFails(answer(other,'spoof','mc',[1]));
  await updateDoc(doc(teacher(),'access','one@school.test'),{enabled:false});
  await assertFails(answer(student(),'revoked','mc',[1]));
});
test('separate rounds retain separate wrong lists; unfinished rounds are excluded and teacher can read', async () => {
  const db = student(); await start(); await answer(db,'bad','mc',[0]);
  await updateDoc(doc(db,'gameSessions','round-one'),{status:'completed',completedAt:serverTimestamp()});
  await start(db,'round-two'); await answer(db,'good','mc',[1],undefined,'round-two');
  const complete = await getDocs(query(collection(db,'gameSessions'),where('studentId','==','s1'),where('status','==','completed')));
  assert.deepEqual(complete.docs.map(d=>d.id),['round-one']);
  await assertSucceeds(getDocs(collection(teacher(),'gameSessions')));
  await assertSucceeds(getDocs(collection(teacher(),'gameSessions','round-one','answers')));
  await assertFails(setDoc(doc(db,'gameCatalog','cold-war-maze','versions','fake'),{enabled:true}));
  await assertFails(updateDoc(doc(teacher(),'gameCatalog','cold-war-maze','versions',version,'questions','mc'),{answer:[0]}));
});

test('record queries isolate students, including answer counts; teachers can read every student', async () => {
  const db = student(); await start(db); await answer(db,'wrong-a','mc',[0]); await answer(db,'wrong-b','mc',[0]);
  await updateDoc(doc(db,'gameSessions','round-one'),{status:'completed',completedAt:serverTimestamp()});
  const other = env.authenticatedContext('u2',claims('two@school.test')).firestore();
  await assertFails(getDocs(query(collection(other,'gameSessions'),where('studentId','==','s1'),where('status','==','completed'))));
  await assertFails(getDocs(query(collection(db,'gameSessions'),where('status','==','completed'))));
  await assertFails(getDocs(query(collection(other,'gameSessions','round-one','answers'),where('correct','==',false))));
  const own = await assertSucceeds(getDocs(query(collection(db,'gameSessions','round-one','answers'),where('correct','==',false))));
  assert.equal(own.size,2);
  const all = await assertSucceeds(getDocs(query(collection(teacher(),'gameSessions'),where('status','==','completed'))));
  assert.equal(all.size,1);
  await assertSucceeds(getDocs(query(collection(teacher(),'gameSessions','round-one','answers'),where('correct','==',false))));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(),'gameSessions')));
});
