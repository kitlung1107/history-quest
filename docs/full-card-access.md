# 指定帳號全卡使用權（本機工程交付）

後續狀態：用戶已提交全卡功能為 `a8f2a2ddf7c8ba0ee9bd889ee8b2f73f22b9380f`。下文原始基準及驗證紀錄保留；新一輪未提交的自動發布差異及啟用要求見 [卡庫自動同步手冊](deployment/card-catalog-auto-sync.md)。

2026-10-02 正式批准後：專用 WIF/IAM、初始 6 卡卡庫及全卡 rules 已部署並讀回核對；GitHub 變數、用戶 push 新 workflow、首次 CI 與真人登入仍待完成。實際只發布從現行規則加上全卡差異的隔離版本，**沒有包含本機另有的獎勵系統改動；下方舊的完整 rules 部署命令不可直接照做**。精確 ruleset、備份及證據見自動同步手冊。

本次基準：`956a81b8e528c8f478c28c5cb391fef06c29a1c8`。未 stage、commit、push、部署 Firebase 規則或修改正式帳號資料。StoneAge 卡庫、背景、圖片及其他 worktree 不在本功能 review patch 內。

既有 `check-content.mjs` 會執行 `build-content-index.mjs`；驗證時重建了 `client/public/cms/content-index.json`，補回現有背景／教材圖片引用。這個產生檔差異另列、保留，沒有自行還原，也不包含在本功能 review patch。請勿使用整個 checkout 的全部差異當成本功能範圍。

## 行為及信任邊界

- 僅 `tangkl@ctshkpcc.edu.hk`、`kitlung1107@gmail.com` 的已驗證 Google Firebase 身份有全卡選用資格；前端從 ID-token claims 判斷，Firestore 再獨立檢查。
- 必須有已啟用且指向本人 profile 的 `access/{email}`。既有 owner 沒有 access 記錄時，僅可使用自己 Auth UID 的 profile；存在但停用或指向別人的 access 不會走此 fallback。
- 可選所有已啟用卡，包含不同男／女角色卡。固定角色、原有 earned `ownedCardIds`、班別、姓名及學號不因換卡而改動。全卡資格不存入可由客戶端提交的 profile 欄位。
- 普通學生仍獲同角色 starter；1A–1E 仍加送同角色 Nile。`testing` 旗標不授予全卡資格。
- 不變更 `teacher()`、CMS、名冊、年級、成績、探索幣或其他管理權。`kitlung1107@gmail.com` 原本已有的管理權維持原樣；沒有授予 Tang 管理權。
- 已保存但其後移除／停用的卡，在目前卡庫 UI 不再顯示；規則允許保留其既有 cardId 做贈卡補齊或原有教師名冊編輯，避免鎖死帳號。此例外要求原來已有固定角色且角色不變，不能用舊版無角色資料啟用未知卡；離開該卡後不能重新選回。
- ID-token 變更會重新載入身份。access 記錄的停用／移除／改綁會讓 UI 重新檢查，Firestore 亦拒絕新的全卡選擇。這不聲稱 Firebase Console 停用 Auth 使用者可即時撤銷已簽發 token；本次停用測試指 `access.enabled`。
- owner 尚未有個人 profile 時，按「儲存卡片」才建立自己 profile；不會在登入時建立學生或授權帳號。

## 可信卡庫

規則只為新全卡選擇讀取 `cardCatalog/current`，內容是單一原子快照：

```text
schemaVersion: 1
sourceSha256: SHA-256 of normalized card metadata
cards: { <CMS card ID>: { enabled: boolean, role: studentBoy | studentGirl } }
```

一般客戶端（包括既有 owner）不能讀寫此集合。同步工具使用已存在的 Firebase CLI 管理身份／IAM 寫入；程式沒有建立新身份、秘密或權限。只讀寫這一個卡庫文件，不讀寫 access、profiles 或學生紀錄。SHA 是來源辨識，並非客戶端授權依據。

`scripts/sync-card-catalog.mjs` 預設完全離線 dry-run，從當前 CMS `cards.json` 自動產生所有卡 metadata；沒有硬編碼卡 ID。明確 `--apply --project ...` 才載入 CLI 身份及連線。更新先備份卡庫文件，以 updateTime／不存在 precondition 作原子替換，再讀回驗證；移除的卡 ID 亦會移除，重複同步相同內容不寫入。檢查失敗不會部分寫入。卡庫過大時明確停止。

```powershell
# 安全的本機方案預覽，無網絡或憑證存取
node scripts/sync-card-catalog.mjs --dry-run
```

## 尚未執行的發布步驟（需要另行批准）

1. 確定將發布的原碼／CMS commit，檢查上述 dry-run，確認仍只有兩個指定 email；確認 Tang 已有正確啟用綁定。今次沒有讀取正式帳號以確認此事，也沒有替其建立綁定。
2. 批准後，使用既有受信任的 Firebase CLI 身份同步該 commit 的卡庫：

   ```powershell
   node scripts/sync-card-catalog.mjs --apply --project history-discovery-center
   ```

3. 審批本次 `firestore.rules` 後，僅發布 Firestore rules：

   ```powershell
   pnpm exec firebase deploy --only firestore:rules --project history-discovery-center
   ```

4. 再依使用者既有 GitHub 發布流程發布前端，驗證兩指定身份及普通學生。無需 Firebase Functions、indexes、Storage rules 或帳號批次遷移。

