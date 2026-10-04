# 原 App 小測與 Rules 獎勵整合預覽

> 2026-10-04 正式啟用更新：用戶已批准 main 發布、相容 Rules、私有題庫和派幣開關；以下預覽段落保留原驗收歷史。當前部署順序及回復方式見 [`docs/RULES_ASSESSMENT_ACTIVATION.md`](../../docs/RULES_ASSESSMENT_ACTIVATION.md)。真實 Kitlung 教師身份已唯讀核實，Rules 與石器重溫私有版本已讀回驗證；正式網站與真人结算結果以本輪 CI／Firestore 收據為準。Cloud Functions 服務停用，本輪不部署 Functions，不新增 IAM 或計費。

此版本在獨立 worktree 與分支 `feat/rules-rewards-app-integration` 製作，最初 main 基準為 `17144db47aa2d41d3986ccb3afac0d898af63292`。第一輪版本由用戶提交為 `64d50357f26dc7f58be442cb4d1d4de70d0c45fb`，正式接線準備由用戶提交及推送為 `98eda2428e6585debe685f3ab9e5c5d915f61a6a`。本輪依批准將最新 main 整合至此工作目錄，停在尚未提交的 merge；代理沒有 commit、push 或部署。所有驗收使用本機合成帳戶／探索幣及 demo emulator。正式 `firestore.rules` 與 IAM 未修改；Functions 和發布工作流程有待審的程式草稿，但沒有發布到正式環境。

## 最新 main 整合驗收（2026-10-04）

Summary：整合 main 的抽卡 UI，保留逐題小測、答案總覽、教師批改和私有 CMS；修正並行評分遇到過時檢查點或相同成績已提交時的恢復處理。正式 writer 仍關閉。

Description：從 `98eda242` 執行 `git merge --no-commit --no-ff f172efdee05700db75a1bc87a6983a3e843e91f6`，沒有文字衝突。HEAD 仍為 `98eda242`，MERGE_HEAD 為 `f172efde`；21 個 main 檔案由 merge 暫存。抽卡專用檔案與 main 完全一致，App／Home 同時保留小測和抽卡接線。另有引擎、並行回歸測試及本文三個未暫存修正供審閱，沒有處理另一個抽卡後端 worktree。

| 最新合併版本驗收 | 結果 |
| --- | --- |
| Rules／可信評分／正式準備 | 54 / 54；新增八個獨立 SDK 客戶端同時完成同一新提交 |
| 原 Functions 與協定隔離 | 17 / 17 |
| 原流程與公私匯出回歸 | 69 / 69 |
| HTTP 公開管線 | 3 / 3 |
| 原 App 操作 | 18 + 16 項通過：往返保留、總覽修改、缺題提醒、圖片、30 題、批改和獎勵設定 |
| 真正 Google Auth emulator token／access 接線 | 21 / 21；未處理瀏覽器例外 0 |
| main 抽卡 UI 的實際操作 | 17 / 17；鍵盤完整動畫 319 個繪製影格，手機／iPad、離開重進及減少動態皆通過 |
| 型別／內容／正式旗標關閉的 Vite、server、Functions 建置 | 通過；既有 bundle 大小警告保留 |
| 正式公開產物隔離 | 477 檔、6 組合成題目 ID、私有新版本值外洩 0 |
| 已出版 CMS 的私有 core 輸入 | 精確 2 次本機 GET，版本及 hydration 核對通過，0 寫入 |

原始 Auth 並行失敗的 Rules coverage 顯示 `request.resource.data.checked == d.checked + 1` 為 false，access 已通過；並未證實 map 欄位順序錯誤。新增獨立客戶端測試也重現最後 grade 交易已由另一個完成者提交後的拒絕。修正只在伺服器新讀確認相同 immutable quote 已推進，或同一提交已有完全相同 grade／revision 時續行；其他 permission-denied 仍拋出。原 Rules、coinRules 和單次正數 ledger 政策不變。原先失敗且已封存的提交也實際續傳至 revision 1／100 分，答案及既有正數帳本均未改動。

抽卡首輪的鍵盤與手機失敗屬驗收工具：CDP Enter 缺少原生 char 事件、以及在 Sheet 關閉動畫結束前讀取版面。補正事件及等待後重跑全部 17 項。正式 Home 抽卡保持「尚未啟用」、100 幣按鈕停用；DEV demo 只演示動畫，前後帳本及 ownedCardIds 相同。Java emulator 曾因 zh_HK 驗證訊息資源缺失回傳 500，改以 en_US 啟動後排除；沒有因此改產品程式。

