# 學生新增核證分頁修復

Summary：修正新增及 CSV 匯入學生時，抽卡資格核證查詢超出接口 10,000 筆上限。

Description：entries、creditClaims 及 receipts 改用伺服器文件 ID 排序及 startAfter 分頁，每頁最多 1,000 筆。每類仍最多核算 10,000 筆；到達上限後另查一筆，發現超量即整筆拒絕，不截斷歷史帳項。後續頁讀取失敗也不會提交部分核證。

所有已查到的文件及錢包仍在原 Firestore 交易中重讀；歷史負數、證據錢包一致性、孤立子集合、新 SID 零歷史、名單版本和並行重試檢查保留。profile、access、eligibility 與名單版本仍原子提交。CSV 沿用四人一批與已完成批次回報。既有有效資格不重新核證；不改原有餘額、持卡、登入綁定或角色，不新增 IAM、Functions、WIF 或付費服務。

## 回歸

- `pnpm test:enrollment-pages`：空集合、999/1000/1001/1999/2000/9999/10000 筆、10001/11000 筆拒絕、後頁讀取失敗、後頁歷史負數及 CSV 格式。此命令已加入既有 Pages CI。
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8185 node --experimental-strip-types --test functions/test/teacherCertification.integration.test.ts functions/test/browserDraw.integration.test.ts functions/test/drawQualification.integration.test.ts`：僅 demo 專案，包含三類真實 server 分頁、10001 筆原子拒絕、後頁競態、手動新增、各年級匯入、部分失敗、既有資格和身份保留及抽卡重試。
- 既有 `scripts/enrollment-ui-check.cjs` 可用 localhost 修復分支驗證桌面及手機新增、CSV、連結、恢復／停用及申請審批；其完整版本另依賴已種子的抽卡 demo。

正式驗收必須核對遠端 main、相同 SHA 的 CI/Core/Pages 成功，並在原已登入的 Kitlung 教師網站實際新增及 CSV 匯入明確標示的合成學生。本機成功不能代替正式驗收；正式測試學生保留並列入驗收報告。
