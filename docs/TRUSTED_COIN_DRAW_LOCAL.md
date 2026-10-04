# 抽卡與教師同步核證

基線 main：a0df49390d50c96238a7906d27e597e2b3401736。独立工作樹：history-quest-trusted-coin-draw；分支：feat/trusted-coin-draw-local。沒有更改 history-quest-rules-rewards-app-integration 工作樹。

## Summary

保留 PR5 整段自動抽卡動畫。支付目前 CMS 價格（初始100探索幣）、取得卡片、不可改收據與錢包更新以同一交易成功後，才播放及揭曉實際取得的 ExplorerCard。返回卡庫不會再次派卡或自動換展示卡。

新增、匯入、連結或恢復學生登入時，由現有經 Google 核實的 Kitlung 教師瀏覽器同步核算及建立抽卡資格，與名單版本和登入連結一起提交。不依賴背景 runner，不新增密鑰、IAM/WIF、Functions、Workers、Blaze 或付費服務。

## Description 與信任邊界

- 正常瀏覽器用 crypto.getRandomValues 加 rejection sampling，從 CMS enabled/drawEnabled、同性別、未持有卡均勻選卡，所有年級共用該角色剩餘卡池。集齊或不足幣不扣款。經修改的瀏覽器可選取任一合法池內卡；此方案不是服務端可信隨機。這個限制已向用戶說明並獲接受。
- Rules 強制價格、卡池、性別、未持有、原子四寫、餘額下限、序號及不可改收據。同一 requestId 重試只返回原收據；不同 ID 競態不能重複取得卡或透支。未知斷線結果保留 requestId，恢復已付但未顯示的卡，不重新購買。
- 每筆既有不可改正獎勵以相同來源 ID 的 immutable creditClaim 入支出證據錢包一次。原 entries 不移動、不改數額；wallet.balance=credited-spent，實際可用額再減 legacySpent。
- 教師核證向伺服器讀取指定 SID 的 entries、creditClaims、receipts 及 wallet，再在交易中重讀命名文件及 profile/access/eligibility/enrollment revision。新 SID 即使沒有父文件，也必須確認子集合沒有孤立歷史；未知來源、未證扣款、矛盾錢包或孤立收據均原子失敗。舊歷史負數全部逐筆保留為 legacyDebits/legacySpent。來源正數零轉正由交易重讀保護；合法新增正數不增加債務，既有 Rules 禁止新增或修改歷史負數。Admin 越過 Rules 的修改不在瀏覽器信任模型內。
- Rules 不能重算任意長歷史，核證明確信任現有 Kitlung 教師完成完整核算；學生及 Tang 全卡帳戶沒有核證權限。資格只可新建或取代未 verified 紀錄，不能改寫已有 verified 資格，openingBalance 固定0、欄位受限，且必須與 enabled 登入連結、存在的 profile 及遞增名單版本相符。這項新受限權限已獲用戶批准。
- 既有有效資格直接保留，不重新讀取帳項或改寫。此前已核證436份資格；本次不掃描或重寫該名單、不掃正式 inventory。四人一批符合 Rules 文件預算；CSV 部分失敗只報告已完成批次。
- 所有中一至中六新學生只收到所選同性別 starter。停止登入時 Nile／年級補卡。現有 ownedCardIds、role、nickname、avatar、testing 及舊選卡均保留。指定 Kitlung/Tang 全卡展示權限保留；Tang 仍不是教師。
- 普通卡庫只顯示已持有、啟用、同角色卡。隱藏提示不保護公開圖片；真正保密需移出公開 bundle/URL並由服務端按授權提供。

## 發布及派幣相容

唯一正式 Rules 入口是 firebase.json 的 integration/assessment/compatible.rules，由 build-compatible-rules.mjs 合併 base 與 main assessment protocol。不要单獨部署 base firestore.rules。

既有受保護 Pages 工作流同步 cardCatalog/current 後發布同一 SHA 前端，未擴張 publisher IAM 或 WIF。CMS drawPrice 可調、drawEnabled 可控制卡池；compiled clientCatalogHash 必須等於 current sourceSha256（含卡圖/名稱等 metadata），舊分頁會在扣款前要求重新整理。沿用既有 public/private assessment catalogue 發布流程。

前端 VITE_CARD_DRAW_ENABLED=1；伺服器仍需 cardDraw/status.enabled=true、protocolVersion=1 及個別資格。正常抽卡只讀已備資格，不提交舊 qualification queue、不等待排程。automaticQualificationEnabled 保持 false。

派幣整合繼續使用原 entries/taskReward/gameReward 協定、immutable positive 與 legacy zero 升級。新正獎勵下一次抽卡會以唯一 sourceId 取得證據，不再授幣；抽卡負數明確 kind=cardDraw、draw_{requestId}，報表仍按原 ledger 加總。獨立派幣工作樹沒有更改或混提交。

## 本機驗證與預覽

專用127.0.0.1:8185 emulator，僅 demo 專案；沒有核證 runner。桌面與390px真實教師UI驗證新增、匯入、連結、停用/恢復、核准申請，另驗證小測賺120→抽100餘20、完整動畫、真正卡面、班別(學號) 姓名、暱稱及返回不二次授卡。

預覽：http://127.0.0.1:4340/__enrollment-demo 與 http://127.0.0.1:4340/__coin-draw-demo?scenario=earn&slot=0 。DEV-only routes，不會加入正式 production bundle；合成示範不改真實餘額。

證據：tmp/enrollment-draw-review/teacher-certification.log、draw-and-legacy-qualification.log、release-checks.log、teacher-ui.log、enrollment-ui-results.json及三張截圖；最新main派幣/舊Rules證據另為 teacher-sync-rewards.log、teacher-sync-legacy.log。

## 正式驗收與回退

發布只使用既有 owner 互動登入及受保護 publisher，不新增憑證或 scopes。先保存舊 Rules／伺服器開關，再發布相容 Rules、CMS與UI；核對同 SHA及catalogue hash後才開抽卡。若新版失敗，關閉 draw/status.enabled 即停止新扣款，既有收據、卡與餘額保持；舊分頁也受伺服器旗標約束。真實賺幣→抽100→一次卡與重試驗收只准使用已授權 Kitlung/Tang 測試帳戶，不重置或盲加幣、不處理其他學生資料。登入式驗收必須有可操作且已登入的瀏覽器，owner CLI OAuth 不可冒充 Firebase 學生身份或當作驗收。
