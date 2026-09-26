import React from "react";
import { createRoot } from "react-dom/client";
import AccountManager from "./components/AccountManager";
import "./index.css";

if (!import.meta.env.DEV) throw new Error("僅供本機示範預覽");
createRoot(document.getElementById("root")!).render(
  <main className="paper-texture min-h-screen p-5 md:p-10">
    <div className="mx-auto max-w-6xl">
      <h1 className="display-title text-3xl">教師工作室・學生帳戶預覽</h1>
      <p className="my-3 border-2 bg-amber-100 p-3">示範資料：可試搜尋、班別與登入狀態篩選，以及編輯、新增和刪除確認畫面。儲存操作不會寫入真實帳戶。</p>
      <AccountManager previewOnly onChanged={async()=>{}}/>
    </div>
  </main>
);
