# 桌面首頁與十款角色

## 範圍

首頁採用奶油色側欄、內縮漫畫 hero、可選取文字與實際任務卡。主內容不再呈現年級捷徑；年級與課題選擇仍在側欄。底部只保留 CMS 每日內容（如啟用）及實際成績統計，不顯示鼓勵標語。

四份原任務 JSON、21 個課題、教材圖片 URL、文章、測驗、ColdWarMaze 遊戲 URL、圖片庫、提交與批改程式均保留。首頁大圖是唯一更換的 CMS 圖片，索引由既有建置工具更新。

## 角色資料

只提供十款人物，沒有 emoji 選項或 emoji 回退。

| key | 人物 |
| --- | --- |
| studentBoy | 男學生 |
| studentGirl | 女學生 |
| explorer | 探險家 |
| scholar | 學者 |
| archaeologist | 考古學家 |
| navigator | 航海家 |
| detective | 歷史偵探 |
| conservator | 文物修復師 |
| ancientScholar | 古代書生 |
| cartographer | 製圖師 |

舊四個 key 保持原值，對應同名人物，不需遷移帳戶。缺失或不支援的 key 以探險家顯示，角色表單儲存時使用有效人物 key。姓名、班別、學號仍不可由學生更改。

`firestore.rules` 已在本機擴充六個 key，沒有改動權限範圍。**日後自行發佈時須一併部署這份規則，否則正式環境會拒絕六款新角色的儲存。** 本次没有部署規則、寫入正式資料、commit 或 push。

## 預覽與驗證

以現有本機依賴啟動：`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort`。

開啟 `http://127.0.0.1:4173/__home-demo`。這是 dev-only 路由，使用虛構學生、獨立的 `hdc.local-home-demo.v1` 瀏覽器儲存鍵及正式教材唯讀預覽。沒有帳戶 provider，試答使用既有 preview 流程，不提交成績。正式建置移除此路由和模組。正式首頁 `/` 仍必須經過原本 Google 登入和帳戶權限檢查。

檢查指令：

```text
node node_modules/pnpm/bin/pnpm.cjs run check
node node_modules/pnpm/bin/pnpm.cjs run build
node --experimental-strip-types --test client/src/lib/contentModel.test.ts scripts/teaching.test.mjs scripts/admin-refresh.test.mjs scripts/mc-encouragement.test.mjs scripts/editor.test.mjs scripts/image-position.test.mjs
```

規則測試需先啟動本機 Firestore emulator，再指定 `FIRESTORE_EMULATOR_HOST` 執行 `node --test scripts/cloud-rules.test.mjs`。測試專案固定為 `demo-hdc`。

驗證結果：內容驗證、TypeScript 及正式建置通過；40 項既有教材／教師／MC／編輯器測試與 17 項本機 Firestore 規則測試通過。瀏覽器驗證了十款人物逐一儲存和重新載入、年級／課題篩選、四個原任務開啟、原冷戰遊戲 iframe、手機選單與角色儲存，以及 1440、1024、768、390、320px 無橫向溢出。示範流程沒有 Firestore 請求和 JavaScript page error。正式 Google 登入與正式帳戶寫入未作線上驗證；建置保留既有大型 chunk 提示。

## 插畫來源與處理

使用內建 imagegen，沒有 CLI/API fallback。十款人物以已確認的 `six-pixel-characters-v1.png` 和 `four-pixel-characters-v1.png` 為來源，保留角色造型；不改成另一組人物。素材經 imagegen 去背，驗證真正 alpha 後才逐格分離、等比例縮放、輸出透明 WebP。網站不使用整張比較圖當單一角色。

最終素材：`client/public/images/characters/*.webp`（10 張，每張 384×464）；`client/public/uploads/home-history-hero.webp`（1920×640）。原圖與生成結果均保留，不覆寫。

生成提示（最終採用）：

> Hero: Generate a standalone website hero ILLUSTRATION asset based on ONLY the hero artwork in this reference, not the UI screenshot. Landscape approx 3:1 ratio, vivid smooth manga style matching reference. Historical exploration scene: cute Hong Kong boy in navy blazer with gold piping, white shirt blue tie, exploring an open historical atlas with a magnifying glass on LEFT foreground. Roman colosseum left background; Hong Kong Victoria Harbour with blue sea, junk boat, skyline and Clock Tower in center lower portion; pyramids and sphinx on right; old books, globe and leaves at lower right. Bright azure sky, vivid green leaves, golden sunshine. Preserve a large quiet PALE CREAM CLOUD area in upper center about 55 percent width and 50 percent height for live website heading text to be overlaid later. Art concentrated at left and right edges and lower third. No text, no letters, no symbols resembling writing, no headings, no buttons, no UI, no borders, no corners/frame. Fill entire image with illustration. The intended final webpage displays real readable text separately.

> Top three: Extract ONLY TOP THREE characters from reference into a single horizontal row on transparent background, full body. Exact accepted original boy student, girl student, explorer with compass, in same order and preserving their existing pixel art design, clothes faces pose equipment. Three equally spaced cells. Remove bottom three characters entirely. Real transparent background, no checkerboard, no shadows, no new objects or text. These are website sticker cutouts.

> Bottom three: Extract ONLY BOTTOM THREE characters from reference into a single horizontal row on transparent background, full body. Exact accepted original bespectacled scholar with books, female archaeologist with pottery and brush, sailor with scroll, in same order and preserving their existing pixel art design clothes faces poses equipment. Three equally spaced cells. Remove top three characters entirely. Real transparent background, no checkerboard, no shadows, no new objects or text. These are website sticker cutouts.

> Additional four: Background extraction only. Preserve the FOUR accepted original pixel characters faithfully, same faces, hair, clothes, equipment, poses, colors and pixel styling; DO NOT redesign. Remove cream background and shadows completely to genuine transparency. Same square 2x2 grid regular spaced cells with clear transparent gutters. Top left brown detective with magnifying glass and notebook; top right female pottery conservator in teal apron; bottom left ancient Chinese scholar in white and blue robe with brush and scroll; bottom right female cartographer with green hat, map and map tube. Full body feet and all accessories visible. No text, no frame, no circle, no extra objects. Intended to split into four independent web character assets.
