import { test } from "node:test";
import assert from "node:assert/strict";
import { coinRewardHint, possibleAssessmentScores } from "./coinRewardHint.ts";
import { defaultCoinRule } from "./coinModel.ts";

test("固定獎勵沿用教師金額，短答標示批改後發放", () => {
  const rule = { ...defaultCoinRule, mode: "fixed" as const, amount: 37 };
  assert.equal(
    coinRewardHint(rule, "assessment")?.label,
    "完成可獲得 37 探索幣"
  );
  assert.equal(
    coinRewardHint(rule, "assessment", true)?.delivery,
    "老師批改完成後發放"
  );
  assert.equal(coinRewardHint(rule, "game")?.delivery, "");
});
test("分級互斥，遞減金額按真正可結算範圍計算最高額", () => {
  const rule = {
    ...defaultCoinRule,
    mode: "tiers" as const,
    tiers: [
      { minimum: 80, amount: 19 },
      { minimum: 50, amount: 61 },
    ],
  };
  const hint = coinRewardHint(rule, "assessment")!;
  assert.equal(hint.label, "最高可獲得 61 探索幣");
  assert.equal(hint.tiers[0].condition, "正式成績 50% 至不足 80%");
  assert.equal(hint.tiers[1].amount, 19);
  assert.match(hint.conditions.join(""), /不會累加/);
  assert.deepEqual(
    rule.tiers.map(t => t.minimum),
    [80, 50]
  );
});
test("完成程度只會在 100% 結算，較低門檻的較大金額不可獲得", () => {
  const rule = {
    ...defaultCoinRule,
    mode: "tiers" as const,
    metric: "progress" as const,
    tiers: [
      { minimum: 50, amount: 500 },
      { minimum: 100, amount: 19 },
    ],
  };
  const hint = coinRewardHint(rule, "assessment")!;
  assert.equal(hint.label, "最高可獲得 19 探索幣");
  assert.deepEqual(
    hint.tiers.map(t => t.reachable),
    [false, true]
  );
  assert.equal(
    coinRewardHint(
      {
        ...rule,
        tiers: [
          { minimum: 50, amount: 500 },
          { minimum: 100, amount: 0 },
        ],
      },
      "game"
    ),
    null
  );
});
test("整數成績不會觸發無法到達的小數門檻範圍", () => {
  const rule = {
    ...defaultCoinRule,
    mode: "tiers" as const,
    tiers: [
      { minimum: 50.1, amount: 700 },
      { minimum: 50.2, amount: 17 },
    ],
  };
  assert.equal(coinRewardHint(rule, "game")?.label, "最高可獲得 17 探索幣");
});
test("未設定、停用、零獎勵、無結算途徑及損壞設定均不顯示可獲獎勵", () => {
  for (const rule of [
    undefined,
    defaultCoinRule,
    { ...defaultCoinRule, mode: "fixed" as const, amount: 0 },
    { ...defaultCoinRule, mode: "fixed" as const, amount: NaN },
  ])
    assert.equal(coinRewardHint(rule, "assessment"), null);
  assert.equal(
    coinRewardHint({ ...defaultCoinRule, mode: "fixed", amount: 37 }, null),
    null
  );
});
test("最高金額只計入按現有題目配分真正可達的成績", () => {
  const questions = [
    { id: "q1", type: "choice" as const, prompt: "測試", points: 10 },
  ];
  assert.deepEqual(possibleAssessmentScores(questions), [0, 100]);
  const rule = {
    ...defaultCoinRule,
    mode: "tiers" as const,
    tiers: [
      { minimum: 50, amount: 500 },
      { minimum: 100, amount: 19 },
    ],
  };
  assert.equal(
    coinRewardHint(
      rule,
      "assessment",
      false,
      possibleAssessmentScores(questions)
    )?.label,
    "最高可獲得 19 探索幣"
  );
  const weighted = [...questions, { ...questions[0], id: "q2", points: 90 }];
  assert.deepEqual(possibleAssessmentScores(weighted), [0, 10, 90, 100]);
  const short = [
    { ...questions[0], points: 90 },
    { ...questions[0], id: "q2", points: 10, type: "short" as const },
  ];
  const attainable = possibleAssessmentScores(short);
  assert.equal(attainable.includes(50), false);
  assert.equal(attainable.includes(5), true);
  assert.equal(attainable.includes(95), true);
});
