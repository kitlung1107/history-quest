import { ChevronRight } from "lucide-react";

export default function CoinDrawEntry({ onClick, demo = false }: { onClick: () => void; demo?: boolean }) {
  return (
    <button type="button" className="coin-draw-entry" onClick={onClick}
      aria-label={demo ? "探索幣抽卡效果示範" : "探索幣抽卡（尚未啟用）"}>
      <svg viewBox="0 0 40 34" width="34" height="30" aria-hidden="true">
        <rect x="16" y="2" width="21" height="27" rx="3" fill="#17324d" stroke="#17324d" strokeWidth="1.7" transform="rotate(6 26 16)" />
        <rect x="13" y="4" width="21" height="26" rx="2.5" fill="#193b58" stroke="#eabb53" strokeWidth="1.7" />
        <path d="M23.5 9l1.4 5.2 5.1 1.5-5.1 1.5-1.4 5.2-1.5-5.2-5.1-1.5 5.1-1.5z" fill="#ffd96d" />
        <circle cx="12" cy="23" r="9" fill="#ffda69" stroke="#17324d" strokeWidth="1.9" />
        <circle cx="12" cy="23" r="6.4" fill="none" stroke="#b77c22" strokeWidth="1.2" />
        <path d="M12 17.5l1.3 4.1 4.2 1.4-4.2 1.3-1.3 4.2-1.3-4.2-4.2-1.3 4.2-1.4z" fill="#17324d" />
      </svg>
      <span>探索幣抽卡{!demo && <small>尚未啟用</small>}</span>
      <ChevronRight aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