本輪可攜報告在 `tmp/main-integration-review.html`、`tmp/main-integration-evidence.json`，截圖在 `tmp/main-merge-app-qa/`、`tmp/main-merge-auth-qa/`、`tmp/main-merge-draw-qa/`，Library 交付 ID 在 `tmp/main-integration-library-delivery.json`。最初失敗、Rules coverage 摘要及修復後結果分別保留在 `tmp/main-merge-auth-qa/first-concurrency-failure.json`、`tmp/main-integration-checkpoint-diagnosis.json`、`tmp/main-integration-finalizers-first-failure.json`、`tmp/main-integration-rules-results.json` 及 `tmp/main-integration-original-attempt-recovery.json`。三份用戶未追蹤的舊報告 SHA-256 保持不變。

後續抽卡後端接線須另行審核：使用已驗證 access.studentId；新版小測來源標示 `rules-assessment/1`；保留 `coinAccounts/{studentId}/entries/{taskId}` 已有 immutable 正數任務獎勵，不覆寫、補發或用作抽卡扣款。抽卡交易及卡片所有權應有獨立、避免與現有 task ledger 衝突的協定，並保留既有 rewardAutomation 啟用時間。此輪沒有新增該後端或接上正式資料。

## 正式接線準備（98eda242 歷史驗收，預設關閉）

本輪 Summary：準備 Google 登入與 access.studentId 接線、私有題庫出版、受保護核心同步的私有版本輸入，以及新舊評分協定的切換保護；正式開關保持關閉。

本輪 Description：新版提交必須使用已驗證 Google 身分及獲准的 access 映射，不能用 localRole 或自報 studentId 取得正式權限。教師 CMS 先原子儲存 immutable 私有答案及公開版本，核對儲存結果後只下載公開教材 JSON，交由原 Git 審核／發布流程。一般 build 只做公開 core plan；受保護部署階段經原有審核後，精確 GET 已發布版本的私有輸入，缺權限、缺版本或不匹配會停止。普通發布備份不含私有題目答案，歷史 core 版本、索引和授權同步仍沿用現有流程。

Rules 核驗沿用現有 coinRules，並尊重既有 rewardAutomation 啟用時間；不追補舊成績。舊 Functions 增加協定檢查，跳過由新版 Rules 負責的提交與降級偽裝，其他 legacy／遊戲結算保留。唯讀 cutover planner 列出轉換任務、未完成舊提交及已有正數帳本，不改寫資料。相同 taskId 保留每人每任務只一次正數獎勵。

| 本輪驗收 | 實際結果 |
| --- | --- |
| Rules／引擎與正式準備測試 | 53 / 53（45 項相容及評分、8 項正式接線／發布保護） |
| 原 Functions 與協定隔離 | 17 / 17 |
| 原流程回歸與公私管線 | 69 / 69 |
| Google Auth emulator 的原 App 操作 | 21 / 21；未處理瀏覽器例外 0 |
| TypeScript／內容檢查／正式旗標關閉的 Vite build／Functions build | 通過 |
| 正式產物資料隔離 | 464 個檔案，私有新版本值／6 組合成題目 ID 外洩 0 |
| 已出版 CMS 版本的私有 core 輸入 | emulator 精確 2 次 GET，版本核對及 hydration 通過，0 次寫入 |

瀏覽器驗收使用 Google Auth emulator 的真正 Firebase Auth token 及 access 映射，沒有使用 localRole 假身分。覆蓋即時 MC 評分／首次獎勵、同次及不同次並行重試、短答／混合題未批完保持 pending、最後成績與帳本同交易、重複批改、access 撤銷、CMS 實際下載及手機／iPad。Google 正式 OAuth、正式 WIF 權限及正式資料寫入未測。

本輪報告為 `formal-readiness-review.html`（內嵌截圖，可單獨開啟）、`readiness-evidence.json` 及 `formal-library-delivery.json`。原始結果保留於 `tmp/formal-readiness-results.json`、`tmp/formal-legacy-functions-results.txt`、`tmp/formal-regression-results.txt`、`tmp/auth-qa/results.json`、`tmp/formal-artifact-audit.json`。前一輪 `review-record.html`／`evidence.json` 是歷史紀錄。

98eda242 階段只完成 main 抽卡 PR #5 的靜態相容性檢查；本輪已完成上方所列的未提交整合及運行驗收。正式 Rules 與該 main 一致。

## 開啟預覽

