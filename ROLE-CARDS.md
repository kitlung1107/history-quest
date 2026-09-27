# 固定角色與收藏卡（本機完成，尚未部署）

## 產品行為

- 第一次登入或舊帳戶沒有 `role` 時，必須自行選 `studentBoy` 或 `studentGirl`。不從舊 avatar、姓名、班別推斷角色。
- 選角及贈卡在 Firestore transaction 一次完成；兩個分頁同時選不同角色時，後完成者會被拒絕。學生之後只能改暱稱及展示自己的收藏卡。
- `ownedCardIds` 是唯一有效收藏清單；`cardId` 是展示選擇。所有年級送同角色新手卡；可信的 profiles.className 符合 `1[A-E]` 再送同角色尼羅河卡。學生不能修改 className。
- 登入時以集合補齊應有贈卡，不重複發放；升班保留已擁有卡。中二至中六未有其他尼羅河獲得條件。
- 舊 `avatar` 原值保留。舊 `cardId` 首次選角時存為 `legacyCardId`，只作遷移存檔，不算收藏，不能用來展示或解鎖。姓名、學號、班別、作業與進度不會被改寫。
- 停用、遺失、其他角色或未擁有的展示卡均不會回退到另一張；頁面顯示不可用，可重新選擇合法收藏。
- 名牌頂部是暱稱，底部只顯示姓名。保留縮字、最多兩行、省略及點擊全文。

## 預覽

`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4180 --strictPort`

打開 http://127.0.0.1:4180/__role-preview 。展示帳戶只寫入獨立 localStorage；不登入、不寫入雲端。首次選角後開左上角年級選單，再按「更換卡片」。頂部可重設、切換中一至中六、測試舊帳戶、重新登入與長文字。DEV 專用頁面不打入正式版本。

## 上線前必要步驟

尚未部署任何網站或規則。Firestore 的角色鎖定和防偽發卡必須部署本次 `firestore.rules` 才會在線上生效；應安排規則及新版前端一同切換。新規則會拒絕舊前端的未選角個人資料寫入，舊頁面需重新載入。正式 Google 登入的實帳流程未在生產環境改動或試寫；目前驗證使用本機 Firestore emulator 及展示帳戶。

未建立批次猜測角色的遷移。未選角舊帳戶會自行完成一次性選角。Firestore Admin SDK 仍是受信任管理端，會繞過安全規則；管理腳本不可覆寫 role/ownedCardIds。現有學生端不具這種權限。

## 擴展

目前只允許四個已批准卡款，規則使用明確 allowlist。新增卡款時同時加入 catalogue 的 role/edition、規則同角色 allowlist 及明確獲得條件，補上 emulator 測試；單在 CMS 上載圖片不會授予收藏。沒有杜撰任務完成獎勵。

## 圖片製作

使用 imagegen 內建編輯工具，沒有程式重畫。來源保留於使用者原始 generated_images 目錄，輸出非破壞性複製為：
- client/public/uploads/starter-explorer-boy-v1.png
- client/public/uploads/starter-explorer-girl-v1.png

最終提示詞（男女各一）：
“Use case: precise-object-edit. Edit target: supplied accepted two-card illustration. Output ONE independent portrait card: the LEFT BOY / RIGHT GIRL card only, filling canvas with its complete gold outer border intact, no other card. Preserve exactly the accepted character's youthful anime face, hair, pose, white short sleeve shirt, gray knitted vest, gray tie, library and Hong Kong harbour background, navy and gold frame, books and compass ornaments. Remove ONLY the Chinese text on the top nameplate and bottom nameplate, leaving both cream plaques completely blank with their borders intact. No text or flags. Do not redesign the character or layout.”

## 驗證指令

- `node --experimental-strip-types --test client/src/lib/cardModel.test.ts`
- 啟動 Firestore emulator 後設定 `FIRESTORE_EMULATOR_HOST=127.0.0.1:8181`，執行 `node --test --test-isolation=none scripts/cloud-rules.test.mjs`
- `node scripts/role-ui-check.cjs`（需 Playwright 及 Edge；可設定 PLAYWRIGHT_MODULE）
- `npm run check`、`npm run build`

## 2026-09-27 雲端規則部署前檢查

本次使用者授權只部署 Firestore 規則；沒有授權此輪部署網站前端。檢查結果：**因已確認的前端相容性阻礙，沒有部署，也沒有改動任何雲端規則或學生資料。**

- Firebase 設定專案：`history-discovery-center`；CLI 登入：`kitlung1107@gmail.com`，與網站設定一致。
- 現行 release：`projects/history-discovery-center/releases/cloud.firestore`。
- 現行 ruleset：`projects/history-discovery-center/rulesets/c4f121c8-99ce-40df-867b-21c7e3fde8c7`。
- 備份目錄：`tmp/rules-backup-2026-09-27T06-19-58-734Z/`，含 `firestore.rules`、`source.json`、`release.json` 及讀取的線上前端檔案。舊規則 SHA-256：`2a1c4cd3c7a6c914a27ea88743e8163d95def98dcac366ca509c162d8a238815`。備份位於 git-ignored tmp，留在本機供回復，不會混入提交。
- 線上前端仍為 `assets/index-D36ADmTn.js`，不含 `ownedCardIds`、首次選角或新手卡。其實際儲存 payload 為 nickname、avatar、cardId、configured，沒有角色及收藏清單。
- 模擬器重現：上述舊版 payload 在現行規則成功，在本次新規則得到 permission-denied；2 項相容性檢查通過。另重新執行 21 項規則測試全部通過。證據：`tmp/role-deploy-compatibility.log`、`tmp/role-rules-test.log`。
- 因此不可單獨先部署本次嚴格規則而保持現行網站不變。應安排前端及規則同一上線窗口，處理舊頁面重載；單純放行舊版任意 avatar/cardId 寫入會繼續繞過新選角及收藏要求，不作為正式方案。

最終學生可見尼羅河卡名稱為「尼羅河探險 (女)」與「尼羅河探險 (男)」，ID 不變。選角後不顯示固定角色欄，底層限制仍然保留。
