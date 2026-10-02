import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCardBackground } from "./cardBackground.ts";
import type { ExplorerCard } from "./cardModel.ts";

const backgrounds = [
  { id: "voyages", name: "航海與交流", image: "/history-quest/uploads/home-voyages-exchange-v2.webp" },
  { id: "history", name: "歷史探索", image: "/history-quest/uploads/home-history-hero.webp" },
];
const cards: ExplorerCard[] = [
  { id: "starter-boy", name: "Starter", image: "/card.png", enabled: true, role: "studentBoy", edition: "starter", backgroundId: "voyages" },
  { id: "starter-girl", name: "Starter", image: "/card.png", enabled: true, role: "studentGirl", edition: "starter", backgroundId: "voyages" },
  { id: "nile-boy", name: "Nile", image: "/card.png", enabled: true, role: "studentBoy", edition: "nile", backgroundId: "history" },
];
const profile = { role: "studentBoy" as const, ownedCardIds: ["starter-boy", "nile-boy"], cardId: "starter-boy" };

test("multiple cards share one named background without copied images", () => {
  assert.deepEqual(resolveCardBackground(cards, backgrounds, profile), backgrounds[0]);
  assert.deepEqual(resolveCardBackground(cards, backgrounds, {
    role: "studentGirl", ownedCardIds: ["starter-girl"], cardId: "starter-girl",
  }), backgrounds[0]);
  assert.equal(backgrounds.length, 2);
});

test("background follows saved card after switch, serialization, and a fresh session", () => {
  const next = { ...profile, cardId: "nile-boy" };
  for (const restored of [next, JSON.parse(JSON.stringify(next)), structuredClone(next)]) {
    assert.deepEqual(resolveCardBackground(cards, backgrounds, restored), backgrounds[1]);
  }
  assert.deepEqual(resolveCardBackground(cards, backgrounds, profile), backgrounds[0]);
});

test("unconfigured old cards and cleared CMS references request the default", () => {
  for (const backgroundId of [undefined, null, "", "   ", "deleted-background"]) {
    const oldCards = cards.map(card => ({ ...card, backgroundId }));
    assert.equal(resolveCardBackground(oldCards, backgrounds, profile), null);
  }
  assert.deepEqual(resolveCardBackground(cards.map(card => ({ ...card, backgroundId: " voyages " })), backgrounds, profile), backgrounds[0]);
  for (const library of [undefined, null, []]) {
    assert.equal(resolveCardBackground(cards, library, profile), null);
  }
});

test("never reveals a background for an unowned, wrong-role, disabled or missing card", () => {
  for (const account of [undefined, null, {}, { cardId: "starter-boy" },
    { ...profile, cardId: "missing" }, { ...profile, cardId: "starter-girl" },
    { ...profile, ownedCardIds: [] }, { ...profile, role: "studentGirl" as const },
  ]) {
    assert.equal(resolveCardBackground(cards, backgrounds, account), null);
  }
  assert.equal(resolveCardBackground(cards.map(card => ({ ...card, enabled: false })), backgrounds, profile), null);
});

test("missing/unsafe images request fallback; named https or uploaded media resolves", () => {
  for (const image of ["", " ", "http://example.test/photo.png", "javascript:alert(1)", "/history-quest/uploads/"]) {
    assert.equal(resolveCardBackground(cards, [{ ...backgrounds[0], image }], profile), null);
  }
  const remote = { ...backgrounds[0], image: "https://example.test/photo.png" };
  assert.deepEqual(resolveCardBackground(cards, [remote], profile), remote);
  const existingUpload = { ...backgrounds[0], image: "/history-quest/uploads/ 截圖 2026.png" };
  assert.deepEqual(resolveCardBackground(cards, [existingUpload], profile), existingUpload);
});

test("renaming or replacing a shared entry applies to every linked card without profile changes", () => {
  const replacement = { ...backgrounds[0], name: "新名稱", image: backgrounds[1].image };
  assert.deepEqual(resolveCardBackground(cards, [replacement], profile), replacement);
  assert.equal(profile.cardId, "starter-boy");
  assert.equal(cards[0].backgroundId, "voyages");
});
