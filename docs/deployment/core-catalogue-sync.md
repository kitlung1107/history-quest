# 核心教材同步修正（已批准，待推送發布）

分支 `fix/core-teaching-sync`，獨立 worktree `history-quest-core-sync-fix`，基準 main `1a3cf79`。沒有改逐題介面、reward backend/rules、學生資料或探索幣；沒有 commit/push/deploy。現有待傳分頁不操作。

## 正式啟用設定紀錄（2026-10-03）

用戶已批准無list方案、409條已審明確教材metadata核對/缺漏同步及GitHub開關。最新main即時讀回仍為 `1a3cf79d513399cb2cf0c773db96dc228d69b511`；本機CMS/遊戲原JSON未改，離線計劃與已審清單一致。

已在既有 `github-pages` environment新增並讀回確認 `CORE_CATALOG_SYNC_ENABLED=true`，GitHub建立/更新時間 `2026-10-03T11:04:26Z`（香港19:04:26）。既有3個CARD_CATALOG變數核對一致，WIF仍限指定repo/main/workflow/environment；正式自訂角色即時讀回只有get/create/update。沒有改IAM、list、rules、API、計費或獎勵。

本輪正式教材metadata實際核對0份、寫入0份。已上線main尚無核心同步步驟，本地15檔未提交，故409條同步待用戶自行推送後由新workflow執行；沒有手動繞過workflow或觸發舊workflow。此前已批准的石器兩文件修復保持原狀。設定讀回收據 `tmp/core-sync-review/core-enablement-receipt.json`、前置核對 `core-enablement-preflight.json`，均不提交；憑證只留程序記憶體，沒有另存token。

## 已確認原因與本批行為

正式規則 `03302d57-706c-44a6-afa0-0c2c72b8f2ec`，SHA256 `89311f9db82898b145b135e14ee838becd67be1ae2dccdcfe5121e71dc9c396b`。交卷規則與main相同。石器小測授權文件與 `902a7d42` 題庫缺失；舊 `syncCatalogue` 把正式尚未允許的 `rewardPolicies` 放入核心metadata同一batch，令整批失敗。

現在教師同步只補齊核心metadata，不寫rewardPolicies。共用同步器涵蓋所有當前公開CMS教材；每項教材的題庫、遊戲manifest/答案、taskAccess與固定教材索引同一原子交易。新題目產生新版本，舊版本保留；相同版本內容不符即停止，不能覆蓋歷史題目。單項失敗不產生只有授權而沒有題庫的新教材，已完成其他教材保留，重試安全。未啟用自動派幣。

教師舊頁可能持有舊CMS內容，因此教師端採 repairOnly：可補缺資料，但不改已存在授權或發布索引；授權缺失時使用索引中的年級與停用狀態。索引已存在但教材ID未收錄時，舊頁修補停止，不自行授權。首次索引尚未建立時保留既有修補功能；首次正式遷移會為明確已刪除ID建立停用授權，防止並行舊頁重建啟用授權。授權年級與停用變更由精確main的CMS發布流程處理。

CMS發布前，新的核心publisher驗證當前main、OIDC身份及獨立開關；把新教材metadata同步並讀回，成功才可發布Pages。CMS中隱藏/刪除教材、隱藏主題或年級，會先停用明確ID的不再公開taskAccess，並保留索引內的停用與版本紀錄；題庫及歷史紀錄保留。遊戲版本停用不自動重新啟用。

## 不列舉資料庫的索引與遷移

固定文件為 `catalogue/core-sync-index-v1`：`schemaVersion:1`，`tasks` map按明確教材ID記錄年級、enabled及已同步題庫/遊戲版本路徑。REST publisher只有指定document GET與帶precondition的commit；已移除ListDocuments、collection query及pageToken。教師SDK亦改成指定document讀取。僅需既有 `datastore.entities.get/create/update`，不新增 `datastore.entities.list`；沒有改WIF、IAM binding、自訂角色、rules或API。

首次遷移的明確ID清單為 `scripts/core-catalogue-legacy-ids.json`，來自main `1a3cf79`可到達的CMS任務歷史，沒有下載Firestore清單：

