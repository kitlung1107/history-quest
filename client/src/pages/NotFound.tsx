/** 設計提醒：404 是像素通訊中斷的漫畫分鏡，不使用模板預設英文頁。 */
import { RadioTower, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="not-found-page min-h-screen p-6">
      <div className="error-panel mx-auto max-w-2xl">
        <RadioTower className="mx-auto h-20 w-20 text-red" />
        <p className="pixel-label mt-5">錯誤代號 404</p>
        <h1 className="display-title mt-3 text-4xl">📡 歷史檔案修復中，訊號微弱，請稍後再試…</h1>
        <p className="mt-4 text-ink/70">你尋找的年代可能尚未開放，或者已經移到另一個檔案櫃。</p>
        <button className="pixel-button pixel-button-gold mx-auto mt-7" onClick={() => navigate("/")}>
          <RotateCcw className="h-5 w-5" />返回探索館
        </button>
      </div>
    </div>
  );
}
