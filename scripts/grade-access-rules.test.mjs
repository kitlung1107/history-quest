import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
let env;
const claims = email => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-grade-access', firestore: { host: '127.0.0.1', port: 8086, rules: await readFile('firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (let grade = 1; grade <= 6; grade++) {
      await setDoc(doc(db, 'taskAccess', `task${grade}`), { grade, enabled: true });
      await setDoc(doc(db, 'gameCatalog', `game${grade}`, 'versions', 'v1'), { enabled: true, taskId: `task${grade}` });
    }
  });
});
after(async () => env?.cleanup());
async function identity(id, className) {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'access', `${id}@school.test`), { enabled: true, studentId: id });
    await setDoc(doc(c.firestore(), 'profiles', id), { className });
  });
  return env.authenticatedContext(id, claims(`${id}@school.test`)).firestore();
}
const submission = (db, id, grade, suffix = '') => setDoc(doc(db, 'submissions', `${id}-${grade}${suffix}`), { studentId: id, taskId: `task${grade}`, version: 'v1', answers: [], createdAt: serverTimestamp() });
const start = (db, id, grade, suffix = '') => setDoc(doc(db, 'gameSessions', `${id}-${grade}${suffix}`), { uid: id, studentId: id, gameId: `game${grade}`, version: 'v1', status: 'open', attempts: 0, correct: 0, lastEventId: '', createdAt: serverTimestamp() });
test('server enforces all 36 student/task and game pairs; Chinese and legacy roster formats', async () => {
  for (let own = 1; own <= 6; own++) {
    for (const [format, className] of [`${own}A`, `S${own}`, `${'一二三四五六'[own - 1]}A`].entries()) {
      const id = `s${own}-${format}`, db = await identity(id, className);
      for (let grade = 1; grade <= 6; grade++) {
        const check = own <= 3 ? grade === own : grade >= 4 && grade <= own;
        await (check ? assertSucceeds : assertFails)(submission(db, id, grade));
        await (check ? assertSucceeds : assertFails)(start(db, id, grade));
      }
    }
  }
});
test('teacher/admin plays all six without a student profile or access entry', async () => {
  const db = env.authenticatedContext('teacher', claims('kitlung1107@gmail.com')).firestore();
  for (let grade = 1; grade <= 6; grade++) {
    await assertSucceeds(submission(db, 'teacher', grade));
    await assertSucceeds(start(db, 'teacher', grade));
  }
});
test('unknown grade, forged catalogue, missing task, disabled task and changed class fail closed', async () => {
  const db = await identity('unknown', 'Other');
  for (let grade = 1; grade <= 6; grade++) {
    await assertFails(submission(db, 'unknown', grade));
    await assertFails(start(db, 'unknown', grade));
  }
  await assertFails(setDoc(doc(db, 'taskAccess', 'task1'), { grade: 1, enabled: true }));
  const senior = await identity('senior', 'S6');
  await assertSucceeds(start(senior, 'senior', 6));
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'profiles', 'senior'), { className: 'S4' }));
  await assertFails(updateDoc(doc(senior, 'gameSessions', 'senior-6'), { status: 'completed', completedAt: serverTimestamp() }));
  await assertFails(submission(senior, 'senior', 7));
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'taskAccess', 'task4'), { enabled: false }));
  await assertFails(submission(senior, 'senior', 4));
  await assertFails(start(senior, 'senior', 4));
});
