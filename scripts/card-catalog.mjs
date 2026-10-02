import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Minimal trusted metadata, derived from CMS at release time; no card IDs in code. */
export function buildCardCatalog(source) {
  assert.ok(Array.isArray(source.cards) && source.cards.length, 'CMS cards must be a nonempty array');
  const entries = source.cards.map(card => {
    assert.ok(typeof card.id === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(card.id), 'Invalid card ID');
    assert.ok(['studentBoy', 'studentGirl'].includes(card.role), `Invalid role: ${card.id}`);
    assert.equal(typeof card.enabled, 'boolean', `Invalid enabled flag: ${card.id}`);
    return [card.id, { enabled: card.enabled, role: card.role }];
  }).sort(([a], [b]) => a.localeCompare(b, 'en'));
  assert.equal(new Set(entries.map(([id]) => id)).size, entries.length, 'Duplicate card IDs');
  const cards = Object.fromEntries(entries);
  const sourceSha256 = createHash('sha256').update(JSON.stringify(cards)).digest('hex');
  const snapshot = { schemaVersion: 1, sourceSha256, cards };
  // Conservative single-document limit; fail explicitly instead of partial sync.
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 250_000, 'Catalogue exceeds safe snapshot size');
  return snapshot;
}

export function catalogFields(snapshot) {
  return {
    schemaVersion: { integerValue: String(snapshot.schemaVersion) },
    sourceSha256: { stringValue: snapshot.sourceSha256 },
    cards: { mapValue: { fields: Object.fromEntries(Object.entries(snapshot.cards).map(([id, card]) => [id, {
      mapValue: { fields: { enabled: { booleanValue: card.enabled }, role: { stringValue: card.role } } },
    }])) } },
  };
}
