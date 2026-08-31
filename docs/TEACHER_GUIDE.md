# 教師管理指南

## Google 資源

| 資源 | 連結／用途 |
|---|---|
| 主試算表 | [歷史互動探索館｜學生成績主試算表](https://docs.google.com/spreadsheets/d/19FUB6aC_zmRdXz-VY9n3ZHY7NTOzwJIq0lh-Ucfhs-8/edit) |
| 成績 API | `https://script.google.com/macros/s/AKfycbymowbPxS3_LxAcfOP546HahoNKV1S-8Uwatj0-0Uw3Rz4oYMVMK0VeJAiG17BCzmWG/exec` |
| 成績 Apps Script | [程式專案](https://script.google.com/u/1/home/projects/1jEmaJmCGJ4gFx8ueWWc_mN3IUODpuDQOBBe-5IYJo0ccUjHlNciCGW9k/edit) |
| CMS OAuth 代理 | [程式專案](https://script.google.com/u/1/home/projects/1gy0LY_BffZ3g3_jx7nE8Pt1K0aH2LRrlQSon5AK36Bx3eC1OJ3c8d0ER/edit)；[Web App](https://script.google.com/macros/s/AKfycbyITPZjoTaI6mFZrYzCkkJbKOAlUrVvcLcHFhRXzw8X9QfcGYsRCjW4VpdcT7Rh5FD0/exec) |

當學生完成文章、遊戲或小測，網站會立即把資料加入本機同步佇列，再背景 POST 至成績 API。GAS 收到新 `task_id` 時會自動建立同名分頁及表頭；相同 `attempt_id` 不會重複寫入。離線或網絡異常時，資料會保留在該部裝置，恢復連線後自動重試。

## 新增或修改內容

登入網站 `/cms/` 後，選擇「歷史任務」。`task_id` 只可使用英文字母、數字、底線及連字號，而且發佈後不應隨意更改，否則成績會分流至新的試算表分頁。完成編輯並發佈後，Decap CMS 會 Commit 至 `main`，GitHub Actions 隨即重新建置 GitHub Pages。

## 影片與互動遊戲

YouTube 連結會轉換為 `youtube-nocookie.com` 嵌入網址；Google Drive 檔案連結會轉為預覽模式。HTML5／iframe 遊戲必須使用 HTTPS，而且來源網站需允許被 iframe 嵌入。遊戲 iframe 會套用 sandbox 權限限制，以減少第三方內容風險。

## 教師後台

前往 `/admin`，輸入交付時提供的教師 PIN。PIN 驗證在 GAS 執行，並非只以 JavaScript 隱藏畫面。成功後可檢視不重複學生、完成紀錄、任務分頁數量、平均分圖表及逐筆資料。

## 資料與私隱

網站會在學生裝置的 `localStorage` 保存班別、姓名、學號、任務進度與尚未送出的同步佇列。教師應依校本私隱政策告知學生資料用途、保留期及查詢方式；不再需要的成績分頁應由獲授權教師在試算表內處理。
