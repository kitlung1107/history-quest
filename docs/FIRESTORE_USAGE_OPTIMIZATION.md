# Firestore 用量優化驗收（2026-10-06，Lung）

## 狀態與範圍

此文件記錄開發驗收及發布前檢查。程式修改、emulator baseline／修改後比較、主要回歸及桌面／手機本機預覽已完成；用戶其後批准 commit、push、合併 main 和正式發布。發布結果另於原 Library 報告同一ID更新，不能把此提交前snapshot當成部署確認。

開發驗收全部使用demo emulator，沒有讀寫正式Firestore。發布只沿用既有受保護CI流程對catalogue／已發布私有題目版本作必要核對及同步；不掃描學生名單、不作真實答題／抽卡／派幣測試，不改收費、帳戶、安全權限或安裝新憑證。

- 原 checkout：`C:\AI\歷史探索館網站\history-quest`；核對時無未提交修改，保持原 main checkout。
- 遠端 fetch 核對最新 main：`60c6fc475837f02bfa0cc8d2b3ce769000a5041a`。獨立 worktree 從此版本建立，保留高中鎖定選單及老師抽卡提醒。
- Worktree：`C:\Users\user\Documents\Codex\2026-10-06\task\history-quest-firestore-usage`
- Branch：`perf/firestore-usage-20261006`；以60c6fc4建立，發布commit／merge SHA以最終Library報告及GitHub證據為準。
- 沒有找到適用的 AGENTS.md／.agents 指示；已讀 assessment README、相關測試及既有啟用說明。
- App managed-worktree 附件功能不適用此 delegated 環境；普通 Git worktree 已成功建立，實作不受阻。
- 僅用 `demo-rules-rewards-*` 合成資料及 localhost:8191 emulator。既有 Java／Firestore emulator JAR、pnpm lockfile及套件版本沿用；隔離 worktree 的 dependencies 已補齊，原 node_modules 未改動。

## 實際改動

1. **教師及學生列表讀摘要。** cloudStore 不再對每份 Rules 提交讀版本、答案、評語等詳情；Admin 不再對已有 grade（包括短答 pending grade）呼叫 markSubmission。真正尚未建立 grade 的 sealed 提交仍可續傳／核算。教師點閱及詳細匯出、學生按「載入答案、獎勵及老師評語」才取得詳情。
2. **提交流程重用同次操作的資料。** 讀取 sealed submission／不可變題目版本一次；MC及分級獎勵 checkpoint 直接使用交易回傳的已驗證結果，移除逐題／逐級交易外 GET。成績與派幣提交交易仍重新讀取並驗證可變獎勵設定、checkpoint、progress及ledger。
3. **修正並行續傳 race。** 若另一 client 已合法推進相同 student／task／version 的 checkpoint，只有取得伺服器新 checkpoint 證明後才繼續；沒有此證明的 permission-denied 仍失敗。未改 Rules 或放寬存取。
4. **帳戶管理按需掛載。** 預設不載入全校 profiles／access／studentLogins；展開後以每頁100筆 cursor 查詢讀完整名單，保留既有 CSV／重複帳戶檢查。這不是逐頁 UI：展開後仍讀完整名單；Admin 缺交比較仍需要 profiles，catalogue sync 亦保留。
5. **共用相同 reward 訂閱。** 以 project／身分／學生／班別等 scope 區分共享狀態，task狀態另包含版本；移除 Rules 路徑未使用的 policy 及無任務 automation 訂閱。最後 observer 離開即取消訂閱及清除共享快取；權限錯誤清除已確認獎勵，忽略 cache-only snapshot。
6. **quota／暫存恢復。** pending sessionStorage key 包含 project、UID及student；避免舊身分非同步結果污染新學生；保留第一次 answers／attempt ID，成功或切換身分清理。顯示「未確認上載」與「已上載待核算」，resource-exhausted 停止 online 自動重試，人工恢復沿用同一 attempt。未新增長期本機保存；未提交草稿及關閉分頁後保留仍沒有保證。

## 比較方法與結果

