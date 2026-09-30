export type CoinRule = {
  mode: "off" | "fixed" | "tiers";
  amount: number;
  metric: "score" | "progress";
  tiers: { minimum: number; amount: number }[];
};
export const defaultCoinRule: CoinRule = {
  mode: "off",
  amount: 0,
  metric: "score",
  tiers: [],
};
export function validateCoinRule(rule: CoinRule) {
  const coins = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 100000;
  if (
    !rule ||
    !["off", "fixed", "tiers"].includes(rule.mode) ||
    !["score", "progress"].includes(rule.metric) ||
    !coins(rule.amount) ||
    !Array.isArray(rule.tiers) ||
    rule.tiers.length > 20
  )
    throw new Error("探索幣設定無效。");
  if (rule.mode === "tiers" && !rule.tiers.length)
    throw new Error("請加入最少一個獎勵級別。");
  if (
    rule.tiers.some(
      t =>
        !Number.isFinite(t.minimum) ||
        t.minimum < 0 ||
        t.minimum > 100 ||
        !coins(t.amount)
    ) ||
    new Set(rule.tiers.map(t => t.minimum)).size !== rule.tiers.length
  )
    throw new Error(
      "門檻須為 0 至 100，不能重複；探索幣須為 0 至 100,000 嘅整數。"
    );
}
export function coinAward(
  rule: CoinRule,
  score: number | null,
  progress: number
): number | null {
  if (
    score === null ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100 ||
    progress !== 100
  )
    return null;
  validateCoinRule(rule);
  if (rule.mode === "off") return 0;
  if (rule.mode === "fixed") return rule.amount;
  const value = rule.metric === "score" ? score : progress;
  return (
    [...rule.tiers]
      .sort((a, b) => b.minimum - a.minimum)
      .find(t => value >= t.minimum)?.amount ?? 0
  );
}
