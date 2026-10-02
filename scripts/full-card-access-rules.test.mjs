import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { buildCardCatalog } from './card-catalog.mjs';

assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Local emulator is required');
let env;
const tang = 'tangkl@ctshkpcc.edu.hk', owner = 'kitlung1107@gmail.com', ordinary = 'student@school.test';
const claims = email => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
const dbFor = (email, overrides = {}) => env.authenticatedContext(email === owner ? 'owner-uid' : email, { ...claims(email), ...overrides }).firestore();
const base = { className: '2A', studentNo: '01', name: 'Test Student', nickname: 'Explorer', avatar: 'explorer', configured: true,
  role: 'studentBoy', ownedCardIds: ['starter-explorer-boy'], cardId: 'starter-explorer-boy' };
let source;
before(async () => {
  source = JSON.parse(await readFile('client/src/content/settings/cards.json', 'utf8'));
  env = await initializeTestEnvironment({ projectId: 'demo-full-card-access', firestore: { rules: await readFile('firestore.rules', 'utf8') } });
});
after(async () => env?.cleanup());
const admin = callback => env.withSecurityRulesDisabled(c => callback(c.firestore()));
beforeEach(async () => {
  await env.clearFirestore();
  await admin(async db => {
    await setDoc(doc(db, 'cardCatalog', 'current'), buildCardCatalog({ cards: [...source.cards,
      { id: 'future-cms-girl', role: 'studentGirl', enabled: true },
      { id: 'disabled-card', role: 'studentBoy', enabled: false },
    ] }));
    for (const [email, sid] of [[tang, 'tang-profile'], [owner, 'owner-uid'], [ordinary, 'ordinary-profile']]) {
      await setDoc(doc(db, 'access', email), { studentId: sid, enabled: true });
      await setDoc(doc(db, 'profiles', sid), base);
    }
  });
});

