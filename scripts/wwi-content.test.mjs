import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { availableCards, giftCards } from "../client/src/lib/cardModel.ts";
import { resolveCardBackground } from "../client/src/lib/cardBackground.ts";

const read = name => JSON.parse(fs.readFileSync(new URL(`../client/src/content/settings/${name}.json`, import.meta.url), "utf8"));
const { cards } = read("cards");
const { backgrounds } = read("backgrounds");
const additions = cards.filter(card => ["wwi-s3", "wwi-s4"].includes(card.edition));

test("WWI themes each pair two roles with one shared local background", () => {
  assert.equal(additions.length, 4);
  for (const edition of ["wwi-s3", "wwi-s4"]) {
    const pair = additions.filter(card => card.edition === edition);
    assert.deepEqual(pair.map(card => card.role).sort(), ["studentBoy", "studentGirl"]);
    assert.equal(new Set(pair.map(card => card.backgroundId)).size, 1);
    for (const card of pair) {
      const background = resolveCardBackground(cards, backgrounds, { role: card.role, ownedCardIds: [card.id], cardId: card.id });
      assert.equal(background?.id, card.backgroundId);
      for (const image of [card.image, background.image]) {
        const path = new URL(`../client/public/${image.replace("/history-quest/", "")}`, import.meta.url);
        const bytes = fs.readFileSync(path);
        assert.equal(bytes.subarray(1, 4).toString(), "PNG");
        if (image === card.image) assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [1024, 1536]);
      }
    }
  }
  assert.notEqual(additions[0].backgroundId, additions[2].backgroundId);
});

test("WWI themes never grant cards by class or bypass ownership and role", () => {
  for (const role of ["studentBoy", "studentGirl"]) {
    for (const className of ["1A", "2A", "3A", "S3", "S4", "S5", "S6"]) {
      assert.ok(giftCards(role, className).every(id => !id.startsWith("wwi-")));
      assert.deepEqual(availableCards(additions, { role, ownedCardIds: giftCards(role, className) }), []);
    }
    const permitted = additions.filter(card => card.role === role);
    assert.deepEqual(availableCards(additions, { role, ownedCardIds: additions.map(card => card.id) }), permitted);
  }
  assert.deepEqual(availableCards(additions), []);
});
