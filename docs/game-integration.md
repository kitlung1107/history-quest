# 探索館遊戲接駁 v1

目前為可審查的本機實作，尚未部署。探索館專案：`C:/AI/歷史探索館網站/history-quest`。

## 第一版行為

- 必須經探索館 `AccountGate` 登入及取得核准的學生身分。直接開遊戲會轉往探索館 `?game=cold-war-maze`，登入後仍回到此遊戲入口。
- 探索館保留登入至登出，並共用於同源分頁；登出會傳至其他分頁。全螢幕使用同一個已綁定的 iframe。瀏覽器隔離的設定檔／隱私視窗不共用登入。
- **成功帶出三份文件並到達出口**才提交 `completed`。返回選單／重新開始為 `abandoned`；關閉分頁可能留下 `open`，兩者都不列作完成場次。
- 每次交答案都計一次，保留原始陣列。摘要是作答次數及答對次數；错題庫為該局所有錯答題目的聯集。同題錯多次只列一次，之後答對不移除。
- 完成各局在「我的提交與評語 → 我的遊戲場次與錯題庫」翻查；教師在「教師工作室 → 學生遊戲場次與錯題庫」讀取。
- 沒有修改探索館積分、獎勵或既有測驗成績。場次時間戳僅供技術排序，不另呈現遊玩時間／弱項分析。
- 舊 `coldwar-study-v1` 匿名資料不匯入。弱題抽題用的本機紀錄以 UID + 已核准學生 ID 分隔；切換學生會卸載遊戲。

## 共用平台與新遊戲接入

共用程式：遊戲端 `web/history-game-bridge.js`，探索館 `GameSyncContext.tsx`、`ConnectedGame.tsx`、`lib/games/store.ts`、`GameRecords.tsx` 和 Firestore game rules。冷戰引擎適配在 `scripts/game.gd`、`scripts/study.gd`。

新遊戲需設定：

1. 穩定 `gameId`、探索館 `taskId`、標題、**固定且受信任**的 HTTPS 遊戲 URL。登錄到探索館 `lib/games/registry.ts`；不可把網址參數的任意來源當作允許來源。
2. 遊戲端設定 `HISTORY_GAME_CONFIG = { gameId, version, host }`，先載設定，再載 SDK。`host` 是探索館固定入口。消息只接受精確 parent/window、origin、隨機 channel、gameId 和 version。
3. 用完整題目內容及驗證結構的 hash 產生不可變 `version`。題目 ID 在同版中唯一；保存可讀題幹、選項、各片段／配對項及答案形狀。冷戰生成器為 `node tools/prepare_game_integration.cjs`，生成 `web/history-game-config.js` 及 `build/integration/cold-war-maze.json`；把 JSON 同步至探索館 `client/src/lib/games/cold-war-maze.json` 再發布。不要覆蓋雲端舊版本。遊戲 CI 會用 `--check` 阻止忘記更新接駁版本的題庫變動。
4. 本版驗證器 `index-array/1` 支援 1–8 個有界整數、可選不重複約束及精確陣列比對，涵蓋冷戰 MC、排序、配對、分類、找錯。MC 亦保持此遊戲原有的單元素陣列，沒有把其他題型壓平成選項 ID。
5. 若新遊戲原始答案是文字、座標、物件或其他形狀，增加新的版本化驗證器及服務端規則／受驗證 API，更新協定型別並保留原答案。**不要硬轉為 MC，也不能只增加前端算分程式。**
6. 引擎呼叫以下最小介面；必須在遊戲的實際開始、交答案、成功結算位置接入。單靠 iframe URL 不能自動讀懂任意遊戲作答。

```js
HistoryGame.ready();                 // 尚未取得身分時，遊戲須禁止開始和輸入
HistoryGame.start();                 // 新局：SDK 產生固定場次 ID，返回是否可開始
HistoryGame.answer('question-id', [2, 0, 1]); // 每次提交原始答案，不傳自報分數
HistoryGame.end('completed');        // 僅成功結算；重繪重複呼叫不會產生第二局
HistoryGame.end('abandoned');        // 主動退出／重開，可選
```

協定封包為 `history-game/1`，包含 gameId、version、channel；事件包含 eventId、sessionId、sequence。start sequence=0；第 n 次 answer sequence=n；end 帶 attempts=n、sequence=n+1。SDK 在探索館確認本機持久保存前會重送相同 eventId；不在 URL 或 postMessage 中傳 Firebase token。identity 的 scope 僅用於本機資料分隔，**不作服務端授權依據**。

## 權限、核算、斷線

