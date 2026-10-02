# 卡庫自動同步：原碼交付及啟用手冊

本次差異基於用戶已提交的 `a8f2a2ddf7c8ba0ee9bd889ee8b2f73f22b9380f`。2026-10-02 用戶明確接受 database 級讀寫範圍，批准 WIF/IAM、rules、初始卡庫及 GitHub 啟用。以下是實際進度；原碼仍未 stage、commit 或 push。

## 正式啟用紀錄（2026-10-02）

- 真實 Firebase project number `453548212735`，default database 位於 `asia-east2`；repo ID `1352626201`，owner ID `322858010`，均已唯讀核對。
- 已啟用必要的 IAM、IAM Credentials、STS API。已建立下述專用 SA、WIF pool/provider、自訂角色及兩個 IAM binding，讀回確認只有批准範圍；沒有建立 key、個人 token、Admin/Delete 角色或改動其他 binding。
- 已原子同步 6 張卡及讀回核對；卡庫 hash `dd3d294d5bfd970f16d489a0ce902da9b14ad263ee3878ac320278dbad18ad4f`，來源 cards.json 與上述 commit 一致。
- 已發布全卡 rules，ruleset `projects/history-discovery-center/rulesets/03302d57-706c-44a6-afa0-0c2c72b8f2ec`，讀回 hash `89311f9db82898b145b135e14ee838becd67be1ae2dccdcfe5121e71dc9c396b`。舊 ruleset `b5018f14-ac91-49fb-9d67-f734af766f8b` 已留備份。
- **本機完整 firestore.rules 另外包含尚未上線的獎勵系統規則。本次只將全卡 commit 差異加入現行正式規則，沒有部署獎勵改動。不要直接用完整本機 rules 再次部署。** 精確發布檔為 `tmp/card-catalog-ci-review/firestore-full-card-only.rules`，13 項全卡 emulator 測試通過。CLI 初始化因缺 `@apidevtools/json-schema-ref-parser` 失敗，實際發布使用相同官方 Rules REST API，沒有改依賴或擴權。
- 僅讀取指定兩個 access 的 enabled/studentId 欄位：Tang 已啟用且有 profile 綁定；Lung 沒有 access 記錄，適用已測的 owner 自己 UID fallback。沒有讀取其他學生資料、改寫任何 access/profile 或冒充真人登入。
- 全卡前端 commit 已有 [成功 Pages run](https://github.com/kitlung1107/history-quest/actions/runs/37038857221)。新自動同步 workflow 尚未 push／執行；短效 OIDC 交換及 service account 的實際 Firestore 呼叫仍待首次 CI 驗證。
- **GitHub 三個 environment variables 尚未由本工程設定。** Connector 沒有這項寫入 action；computer-use 所需 node_repl 未提供，亦沒有 gh CLI。已交用戶在既有 `github-pages` environment 設定下方三個非 secret 值。先完成變數，再由用戶 commit/push 九檔差異；最後驗證新 run 的 commit/hash 及兩帳號真人選卡。

本機證據在 `tmp/card-catalog-ci-review/production-verification.json`、`verified-identity-bindings.json`；備份包括 `ruleset-before.json`、`firestore-before.rules`、`iam-policy-before.json` 及 `tmp/full-card-access/catalogue-before-1790963887026.json`。這些含操作紀錄的 tmp 檔不提交 repo。

## 發布行為

指定且已驗證的 Google 帳號 `tangkl@ctshkpcc.edu.hk`、`kitlung1107@gmail.com` 可選所有已啟用卡，不分男／女；後續 CMS 新卡自動產生授權 metadata，不須逐張加 ID 或改帳號。普通學生、停用卡、帳號啟用狀態及管理權沿用既有規則。

`.github/workflows/deploy-pages.yml` 在 main push／main 手動發布時：

1. Build job 做型別、內容及相關單元測試、離線卡庫預覽，建立 Pages artifact；只有 contents/read、pages/read，沒有 Google 身份。
2. Deploy job checkout 同一 `github.sha`，驗證批准開關、repo／main／workflow／event，查 GitHub main 排除舊 commit 重跑。
3. 安裝 lockfile 指定依賴（不跑 lifecycle scripts），以固定 commit 的 Google auth action 取得短效 OIDC ADC。
4. 同步工具再次核對來源及 main，驗證 ADC 對應批准的 WIF provider／專用 SA，原子更新 `cardCatalog/current` 並讀回核對。
5. 保存卡庫 metadata 備份及 receipt（來源 commit／卡庫 hash）30 日；同步成功才發布同次 build 的 Pages artifact。

發布使用同一 concurrency group，不取消執行中的 release；過時 run 停止。同步使用 updateTime／不存在 precondition，拒絕並行覆寫，相同內容不重寫。若新 commit 在檢查後才到達，當前版本可先完成，再由下一次發布更新。Firestore 與 Pages 並非分散式原子交易；同步成功但 Pages 失敗時，保留卡庫備份，修復後重跑最新 main。

**合併這次 workflow 後，未配置或未將 `CARD_CATALOG_SYNC_ENABLED` 設為精確的 `true`，會停止新的 Pages 發布。** 現有網站保留。請把提交時機與下列一次性設定一起安排。

## 啟用前由誰同步

由用戶／Lung 或原有可信任 Firebase 發布操作員負責。Tang 的全卡選用權不包含後端發布權。每次 CMS 卡資料改動，須在同一已審 commit 預覽，另經批准才手動同步後發布網站：

```powershell
node scripts/sync-card-catalog.mjs --dry-run
# 正式寫入：只供另外批准後由既有操作員執行
node scripts/sync-card-catalog.mjs --apply --project history-discovery-center
```

只做首次同步不能保證未來新卡可儲存。下列設定啟用後由 deploy job 接手每次同步，不須每加卡再改程式或帳號。

## 身份設定規格（已按此完成）

專案：`history-discovery-center`。專用 SA：`hq-card-catalog-publisher@history-discovery-center.iam.gserviceaccount.com`；WIF pool：`history-quest-releases`；provider：`github`。以下保留可審設定規格，這些資源已建立。

操作員先唯讀核對 project number、GitHub repository ID／owner ID：

```powershell
gcloud projects describe history-discovery-center --format='value(projectNumber)'
gh api repos/kitlung1107/history-quest --jq '{repository_id: .id, repository_owner_id: .owner.id}'
```

批准後建立／配置專用 SA、pool/provider、自訂角色及兩個 binding，先核對同名資源，避免覆蓋既有設定；只有需要時才啟用 STS、IAM Service Account Credentials、Firestore APIs。

| 項目 | 待批准設定 |
| --- | --- |
| OIDC issuer | `https://token.actions.githubusercontent.com` |
| Attribute mapping | `google.subject=assertion.sub,attribute.repository_id=assertion.repository_id` |
| Provider condition | 下方 CEL，必須填入核對過的數字 ID |
| SA 信任 binding | 只在專用 SA 上給下面 principalSet `roles/iam.workloadIdentityUser` |
| Firestore 自訂角色 | [card-catalog-sync-role.yaml](./card-catalog-sync-role.yaml)，只有 get/create/update |
| 自訂角色 binding | 只給專用 SA，condition 限 default database；沒有 Owner、Editor、Datastore User、Rules/Auth/IAM 管理角色 |

Provider condition（替換 `REPOSITORY_ID`／`OWNER_ID`）：

```text
assertion.repository_id == 'REPOSITORY_ID' &&
assertion.repository_owner_id == 'OWNER_ID' &&
assertion.repository == 'kitlung1107/history-quest' &&
assertion.ref == 'refs/heads/main' &&
assertion.workflow_ref == 'kitlung1107/history-quest/.github/workflows/deploy-pages.yml@refs/heads/main' &&
assertion.sub == 'repo:kitlung1107/history-quest:environment:github-pages' &&
(assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch')
```

SA 的 WIF member：

```text
principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/history-quest-releases/attribute.repository_id/REPOSITORY_ID
```

Firestore role binding 的 condition：

```text
resource.name == 'projects/history-discovery-center/databases/(default)'
```

**IAM 是 database 級限制，不能宣稱為 document allowlist。** 程式固定只讀寫 `cardCatalog/current`，但被攻破的 CI 身份仍可讀取及建立／更新 default database 其他已知路徑的 document；沒有 list/delete 仍不等於學生文件隔離。Firestore client rules 不約束 IAM 寫入。接受這項持續權限是正式批准點；若不能接受，須另審只接受固定卡庫操作的後端服務及其部署。[Firestore IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam)、[database IAM condition](https://docs.cloud.google.com/firestore/native/docs/manage-databases)

角色包含 create 以支援首次建立卡庫。若操作員先建立 document，可改批只 get/update 的常態角色；卡庫被移除時 CI 會停止，須操作員恢復。兩者都不是 document 級 IAM 隔離。

數字 repo/owner ID 條件避免只靠可重用名稱辨識來源。此流程不要求 Domain-Wide Delegation 或額外 Token Creator 角色。[Google WIF](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)、[auth action](https://github.com/google-github-actions/auth)

## Firestore 與 GitHub 啟用步驟

1. 已批准並發布隔離的全卡 rules，詳見上方正式紀錄。自動同步身份沒有 rules 發布權。再次部署前必須比對即時正式版本，不能帶入未批准的本機獎勵規則。

2. 卡庫可由已批准的手動同步建立，或由有 create 權限的首次 CI 同步建立。不修改學生 profile、access 或其他帳號。若 Tang 的既有啟用綁定缺失，應獨立核對及批准。
3. 確認 GitHub 既有 `github-pages` environment 僅允許 main，符合現有審核政策。能改 main／workflow／此 environment 的人是發布信任鏈的一部分。配置三個非 secret 變數：

   | 變數 | 值 |
   | --- | --- |
   | `CARD_CATALOG_WIF_PROVIDER` | `projects/453548212735/locations/global/workloadIdentityPools/history-quest-releases/providers/github` |
   | `CARD_CATALOG_SERVICE_ACCOUNT` | `hq-card-catalog-publisher@history-discovery-center.iam.gserviceaccount.com` |
   | `CARD_CATALOG_SYNC_ENABLED` | `true`（身份、規則及持續寫入已批准；待用戶設定） |

4. 設定變數並由用戶 push 後，在最新 main 首次執行，核對 receipt commit/hash、同步及 Pages step；由用戶真實登入兩指定帳號驗證新卡及跨角色儲存。正式 rules 已發布及讀回，普通學生拒絕測試已在 emulator 通過；真實 OIDC/IAM 呼叫及真人登入尚未驗證。

工具使用 Firebase CLI 的 GoogleAuth ADC／Firestore REST，沒有 Firebase Admin SDK。沒有長期 key 或個人 Firebase token。ADC 只在 runner 產生及清理，gitignore 排除 `gha-creds-*.json`，artifact 只匹配卡庫 metadata。CLI 官方建議 CI 使用 ADC。[Firebase CLI CI](https://firebase.google.com/docs/cli#cli-ci-systems)

暫停時把 enable 改為 `false`，保留現有網站；撤銷 IAM 須考慮已簽發短效 token 的有效期。修復後只重跑最新 main。回退網站需以新 main commit 審查對應 CMS 回退；舊 SHA 重跑會被拒絕。必要時批准的操作員可根據 metadata 備份恢復卡庫。

## 本機驗證及環境限制

本次已通過 8 項發布 guard／卡庫單元測試、1 項同步工具 emulator 回歸（原子替換、移除舊 ID、重跑不重寫）、直接 TypeScript 檢查。指令：

```powershell
node --test scripts/card-catalog-release.test.mjs scripts/card-catalog.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
# 本機 demo emulator 啟動後
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8096'
node --test --test-name-pattern='release tool' scripts/full-card-access-rules.test.mjs
```

測試拒絕未啟用、錯誤 repo/ref/workflow/event、舊 SHA、模擬器混入正式 CI、個人 token、長期 key、錯誤 provider／SA。GitHub API 使用 mock；workflow 靜態測試核對發布順序、固定 auth SHA、build 身份隔離與角色清單。尚未在 GitHub Actions 執行新 workflow。

較早已完成的 69 項功能回歸、34 項 rules emulator 測試及 UI 截圖見 [full-card-access.md](../full-card-access.md)。重連後 Vite 載入 jsx-loc plugin 報 `Cannot find module '@babel/parser'`：pnpm junction 存在，但 parser 的 package.json／lib/index.js 不存在。未修改共享 node_modules、版本或 lockfile。

建議用獨立 disposable checkout、專案指定 pnpm 執行 `pnpm install --frozen-lockfile` 後再 build／preview；本機 store 完整時可加 `--offline`，缺包則需要取得 lockfile 指定包。不要額外加入 parser、刪 lockfile 或修補共享 junction。此修復尚未執行。[pnpm install](https://pnpm.io/cli/install)

## SummaryDescription

把可信卡庫同步接入同次 main 的 Pages 發布：驗證批准開關、來源、OIDC 身份及最新 commit，同步並讀回核對成功才發布網站。加入 CI guard、短效 ADC、測試及備份／receipt。風險知情批准後已設定專用 WIF／最小 IAM、發布隔離全卡 rules、同步初始卡庫並讀回確認；待 GitHub 變數設定、用戶 commit/push、首次自動 run 及真人登入驗證。
