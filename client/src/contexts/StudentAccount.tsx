import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, googleLogin, googleLogout, OWNER_EMAIL } from "@/lib/firebase";
import { CLASS_OPTIONS, type StudentProfile } from "@/lib/historyQuest";

export const AVATARS = { explorer: "🧭", scholar: "📚", archaeologist: "🏺", navigator: "⛵" };
export type CloudProfile = StudentProfile & { nickname: string; avatar: keyof typeof AVATARS; configured: boolean };
type Account = { user: User; studentId: string; profile: CloudProfile | null; teacher: boolean; refresh: () => Promise<void> };
const Context = createContext<Account | null>(null);
export const useOptionalStudentAccount = () => useContext(Context);
export function useStudentAccount() {
  const context = useContext(Context);
  if (!context) throw new Error("請先以 Google 帳戶登入。");
  return context;
}
export function AccountGate({ children, teacherPage = false }: { children: React.ReactNode; teacherPage?: boolean }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  async function refresh() {
    const user = auth.currentUser;
    setAccount(null);
    setWaiting(false);
    if (!user) { setLoading(false); return; }
    try {
      const email = user.email?.toLowerCase() || "";
      const teacher = email === OWNER_EMAIL && user.emailVerified;
      const access = await getDoc(doc(db, "access", email));
      let studentId = user.uid;
      if (access.exists()) {
        if (!access.data().enabled) { setWaiting(true); return; }
        studentId = access.data().studentId;
      } else if (!teacher) {
        setWaiting(true); return;
      }
      const result = await getDoc(doc(db, "profiles", studentId));
      if (auth.currentUser?.uid !== user.uid) return;
      const profile = result.exists() ? result.data() as CloudProfile : null;
      setAccount({ user, studentId, profile, teacher, refresh });
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "無法讀取帳戶，請重試。"); }
    finally { setLoading(false); }
  }
  useEffect(() => onAuthStateChanged(auth, () => { setLoading(true); void refresh(); }), []);
  if (loading) return <main className="paper-texture min-h-screen p-10">正在確認 Google 帳戶…</main>;
  if (!account) return <main className="login-scene" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/login-history.webp)` }}>
    <picture className="login-phone-art" aria-hidden="true"><source media="(max-width:600px) and (orientation:portrait)" srcSet={`${import.meta.env.BASE_URL}images/login-phone.webp`} /><img src={`${import.meta.env.BASE_URL}images/login-history.webp`} alt="" /></picture>
    <section className="login-card" aria-labelledby="login-title">
    <p className="login-kicker">History Discovery Center</p><h1 id="login-title" className="display-title login-title">登入歷史探索館</h1>
    {waiting && <p role="status" className="my-4">{auth.currentUser?.email} 尚未獲准使用。請把此 email 告訴老師，待核准後按「重新檢查」。</p>}
    {error && <p role="alert" className="my-4 break-words">{error}</p>}
    <div className="login-action"><button type="button" className="pixel-button pixel-button-gold login-google" onClick={() => { setError(""); void googleLogin().catch(e => setError(e.message)); }}><svg aria-hidden="true" viewBox="0 0 48 48" className="login-google-icon"><circle cx="24" cy="24" r="24" fill="white"/><path fill="#4285F4" d="M40 24.4c0-1.1-.1-2.2-.3-3.3H24v6.3h9c-.4 2.1-1.6 3.9-3.4 5.1v4.2h5.5c3.2-3 4.9-7.2 4.9-12.3Z"/><path fill="#34A853" d="M24 40c4.5 0 8.3-1.5 11.1-4.1l-5.5-4.2c-1.5 1-3.4 1.6-5.6 1.6-4.3 0-7.9-2.9-9.2-6.7H9.1v4.4A16.8 16.8 0 0 0 24 40Z"/><path fill="#FBBC05" d="M14.8 26.6a10 10 0 0 1 0-6.4v-4.4H9.1a16.8 16.8 0 0 0 0 15.2l5.7-4.4Z"/><path fill="#EA4335" d="M24 13.4c2.4 0 4.5.8 6.2 2.4l4.6-4.6A16 16 0 0 0 24 7a16.8 16.8 0 0 0-14.9 8.8l5.7 4.4c1.3-3.9 4.9-6.8 9.2-6.8Z"/></svg><span>使用 Google 登入</span></button></div>
    <p className="text-sm leading-7">請使用學校 Google 帳戶登入。<br />獲老師核准的私人 Gmail 也可登入。</p>
    {auth.currentUser && <div className="mt-5 flex flex-wrap justify-center gap-3"><button className="pixel-button pixel-button-paper" onClick={() => { setLoading(true); void refresh(); }}>重新檢查</button><button className="pixel-button pixel-button-paper" onClick={() => void googleLogout()}>登出</button></div>}
    <p className="login-footer">共用電腦使用完畢請登出。<br />網站不會取得你的 Google 密碼。</p>
  </section></main>;
  if (teacherPage && !account.teacher) return <main className="p-10">這個帳戶沒有教師權限。<a href={import.meta.env.BASE_URL}>返回首頁</a></main>;
  if (account.teacher && !account.profile && !teacherPage) return <main className="paper-texture min-h-screen p-10"><h1 className="display-title text-3xl">教師帳戶已登入</h1><p className="my-5">教師帳戶不用建立學生角色。</p><a className="pixel-button pixel-button-gold" href={`${import.meta.env.BASE_URL}admin`}>前往教師工作室</a><button className="ml-4 underline" onClick={()=>void googleLogout()}>登出</button></main>;
  if (!account.profile && !teacherPage) return <main className="p-10">學生名單設定未完整，請聯絡老師。<button onClick={()=>void googleLogout()}>登出</button></main>;
  return <Context.Provider value={account}>{account.profile && !account.profile.configured && !teacherPage ? <ProfileForm /> : children}</Context.Provider>;
}
export function ProfileForm({ onDone }: { onDone?: () => void }) {
  const account = useStudentAccount();
  const [profile, setProfile] = useState<CloudProfile>(account.profile!);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="paper-texture mx-auto min-h-screen max-w-2xl p-8"><h1 className="display-title text-3xl">{account.profile ? "我的角色" : "建立你的探險角色"}</h1><p className="my-3">{account.user.email}</p>
    <form className="grid gap-5" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try {
      const next = { ...profile, name: profile.name.trim(), studentNo: profile.studentNo.trim().toUpperCase(), nickname: profile.nickname.trim() };
      if (!next.nickname || next.name.length < 2) throw new Error("請填寫姓名及角色暱稱。");
      await updateDoc(doc(db,"profiles",account.studentId), { nickname: next.nickname, avatar: next.avatar, configured: true });
      await account.refresh(); onDone?.();
    } catch (err) { setError(err instanceof Error ? err.message : "未能儲存"); } finally { setBusy(false); } }}>
      <label>班別<select required disabled={!!account.profile} className="comic-input block w-full" value={profile.className} onChange={e=>setProfile({...profile,className:e.target.value})}><option value="">選擇班別</option>{CLASS_OPTIONS.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>姓名<input required minLength={2} maxLength={50} disabled={!!account.profile} className="comic-input block w-full" value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
      <label>學號<input required pattern="[A-Za-z0-9-]{1,12}" disabled={!!account.profile} className="comic-input block w-full" value={profile.studentNo} onChange={e=>setProfile({...profile,studentNo:e.target.value})}/></label>
      <label>角色暱稱<input required maxLength={20} className="comic-input block w-full" value={profile.nickname} onChange={e=>setProfile({...profile,nickname:e.target.value})}/></label>
      <fieldset><legend>選擇角色</legend><div className="flex flex-wrap gap-3">{Object.entries(AVATARS).map(([key,emoji])=><label key={key} className="comic-input p-3 text-3xl"><input type="radio" name="avatar" checked={profile.avatar===key} onChange={()=>setProfile({...profile,avatar:key as CloudProfile["avatar"]})} aria-label={key}/>{emoji}</label>)}</div></fieldset>
      {error && <p role="alert">{error}</p>}<button disabled={busy} className="pixel-button pixel-button-gold">{busy ? "儲存中…" : "儲存角色"}</button>
    </form><button className="mt-5 underline" onClick={()=>void googleLogout()}>登出 Google 帳戶</button>
  </section>;
}