- Firestore `owns(studentId)` 核對目前登入的 Google 帳戶、已驗證 email 和 `access` 授權；場次另綁定 Firebase UID。學生不能為其他學生／UID 寫入。
- `gameCatalog/{game}/versions/{version}/questions/{id}` 是教師發布的不可變題庫。學生無權新增或更改，歷史題目可繼續讀取。
- `gameSessions/{session}/answers/{event}` 保存不可修改的原答案及規則核對的 correct。新增答案與更新場次次數必須同一 transaction；規則核對答案、序號、計數增量及新事件存在。不能直接上報 score 或改總數。
- 重試固定 eventId；多分頁同時處理同一待同步事件時，失敗者讀回相同已提交內容才確認成功。完成後不能再添答／改答案。
- 探索館 localStorage 待同步佇列按 UID + studentId + eventId 分開。只掃描目前使用者的前綴；不自動合併其他學生的佇列。重新連線、按重試或再次登入該帳戶時繼續處理，舊版題目從雲端原版本讀取。
- 須完成一次即時登入、授權與题庫核對才能開始新載入的遊戲。已核准的遊戲斷線後可繼續收集待同步答案；伺服器再次核對最新授權才接受寫入。撤銷授權後不會接受待同步資料。
- 瀏覽器禁用／清除儲存，或在 SDK 尚未收到持久保存確認時強制關閉，可能遺失未同步資料；畫面會提示儲存問題。未同步結算不會顯示成雲端成功。

這是課堂學習紀錄保障，**不是防作弊的受控考試環境**。GitHub Pages 的遊戲程式及答案可被下載或修改；合法登入者亦可能自行產生符合格式的作答／完成事件。服務端可保證授權、題庫核算、不可修改紀錄和重送去重，不能證明學生真的依遊戲流程作答。若將來需保護關卡完成或高價值獎勵，需新增服務端發題與遊戲狀態驗證；目前不發放相關獎勵。

## 發布順序（尚未執行）

1. 審查兩個 repo 的修改及測試。探索館 `integration` staging 只是跨工作區套用副本；日常維護以探索館 repo 內檔案為準。
2. 在探索館發布 `firestore.rules` 和 `firestore.indexes.json`，等待 gameSessions 索引完成；保留既有測驗規則與索引。
3. 由管理員在發布流程中上傳新版本題庫，逐項核實題目後才啟用版本，再發布探索館前端。學生遊戲場次頁只供查看紀錄，不提供題庫發布按鈕。
4. 發布使用相同 `version` 的 Godot Web 遊戲（workflow 會複製 `web/*`）。兩站必須搭配發布；僅發布前端無法提供雲端授權驗證。
5. 用一個正式授權測試學生實際驗證 Google 登入返回、內嵌／新分頁／全螢幕、成功完成兩局、錯題保留、斷線重試、登出切換及教師讀取。正式 OAuth 與 Firebase 部署驗收未在本機模擬器中取代。

## 本機驗證

- `node tests/test_history_bridge.cjs`：來源／視窗／channel、直接網址轉址、原答案、重送 ID、重複 end、匿名及帳戶隔離。
- Godot `tests/test_game.gd`、`tests/test_flow.gd`：題庫與成功結算等遊戲流程。
- 探索館 `node --experimental-strip-types --test client/src/lib/games/model.test.ts scripts/game-rules.test.mjs`；規則測試固定 `demo-game-rules`、localhost:8086，與瀏覽器測試資料分開。
- 開發時 `VITE_GAME_EMULATORS=1` 才啟用 localhost Auth:9098、Firestore 代理:8088（轉至模擬器8086）及遊戲:8186；正式 build 不啟用此分支。
- 正式型別／內容檢查和 Vite build；UI 另外使用完全本機的測試帳戶與題庫，不寫正式學生資料。

重現瀏覽器測試：在探索館專案啟動 Firestore 模擬器 8086，再分別執行 `node scripts/game-qa-auth.cjs`、`node scripts/game-qa-proxy.cjs`、`node scripts/game-qa-seed.mjs`；設定 `VITE_GAME_EMULATORS=1` 後以 Vite 5177 啟動。將 `scripts/game-qa-login.html` 複製到忽略提交的 `client/tmp/game-login.html`，以瀏覽器開啟此頁選測試學生或教師。遊戲完成 Web 匯出至 `build/web` 後，於遊戲 repo 執行 `node tests/serve_history_game.cjs`。這個**專用測試伺服器**會注入明確標示的虛構場次；不可拿來當正式遊戲伺服器。探索館下方的模擬器控制會真正在代理層中斷請求，並用同一 SDK 驗證離線排隊及恢復。

已驗證：兩個完成局分開呈現，3次／答對1次與1次／答對1次；未完成局排除；同題兩次錯答後答對仍在錯題庫；真斷線時4筆待同步，恢復後成功；新分頁沿用登入、直接遊戲網址返回宿主、全螢幕保留身分、切換學生不併入先前紀錄、跨分頁登出及教師讀取。測試資料全部位於本機 `demo-game-sync`，不屬於正式學生紀錄。

依據：Firebase [跨分頁登入持久性](https://firebase.google.com/docs/auth/web/auth-state-persistence)、[transaction 規則驗證](https://firebase.google.com/docs/firestore/manage-data/transactions)。