- 目前公開：石器小測、`S5_ColdWar_Maze`。
- 歷史已刪除：`S1_AncientCivilisations_EgyptQuiz`、`S3_HK_Battle1941_Quiz`、`S3_HK_EarlyDevelopment_Reading`。最後一項的歷史topic年級為2；若授權已存在，撤權保留其既有有效年級。

每次發布只跟進固定索引、遷移清單及當前CMS全部明確ID（含隱藏教材）。已刪除的3項會核對/建立停用授權與索引紀錄；即使授權原本不存在，也保留停用文件來避免舊頁競態重新授權。以後每項成功發布的教材立即原子註冊，因此下次刪除仍可由索引找到；部分發布失敗和重跑不遺失已完成項目。

限制：不在CMS歷史、當前CMS或索引中的舊手動授權，無法自動識別，可能仍enabled；本批不擅自讀寫它們。若日後取得確定ID，須獨立核對後加入明確遷移清單，不能聲稱已清理所有孤兒。版本路徑從首次索引發布起累積；更早的題庫留在原處，索引不保證收錄其全部版本。索引達2000項或JSON約500KB時停止，須另做分片設計，不截斷停用/歷史紀錄。

新增固定索引沿用既有catalogue教師規則，學生不能讀寫。既有服務帳號IAM仍是default database級的get/create/update，程式路徑限制不等同document級IAM隔離；這次沒有擴大權限。

已接通遊戲採用 `client/src/lib/games/*.json` 版本manifest，registry自動載入。新增遊戲須同時提供與公開game任務相符的manifest及既有事件協定。單純在CMS貼外部遊戲URL不會憑空生成學習紀錄或可信通關證明；此修正保障已接通遊戲的題庫/授權/完成紀錄同步，不部署獎勵驗證服務。

## 已批准並完成的石器小測修復

用戶已明確批准補回以下兩份缺失metadata。執行前逐項確認不存在，並核對GitHub當前main的原題庫；以單一原子交易新增，使用「文件必須不存在」的前置條件。正式寫入時間為 `2026-10-03T09:58:37.044562Z`（香港17:58:37），兩份文件均已讀回核對成功：

- `taskAccess/task_c1cc8f27-d16d-4cd9-8efd-9cccfc7dfdce_aa2ed830`：`grade:1, enabled:true`。
- `catalogue/task_c1cc8f27-d16d-4cd9-8efd-9cccfc7dfdce_aa2ed830--902a7d42`：repo原10題、原配分及答案、原標題、`source:assessment`。

僅新增上述兩份文件；沒有修改學生答案、成績、Firestore規則或獎勵。正式修復收據為 `tmp/core-sync-review/stone-production-repair-receipt.json`，前置快照為 `stone-production-before.json`，執行腳本為 `apply-stone-repair.mjs`，均不提交。沒有操作用戶瀏覽器或實際提交學生答案；用戶可重新作答或重試，實際登入帳戶交卷仍待確認。

通用CLI另備有 `--repair-task` 模式，只操作指定當前公開教材；不撤銷其他授權，不改已有授權值，不覆蓋既有同版本題庫。默認dry-run不取憑證/不連線。本次緊急修復使用已凍結、已審核的兩文件專用腳本，通用全量 `--apply` 尚未批准或執行。

## 通用修正已批准的正式範圍（待新workflow執行）

用戶已批准下列範圍；程式碼仍由用戶自行提交發布：

- 合併本批程式/workflow，由用戶自行commit/push/merge。
- 正式核心metadata寫入範圍僅明確 `taskAccess/{taskId}`、`catalogue/{taskId}--{version}`、`gameCatalog/{gameId}/versions/{version}`及其questions，加上固定 `catalogue/core-sync-index-v1`；保留舊版本，不刪資料。
- 當前教材plan仍為405份：石器小測2份；冷戰遊戲含原問卷catalogue、400道repo既有題目、manifest、taskAccess共403份。另核對1份固定索引及3份歷史停用授權，首次共409條明確路徑。這是核對範圍，不是強制409次寫入；相同既有題庫不重寫，缺漏才新增，同版本不符停止。發布仍須更新年級/停用授權與索引；不能把完整發布承諾簡化成永遠只建立不存在文件。
- 在既有 `github-pages` environment的 `CORE_CATALOG_SYNC_ENABLED=true` 已設定並讀回。新workflow會在取得OIDC/寫入前檢查此批准；開關未設時Pages發布停止。
- 沿用既有專用WIF/IAM身份及get/create/update，不要求list。將卡庫發布服務帳號用於三個核心metadata集合及固定索引的用途已批准。若實際IAM拒絕，停止，不繞過或自動擴權。

