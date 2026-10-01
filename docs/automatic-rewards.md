# 探索幣獎勵提示與後端核算：待確認版本

本次直接修改現有 `history-quest` 專案，新增的 `functions/` 是同一專案的 Firebase 後端。尚未 commit、push、發布網站、部署後端或寫入正式學生資料。

## 預覽與介面

本機測試預覽：<http://127.0.0.1:3000/__home-demo?view=cards&class=S5&rewards=mixed>。全部為合成測試資料，不會提交至正式資料庫。`rewards` 另可選 `fixed`、`tiers`、`progress`、`off`、`unset`、`zero`、`large`。

- 卡片的金額提示在難度左邊，沒有新增框線；開始挑戰後，在難度後方沿用同一款長方形框，窄畫面自然換行。
- 兩處共用 `useTaskCoinRewards` 與 `coinRewardHint`，圖案共用原有 `CoinBalance` 的金幣 SVG。
- 固定獎勵顯示「完成可獲得 X 探索幣」，分級顯示「最高可獲得 X 探索幣」。短答仍交代「老師批改完成後發放」。按最新要求，已移除自動發放字句及獎勵條件按鈕／彈出內容。
- 最高額由原有 `coinAward` 計算，按照實際可達的正式成績及完成程度 100% 評估；分級互斥，選最高符合門檻，不能把獎勵加總或直接選最大單項。題目配分可能令部分成績門檻無法達成，也已納入提示計算。
- 未設定、停用、零獎勵、核算流程未啟用或設定讀取失敗時不顯示可獲金額。已領取者顯示真正帳本金額。

正式資料目前只有冷戰迷宮任務，其附帶舊問卷不視作可領遊戲獎勵的測驗。依用戶決定，冷戰迷宮獎勵保持停用，待可信通關驗證接通後才啟用；預覽中的測驗是額外的本機合成案例。

## 可信核算流程

原網站是靜態前端，沒有可靠的自動派幣後端。新增四個區域為 `asia-east2` 的 Cloud Functions：

1. `settleNewSubmission`：新提交及必要教師批改的資料事件，重新讀取最新提交和教師題庫版本。客觀題由後端重算，短答須全部完成有效教師批改。
2. `settleVerifiedGame`：接收可信遊戲後端的通關證明事件。
3. `settleFinishedGame`：處理場次完成與證明抵達次序不同的情況；瀏覽器完成旗標本身不構成證明。
4. `retryMyReward`：核准學生可重試自己的來源紀錄。請求只接受來源種類及 ID；不接受派幣金額或其他學生 ID。交易內再次檢查本人授權。

核算使用老師現有 `coinRules`，客觀題原始答案與教師版本題庫，以及短答的教師批改。學生上報的分數、進度及金額均不作為派幣依據。普通問卷不能冒充遊戲場次，遊戲附帶測試問卷也不能經測驗途徑領幣。

派幣仍使用 `coinAccounts/{studentId}/entries/{taskId}`，每人每任務首次正數入帳一次。已有正數歷史項目保持不變；舊零幣項目只有在新的合格來源成立時才可升級。未達條件或零獎勵不新增帳本，也不鎖定以後資格。

正式成績、最新進度、正數帳本與 `rewardResults` 在同一 Firestore transaction 提交。餘額繼續從帳本加總，沒有新增獨立餘額欄位。重交、多個來源並行、事件重送、重新整理及安全重試均共用同一任務領取鍵。教師頁載入舊提交不再觸發補派，批改和遊戲頁的手動派幣呼叫已移除。

學生提交結果及歷史頁可查看實際已得探索幣、待批改或核算狀態，並可重試自己的核算。教師工作室新增按學生查看入帳來源、金額及時間的紀錄區。

## 啟用範圍與必要設定

新流程預設關閉。須由可信管理流程建立 `rewardAutomation/status`，包含 `enabled: true` 及 Firestore Timestamp 型別的 `activatedAt`。只有來源紀錄的 `createdAt >= activatedAt` 才適用；舊提交其後獲批改仍不會補派。前端與後端均檢查啟用資料，學生及教師瀏覽器不能修改全域開關。

教師工作室的既有題庫同步新增：

