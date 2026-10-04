# 小測派幣正式啟用

本次沿用 Kitlung 教師、Tang 測試學生的既有角色。沒有新增 IAM、憑證、計費或 Functions；Cloud Functions 服務仍停用。正式評分及獎勵由 Firestore Rules 核實，客戶端只提交答案、逐步核驗和完成交易。

## 題庫與發布

石器時代・課堂重溫(1) 保留原 task ID、原檔名及十題題幹／圖片；新版本 `67b62ce86b84454fb118d45140742756` 的標準答案和解說位於私有題庫。既有 coinRules 完整保留，包括 70 分級別派 69 幣、90 分級別派 87 幣。

教師使用 `/assessment-cms` 建立或修改小測、閱讀後問題及探索幣設定，儲存時將私有 key、公開 metadata、coinRules 原子寫入 Firestore，再用現有 GitHub CMS 連接提交公開教材。公開 Git 不接收答案或獎勵設定。原 Sveltia CMS 保留其他教材、遊戲及卡片管理，小測入口改往私有題庫管理。

公開提交仍由原 main 發布流程處理：受保護 github-pages 環境的既有 WIF 精確讀取已發布私有版本，驗證公私題目綁定、同步 core，成功後才發布 Pages。缺少私有版本、題目不符、版本衝突或權限不足會停止發布。每份新小測毋須另外部署 Rules 或後端。

## 部署檔及防重複

`firebase.json` 指定 `integration/assessment/compatible.rules` 為正式 Rules 部署檔；`firestore.rules` 保留相容產生器的 legacy 基礎。只部署 Firestore Rules，不部署 firebase.json 中保留的 Functions 草稿。

MC 完成核驗後以同一交易寫入正式 grade、合資格的正數 ledger 及最新 progress。混合／短答須完成全部必要批改才結算。未答不提交；答案及 attempt ID 封存後保持不變。並行重試僅在伺服器讀回證明相同核驗或相同 grade 已完成時收斂，拒絕或不同資料仍視為失敗。

rewardAutomation 的伺服器啟用時間阻止歷史回填。每人每任務只取得一次正數獎勵；既有正數帳本 immutable，0 幣、未達門檻或未完成批改保留日後資格。沒有調整原獎勵規則或批量補派。

## 驗收與回復

本機 Rules 驗收使用獨立 demo 專案；真實驗收使用正常 Google 登入、正式專案與已知兩個帳戶，不借用 CLI OAuth 作網站身份、不新增身份證明文件。Kitlung 的教師身份已以教師專用 core 查詢唯讀驗證。正式測試限指定新 attempt／必要測試任務；不開啟會核算其他學生舊提交的整體教師清單。

回復時關閉新版 writer／rewardAutomation，並使公開教材與 core 指向同一保留版本；保留新舊私有版本、提交、成績及正數帳本，不刪帳本或重派。Rules 發布前完整 source／Ruleset 及開關變更前狀態存於本機驗收記錄。不能用將新版提交改回 legacy schema 作回復。

逐題、答案總覽、手機／iPad 及教師批改 UI 已經 emulator 驗收；正式發布成功和真實帳戶結算以本次操作的 CI 與 Firestore 讀回記錄為準。