不涉及 `access/profiles/submissions/progress/gameSessions/coinAccounts/rewardPolicies/rewardAutomation/rewardResults/trustedGameCompletions` 的正式寫入。沒有必要修改Firestore rules、計費方案或Functions API。

## 驗證與限制

使用讀回正式rules及既有Java/Firestore emulator，合成帳號在 `demo-core-catalogue` / `127.0.0.1:8190`：新增quiz前拒絕/同步後可提交與重試；新遊戲start/answer/end與事件去重；短答待批無幣；quiz/game版本保留；隱藏撤銷；年級修改；停用/未驗證/匿名/他人身份拒絕；學生不能自行同步或看他人答案；部分失敗原子性；真正400題冷戰題庫及其實際題目事件；REST publisher讀回/no-op。REST請求守衛拒絕集合或查詢路徑，僅接受精確GET/commit；emulator的owner身份不是正式WIF/IAM實測。

CMS合成fixture使用與網站HISTORY_TASKS相同publicTasks/publicTopics過濾及正式publisher讀取入口：公開→學生小測提交/遊戲完成紀錄；停用/刪除→網站資料不再包含教材，新增交卷、新遊戲start、已開場次後續answer/end均被正式規則拒絕。已存在的同attempt/同event重送只確認既有紀錄，不新增紀錄。舊教師頁修補及與撤權並行的REST修補不能重新啟用；hidden topic/grade與重新公開亦有測試。

已開分頁不會即時抹掉題目或答案；重新讀取網站後教材會消失。停用寫入正式taskAccess後，學生未成功的新交卷及遊戲紀錄由rules拒絕，既有待傳隊列保留，不會靠重試恢復授權。舊已成功紀錄及原題庫保留；teacher既有管理例外沒有改動。本批不涵蓋任意外部遊戲、派幣服務或計費升級。

命令：`FIRESTORE_EMULATOR_HOST=127.0.0.1:8190 CORE_TEST_RULES=<下載正式rules路徑> node --experimental-strip-types --test scripts/core-catalogue.integration.test.mjs`。本機規則副本及結果在 `tmp/core-sync-review`，不提交。

本輪無list結果：核心單元18/18、教師回歸33/33、原發布guard5/5、教材模型3/3、遊戲模型3/3，另有正式規則emulator14/14，共76項通過。TypeScript、正式build及diff檢查通過；build只有既有大chunk警告。日誌在 `tmp/core-sync-review/unit-no-list.log`、`integration-no-list.log`、`build-no-list.log`。石器小測兩份正式metadata新增及讀回已成功；通用publisher的正式OIDC與全量寫入尚未測，真人CMS/網站/實際遊戲操作及pending重試亦未操作。本機測試用共用網站資料過濾及真實client提交函式，不是正式真人瀏覽器端到端驗收。本機通過與metadata讀回不等同真人交卷成功，後者仍待用戶帳戶確認。

## 最少部署步驟與提交文字

1. 正式用途及上述明確metadata範圍（包含固定索引與3份歷史停用授權）已批准；不新增IAM/list，不改rules或計費。
2. `github-pages` environment的 `CORE_CATALOG_SYNC_ENABLED=true` 已新增/讀回，已有3個 `CARD_CATALOG_*`變數已核對。無需再次設定或擴權。
3. 用戶自行提交本分支、整合至main並push。確認最新main run核心同步/讀回、metadata receipt及Pages成功，再以真實學生帳戶驗收公開小測與已接通遊戲的紀錄；停用/刪除另驗收已開分頁拒絕新增紀錄。

Summary：修正核心教材同步，以明確ID及版本索引追蹤發布與撤回。

Description：教師同步只補核心metadata；CMS發布以既有get/create/update同步授權、版本題庫及已接通遊戲，使用固定索引追蹤隱藏/刪除，不列舉Firestore。每項教材與索引原子寫入，保留歷史題庫與停用紀錄；同步讀回成功才發布Pages。沒有改評分或獎勵規則。