- 學生逐題小測：http://127.0.0.1:4201/?localRole=student&assessmentTask=local-assessment-mc-3
- 教師工作室：http://127.0.0.1:4201/admin?localRole=teacher
- 原 App 私有題庫 CMS：http://127.0.0.1:4201/assessment-cms?localRole=teacher
- 我的提交：http://127.0.0.1:4201/submissions?localRole=student
- Google Auth emulator 接線預覽：http://127.0.0.1:4202/?assessmentTask=local-assessment-mc-3
- main 抽卡 UI：在 4201 首頁開啟年級選單，再按「探索幣抽卡」（尚未啟用）
- DEV 抽卡完整動畫：http://127.0.0.1:4201/__coin-draw-demo?view=home （按側欄抽卡入口後可用 Enter）

4201 是便於直接審閱的合成身分預覽。4202 使用正常 AccountGate／Firebase Auth emulator／access 身分映射，測試瀏覽器已登入合成學生；其他瀏覽器可在 Auth emulator 配置合成 Google 帳戶。Firestore 在 8191、Auth 在 9191，均限 loopback。正式 build 的 `VITE_RULES_ASSESSMENT_ENABLED=0`、`VITE_ASSESSMENT_EMULATORS=0`；本機 `.env.local` 不得用於發布。

這是原 App 的 TaskQuiz、教師工作室、探索幣設定與側欄餘額。CMS 私有編輯器位於同一 App 的教師路由；其他教材／卡片 CMS 沿用原工具。本機 CMS 的其他內容連結使用 test-repo，未連上 GitHub 寫入。

小測開始後一次顯示一題。上一題、右下角下一題和題次提示支援任意已發布題數；切換保留答案，最後先進入可修改的答案總覽。未答題會列明題次，最後才由學生按「提交全部答案」。圖片題幹保留，手機及 iPad 也能顯示完整按鈕。

## 第一輪已驗證結果（歷史紀錄）

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

本輪已把下列準備工作落實成可審查程式；啟用仍需用戶批准，順序如下：

1. 最新 main 已依批准整合並完成本機驗收；用戶審閱暫存 merge 及三個未暫存修正後自行提交。正式啟用仍需另外批准。
2. 先批准及部署舊 Functions 的協定隔離草稿，確認 legacy／遊戲仍按原政策處理；讓舊政策可繼續完成 pending 舊提交，同時不接管新版提交。
3. 批准及部署 `compatible.rules` 的具體差異，保留現有遊戲、卡片、profile、舊提交、ledger 及 core 授權。本輪沒有覆蓋正式 `firestore.rules`。
4. 明確批准轉換 taskId 清單、私有新版本的正式儲存，以及正式教師的題庫出版開關；先存私有 key／公開 metadata 並驗證，再審閱公開教材 JSON。保持 taskId，舊提交和正數帳本不轉換、不追補。
5. 核對既有受保護 WIF 執行者是否可 GET 這些精確私有版本，批准 `ASSESSMENT_PRIVATE_INPUT_APPROVED=true`。缺權限先停；這份草稿不新增 IAM。正式 Google OAuth／access 與 WIF 讀取須另行驗證。
6. 在同一已審核版本中，批准啟用 `VITE_RULES_ASSESSMENT_ENABLED=1`，維持 emulator 旗標 0。既有受保護 deploy 先私有 core sync／驗證，再發布 Pages；任何缺版本、不同步或權限失敗都阻止發布。公開教材不先於私有題庫和 core 驗證上線。
7. 依唯讀 cutover 清單完成 pending legacy 提交，批准後才停用已轉換任務的舊 rewardPolicies。保留其他遊戲／任務設定與既有 rewardAutomation 啟用政策，沒有新的後端、獎勵規則或資料回填。

撤回時先批准關閉新版 writer，保留已提交資料／版本／正數 ledger；公開教材與 core 指向必須按同一版本回復，不刪私有 immutable 歷史。一般備份中的私有 payload 已省略；需由仍保留的精確私有版本重新建構。不能用刪帳本或重派作為撤回方式。

實作已保留原核心同步演算法、版本歷史、撤權索引及發布審核機制；新增的私有輸入 adapter 在缺版本或題目 ID 不符時停止。私有 key、版本索引和本機作者快取位於被 Git 忽略且 HTTP 拒絕讀取的 `private-assessments/`，不得放進 Pages 的公開產物。

既有 main／公開 Git 中曾公開的答案不能由這次預覽收回。新資料流保護的是提交前的私有新版本；已提交後的解說可讀且允許重做，仍沿用每人每任務只一次正數獎勵的規則。本次未對舊資料補派或調整獎勵規則。
