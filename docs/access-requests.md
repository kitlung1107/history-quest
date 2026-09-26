# 學生准用電郵申請

未獲批准的學生以已驗證 Google 電郵登入後，可填寫班別、學號及姓名，在站內提交申請。電郵取自登入帳戶，不可自行指定。每個電郵只有一份 `accessRequests/{email}`，待審時不能重複提交；拒絕後可修改資料重送。學生即時看到待審、批准或拒絕原因，批准後按「重新檢查」進入。

教師工作室的「准用電郵申請」提供兩種批准方式：

- **連結現有學生帳號**：明確選擇學生，沿用原 studentId、角色、個人資料及成績，不修改 profile。
- **建立新學生帳號**：老師確認或修正班別、學號及姓名，建立 profile 與准用電郵。相同班別及學號已有 profile 時，要求改為連結，避免重複學生。

拒絕時必須填寫原因（最多 200 字）。申請人填寫的資料不等同已驗證身分，教師應核對名冊後才批准。原有 CSV 匯入和手動連結功能仍可使用；審批後使用名單管理時，可按「重新讀取名單」更新顯示。

批准在 Firestore transaction 中同時寫入申請結果、access 及（新建時）profile。重新讀取申請防止重複審批；已連結另一學生的電郵不能直接覆蓋。新建檢查使用既有 enrollment revision，名單有並行變更時須重新操作。

Firestore 規則只容許已驗證 Google 帳戶提交自己的待審申請、讀取自己的狀態，禁止申請人取得他人名單或自行授權。沿用指定教師電郵權限；批准必須有對應的有效 profile 及已啟用 access（以 getAfter 驗證同一原子寫入）。不使用外部電郵或 Cloud Functions。

## 驗證

在專案根目錄執行（Firestore 模擬器需要 Java 21）：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-content.mjs
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only firestore --project demo-hdc "node --test scripts/cloud-rules.test.mjs"
node --experimental-strip-types --test client/src/lib/contentModel.test.ts scripts/teaching.test.mjs scripts/editor.test.mjs scripts/image-position.test.mjs
node node_modules/vite/bin/vite.js build
```

規則測試包含冒名、未驗證登入、非法欄位、重複提交、自行批准、拒絕後重送、舊 profile 保留、新建原子寫入及缺失 profile/access 時整筆失敗。

## 正式啟用

本次只修改本地程式，尚未部署。正式啟用需要先將更新的 `firestore.rules` 部署到 Firebase 正式專案，再依現有網站發佈流程部署新前端。無需搬移既有 profile 或 access，也沒有新增複合索引。部署後應以測試 Google 帳戶完成一次學生申請、教師連結／新建及拒絕重送的實際瀏覽器驗收。
