import Home from "./Home";
import { SITE_SETTINGS } from "@/lib/siteSettings";
import { REMINDER_PREVIEW_PROFILE } from "@/lib/drawReminderPreview";

export default function LocalDrawRemindersPreview() {
  return <>
    <div className="draw-reminder-preview-controls">
      <span>提醒預覽：測試資料，不會扣學生探索幣或更改收藏。</span>
      <a href="?scenario=poor">探索幣不足</a>
      <a href="?scenario=empty">卡片已集齊</a>
      <a href="?scenario=normal">正常抽卡示範</a>
    </div>
    <Home previewSettings={SITE_SETTINGS} previewProfile={REMINDER_PREVIEW_PROFILE}
      coinDrawDemo initialCoinDrawOpen initialSidebarOpen onChangeCharacter={() => {}} />
  </>;
}
