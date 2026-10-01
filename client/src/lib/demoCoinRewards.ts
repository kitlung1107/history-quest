import type { HistoryTask } from "./historyQuest";
import { defaultCoinRule, type CoinRule } from "./coinModel";

// Imported only by LocalHomeDemo (a DEV-only route). All data is synthetic.
export function demoCoinRewards(base: HistoryTask, scenario: string) {
  const make = (id: string, title: string, short = false): HistoryTask => ({
    ...base,
    id,
    title,
    type: "quiz",
    accent: short ? "teal" : "gold",
    gameUrl: undefined,
    description: short
      ? "測試必要批改完成後才發放獎勵。"
      : "測試由後端核算正式成績及探索幣；不會寫入正式學生資料。",
    article: undefined,
    questions: [
      {
        id: "qa1",
        type: short ? "short" : "choice",
        prompt: "測試題目",
        points: 10,
        options: short ? undefined : ["測試正確答案", "測試錯誤答案"],
        answer: short ? undefined : 0,
      },
    ],
  });
  const tasks = [
    make("qa-fixed", "固定獎勵（測試）"),
    make("qa-tiers", "分級獎勵（測試）"),
    make("qa-progress", "完成程度與短答（測試）", true),
    make("qa-off", "停用獎勵（測試）"),
    make("qa-unset", "未設定獎勵（測試）"),
  ];
  const fixed: CoinRule = { ...defaultCoinRule, mode: "fixed", amount: 37 };
  const tiers: CoinRule = {
    ...defaultCoinRule,
    mode: "tiers",
    tiers: [
      { minimum: 50, amount: 23 },
      { minimum: 90, amount: 81 },
    ],
  };
  const progress: CoinRule = {
    ...defaultCoinRule,
    mode: "tiers",
    metric: "progress",
    tiers: [
      { minimum: 50, amount: 500 },
      { minimum: 80, amount: 60 },
      { minimum: 100, amount: 19 },
    ],
  };
  let rules: Record<string, CoinRule> = {
    "qa-fixed": fixed,
    "qa-tiers": tiers,
    "qa-progress": progress,
    "qa-off": defaultCoinRule,
  };
  if (scenario !== "mixed") {
    const rule =
      scenario === "fixed"
        ? fixed
        : scenario === "large"
          ? { ...fixed, amount: 100000 }
          : scenario === "tiers"
            ? tiers
            : scenario === "progress"
              ? progress
              : scenario === "zero"
                ? { ...fixed, amount: 0 }
                : defaultCoinRule;
    rules =
      scenario === "unset"
        ? {}
        : Object.fromEntries(tasks.map(task => [task.id, rule]));
  }
  return { tasks, rules };
}
