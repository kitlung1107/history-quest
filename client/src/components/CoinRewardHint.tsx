import ExplorationCoin from "./ExplorationCoin";
import type { CoinRewardHint as RewardHint } from "@/lib/coinRewardHint";

export default function CoinRewardHint({
  reward,
  chip = false,
}: {
  reward?: RewardHint | null;
  chip?: boolean;
}) {
  if (!reward) return null;
  return (
    <div className={`coin-reward-hint${chip ? " meta-chip" : ""}`}>
      <div className="coin-reward-label">
        <ExplorationCoin className="h-4 w-4 shrink-0" />
        <span>{reward.label}</span>
      </div>
      {reward.delivery && (
        <span className="coin-reward-confirmation">{reward.delivery}</span>
      )}
    </div>
  );
}
