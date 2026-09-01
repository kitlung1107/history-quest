# 內容管理登入方式

本專案的內容管理介面位於：

> https://kitlung1107.github.io/history-quest/cms/

管理介面使用 **Sveltia CMS**，並直接透過 GitHub 權杖存取 `kitlung1107/history-quest`。這個方案不依賴 Google Apps Script 或其他 OAuth 代理，因此不會因舊代理部署失效而無法登入。

## 登入步驟

進入內容管理介面後，選擇 **Sign in with Token**。依畫面連結前往 GitHub 建立 fine-grained personal access token，將 Repository access 限定為 `history-quest`，並只授予管理內容所需的 Repository permissions。建立後，把權杖貼回登入視窗即可。

權杖只儲存在使用者瀏覽器的本機儲存空間，不會寫入網站程式碼或提交至 GitHub。不要把權杖放入 `config.yml`、Issue、Commit 或其他公開位置。若使用公用電腦，完成後應從 CMS 登出，並在 GitHub 撤銷該權杖。

## 發佈流程

在 CMS 儲存或發佈內容後，變更會直接提交至 `main` 分支。GitHub Pages 工作流程會自動重新建置及發佈網站，通常數分鐘內即可看到更新。

## 多人使用

每位具有儲存庫寫入權限的編輯者應使用自己的 GitHub 帳戶及自己的 fine-grained personal access token，不應共用權杖。若日後需要較簡單的一鍵 GitHub 登入，可再部署 Cloudflare Worker OAuth 代理，並把 CMS `base_url` 指向該代理。

## 參考資料

[Sveltia CMS 的 GitHub backend 文件](https://sveltiacms.app/en/docs/backends/github)說明了權杖登入與 OAuth 兩種模式；[Sveltia CMS 入門文件](https://sveltiacms.app/en/docs/start)提供 CDN 安裝與設定格式。
