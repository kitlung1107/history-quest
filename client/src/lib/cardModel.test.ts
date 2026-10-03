import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableCards,
  resolveCard,
  cardIdentity,
  giftCards,
  isStudentRole,
  type ExplorerCard,
} from "./cardModel.ts";
const cards: ExplorerCard[] = ["boy", "girl"].flatMap(sex =>
  ["starter", "nile", "stone-age", "age-of-discovery"].map(
    edition =>
      ({
        id: `${edition}-explorer-${sex}`,
        name: edition,
        image: "/image.png",
        enabled: true,
        role: sex === "boy" ? "studentBoy" : "studentGirl",
        edition,
      }) as ExplorerCard
  )
);
test("all six grades receive own starter; only form one receives own Nile", () => {
  for (const role of ["studentBoy", "studentGirl"] as const)
    for (const c of [
      "1A",
      "1E",
      "2A",
      "3E",
      "S4",
      "S5",
      "S6",
      "4A",
      "5B",
      "6E",
    ]) {
      const gifts = giftCards(role, c);
      assert.equal(gifts.length, c.startsWith("1") ? 2 : 1);
      assert.ok(
        gifts.every(id => id.endsWith(role === "studentBoy" ? "boy" : "girl"))
      );
    }
  for (const c of ["Other", "S1", "1F", "11A", ""])
    assert.equal(giftCards("studentBoy", c).length, 1);
});
test("selection fails closed for unselected, cross-role, disabled and unowned cards", () => {
  const collection = {
    role: "studentBoy" as const,
    ownedCardIds: ["starter-explorer-boy", "nile-explorer-girl"],
  };
  assert.deepEqual(
    availableCards(cards, collection).map(c => c.id),
    ["starter-explorer-boy"]
  );
  for (const id of [
    undefined,
    "missing",
    "nile-explorer-boy",
    "nile-explorer-girl",
    "__proto__",
  ])
    assert.equal(resolveCard(cards, id, collection), null);
  assert.equal(
    resolveCard(cards, "starter-explorer-boy", collection)?.id,
    "starter-explorer-boy"
  );
  assert.equal(resolveCard(cards, "starter-explorer-boy"), null);
  assert.equal(
    resolveCard(
      cards.map(c => ({ ...c, enabled: false })),
      "starter-explorer-boy",
      collection
    ),
    null
  );
});
test("voyage cards require explicit own-role ownership and are never gifted", () => {
  for (const role of ["studentBoy", "studentGirl"] as const) {
    const suffix = role === "studentBoy" ? "boy" : "girl";
    const id = `age-of-discovery-explorer-${suffix}`;
    const collection = { role, ownedCardIds: giftCards(role, "1A") };
    assert.equal(resolveCard(cards, id, collection), null);
    assert.equal(
      resolveCard(cards, id, {
        ...collection,
        ownedCardIds: [...collection.ownedCardIds, id],
      })?.id,
      id
    );
    for (const className of ["1A", "2A", "3A", "4A", "5A", "6A"])
      assert.ok(!giftCards(role, className).includes(id));
  }
});

test("old avatars never count as role selection; identity uses profile fields", () => {
  assert.equal(isStudentRole("explorer"), false);
  assert.equal(isStudentRole(undefined), false);
  assert.equal(
    cardIdentity({ className: "1A", studentNo: "12", name: "可豪" }),
    "1A(12) 可豪"
  );
  assert.equal(
    cardIdentity({ name: "陳 Alex".repeat(10) }),
    "陳 Alex".repeat(10)
  );
});

test("identity uses one space, preserves actual class and leading zeros, and never substitutes nickname", () => {
  const profile = {
    className: " 4A ", studentNo: " 01 ", name: " 陳 Alex ",
    nickname: "獨立暱稱",
  };
  assert.equal(cardIdentity(profile), "4A(01) 陳 Alex");
  assert.equal(cardIdentity({ className: "1A", studentNo: "12", name: "陳小明" }), "1A(12) 陳小明");
  assert.equal(cardIdentity({ ...profile, name: "" }), "4A(01) 未設定姓名");
});

test("missing identity fields degrade without undefined or empty parentheses", () => {
  for (const [profile, expected] of [
    [{ name: "陳小明" }, "陳小明"],
    [{ className: "1A", name: "陳小明" }, "1A 陳小明"],
    [{ studentNo: "12", name: "陳小明" }, "(12) 陳小明"],
    [{ className: "1A", studentNo: "", name: "陳小明" }, "1A 陳小明"],
    [{ className: " ", studentNo: " ", name: " " }, "未設定姓名"],
    [{ className: null, studentNo: null, name: null }, "未設定姓名"],
    [{}, "未設定姓名"],
  ] as const) {
    assert.equal(cardIdentity(profile), expected);
  }
});
