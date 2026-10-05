# 抽卡提醒預覽

本次改動在獨立 worktree 驗收，發布時整合最新 main 的高中鎖定選單修改（PR #11，`7883523`）。兩張提醒採用已驗收的降低位置版本，維持四秒自動返回；沒有修改抽卡交易、Rules、學生餘額或收藏。

學生按原有抽卡按鈕後，先以伺服器資料確認卡池版本、角色、抽卡資格及帳簿。已集齊目前符合角色且可抽的卡片時顯示集齊圖；仍有可抽卡但餘額不足時顯示不足圖。集齊優先。兩種情境均在呼叫原有交易前返回，沒有扣幣、加卡或正常抽卡動畫。無法載入、權限錯誤、空的角色卡池及未核實資格均保留為錯誤。

右側抽卡畫面顯示已批准的 PNG 四秒後自動恢復待機，沒有新增返回按鈕，側欄保持原樣。圖片載入後才開始計時；提醒中阻止連按。離頁會取消尚未開始的交易；舊請求不能清除新畫面已採用的恢復 ID。已開始的原有交易仍沿用原有憑證恢復方式，Rules 及交易函式未改動。

兩張圖片沿用已批准圖層，均為 1205 × 960；最新版本只將不足／集齊對話框連同文字移低 27／32 像素，在老師頭髮上方保留至少 12 像素空隙。泡泡的文字、尺寸及風格不變，舊／新泡泡範圍外沒有像素改動。相同 Library IDs 已更新至版本 1：

- 不足：`libfile_3dec5ed0b9708191a30bcfab9c2087e8`
- 集齊：`libfile_0c2025714a948191a5df4ad823a6fa6e`

位置更新後的預覽截圖與 mock 驗證結果位於 `tmp/draw-reminders-review/lowered-bubble-preview-results.json`。所有測試只讀取本機預覽並使用記憶體 mock；沒有登入、正式 Firestore 請求或學生資料讀寫。

## 操作預覽

- 不足：<http://127.0.0.1:4367/__draw-reminders-preview?scenario=poor>
- 集齊：<http://127.0.0.1:4367/__draw-reminders-preview?scenario=empty>
- 同時集齊及不足：<http://127.0.0.1:4367/__draw-reminders-preview?scenario=both>
- 正常動畫示範：<http://127.0.0.1:4367/__draw-reminders-preview?scenario=normal>

按「100 探索幣一次」操作。這個路由只在本機開發預覽存在，使用記憶體測試資料，不建立 Firebase 連線、不寫入學生餘額或收藏、不保存測試交易。正常情境使用合成憑證示範原有動畫。`loading`、`permission`、`backend-poor` 參數供檢查失敗情境。

## 驗證

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.draw-reminders.config.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/draw-reminders-ui-check.cjs
```

瀏覽器測試結果及桌面、手機截圖位於 `tmp/draw-reminders-review`。測試阻擋外部帳戶及其他本機服務請求，確認四秒返回、連按、側欄一致、離頁及頁面恢復、錯誤不會當作集齊、圖片載入失敗可重試，以及正常動畫沿用。

本機預覽用既有 `vite.draw-preview.config.ts`，埠為 4367。共用依賴中的 picocolors 原檔缺失，因此只在本 worktree 的 `tmp/preview-deps` 安裝相同版本 1.1.1；未更動原 repo 的依賴或選單。若需重新啟動此機的預覽，將 NODE_PATH 指向該資料夾的 node_modules，然後執行：

```powershell
node node_modules/vite/bin/vite.js --config vite.draw-preview.config.ts --host 127.0.0.1 --port 4367 --strictPort
```
