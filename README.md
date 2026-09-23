# 歷史互動探索館｜History Quest

「歷史互動探索館」是為香港中一至中六學生設計的歷史科互動平台。網站以漫畫分鏡、舊報紙與像素美學呈現；公開內容由 Sveltia CMS 寫入 GitHub，學生答案、成績與教師評語由 Google Apps Script 存入私人試算表。新版教學功能須先完成 [Google 服務升級](docs/TEACHING_UPGRADE.md)。

## 系統架構

| 層面     | 實作                                                                       |
| -------- | -------------------------------------------------------------------------- |
| 網站     | React 19、TypeScript、Tailwind CSS 4、Wouter、Recharts                     |
| 託管     | GitHub Pages，透過 GitHub Actions 自動建置與部署                           |
| 內容管理 | Sveltia CMS GitHub backend；設定、教材、圖片目錄位於 `client/src/content/` |
| 成績同步 | Google Apps Script Web App，以 `text/plain` JSON POST 避免預檢問題         |
| 成績儲存 | Google 試算表 `HQ_` 分頁；相容舊任務成績分頁讀取                           |
| 身分識別 | `localStorage` 儲存班別、姓名及學號                                        |

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

每項任務為一個 JSON 檔，包含唯一 `task_id` 與 `questions` 題目清單。正式網站 `/cms/` 提供 Sveltia CMS 表單，支援首頁設定、文章、圖片、影片、iframe 遊戲、多題選擇／短答及發佈前預覽。

## 安全原則

教師 PIN 只以 SHA-256 雜湊保存在 Apps Script 內；全班數據由 GAS 驗證 PIN 後才回傳。GitHub OAuth Client Secret 只可存在私人 Apps Script OAuth 代理內，**切勿**提交到本儲存庫、`client.html` 或 `config.yml`。

## 主要路徑

| 路徑           | 用途                     |
| -------------- | ------------------------ |
| `/`            | 學生報到與歷史任務首頁   |
| `/admin`       | PIN 保護教師成績看板     |
| `/cms/`        | Sveltia CMS 內容管理     |
| `/submissions` | 學生查閱自己的提交與評語 |
| `/preview`     | CMS 草稿預覽，不提交成績 |

詳細 Google 資源與日常管理步驟請參閱 `docs/TEACHER_GUIDE.md`。
