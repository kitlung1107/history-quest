
import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import AccountManager from "@/components/AccountManager";
if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(location.hostname)) throw Error("Local synthetic preview only");
const db = getFirestore(initializeApp({ projectId: "demo-browser-enrollment-preview", apiKey: "emulator-only", appId: "emulator-only" }, "enrollment-preview"));
connectFirestoreEmulator(db, "127.0.0.1", 8185, { mockUserToken: {
  sub: "synthetic-enrollment-teacher", email: "kitlung1107@gmail.com", email_verified: true,
  firebase: { sign_in_provider: "google.com" },
} });
export default function LocalEnrollmentDemo() {
  return <main className="paper-texture min-h-screen p-4 mx-auto max-w-6xl">
    <h1 className="display-title text-3xl">名單儲存後，自動準備抽卡資料</h1>
    <p className="my-3">本機示範使用合成學生及隔離模擬資料。新增、匯入、連結或恢復登入時即時核證，毋須另批資格。</p>
    <p role="status">教師瀏覽器同步核證；沒有背景 runner。</p>
    <AccountManager database={db} onChanged={async () => {}} />
    <a className="mt-6 block" href="/__coin-draw-demo?scenario=earn">查看原抽卡動畫及賺幣示範</a>
  </main>;
}
