import { test } from "node:test";
import assert from "node:assert/strict";
import { availableCards, resolveCard, cardIdentity } from "./cardModel.ts";
const cards = [
  { id: "first", name: "第一張", image: "/one.webp", enabled: true },
  { id: "hidden", name: "停用", image: "/two.webp", enabled: false },
  { id: "second", name: "第二張", image: "/three.webp", enabled: true },
];
test("missing, disabled, removed and invalid choices resolve to first enabled card", () => {
  for (const id of [undefined, "hidden", "deleted", "__proto__"]) assert.equal(resolveCard(cards, id)?.id, "first");
  assert.equal(resolveCard(cards, "second")?.id, "second");
  assert.deepEqual(availableCards(cards).map(c => c.id), ["first", "second"]);
});
test("CMS ordering controls fallback; no enabled cards yields null", () => {
  assert.equal(resolveCard([...cards].reverse())?.id, "second");
  assert.equal(resolveCard([]), null);
  assert.equal(resolveCard(cards.map(c => ({ ...c, enabled: false }))), null);
});
test("identity remains exact for legacy classes and multilingual names", () => {
  assert.equal(cardIdentity({ className: "1A", studentNo: "12", name: "鄧小明" }), "1A(12)鄧小明");
  assert.equal(cardIdentity({ className: "4B", studentNo: "02", name: "陳 Alex" }), "4B(02)陳 Alex");
  assert.equal(cardIdentity({ className: "Other", studentNo: "A12", name: "A".repeat(50) }), `Other(A12)${"A".repeat(50)}`);
});