40人是一班合成測試假設，80人為兩班合成假設。authenticatedContext 模擬登入身分，並各讀 access及profile；並非40個瀏覽器執行 Google OAuth。提交均為10題全對MC、固定100幣。baseline 首輪在修改前量度；擴充案例及教師比較從固定 60c6fc4 原始碼重播。測試 instrumentation 計 SDK getDoc／transaction.get 呼叫與已提交寫入，**不是正式計費量**，未計 Rules 相依文件、訂閱 snapshot文件、最小查詢計費或網絡重試帳單。

| 情境／指標 | 原版 | 修改後 | 差異 |
| --- | ---: | ---: | --- |
| 40人提交：應用層文件讀取 | 2,080 | 1,440 | −30.8% |
| 80人提交：應用層文件讀取 | 4,160 | 2,880 | −30.8% |
| 40人登入 access/profile（另計） | 80 | 80 | 相同 |
| 80人登入 access/profile（另計） | 160 | 160 | 相同 |
| 40人提交：交易呼叫／attempts | 1,000／1,000 | 1,000／1,000 | 相同 |
| 40人提交：已提交文件寫入 | 1,120 | 1,120 | 相同 |
| 40人提交：被 Rules 拒絕交易 | 400 | 400 | 保留既有 MC zero probe |
| 80人提交：交易／寫入／拒絕 | 2,000／2,240／800 | 2,000／2,240／800 | 相同 |
| 已完成 attempt 斷線重連：讀取／交易／寫入 | 9／3／0 | 4／2／0 | 不再重複派幣 |

教師完整流程的獨立測量：40份已 graded 提交及43份profile，每次刷新（連續兩次結果相同）：

| 教師刷新指標 | 原版 | 修改後 |
| --- | ---: | ---: |
| 額外直接文件 GET | 640 | 0 |
| 逐份評分交易／交易內讀取 | 80／80 | 0／0 |
| 列表 query呼叫／返回文件 | 2／83 | 2／83 |
| 上述應用層文件讀取合計 | 803 | 83 |
| 點閱一份詳情 | eager已包含 | 5個GET（傳入profile可省1個） |

此教師測量**排除 catalogue sync、登入及reward panels**，803→83是這個明確範圍的減少89.7%，不能當全頁或正式帳單降幅。usage.json另有強制呼叫舊 resettlement API 的診斷；它不代表修改後Admin會呼叫該API。

擴充案例的應用層讀取；交易及已提交寫入維持相同：

| 案例／階段 | 原版 | 修改後 |
| --- | ---: | ---: |
| 10題MC全錯／提交 | 42 | 26 |
| 30題MC全錯／提交 | 82 | 46 |
| 30題MC全對、4級獎勵／提交 | 121 | 80 |
| 10題MC＋短答／提交 | 43 | 28 |
| 10題混合／老師確認總分 | 53 | 32 |
| 30題短答／提交 | 78 | 43 |
| 30題短答／老師確認總分 | 93 | 52 |

8個獨立 client 並行重試同一10題attempt：8個均成功、score100、revision1、ledger僅1筆；一次觀察148個交易呼叫、166次attempt（18次額外重試）、238次應用讀取、32次已提交寫入、68次被拒絕交易。重試數受排程影響，並非固定成本。

訂閱分開計：單個可讀 Rules 任務由4→3次應用層 listener註冊；無任務由1→0；兩個相同doc consumer共用1次註冊，最後離開會unsubscribe。SDK本身可能已共用網絡 target，**註冊減少不能直接換算成Firestore文件讀取或帳單**，亦不假定它是最大效益。

## Rules、安全及計費界限

`firestore.rules`、`protocol.rules`及`compatible.rules`均未改；compatible.rules Git blob仍為 `3b8d0a79008c083161a76d79071a5ae84046a4b3`。MC正確判分、版本一致、sealed答案不可變、短答／混合完成教師確認才派幣、原子成績／派幣、首個正數獎勵不重複均由既有Rules及回歸驗證。

乾淨 emulator 的3題MC probe取得Rules coverage（約1.99MB）。分析可見 access、profiles、taskAccess、assessmentVersions、assessmentKeys、checkpoint及ledger-proof 的 get／getAfter／exists 表達式有正數evalCount。這是Rules依赖仍執行的證據；coverage的巢狀表達式重疊，不能加總成唯一相依文件數或計費讀取，亦未聲稱量得Rules帳單降幅。早前累積coverage report過大返回429是emulator報告大小限制，**不是Spark每日quota**。