- `rewardPolicies/{taskId}`：兩個公開欄位 `source`、`enabled`。測驗來源為 `assessment`，可核算的測驗才啟用；目前遊戲來源為 `game` 且保持停用。
- `catalogue/{taskId}--{version}`：真正測驗發布 `source: assessment` 的可信題庫；遊戲問卷保留原有批改題庫，但標示 `source: questionnaire` 並排除於獎勵來源。

學生只可讀取符合既有任務／年級權限的單筆獎勵設定，不能列出全部設定；只開放所需的四個規則欄位。自己的帳本及核算結果可讀，其他學生資料、規則寫入、派幣、通關證明及驗證器設定仍被拒絕。

遊戲未來必須增加能可靠驗證「三份文件及出口」的可信服務，才可啟用。該服務以 Admin SDK 寫入 `trustedGameCompletions/{session}`，綁定 UID、學生 ID、遊戲、版本、驗證時間、完成結果及 verifier；對應版本另需可信管理流程建立已核准的 `trustedGameVerifiers/{gameId}--{version}`。兩者均禁止任何瀏覽器寫入。這次只完成探索館的驗證入口及安全派幣流程，沒有修改遊戲專案或冒充已有可靠通關證明。

正式啟用仍需先審閱前端、Firestore rules 與 Cloud Functions，經用戶確認後再另行部署及設定截止時間。沒有提供批量補派腳本；如要補派，須另訂來源範圍及預覽。

## 已完成驗證

相關測試共 **69 項通過**，全部使用明確的本機 `demo-*` 測試專案或純合成資料：

| 測試 | 通過數 | 範圍 |
| --- | ---: | --- |
| `functions/test/rewards.integration.test.ts` | 16 | 固定與分級金額、符合／不符合、停用／缺設定／零幣、完成程度、並行與重送、歷史正數／零幣、教師批改、啟用截止、來源隔離、授權、可信遊戲證明及失敗重試 |
| `functions/test/triggers.integration.test.mjs` | 3 | 真實學生 SDK 提交事件、教師 SDK 批改事件、Functions 事件觸發、本人 callable 重試、匿名與其他學生拒絕、失敗後恢復 |
| 獎勵模型與教學流程回歸 | 41 | 最高額可達性、互斥門檻、成績與教師頁既有行為、遊戲問卷保留批改且不啟用獎勵 |
| 原有探索幣整合測試 | 9 | 帳本、權限、並行去重、歷史零幣與跨任務累積相容性 |

前端及後端 TypeScript 檢查、內容驗證、Vite 正式建置與 Functions 建置均通過。本機 Functions 模擬器使用宿主 Node 24；後端部署設定及編譯目標是 Node 22，正式 Node 22 環境尚未部署驗證。

介面檢查包括 390×844、320×740 手機（含 100,000 金額）、768×1024 iPad 直向、1024×768 iPad 橫向及桌面。固定／分級／短答提示、停用／未設定／零獎勵隱藏、共同金幣圖案、卡片無框、挑戰框樣式及換行均納入檢查。

### 本機重現

從專案根目錄執行；測試內有本機模擬器與 `demo-*` 專案限制。需先啟動對應模擬器，不要改成正式專案。

```powershell
node functions/build.mjs
node node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only functions,firestore,auth --project demo-automatic-events --config firebase.automatic-test.json
```

另一終端執行事件測試：

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082'
node --test functions/test/triggers.integration.test.mjs
```

核心派幣測試使用另開的 Firestore 模擬器 `127.0.0.1:8080`，測試專案固定為 `demo-automatic-coins`：

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
node --experimental-strip-types --test functions/test/rewards.integration.test.ts
node node_modules/vitest/vitest.mjs run --config vitest.coins.config.ts
node --experimental-strip-types --test client/src/lib/coinModel.test.ts client/src/lib/coinRewardHint.test.ts scripts/teaching.test.mjs scripts/admin-refresh.test.mjs scripts/mc-encouragement.test.mjs
```

測試紀錄存於 `tmp/automatic-rewards-tests.log`、`tmp/automatic-trigger-tests.log`、`tmp/coin-rewards-regression.log`、`tmp/coins-legacy-regression.log`。`PERMISSION_DENIED` 是拒絕越權寫入案例的預期結果。
