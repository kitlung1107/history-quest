# 原 App 小測與 Rules 獎勵整合預覽

此版本在獨立 worktree 與分支 `feat/rules-rewards-app-integration` 製作，基準 main 為 `17144db47aa2d41d3986ccb3afac0d898af63292`。所有操作使用本機合成帳戶與 `demo-rules-rewards-app`；未 commit、push、merge 或部署，正式 `firestore.rules`、Functions、IAM 和發布工作流程均未修改。

## 開啟預覽

- 學生逐題小測：http://127.0.0.1:4201/?localRole=student&assessmentTask=local-assessment-mc-3
- 教師工作室：http://127.0.0.1:4201/admin?localRole=teacher
- 原 App 私有題庫 CMS：http://127.0.0.1:4201/assessment-cms?localRole=teacher
- 我的提交：http://127.0.0.1:4201/submissions?localRole=student

這是原 App 的 TaskQuiz、教師工作室、探索幣設定與側欄餘額。CMS 私有編輯器位於同一 App 的教師路由；其他教材／卡片 CMS 沿用原工具。本機 CMS 的其他內容連結使用 test-repo，未連上 GitHub 寫入。

小測開始後一次顯示一題。上一題、右下角下一題和題次提示支援任意已發布題數；切換保留答案，最後先進入可修改的答案總覽。未答題會列明題次，最後才由學生按「提交全部答案」。圖片題幹保留，手機及 iPad 也能顯示完整按鈕。

## 已驗證結果

| 項目 | 結果 |
| --- | --- |
| 相容 Rules、可信評分、四捨五入、防偽造／重試／舊流程 | 原 38 項通過；新增 CMS 3／10／30 題與遊戲問卷排除共 4 項通過，合計 42 個不同測試 |
| 原核心同步、教師工作室、MC 回饋、CMS 編輯器等回歸 | 60 項通過 |
| 公私匯出／HTTP 入口／私有核心題庫輸入 | 9 項通過 |
| 原 App 瀏覽器操作 | 18 項 + 剩餘流程 15 項 + 最終版面／截圖 3 項通過 |
| 型別、內容、建置 | TypeScript、check-content、Vite build 通過 |
| 核心同步 | dry-run 通過；不列舉遠端資料、不寫入正式專案 |

MC 2/3 的正式分數為 67，按現有級別獎勵派 50 幣。混合與純短答未完成全部配分前保持 pending；教師最後儲存完成後，正式 grade 與首次正數 ledger 同一交易，重複儲存沒有加版本或派第二次。評語透過原工作室顯示於「我的提交」，儲存重試保留相同批改內容。

CMS 已實際儲存私有 key 與公開版本，再匯出只有題幹、選項、配分、圖片及 opaque version 的公開教材。30 題 CMS 儲存與學生逐題作答亦已完成驗收。原探索幣設定編輯器已儲存 77 幣設定，新 CMS MC 按該設定結算；已有正數獎勵的任務不追加或補差額。最終側欄顯示合成帳本總額 427。

實際證據在 `evidence.json` 與可單獨開啟的 `review-record.html`；兩者是本機驗收產物。測試原始結果位於 `tmp/compatibility-results.json`、`tmp/cms-rules-results.json`、`tmp/game-scope-results.json`、`tmp/app-qa/`、`tmp/legacy-regression.txt` 與 `tmp/public-pipeline-results.txt`。交付截圖及可攜驗收文件另存入 Library，確認 ID 會在交付訊息列出。

## 資料與提交流程

1. 公開題目從已發布的 `assessmentVersions/{task--version}` 讀取，私有答案位於不可列舉的 `assessmentKeys/{task--version}`。
2. 先封存 immutable 原始答案及 attempt ID，再逐題讓 Rules 驗證 MC 得分；短答不自動判分。
3. Rules 驗證分數及現有 coinRules 級別，最後以單一交易寫正式 grade、符合資格的正數 ledger 及最新 progress。
4. 混合／短答的教師配分使用相同核驗及結算程序。既有正數 ledger immutable；0 幣、未合格或未啟用不鎖定日後資格。
5. 提交完成後才授權讀取該版本的答案解說。未完成的提交和批改保留相同 ID／版本供續傳；permission-denied 會明示規則拒絕，不誤導成重連便能解決。

評分／獎勵不是在瀏覽器自行計算後直接接受：每一步都有 Rules 核驗。Rules 本身只允許或拒絕寫入，因此需要多個有上限的交易；目前上限為 30 題及 20 個獎勵級別，並非硬編十題。分數 Rules 使用 `100.0` 浮點運算，與 JavaScript 的四捨五入一致。

原遊戲紀錄、卡片權限及舊提交的規則保留。遊戲問卷的私有資料只供既有核心同步使用，其 assessment metadata 停用，不進入此自動小測獎勵流程。

## 重新啟動與檢查

工作目錄為 `C:\AI\歷史探索館網站\history-quest-rules-rewards-app-integration`。目前 `.env.local` 為 `VITE_ASSESSMENT_EMULATORS=1`，Firestore emulator 位於 `127.0.0.1:8191`，Vite 位於 4201。假身份和 localhost 傳輸只在該明確旗標啟用，使用固定 demo project；遠端主機會拒絕本機模式。

```powershell
node integration/assessment/build-compatible-rules.mjs
node integration/assessment/load-app-rules.mjs
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4201 --strictPort
```

全新本機專案可先執行 `node integration/assessment/seed-app.mjs`；它不清除提交，並保留既有探索幣設定與 CMS 已發布版本。測試使用不同的 `demo-rules-rewards-integration-tests`，不清除正在審閱的 App／原型專案。

```powershell
node node_modules/vitest/vitest.mjs run --config integration/assessment/vitest.config.ts
node --test integration/assessment/export-content.test.mjs integration/assessment/public-pipeline.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-content.mjs
node --experimental-strip-types scripts/sync-core-catalogue.mjs --dry-run
```

HTTP 管線測試需先開啟 4201 並完成合成 MC 30 教材的 CMS 儲存。瀏覽器測試使用自有 headless Chrome profile／9297，不操作使用者平日瀏覽器。

## 正式啟用仍需另外審核的內容

這次完成的是可操作的本機原 App 整合。正式站繼續沿用 main 現有流程。`compatible.rules` 是待審的相容版本，`rules-compatibility.diff` 只展示需要合併的差異，並未覆蓋正式規則。

正式啟用前需另審：相容 Rules 合併與正式身份傳輸；私有版本先發布、公開教材後發布的受保護管線；核心同步執行環境提供相同私有版本輸入；以及逐一停用轉換任務的舊 `rewardPolicies.enabled`，避免現有 Functions 仍嘗試按 legacy catalogue 核算新協定。停用只針對經審核轉換的 assessment 任務，其他遊戲／任務保持原設定，無需增設新的後端服務。

實作已保留原核心同步演算法、版本歷史、撤權索引及發布審核機制；新增的私有輸入 adapter 在缺版本或題目 ID 不符時停止。私有 key、版本索引和本機作者快取位於被 Git 忽略且 HTTP 拒絕讀取的 `private-assessments/`，不得放進 Pages 的公開產物。

既有 main／公開 Git 中曾公開的答案不能由這次預覽收回。新資料流保護的是提交前的私有新版本；已提交後的解說可讀且允許重做，仍沿用每人每任務只一次正數獎勵的規則。本次未對舊資料補派或調整獎勵規則。
