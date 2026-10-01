import { coinAward, validateCoinRule, type CoinRule } from "./coinModel.ts";
import type { Question } from "./assessment.ts";

export type RewardSource = "assessment" | "game";
export type CoinRewardHint = {
  label: string;
  delivery: string;
  conditions: string[];
  tiers: { condition: string; amount: number; reachable: boolean }[];
};

// Both grading paths round the formal percentage to an integer. Evaluate the
// existing settlement function, including its exclusive thresholds and the
// requirement that progress is exactly 100; never sum tier amounts.
const formalScores = Array.from({ length: 101 }, (_, score) => score);
const number = (value: number) => value.toLocaleString("zh-HK");

export function possibleAssessmentScores(
  questions: readonly Question[]
): number[] {
  if (
    !questions.length ||
    questions.length > 30 ||
    questions.some(
      q => !Number.isInteger(q.points) || q.points < 1 || q.points > 100
    )
  )
    return [];
  const total = questions.reduce((sum, q) => sum + q.points, 0);
  const shortPoints = questions
    .filter(q => q.type === "short")
    .reduce((sum, q) => sum + q.points, 0);
  let sums = new Set([0]);
  for (const q of questions.filter(q => q.type === "choice"))
    sums = new Set([...Array.from(sums), ...Array.from(sums, sum => sum + q.points)]);
  const scores = new Set<number>();
  for (const sum of Array.from(sums))
    for (
      let score = Math.round((100 * sum) / total);
      score <= Math.round((100 * (sum + shortPoints)) / total);
      score++
    )
      scores.add(score);
  return Array.from(scores).sort((a, b) => a - b);
}

export function coinRewardHint(
  rule: CoinRule | undefined,
  source: RewardSource | null,
  hasShortAnswers = false,
  attainableScores: readonly number[] = formalScores
): CoinRewardHint | null {
  if (!rule || !source) return null;
  try {
    validateCoinRule(rule);
  } catch {
    return null;
  }
  const maximum = Math.max(
    0,
    ...attainableScores.map(score => coinAward(rule, score, 100) ?? 0)
  );
  if (maximum <= 0) return null;

  const conditions = [
    source === "game"
      ? "成功完成遊戲並至少作答一次。"
      : "完成測驗並提交全部答案，取得有效正式成績。",
    hasShortAnswers && source === "assessment"
      ? "老師完成必要批改、符合條件後發放。"
      : "完成並符合條件後發放。",
    "每人每任務只發放一次正數獎勵；重做不會重複領取或補差額。",
    "實際發放以系統核算時的獎勵設定為準。",
  ];
  if (source === "assessment" && hasShortAnswers)
    conditions.splice(1, 0, "短答題須待老師全部批改完成。");

  const tiers: CoinRewardHint["tiers"] = [];
  if (rule.mode === "tiers") {
    const sorted = [...rule.tiers].sort((a, b) => a.minimum - b.minimum);
    const metric =
      rule.metric === "score"
        ? source === "game"
          ? "本局答對率"
          : "正式成績"
        : "完成程度";
    conditions.push("只取最高符合門檻的級別，不會累加；未達最低門檻不發放。");
    if (rule.metric === "progress")
      conditions.push(
        "目前只在完成後以 100% 結算，未完成不發放；其他完成程度不會觸發部分獎勵。"
      );
    else if (source === "game")
      conditions.push(
        "本局答對率＝答對次數 ÷ 總作答次數，以百分比四捨五入；同題重答亦計入總次數。"
      );

    sorted.forEach((tier, index) => {
      const next = sorted[index + 1]?.minimum;
      const inRange = (value: number) =>
        value >= tier.minimum && (next === undefined || value < next);
      tiers.push({
        condition:
          next === undefined
            ? `${metric} ${number(tier.minimum)}% 或以上`
            : `${metric} ${number(tier.minimum)}% 至不足 ${number(next)}%`,
        amount: tier.amount,
        reachable:
          rule.metric === "progress"
            ? inRange(100)
            : attainableScores.some(inRange),
      });
    });
  }
  return {
    label: `${rule.mode === "fixed" ? "完成" : "最高"}可獲得 ${number(maximum)} 探索幣`,
    delivery:
      source === "assessment" && hasShortAnswers ? "老師批改完成後發放" : "",
    conditions,
    tiers,
  };
}
