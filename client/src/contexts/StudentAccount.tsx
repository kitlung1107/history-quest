import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, googleLogin, googleLoginInThisTab, finishGoogleRedirect, googleLogout, OWNER_EMAIL, SCHOOL_DOMAIN } from "@/lib/firebase";
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
  useEffect(() => { void finishGoogleRedirect().catch(e => setError(e.message)); }, []);
  if (loading) return <main className="paper-texture min-h-screen p-10">正在確認 Google 帳戶…</main>;
  if (!account) return <main className="paper-texture min-h-screen p-6 md:p-16"><section className="admin-panel mx-auto max-w-xl p-8">
    <p className="comic-kicker">History Discovery Center</p><h1 className="display-title my-5 text-3xl">登入歷史探索館</h1>
    <p>使用老師名單中的 @{SCHOOL_DOMAIN} 學校 Google 帳戶。獲老師核准的私人 Gmail 也可登入。</p>
    {waiting && <p role="status" className="my-4">{auth.currentUser?.email} 尚未獲准使用。請把此 email 告訴老師，待核准後按「重新檢查」。</p>}
    {error && <p role="alert" className="my-4 break-words">{error}</p>}
    <div className="mt-6 flex flex-wrap gap-3"><button className="pixel-button pixel-button-gold" onClick={() => { setError(""); void googleLogin().catch(e => setError(e.message)); }}>使用 Google 登入</button>
    <button className="pixel-button pixel-button-paper" onClick={() => { setError(""); void googleLoginInThisTab().catch(e => setError(e.message)); }}>在同一分頁登入 Google</button>
    {auth.currentUser && <><button className="pixel-button pixel-button-paper" onClick={() => { setLoading(true); void refresh(); }}>重新檢查</button><button className="pixel-button pixel-button-paper" onClick={() => void googleLogout()}>登出</button></>}</div>
    <p className="mt-5 text-sm">共用電腦使用完畢請登出。網站不會取得你的 Google 密碼。</p>
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