以上命令是待批准的操作說明，工程期間未執行。

| 發布狀態 | 實際效果 |
| --- | --- |
| 只有本機原碼 | 正式網站及帳號權限完全不變 |
| 只發布前端，仍用舊規則 | 指定身份可看到全卡選擇／本地即時卡片預覽；未擁有卡的雲端儲存被舊規則拒絕 |
| 新規則及卡庫已發布，前端仍舊版 | 後端已具備資格，舊前端仍按原選卡清單 |
| 前端、新規則、卡庫全部發布 | 指定已啟用身份可跨角色選卡、儲存並顯示相應首頁背景 |
| 日後 CMS 加卡但沒有同步可信卡庫 | 新前端會列出該卡，但後端拒絕其新的儲存，直到同步成功 |

**後續更新：自動同步 workflow 原碼已補齊，啟用設定尚未執行。** 以用戶已提交的 `a8f2a2ddf7c8ba0ee9bd889ee8b2f73f22b9380f` 為基準，新增同次 main 發布的 OIDC 同步、來源與最新 commit 驗證、失敗時停止 Pages、備份及測試。詳見 [自動同步啟用手冊](deployment/card-catalog-auto-sync.md)。未建立正式身份、設定環境變數或增加 IAM；未啟用時新 workflow 會停止新 Pages 發布。

新 workflow 已實作同一已審 commit 的內容檢查、同步驗證及 Pages 發布順序，限制發布來源／環境、序列化發布及拒絕舊 commit 重跑。選擇／授予正式 IAM 及 OIDC 仍需另外批准；不能把 IAM 當作只受 Firestore rules 的 document allowlist 約束。

在串接獲准前，可由既有受信任操作員在每次 CMS 發布時執行同一同步命令；不需要手改卡 ID 或改兩個帳號。這仍是人工發布步驟，不能聲稱目前已做到未來全自動同步。

回復前端時可暫留相容規則及卡庫。若要撤回後端全卡例外，先檢查兩個 profile 是否仍選用非 owned 卡；必要的選卡重設須另批，之後才回退規則，避免舊規則令 profile 編輯失敗。卡庫同步備份只含卡 metadata，保存在 `tmp/full-card-access/catalogue-before-*.json`。

## 本機驗證及預覽

已通過：`pnpm check`、`pnpm build`；69 項單元／內容／教學／編輯器回歸；34 項 Firestore emulator 測試（原有 21 + 本功能 13）；桌面 1440px、手機 390px／320px 的瀏覽器檢查。build 仍提示大於 500 kB 的 bundle，沒有 build error。

交付前執行端重連令原預覽程序停止；重開 Vite 時目前依賴報 `Cannot find module '@babel/parser'`（由 jsx-loc plugin 載入）。上述檢查及截圖是在重連前已完成；沒有修改依賴或 lockfile。即時預覽需要先恢復本機依賴，不能將目前 localhost URL 當作仍在運行。已有截圖及測試日誌可直接審閱。

後端測試包括：兩身份／現有六卡／未來新卡、跨角色、未驗證 email、錯誤或缺少 provider、停用／錯誤綁定、普通學生偽造欄位及 custom claim、禁止自授卡／修改可信卡庫、其他學生資料與管理頁資料權限、legacy 及首次 profile、移除／禁用卡、同步原子快照和 idempotency。測試 token 由本機 emulator 提供；沒有進行真實 Google 登入或正式環境驗證。

```powershell
pnpm check
pnpm build
pnpm test:full-cards

# 一個終端執行 emulator；英文 locale 避免該 JAR 的 zh_HK 訊息資源錯誤
& './tmp/java/jdk-21.0.12.1+1-jre/bin/java.exe' '-Duser.language=en' '-Duser.country=US' -jar './tmp/cloud-firestore-emulator-v1.22.0.jar' --host 127.0.0.1 --port 8096 --project_id demo-full-card-access

# 另一終端執行規則測試；全卡測試強制 loopback emulator
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8096'
pnpm test:full-card-rules

# 本機合成資料預覽，不經 AccountGate，不寫雲端
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4197 --strictPort
# http://127.0.0.1:4197/__role-preview?fullCards=1
node scripts/full-card-access-ui-check.cjs
```

若此環境 PATH 沒有 pnpm，等效入口為 `node node_modules/pnpm/bin/pnpm.cjs`。瀏覽器腳本預設使用本機 Codex Playwright；可透過 `PLAYWRIGHT_MODULE` 指定安裝位置。預覽路由原本已受 `import.meta.env.DEV` 限制，fullCards query 只存在於該本機頁，不能為正式帳號授權。

結果和截圖位於 `tmp/full-card-access/`：`unit-tests.log`、`rules-tests.log`、`ui-results.json`、`desktop-all-cards.png`、`desktop-cross-role-background.png`、`mobile-390-all-cards.png`、`mobile-320-all-cards.png`。全部使用合成帳號；瀏覽器測試攔截外部連線。

## SummaryDescription

為兩個指定已驗證 Google 帳號加入跨角色全卡選用，保留啟用限制、固定角色及原有 earned 卡清單；Firestore 以本人啟用綁定和可信卡庫驗證新選擇，普通學生與既有管理權不變。補上 owner 首次個人卡儲存、token／access 更新處理、離線預設的卡庫同步工具及本機安全／UI 測試。正式 rules、初始卡庫及未來自動同步發布串接尚待批准，未作 commit／push／部署。
