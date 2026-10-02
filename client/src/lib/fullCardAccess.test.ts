import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasFullCardAccess, hasFullCardSessionAccess, availableAccountCards, resolveAccountCard, cardDisplayCollection } from './fullCardAccess.ts';
import { resolveCardBackground } from './cardBackground.ts';
import { giftCards, type ExplorerCard } from './cardModel.ts';

const claims = (email: string) => ({ email, email_verified: true, firebase: { sign_in_provider: 'google.com' } });
const approved = ['tangkl@ctshkpcc.edu.hk', 'kitlung1107@gmail.com'];
const cards: ExplorerCard[] = [
  { id: 'starter-explorer-boy', name: 'Starter', enabled: true, role: 'studentBoy', image: '/boy.png', edition: 'starter' },
  { id: 'future-girl', name: 'Future', enabled: true, role: 'studentGirl', image: '/girl.png', edition: 'starter', backgroundId: 'future-background' },
  { id: 'disabled-boy', name: 'Disabled', enabled: false, role: 'studentBoy', image: '/disabled.png', edition: 'starter' },
];
const profile = { role: 'studentBoy' as const, ownedCardIds: giftCards('studentBoy', '2A'), cardId: 'future-girl' };

test('exact verified Google identities only; roles, client flags and similar emails do not grant access', () => {
  for (const email of approved) {
    assert.equal(hasFullCardAccess(claims(email)), true);
    for (const invalid of [
      { ...claims(email), email_verified: false }, { ...claims(email), email_verified: 'true' },
      { ...claims(email), firebase: { sign_in_provider: 'password' } },
      { ...claims(email), firebase: {} }, { email, email_verified: true },
      claims(`x${email}`), claims(`${email}.evil`), claims(email.toUpperCase()),
    ]) assert.equal(hasFullCardAccess(invalid), false);
  }
  assert.equal(hasFullCardAccess({ ...claims('student@ctshkpcc.edu.hk'), fullCardAccess: true, teacher: true, testing: true }), false);
  assert.equal(hasFullCardAccess({}), false);
});

test('active own binding is required; owner fallback is only the owner UID with no access record', () => {
  for (const email of approved) {
    const token = claims(email);
    assert.equal(hasFullCardSessionAccess(token, 'uid', 's1', { enabled: true, studentId: 's1' }), true);
    for (const access of [{ enabled: false, studentId: 's1' }, { enabled: 'true', studentId: 's1' }, { enabled: true, studentId: 'other' }])
      assert.equal(hasFullCardSessionAccess(token, 'uid', 's1', access), false);
    assert.equal(hasFullCardSessionAccess(token, 'uid', 's1', null), false);
  }
  assert.equal(hasFullCardSessionAccess(claims(approved[0]), 'uid', 'uid', null), false);
  assert.equal(hasFullCardSessionAccess(claims(approved[1]), 'uid', 'uid', null), true);
  assert.equal(hasFullCardSessionAccess(claims(approved[1]), 'uid', 'uid', { enabled: false, studentId: 'uid' }), false);
});

test('full selection uses current enabled catalogue across roles; ordinary gifts stay unchanged', () => {
  assert.deepEqual(availableAccountCards(cards, profile).map(c => c.id), ['starter-explorer-boy']);
  assert.deepEqual(availableAccountCards(cards, profile, true).map(c => c.id), ['starter-explorer-boy', 'future-girl']);
  assert.equal(resolveAccountCard(cards, 'future-girl', profile), null);
  assert.equal(resolveAccountCard(cards, 'future-girl', profile, true)?.id, 'future-girl');
  for (const id of ['disabled-boy', 'missing', undefined]) assert.equal(resolveAccountCard(cards, id, profile, true), null);
  const added = { ...cards[1], id: 'next-cms-card' };
  assert.equal(resolveAccountCard([...cards, added], added.id, profile, true)?.id, added.id);
  assert.deepEqual(giftCards('studentBoy', '2A'), ['starter-explorer-boy']);
  assert.deepEqual(giftCards('studentGirl', '1E'), ['starter-explorer-girl', 'nile-explorer-girl']);
});

test('background presentation follows selected cross-role card without mutating saved role or ownership', () => {
  const original = structuredClone(profile);
  const background = { id: 'future-background', name: 'Future', image: '/history-quest/uploads/future.webp' };
  assert.equal(resolveCardBackground(cards, [background], profile), null);
  assert.deepEqual(resolveCardBackground(cards, [background], cardDisplayCollection(cards, profile, true)), background);
  assert.deepEqual(profile, original);
  assert.equal(cardDisplayCollection(cards, profile, false), profile);
  assert.equal(resolveCardBackground(cards.filter(c => c.id !== 'future-girl'), [background], cardDisplayCollection([], profile, true)), null);
});
