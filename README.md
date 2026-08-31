# 歷史互動探索館｜History Quest

「歷史互動探索館」是為香港中一至中六學生設計的純前端歷史科互動平台。視覺語言採用漫畫分鏡、舊報紙與 8-bit／16-bit 像素美學；內容由 Decap CMS 寫入 GitHub，學生任務成績則自動送到 Google Apps Script，再按 `task_id` 分流至同一份 Google 試算表的專屬分頁。

## 系統架構

| 層面 | 實作 |
|---|---|
| 網站 | React 19、TypeScript、Tailwind CSS 4、Wouter、Recharts |
| 託管 | GitHub Pages，透過 GitHub Actions 自動建置與部署 |
| 內容管理 | Decap CMS GitHub backend；內容位於 `client/src/content/tasks/*.json` |
| 成績同步 | Google Apps Script Web App，以 `text/plain` JSON POST 避免預檢問題 |
| 成績儲存 | 單一 Google 試算表；每個 `task_id` 自動建立一個分頁 |
| 身分識別 | `localStorage` 儲存班別、姓名及學號 |

## 本機開發

```bash
pnpm install
pnpm dev
```

執行型別與正式建置檢查：

```bash
pnpm check
GITHUB_ACTIONS=true pnpm build
```

## 內容資料格式

每項任務為一個 JSON 檔，必須包含唯一 `task_id`。老師毋須手動編輯 JSON；正式網站的 `/cms/` 會提供 Decap CMS 表單，支援文章、上載圖片、YouTube／Google Drive 影片、HTML5 iframe 遊戲與完成快問。

## 安全原則

教師 PIN 只以 SHA-256 雜湊保存在 Apps Script 內；全班數據由 GAS 驗證 PIN 後才回傳。GitHub OAuth Client Secret 只可存在私人 Apps Script OAuth 代理內，**切勿**提交到本儲存庫、`client.html` 或 `config.yml`。

## 主要路徑

| 路徑 | 用途 |
|---|---|
| `/` | 學生報到與歷史任務首頁 |
| `/admin` | PIN 保護教師成績看板 |
| `/cms/` | Decap CMS 內容管理 |

詳細 Google 資源與日常管理步驟請參閱 `docs/TEACHER_GUIDE.md`。
