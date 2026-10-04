# 探索抽卡機 UI 整合

## Summary

將已確認的4332抽卡介面接入原App的Home／HistorySidebar，保留高清收窄入口、完整右側stage及老師按鍵、出卡、跌卡、翻卡、白光和揭卡效果。正式入口清楚標示「尚未啟用」，100探索幣按鈕停用。

## Description

點選側欄「探索幣抽卡」會以完整抽卡區取代右側Home內容，不重複側欄或Home館名。移除開場自動播放提示、返回預覽首頁按鈕及直接查看已得卡片入口；保留最後「加入卡片庫」返回初始抽卡畫面的效果。本機展示中的此按鈕不授卡，也不更換身份卡。

本次僅整合UI和效果，沒有真實扣幣、抽卡池／角色／權重規則、派卡、錢包、持卡或ledger。原CoinBalance、StudentAccount、Firestore、Rules及派幣模組保持不變。正式頁面不載入mock帳本或mock餘額，不顯示扣幣／獲卡成功。本機展示亦改為無儲存的純視覺效果，每次離開再進入都從初始畫面開始。

## 隔離及預覽

- Branch：`feat/coin-draw-ui-integration`
- Base：`17144db`（main）
- Worktree：`C:\AI\歷史探索館網站\history-quest-coin-draw-ui-integration`
- 效果展示：`http://127.0.0.1:4333/__coin-draw-demo`
- 尚未啟用畫面：`http://127.0.0.1:4333/__coin-draw-demo?mode=unavailable`
- 從Home點入口：`http://127.0.0.1:4333/__coin-draw-demo?view=home`

Demo路由只存在於DEV；production build移除此路由，正式CoinDrawPanel固定使用unavailable模式。效果腳本只在localhost且明確指定demo模式時播放；即使展示播放，亦不連帳戶、不扣幣、不派卡。

驗收Vite設定、離線Firebase替身、依賴補件、截圖和實錄放在worktree外的`coin-draw-ui-integration-qa-20261003`。這些離線替身不屬於正式App變更。4333只綁127.0.0.1；手機／iPad為Chrome尺寸模擬，其他實體裝置不能直接使用此loopback網址。沒有修改VPN、防火牆或公開服務。

## 檔案

- 修改：`client/src/App.tsx`、`client/src/pages/Home.tsx`、`client/src/components/HistorySidebar.tsx`
- 新增元件：`CoinDrawEntry.tsx`、`CoinDrawPanel.tsx`
- 新增樣式：`client/src/coin-draw.css`
- DEV頁面：`client/src/pages/LocalCoinDrawDemo.tsx`
- 效果：`client/public/coin-draw/index.html`、`style.css`、`presentation.js`
- 已確認素材：`client/public/coin-draw/assets/`十張PNG（機台／揭卡場景、卡背／白卡／示範卡、三張老師姿態、兩個按鈕）
- 本說明文件

右側stage使用同源iframe隔離既有canvas效果的樣式；它只向Home傳送經驗證的高度訊息，不傳送餘額、帳戶ID、授卡結果或持卡資料。素材從4332直接複製，本次沒有再生成或修改美術。

## 驗證

- `scripts/check-content.mjs`內容驗證通過；其生成的CMS索引變動已還原，不納入此分支。
- TypeScript `--noEmit --incremental false`通過。
- `GITHUB_ACTIONS=true`、原Vite production設定、`--configLoader native`前端build通過；server esbuild步驟通過。既有缺件只在外置QA工具目錄補齊，沒有修改原依賴或package／lock檔。
- `git diff --check`通過。
- 1440桌面、820 iPad、390手機：完整實播、入口對齊、無橫向溢出、無重複Home header、三項預覽控制確實不存在。
- 鍵盤啟動、減少動態、揭卡後返回、切回Home及重入通過；重新進入為idle，沒有殘留自動播放。
- 尚未啟用模式按鈕disabled，程式觸發click也不啟動效果。
- QA未觀察到Firebase／Auth／Firestore／Functions請求；原Google字型請求保留。

## 留待後續

真實100幣價格及CMS設定、角色與不重複抽卡池、既有持卡選用、後端權重、原子扣幣與授卡、冪等ledger、斷線重試／結果重看，均尚未接入。本次沒有commit、push、merge或部署。
