# Decap CMS GitHub OAuth 參考

Decap CMS 的 GitHub backend 需要伺服器端 OAuth 交換；GitHub 不支援純前端 implicit grant。因此 GitHub Pages 仍需一個輕量 OAuth proxy。官方 Decap 文件列出以 edge worker／serverless handler 處理 `/auth` 與 `/callback` 的方案，也列出 Google Apps Script 社群實作。

| 來源 | URL | 關鍵用途 |
|---|---|---|
| Decap Backends Overview | https://decapcms.org/docs/backends-overview/ | `backend.base_url`、`auth_endpoint` 與 GitHub OAuth proxy 流程 |
| Decap GitHub Backend | https://decapcms.org/docs/github-backend/ | GitHub backend 需要伺服器完成認證；使用者須有 repo push 權限 |
| Decap External OAuth Clients | https://decapcms.org/docs/external-oauth-clients/ | 官方列出的社群 OAuth 代理，包括 Google Apps Script 實作 |
| Google Apps Script PKCE Proxy | https://github.com/nuzulul/decap-cms-google-apps-script | GAS + PKCE 的 Decap CMS GitHub 授權流程與設定欄位 |
| Cloudflare Worker Alternative | https://github.com/sterlingwes/decap-proxy | 可替換的自託管 Cloudflare Worker OAuth 方案 |
| Sveltia CMS Auth | https://github.com/sveltia/sveltia-cms-auth | 另一個相容 Decap 的自託管 OAuth 方案，需自行部署，沒有公共 SaaS 實例 |

本專案採用**獨立 Google Apps Script OAuth／PKCE 代理**，原因是老師的 Google Workspace 已完成授權，而且可避免增加 Cloudflare 帳戶。GitHub Client Secret 只保存在私人 Apps Script 專案；公開網站只包含 GitHub Client ID、GAS Web App URL 與固定 PKCE callback URL。