37,615與50,043的舊統計不同口徑，沒有將差額歸因Rules或學生。emulator不實施Spark每日50,000讀取帳單；此次quota是應用層錯誤注入驗證，不能保证免費方案永不爆額。日後只可在用戶另行授權的正式觀察中確認帳單改善。

## 驗收

- 原版核心Rules回歸63／63，修改後63／63。
- 40／80人使用量情境2／2；原版與修改後各5個擴充案例5／5；教師刷新比較1／1；8-client並行續傳1／1。
- 相關單元／教學／內容回歸75／75（包括9個新增用量、共享訂閱、quota恢復及身分隔離測試）。
- 覆蓋全對／全錯、30題、短答／混合、分級及停用獎勵、重複點擊／並行finalize、部分MC中斷、真正disableNetwork重連、權限停用／跨身分拒絕、版本及偽造分數／獎勵拒絕、答案與feedback在提交前不可讀；保留高中班別／鎖定及既有獎勵回歸。
- TypeScript `--noEmit --incremental false`、內容驗證、Vite＋server esbuild、git diff --check 通過。build在 `VITE_ASSESSMENT_EMULATORS=1` 本機合成fixture模式執行；**不是正式發布產物**。既有大bundle警告仍存在。
- Edge本機1440px桌面、390px手機：教師摘要→按需詳情→混合題教師確認→學生按需讀評語／獎勵、帳戶名單展開；手機document scrollWidth375≤390，無整頁橫向溢出。
- 離線CMS HTTP public-pipeline **3／3通過**：拒絕私有欄位、未發佈版本、改動題目及外部Origin；JSON／raw／import不含私有值、HTTP私有路徑403；缺失或不匹配private input安全停止。
- 補建**明確合成**的CMS public export，從既有本機30題fixture建立新的demo版本，經localhost HTTP出版；不冒充Google登入產物。artifact audit加入 `--synthetic` 模式，結果明示 `authenticatedCMSPublicExport:false` 及 `releaseArtifact:false`。
- 另建本機emulator模式靜態artifact；建置期間暫存6個local fixture並在finally恢复，掃描479個檔案、3個私有字串及6個fixture ID，0洩漏。exact resolver只向localhost demo版本GET兩次，版本綁定與hydrate通過；Rules未變。注入私有marker／fixture ID的負向probe會被拒絕，清除後重新審計通過。證據只涵蓋合成私有版本及此次本機artifact，既有legacy公開答案不在保密範圍。
- 完整Google OAuth／Auth emulator瀏覽器套件及40個真實瀏覽器登入仍**未測**；此次補測不需要正式資料，沒有用正式DB補測，也不代表正式登入CMS或最終發布產物已驗收。
- 發布前另以正式flags（emulators=0、Rules assessment=1、card draw=1、GitHub Pages base）建置實際CMS內容；`scripts/audit-release-artifact.mjs`檢查480個檔案，無local fixture／synthetic值，正式project及公開版本存在，保留入口JS／CSS hash。此離線審計不讀私有key；authoritative private binding仍須exact-commit受保護core-sync CI成功。workflow已加入此產物gate、receipt artifact及用量回歸，不改既有WIF／IAM或catalogue規則。

## 本機證據與重跑

證據保留在worktree的ignored `tmp`，不包含真實學生資料：

- `tmp/usage/before.json`、`after.json`：班級baseline／after。
- `tmp/usage/teacher.json`：原版與修改後教師刷新。
- `tmp/usage/before-extended.json`、`after-extended.json`、`after-concurrent.json`。
- `tmp/usage/subscriptions.json`、`rules-coverage.json`、`rules-dependent-evidence.json`。
- `tmp/usage/cms-public-export.json`、`cms-http-fixture.json`、`cms-http-tests.txt`、`cms-artifact-audit.json`、`cms-negative-probe.json`及`cms-artifact-build.txt`：合成CMS／artifact收尾證據。
- `tmp/baseline-regression.json`、`tmp/after-regression.json`、`tmp/usage-unit-results.txt`、`tmp/usage-build.txt`及各usage JSON test結果。
- `tmp/usage/teacher-desktop.jpg`、`teacher-mixed-detail.jpg`、`teacher-mobile.jpg`、`student-desktop.jpg`、`student-mobile.jpg`。