test('both designated accounts select every enabled current/future card across roles without owning it', async () => {
  for (const [email, sid] of [[tang, 'tang-profile'], [owner, 'owner-uid']]) {
    const ref = doc(dbFor(email), 'profiles', sid);
    for (const cardId of [...source.cards.filter(c => c.enabled).map(c => c.id), 'future-cms-girl'])
      await assertSucceeds(updateDoc(ref, { cardId }));
    const stored = (await getDoc(ref)).data();
    assert.equal(stored.role, base.role);
    assert.deepEqual(stored.ownedCardIds, base.ownedCardIds);
  }
});
test('unknown/disabled cards and client-authored catalogue grants are denied, including owner client', async () => {
  for (const [email, sid] of [[tang, 'tang-profile'], [owner, 'owner-uid'], [ordinary, 'ordinary-profile']]) {
    const db = dbFor(email);
    for (const cardId of ['missing-card', 'disabled-card']) await assertFails(updateDoc(doc(db, 'profiles', sid), { cardId }));
    await assertFails(setDoc(doc(db, 'cardCatalog', 'current'), { schemaVersion: 1, cards: { 'fake-card': { enabled: true, role: 'studentBoy' } } }));
    await assertFails(deleteDoc(doc(db, 'cardCatalog', 'current')));
  }
});
test('ordinary and testing-flag students cannot forge client fields, add cards or choose full-only cards', async () => {
  await admin(db => updateDoc(doc(db, 'access', ordinary), { testing: true }));
  const db = dbFor(ordinary), ref = doc(db, 'profiles', 'ordinary-profile');
  for (const patch of [{ cardId: 'future-cms-girl' }, { cardId: 'nile-explorer-boy' }, { cardId: 'stone-age-explorer-boy' },
    { email: tang }, { fullCardAccess: true }, { teacher: true }, { testing: true },
    { ownedCardIds: [...base.ownedCardIds, 'future-cms-girl'] }]) await assertFails(updateDoc(ref, patch));
  await assertFails(updateDoc(doc(db, 'access', ordinary), { fullCardAccess: true }));
  await assertFails(setDoc(doc(db, 'access', tang), { enabled: true, studentId: 'ordinary-profile' }));
  await assertSucceeds(updateDoc(ref, { nickname: 'Normal' }));
  await assertFails(updateDoc(doc(dbFor(ordinary, { fullCardAccess: true, teacher: true }), 'profiles', 'ordinary-profile'), { cardId: 'future-cms-girl' }));
});
test('exact identity, verified email and Google provider are required', async () => {
  for (const email of [tang, owner]) for (const overrides of [
    { email_verified: false }, { email_verified: 'true' }, { firebase: { sign_in_provider: 'password' } },
    { firebase: { sign_in_provider: 'custom' } }, { firebase: {} }, { email: `x${email}` },
  ]) await assertFails(updateDoc(doc(dbFor(email, overrides), 'profiles', email === tang ? 'tang-profile' : 'owner-uid'), { cardId: 'future-cms-girl' }));
  await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), 'profiles', 'tang-profile'), { cardId: 'future-cms-girl' }));
});
test('disabled, unapproved and mismatched bindings cannot gain full selection', async () => {
  for (const [email, sid] of [[tang, 'tang-profile'], [owner, 'owner-uid']]) {
    await admin(db => updateDoc(doc(db, 'access', email), { enabled: false }));
    await assertFails(updateDoc(doc(dbFor(email), 'profiles', sid), { cardId: 'future-cms-girl' }));
    await admin(db => updateDoc(doc(db, 'access', email), { enabled: true, studentId: 'someone-else' }));
    await assertFails(updateDoc(doc(dbFor(email), 'profiles', sid), { cardId: 'future-cms-girl' }));
  }
  await admin(db => deleteDoc(doc(db, 'access', tang)));
  await assertFails(updateDoc(doc(dbFor(tang), 'profiles', 'tang-profile'), { cardId: 'future-cms-girl' }));
});
test('full access adds no roster/admin/grade privileges or access to other profiles', async () => {
  const db = dbFor(tang);
  await assertFails(getDocs(collection(db, 'access')));
  await assertFails(getDoc(doc(db, 'profiles', 'ordinary-profile')));
  await assertFails(updateDoc(doc(db, 'profiles', 'ordinary-profile'), { cardId: 'future-cms-girl' }));
  for (const path of ['roster/other', 'catalogue/other', 'metadata/other', 'taskAccess/other', 'coinRules/other'])
    await assertFails(setDoc(doc(db, path), { enabled: true, grade: 1 }));
  await admin(db => setDoc(doc(db, 'taskAccess', 'grade1-task'), { enabled: true, grade: 1 }));
  await assertFails(setDoc(doc(db, 'submissions', 'forged'), { studentId: 'tang-profile', taskId: 'grade1-task', version: '1', answers: [], createdAt: serverTimestamp() }));
  await assertSucceeds(getDocs(collection(dbFor(owner), 'access'))); // Existing owner permission unchanged.
  await assertFails(updateDoc(doc(dbFor(owner), 'profiles', 'ordinary-profile'), { cardId: 'future-cms-girl' }));
});
test('fixed student role, earned collection, identity and legacy fields remain protected', async () => {
  const ref = doc(dbFor(tang), 'profiles', 'tang-profile');
  await assertSucceeds(updateDoc(ref, { cardId: 'future-cms-girl' }));
  for (const patch of [{ role: 'studentGirl', ownedCardIds: ['starter-explorer-girl'] },
    { ownedCardIds: ['starter-explorer-boy', 'future-cms-girl'] }, { ownedCardIds: [] },
    { name: 'Changed' }, { className: '1A' }, { legacyCardId: 'fake' }, { configured: false }]) await assertFails(updateDoc(ref, patch));
});
test('first role setup can select a cross-role card while receiving only normal gifts', async () => {
  await admin(db => setDoc(doc(db, 'profiles', 'tang-profile'), { className: '1A', studentNo: '01', name: 'Test Student', nickname: 'Explorer', avatar: 'explorer', configured: false }));
  await assertSucceeds(updateDoc(doc(dbFor(tang), 'profiles', 'tang-profile'), {
    configured: true, role: 'studentBoy', ownedCardIds: ['starter-explorer-boy', 'nile-explorer-boy'], cardId: 'future-cms-girl',
  }));
});
test('legacy onboarding cannot use retained-selection exception to activate an unknown old card', async () => {
  await admin(db => setDoc(doc(db, 'profiles', 'tang-profile'), {
    className: '2A', studentNo: '01', name: 'Test Student', nickname: 'Explorer', avatar: 'explorer', configured: true, cardId: 'legacy-unknown',
  }));
  const ref = doc(dbFor(tang), 'profiles', 'tang-profile');
  await assertFails(updateDoc(ref, { ...base, cardId: 'legacy-unknown', legacyCardId: 'legacy-unknown' }));
  await assertSucceeds(updateDoc(ref, { ...base, cardId: 'future-cms-girl', legacyCardId: 'legacy-unknown' }));
});
test('existing owner without access/profile may create own profile only; no student bootstrap', async () => {
  await admin(async db => { await deleteDoc(doc(db, 'access', owner)); await deleteDoc(doc(db, 'profiles', 'owner-uid')); });
  await assertSucceeds(setDoc(doc(dbFor(owner), 'profiles', 'owner-uid'), { ...base, className: 'Other', studentNo: 'TEACHER', cardId: 'future-cms-girl' }));
  await assertFails(setDoc(doc(dbFor(owner), 'profiles', 'unrelated'), { ...base, cardId: 'future-cms-girl' }));
  await assertFails(setDoc(doc(dbFor(tang), 'profiles', 'new-profile'), base));
});
test('atomic catalogue replacement handles new, removed, disabled cards; old selection does not break top-ups', async () => {
  const ref = doc(dbFor(tang), 'profiles', 'tang-profile');
  await assertSucceeds(updateDoc(ref, { cardId: 'future-cms-girl' }));
  await admin(async db => {
    await setDoc(doc(db, 'cardCatalog', 'current'), buildCardCatalog({ cards: [...source.cards, { id: 'next-cms-boy', role: 'studentBoy', enabled: true }] }));
    await updateDoc(doc(db, 'profiles', 'tang-profile'), { className: '1A' });
  });
  await assertSucceeds(updateDoc(ref, { ownedCardIds: ['starter-explorer-boy', 'nile-explorer-boy'] }));
  await assertSucceeds(updateDoc(doc(dbFor(owner), 'profiles', 'tang-profile'), { nickname: 'Roster edit' }));
  await assertSucceeds(updateDoc(ref, { cardId: 'next-cms-boy' }));
  await assertFails(updateDoc(ref, { cardId: 'future-cms-girl' }));
  await admin(db => updateDoc(doc(db, 'cardCatalog', 'current'), { 'cards.next-cms-boy.enabled': false }));
  await assertSucceeds(updateDoc(ref, { cardId: 'starter-explorer-boy' }));
  await assertFails(updateDoc(ref, { cardId: 'next-cms-boy' }));
});
test('missing backend catalogue fails closed for new full selections, normal student selection still works', async () => {
  await admin(db => deleteDoc(doc(db, 'cardCatalog', 'current')));
  await assertFails(updateDoc(doc(dbFor(tang), 'profiles', 'tang-profile'), { cardId: 'future-cms-girl' }));
  await assertSucceeds(updateDoc(doc(dbFor(ordinary), 'profiles', 'ordinary-profile'), { nickname: 'Still works' }));
});
test('release tool applies only catalogue snapshot, removes stale IDs, and is idempotent in the local emulator', async () => {
  const run = () => JSON.parse(execFileSync(process.execPath, ['scripts/sync-card-catalog.mjs', '--apply', '--project', 'demo-full-card-access'], { encoding: 'utf8' }));
  assert.equal(run().mode, 'applied');
  assert.equal(run().mode, 'unchanged');
  await admin(async db => {
    assert.deepEqual((await getDoc(doc(db, 'cardCatalog', 'current'))).data(), buildCardCatalog(source));
    assert.deepEqual((await getDoc(doc(db, 'profiles', 'tang-profile'))).data(), base);
    assert.deepEqual((await getDoc(doc(db, 'access', tang))).data(), { studentId: 'tang-profile', enabled: true });
  });
  await assertFails(updateDoc(doc(dbFor(tang), 'profiles', 'tang-profile'), { cardId: 'future-cms-girl' }));
});
