import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Minimal trusted metadata, derived from CMS at release time; no card IDs in code. */
export function buildCardCatalog(source) {
  assert.ok(Array.isArray(source.cards) && source.cards.length, 'CMS cards must be a nonempty array');
  const entries = source.cards.map(card => {
    assert.ok(typeof card.id === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(card.id), 'Invalid card ID');
    assert.ok(['studentBoy', 'studentGirl'].includes(card.role), `Invalid role: ${card.id}`);
    assert.equal(typeof card.enabled, 'boolean', `Invalid enabled flag: ${card.id}`);
    assert.ok(card.drawEnabled === undefined || typeof card.drawEnabled === 'boolean', 'Invalid draw enabled flag');
    return [card.id, { enabled: card.enabled, role: card.role, drawEnabled: card.drawEnabled ?? true }];
  }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  assert.equal(new Set(entries.map(([id]) => id)).size, entries.length, 'Duplicate card IDs');
  const cards = Object.fromEntries(entries);
  const drawPrice = source.drawPrice ?? 100;
  assert.ok(Number.isSafeInteger(drawPrice) && drawPrice >= 1 && drawPrice <= 100000, 'Invalid draw price');
  // Version identity includes renderer inputs, not only pool eligibility.
  // A page built before a new ID/art/layout assignment cannot buy that version.
  const presentation = [...source.cards].sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map(card=>({id:card.id,name:card.name??'',image:card.image??'',edition:card.edition??'',backgroundId:card.backgroundId??''}));
  const sourceSha256 = createHash('sha256').update(JSON.stringify({schemaVersion:1,cards,drawPrice,presentation})).digest('hex');
  const snapshot = { schemaVersion: 1, sourceSha256, cards, drawPrice };
  // Conservative single-document limit; fail explicitly instead of partial sync.
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 250_000, 'Catalogue exceeds safe snapshot size');
  return snapshot;
}

export function catalogFields(snapshot) {
  return {
    schemaVersion: { integerValue: String(snapshot.schemaVersion) },
    sourceSha256: { stringValue: snapshot.sourceSha256 },
    drawPrice: { integerValue: String(snapshot.drawPrice) },
    cards: { mapValue: { fields: Object.fromEntries(Object.entries(snapshot.cards).map(([id, card]) => [id, {
      mapValue: { fields: { enabled: { booleanValue: card.enabled }, drawEnabled: { booleanValue: card.drawEnabled }, role: { stringValue: card.role } } },
    }])) } },
  };
}