在獨立worktree以PowerShell操作，先啟動既有emulator：

```powershell
& 'C:\AI\歷史探索館網站\history-quest\tmp\java\jdk-21.0.12.1+1-jre\bin\java.exe' -Duser.language=en -Duser.country=US -jar 'C:\AI\歷史探索館網站\history-quest\tmp\cloud-firestore-emulator-v1.22.0.jar' --host 127.0.0.1 --port 8191 --project_id demo-rules-rewards-usage
node node_modules/vitest/vitest.mjs run --config integration/assessment/vitest.config.ts
node node_modules/vitest/vitest.mjs run --config integration/assessment/usage.vitest.config.ts
$env:USAGE_EXTENDED='1'
node node_modules/vitest/vitest.mjs run --config integration/assessment/usage.vitest.config.ts
Remove-Item Env:USAGE_EXTENDED
$env:USAGE_CONCURRENT='1'
node node_modules/vitest/vitest.mjs run --config integration/assessment/usage.vitest.config.ts
Remove-Item Env:USAGE_CONCURRENT
$env:USAGE_TEACHER='1'
node node_modules/vitest/vitest.mjs run --config integration/assessment/usage.vitest.config.ts
Remove-Item Env:USAGE_TEACHER
node --experimental-strip-types --test scripts/firestore-usage.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

baseline重播：設 `USAGE_PHASE=before-replay`（或配合USAGE_EXTENDED），測試直接讀固定Git commit的原版source；解除USAGE_PHASE再測修改後，測量output檔名依phase而變。不要同時執行會clear同一demo project的測試。

CMS離線補測（localhost Vite與demo emulator需先啟動）：`node tmp/usage/cms-http-fixture.mjs`，`node --test integration/assessment/public-pipeline.test.mjs`，`node tmp/usage/cms-artifact-run.mjs`，`node tmp/usage/cms-negative-probe.mjs`。fixture來源及輸出均標成synthetic，不寫入`tmp/auth-qa/public-export.json`冒充登入證據。

本機預覽：既有ignored `.env.local` 設emulator模式；`node integration/assessment/seed-app.mjs` 及 `node tmp/usage/seed-preview.mjs` 只建立合成fixture／答案，然後 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4201 --strictPort`。教師 `http://127.0.0.1:4201/admin?localRole=teacher`，學生 `/submissions?localRole=student`。seed/check-content會產生本機fixture和index；正式發布前需移走ignored local fixture、重新產生正式內容index及另跑正式模式build，不能直接發布此次dist。

## 可複製 summary

優化 Firestore 提交及教師列表讀取，保留 Rules 驗證與原子派幣

## 可複製 description

教師及學生列表改讀提交摘要，答案、評語和獎勵詳情按需載入；完成提交不再於教師刷新時重新評分。提交流程重用不可變題目版本及交易回傳checkpoint，修正同attempt並行續傳，保留Rules判分、版本一致、教師確認及原子成績／派幣。帳戶名單按需載入，共用相同reward訂閱；quota錯誤停止自動重試，沿原answers及attempt ID人工恢復。

emulator合成40人交10題MC的應用層讀取由2,080降至1,440（−30.8%），80人4,160降至2,880；教師40份完成提交刷新在排除catalogue／登入／reward panels的測量範圍由803降至83次文件讀取。交易／寫入及Rules保持原有驗證，這些數字不是正式計費值。核心Rules63／63、相關單元75／75、擴充／並行／教師比較、TypeScript和本機build通過，桌面手機預覽完成。CMS HTTP 3／3及明確合成的artifact審計通過，另加入正式artifact無網絡審計及receipt；authoritative私有版本綁定仍由受保護release CI核對。完整OAuth／40browser登入仍未測，帳戶展開仍讀完整名單，暫存仍限sessionStorage。
