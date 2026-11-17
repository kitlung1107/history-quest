# 木乃伊工房整合

中一「人類的需要—古與今」，task `S1_Mummy_Workshop`、game `mummy-workshop`。保持遊戲 source repo 私有；公開的只有 Web 遊戲產物，直連正常流程返回探索館登入。不得把私有源碼 repo 改為 public。

## 完成及派幣

`mummy-game/1` 接收五個最終選項，不保存返回修改時的中途答案。版本 manifest 的五個答案由受信任教材發布器提供，Firestore Rules 核驗選項、逐題對錯及 `20 × 正確數`，不是相信瀏覽器的分數。

一個 transaction 建立不可改寫的 `gameSessions/{sessionId}`。首次同時建立 `coinAccounts/{studentId}/entries/S1_Mummy_Workshop`，包括 amount 0；所有舊派幣分支都排除這個保留 key，不能把 0 升級或補領。重玩只新增場次。每局保存最終答案、逐題對錯、分數、遊玩時間、伺服器完成時間及是否首次。玩家提供的 playedAt 僅作顯示，不作授權或派幣證據。

首次由伺服器成功提交的 transaction 仲裁；同一瀏覽器的離線完成依 playedAt 排序，前一局失敗時停止後續局同步。跨裝置同時完成只有一局取得首次資格。eventId/sessionId 不變的重送會核對內容；帳戶切換不合併不同學生的隊列。權限失敗自動退避五分鐘，其他失敗三十秒，可手動重試。

木乃伊每題固定 20 幣，不能以更改一般 CMS 階梯設定改變此協定。帳本 rule 記錄該局已核驗的一次性金額；首頁獎勵提示另外顯示首次零分已完成。舊 Functions 對此協定回傳 protocol-owned；部署此功能不需要啟用 Functions。

## 發布次序（尚未執行）

1. Firebase 已登入後先執行 `node scripts/mummy-readonly-preflight.cjs`：只讀規則、三個指定 metadata 及用量，不列舉學生資料。和目前正式 Rules 比對，保留其他同步發布；若與整合 baseline 不符，先合併並重跑 emulator。
2. 發布測試通過的 `integration/assessment/compatible.rules`，絕不能直接以根目錄舊 firestore.rules 覆蓋。
3. 建置私有遊戲 repo 的精確 commit；以公開 Pages 發布匯出產物，保持 source repo 私有。目前預定 URL 是 `https://kitlung1107.github.io/mummy-workshop/`，尚未有已確認的 Pages 設定／部署。若帳戶不支援私有來源 Pages，需另設只放編譯產物的公開發布目的地，並同步修改 manifest URL。不要公開 source repo。
4. 探索館正常 main 發布流程原子同步新 game manifest、五題及 taskAccess，再發布頁面。此功能新增七個教材文件（五題、manifest、taskAccess），另更新既有固定索引。使用新 task ID，不恢復舊已刪除的 EgyptQuiz。
5. 只為 `S1_Mummy_Workshop` 設 `rewardPolicies={source:'game',enabled:true}` 及 `coinRules={mode:'tiers',amount:0,metric:'score',tiers:[20,40,60,80,100].map(n=>({minimum:n,amount:n}))}`。不改全域 activation、其他遊戲、學生、帳本或計費。全域 automation 若未啟用，停止並回報，不擅自開啟。
6. 以指定測試帳戶驗收後才視作已上線；不重設或操作真實學生獎勵作測試。

## 用量與驗證界線

無競爭時每局 transaction 讀三份文件（場次、首次帳本、manifest）；首次寫兩份，包括首次零分，重玩只寫一份。Rules 的相依文件讀取、登入／目錄監聽、紀錄頁查詢及交易重試另計，不能把三讀當總計費。測試全部使用本機 demo 專案，不消耗正式 Firestore quota。

2026-11-17 本機 Firebase CLI 未登入，正式 Rules、metadata 開關及最近 24 小時用量尚未讀回，正式部署未執行。免費額度參考官方 https://firebase.google.com/docs/firestore/quotas ，不代表本專案剩餘額度。

本機測試涵蓋零分、重玩、滿分、重送、跨分頁、錯年級、撤權、測試帳戶、偽造分數／金額、缺少原子帳本、舊協定繞過及教師舊派幣分支。另跑原冷戰和 assessment emulator suites。桌面瀏覽器已驗證匯出遊戲載入及登入遮罩，844×390 只屬尺寸模擬，不是手機／iPad 真機驗收；完整真人登入到派幣流程仍待正式部署及測試帳戶。
