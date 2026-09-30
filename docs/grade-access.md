# 學生年級權限

權限依已核准帳戶對應的 `profiles/{studentId}.className` 判斷，不採用側欄選擇的年級，也不採用學生可編輯的角色卡片。支援現行 `1A`–`3E`、`S4`–`S6`，舊版 `4A`–`6E`，以及 `一A`、`中一` 等中文格式。未知／缺失班別不開放遊玩。

| 身份 | 可玩年級 | 可見年級入口 |
| --- | --- | --- |
| 中一 | 中一 | 中一至中六 |
| 中二 | 中二 | 中一至中六 |
| 中三 | 中三 | 中一至中六 |
| 中四 | 中四 | 中四至中六 |
| 中五 | 中四、中五 | 中四至中六 |
| 中六 | 中四、中五、中六 | 中四至中六 |
| 教師／管理員 | 全部 | 全部 |

教師／管理員沿用現有已驗證管理帳戶的 `teacher` 判斷；本次沒有建立新的教師帳號授權機制。教師不需學生角色即可進入首頁及遊戲。

「全部」只列可玩的任務。選擇未開放但可見的年級時，內容區顯示暗色鎖頭遮罩，底層內容使用 `inert` 並停用挑戰按鈕；側欄可繼續切換。高中不會出現初中入口或初中任務。任務視窗、手機挑戰按鈕、`?game=` 直接入口及事件佇列各自檢查權限。學生資料的即時監聽會更新畫面；Firestore 依當時的班別再次檢查提交和遊戲事件。

Firestore 使用僅管理員可寫入的 `taskAccess/{taskId}`（`grade`、`enabled`）決定任務年級。遊戲從不可由學生修改的 `gameCatalog` 版本資料取得 `taskId`。缺失權限資料一律拒絕學生提交。舊成績、歷史遊戲紀錄保留原有閱讀權限。

## 發布相依步驟

1. 確認並備份正式 Firestore 規則，合併正式環境可能另有的修改，再部署本次規則。
2. 發布新版網站；用既有管理帳戶進入教師工作室，按「重新整理」。`syncCatalogue()` 會同步任務年級（包含沒有測驗的遊戲）與題庫。規則部署後、同步完成前，學生提交會被安全拒絕。
3. 以中四帳戶確認中五冷戰遊戲被鎖；中五、中六及管理員應可進入。確認初中入口對高中隱藏。

網站前端和 Firestore 規則必須一起發布才能在正式站生效。外部獨立遊戲網站（例如另一個 GitHub Pages 儲存庫）及靜態教材檔案不在此儲存庫的伺服器存取控制範圍內；本次保護探索館入口及受規則保護的提交／遊戲紀錄，不宣稱能撤銷外部公開網址或隱藏已下載的靜態資產。

## 驗證

```powershell
node --experimental-strip-types --test client/src/lib/gradeAccess.test.ts
# Firestore 模擬器使用 127.0.0.1:8086；Java 用英文語系避免本機 zh_HK 資源缺失。
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8086'
node --experimental-strip-types --test scripts/grade-access-rules.test.mjs scripts/game-rules.test.mjs scripts/cloud-rules.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-content.mjs
node node_modules/vite/bin/vite.js build
```

開發模式可用 `/__home-demo?class=2A` 或 `?class=S5` 檢視學生畫面；此路由不會包含於正式建置。這個參數只影響示範身份，正式頁面不讀取它。

## 正式環境紀錄（2026-09-30，香港時間）

- 已獲使用者授權同步及部署；Git push 由使用者自行執行。
- 21:59 以 `node scripts/sync-task-access.cjs` 同步並讀回驗證 `S5_ColdWar_Maze`：`grade: 5`、`enabled: true`。此管理腳本先備份，再以更新時間作並行修改保護。
- 22:00 Firestore 規則部署成功；重新讀取正式 release 並確認內容與本地 `firestore.rules` 完全一致。Ruleset：`f2a33610-c4bd-48dc-a317-d69f6e8a6f3d`。
- 部署前正式規則與 Git HEAD 基準一致；備份位於 `tmp/rules-backup-2026-09-30T13-57-54-215Z`。任務權限備份為 `tmp/task-access-backup-2026-09-30T13-59-44-229Z.json`。
- 網站仍等待使用者 push 到 `main`，由既有 GitHub Pages workflow 自動建置發布；未替使用者 push，也未重跑仍指向舊程式的 workflow。此階段伺服器已拒絕越級提交，但正式網站的遮罩需等待新版前端發布。
