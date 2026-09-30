import { test } from "node:test";
import assert from "node:assert/strict";
import { coinAward, defaultCoinRule, validateCoinRule } from "./coinModel.ts";
test("only valid completed grades qualify, including a genuine zero", () => {
  const rule = { ...defaultCoinRule, mode: "fixed" as const, amount: 17 };
  for (const score of [null, NaN, -1, 101])
    assert.equal(coinAward(rule, score, 100), null);
  assert.equal(coinAward(rule, 100, 99), null);
  assert.equal(coinAward(rule, 0, 100), 17);
  assert.equal(coinAward(defaultCoinRule, 100, 100), 0);
});
test("custom tiers select highest qualifying threshold without assuming 1:1", () => {
  const rule = {
    ...defaultCoinRule,
    mode: "tiers" as const,
    tiers: [
      { minimum: 90, amount: 63 },
      { minimum: 50, amount: 12 },
    ],
  };
  assert.equal(coinAward(rule, 49, 100), 0);
  assert.equal(coinAward(rule, 50, 100), 12);
  assert.equal(coinAward(rule, 100, 100), 63);
  assert.equal(coinAward({ ...rule, metric: "progress" }, 50, 100), 63);
});
test("reject ambiguous thresholds and invalid currency amounts", () => {
  for (const amount of [-1, 0.5, NaN, Infinity, 100001])
    assert.throws(() => validateCoinRule({ ...defaultCoinRule, amount }));
  assert.throws(() =>
    validateCoinRule({ ...defaultCoinRule, mode: "tiers", tiers: [] })
  );
  assert.throws(() =>
    validateCoinRule({
      ...defaultCoinRule,
      tiers: [
        { minimum: 50, amount: 1 },
        { minimum: 50, amount: 2 },
      ],
    })
  );
});
