import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { buildCardCatalog, catalogFields } from './card-catalog.mjs';

const boy = { id: 'future-boy', role: 'studentBoy', enabled: true, image: '/art.png' };
const girl = { id: 'future-girl', role: 'studentGirl', enabled: false };
test('snapshot includes only trusted metadata; adding/removing cards requires no ID code changes', () => {
  const first = buildCardCatalog({ cards: [boy] });
  assert.deepEqual(first.cards, { 'future-boy': { role: 'studentBoy', enabled: true } });
  const next = buildCardCatalog({ cards: [girl, boy] });
  assert.deepEqual(next, buildCardCatalog({ cards: [boy, girl] }));
  assert.notEqual(next.sourceSha256, first.sourceSha256);
  assert.deepEqual(Object.keys(buildCardCatalog({ cards: [girl] }).cards), ['future-girl']);
  assert.equal(catalogFields(next).cards.mapValue.fields['future-girl'].mapValue.fields.enabled.booleanValue, false);
});
test('malformed and duplicate entries fail before any credential or network use', () => {
  for (const cards of [[], [boy, boy], [{ ...boy, id: '../bad' }], [{ ...boy, enabled: 'true' }], [{ ...boy, role: 'admin' }]])
    assert.throws(() => buildCardCatalog({ cards }));
});
test('default CLI is offline dry-run even with unusable emulator/credential environment', () => {
  const output = execFileSync(process.execPath, ['scripts/sync-card-catalog.mjs'], { encoding: 'utf8', env: {
    ...process.env, FIRESTORE_EMULATOR_HOST: 'not-a-real-host:1', GOOGLE_APPLICATION_CREDENTIALS: 'missing-file',
  } });
  const plan = JSON.parse(output);
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.network, false);
  assert.equal(plan.target, 'cardCatalog/current');
  assert.ok(Object.keys(plan.replacement.cards).length >= 4);
});
