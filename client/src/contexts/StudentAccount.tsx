import { displayClass } from "@/lib/classOptions";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import AccessRequestForm from "@/components/AccessRequestForm";
import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import {
  auth,
  db,
  googleLogin,
  googleLogout,
  OWNER_EMAIL,
} from "@/lib/firebase";
import { CLASS_OPTIONS, type StudentProfile } from "@/lib/historyQuest";
import { characterKey, type CharacterKey } from "@/lib/characters";
import CardPicker from "@/components/CardPicker";
import ExplorerCard from "@/components/ExplorerCard";
import { EXPLORER_CARDS } from "@/lib/cards";
import {
  giftCards,
  isStudentRole,
  STUDENT_ROLES,
  type StudentRole,
  resolveCard,
} from "@/lib/cardModel";

export type CloudProfile = StudentProfile & {
  nickname: string;
  avatar: CharacterKey;
  cardId?: string;
  role?: StudentRole;
  ownedCardIds?: string[];
  legacyCardId?: string;
  configured: boolean;
};
type Account = {
  user: User;
  studentId: string;
  profile: CloudProfile | null;
  teacher: boolean;
  testingAccount: boolean;
  refresh: () => Promise<void>;
};
const Context = createContext<Account | null>(null);
export const useOptionalStudentAccount = () => useContext(Context);
export function useStudentAccount() {
  const context = useContext(Context);
  if (!context) throw new Error("請先以 Google 帳戶登入。");
  return context;
}
export function AccountGate({
  children,
  teacherPage = false,
}: {
  children: React.ReactNode;
  teacherPage?: boolean;
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  async function refresh() {
    const user = auth.currentUser;
    setAccount(null);
    setWaiting(false);
    setError("");
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const email = user.email?.toLowerCase() || "";
      const teacher = email === OWNER_EMAIL && user.emailVerified;
      const access = await getDoc(doc(db, "access", email));
      if (auth.currentUser?.uid !== user.uid) return;
      let studentId = user.uid;
      if (access.exists()) {
        if (!access.data().enabled) {
          setWaiting(true);
          return;
        }
        studentId = access.data().studentId;
      } else if (!teacher) {
        setWaiting(true);
        return;
      }
      const result = await getDoc(doc(db, "profiles", studentId));
      if (auth.currentUser?.uid !== user.uid) return;
      let profile = result.exists() ? (result.data() as CloudProfile) : null;
      if (!teacher && isStudentRole(profile?.role)) {
        profile = await runTransaction(db, async tx => {
          const ref = doc(db, "profiles", studentId);
          const latest = await tx.get(ref);
          const current = latest.data() as CloudProfile;
          if (!isStudentRole(current?.role)) return current;
          const ownedCardIds = Array.from(
            new Set([
              ...(current.ownedCardIds || []),
              ...giftCards(current.role, current.className),
            ])
          );
          if (ownedCardIds.length !== current.ownedCardIds?.length)
            tx.update(ref, { ownedCardIds });
          return { ...current, ownedCardIds };
        });
        if (auth.currentUser?.uid !== user.uid) return;
      }
      if (!teacher && profile) {
        await runTransaction(db, async tx => {
          const ref = doc(db, "studentLogins", studentId);
          const firstLogin = await tx.get(ref);
          if (!firstLogin.exists())
            tx.set(ref, { firstLoginAt: serverTimestamp() });
        });
        if (auth.currentUser?.uid !== user.uid) return;
      }
      setAccount({ user, studentId, profile, teacher, testingAccount: access.exists() && access.data().testing === true, refresh });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法讀取帳戶，請重試。");
    } finally {
      setLoading(false);
    }
  }
  useEffect(
    () =>
      onAuthStateChanged(auth, () => {
        setLoading(true);
        void refresh();
      }),
    []
  );
  useEffect(() => {
    if (!account || account.teacher) return;
    return onSnapshot(doc(db, "profiles", account.studentId), snapshot => {
      setAccount(current => current ? { ...current, profile: snapshot.exists() ? snapshot.data() as CloudProfile : null } : current);
    }, () => setAccount(current => current ? { ...current, profile: null } : current));
  }, [account?.user.uid, account?.studentId, account?.teacher]);
  useEffect(() => {
    if (!account || account.teacher) return;
    const email = account.user.email!.toLowerCase(), sid = account.studentId;
    return onSnapshot(doc(db, "access", email), snapshot => {
      if (!snapshot.exists() || snapshot.data().enabled !== true || snapshot.data().studentId !== sid) {
        void refresh();
        return;
      }
      setAccount(current => current?.studentId === sid && current.user.email?.toLowerCase() === email
        ? { ...current, testingAccount: snapshot.data().testing === true } : current);
    }, () => setAccount(current => current ? { ...current, testingAccount: false } : current));
  }, [account?.user.uid, account?.studentId, account?.teacher]);
  if (loading)
    return (
      <main className="paper-texture min-h-screen p-10">
        正在確認 Google 帳戶…
      </main>
    );
  if (!account)
    return (
      <main
        className="login-scene"
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}images/login-history.webp)`,
        }}
      >
        <picture className="login-phone-art" aria-hidden="true">
          <source
            media="(max-width:1000px) and (max-height:500px) and (orientation:landscape)"
            srcSet={`${import.meta.env.BASE_URL}images/login-phone-landscape.webp`}
          />
          <source
            media="(max-width:600px) and (orientation:portrait)"
            srcSet={`${import.meta.env.BASE_URL}images/login-phone.webp`}
          />
          <source
            media="(min-width:601px) and (max-width:1400px) and (orientation:portrait)"
            srcSet={`${import.meta.env.BASE_URL}images/login-ipad.webp`}
          />
          <img
            src={`${import.meta.env.BASE_URL}images/login-history.webp`}
            alt=""
          />
        </picture>
        <section className="login-card" aria-labelledby="login-title">
          <p className="login-kicker">History Discovery Center</p>
          <h1 id="login-title" className="display-title login-title">
            登入歷史探索館
          </h1>
          {waiting && auth.currentUser?.email && (
            <AccessRequestForm
              key={auth.currentUser.uid}
              email={auth.currentUser.email.toLowerCase()}
            />
          )}
          {error && (
            <p role="alert" className="my-4 break-words">
              {error}
            </p>
          )}
          <div className="login-action">
            <button
              type="button"
              className="pixel-button pixel-button-gold login-google"
              onClick={() => {
                setError("");
                void googleLogin().catch(e => setError(e.message));
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 48 48"
                className="login-google-icon"
              >
                <circle cx="24" cy="24" r="24" fill="white" />
                <path
                  fill="#4285F4"
                  d="M40 24.4c0-1.1-.1-2.2-.3-3.3H24v6.3h9c-.4 2.1-1.6 3.9-3.4 5.1v4.2h5.5c3.2-3 4.9-7.2 4.9-12.3Z"
                />
                <path
                  fill="#34A853"
                  d="M24 40c4.5 0 8.3-1.5 11.1-4.1l-5.5-4.2c-1.5 1-3.4 1.6-5.6 1.6-4.3 0-7.9-2.9-9.2-6.7H9.1v4.4A16.8 16.8 0 0 0 24 40Z"
                />
                <path
                  fill="#FBBC05"
                  d="M14.8 26.6a10 10 0 0 1 0-6.4v-4.4H9.1a16.8 16.8 0 0 0 0 15.2l5.7-4.4Z"
                />
                <path
                  fill="#EA4335"
                  d="M24 13.4c2.4 0 4.5.8 6.2 2.4l4.6-4.6A16 16 0 0 0 24 7a16.8 16.8 0 0 0-14.9 8.8l5.7 4.4c1.3-3.9 4.9-6.8 9.2-6.8Z"
                />
              </svg>
              <span>
                {auth.currentUser
                  ? "使用其他 Google 帳戶登入"
                  : "使用 Google 登入"}
              </span>
            </button>
          </div>
          <p className="text-sm leading-7">
            請使用學校 Google 帳戶登入。
            <br />
            獲老師核准的私人 Gmail 也可登入。
          </p>
          {auth.currentUser && (
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                className="pixel-button pixel-button-paper"
                onClick={() => {
                  setLoading(true);
                  void refresh();
                }}
              >
                重新檢查
              </button>
              <button
                className="pixel-button pixel-button-paper"
                onClick={() => void googleLogout()}
              >
                登出
              </button>
            </div>
          )}
          <p className="login-footer">
            登入會保留並共用至其他分頁；共用電腦使用完畢請登出。
            <br />
            網站不會取得你的 Google 密碼。
          </p>
        </section>
      </main>
    );
  if (teacherPage && !account.teacher)
    return (
      <main className="p-10">
        這個帳戶沒有教師權限。<a href={import.meta.env.BASE_URL}>返回首頁</a>
      </main>
    );
  if (!account.profile && !teacherPage && !account.teacher)
    return (
      <main className="p-10">
        學生名單設定未完整，請聯絡老師。
        <button onClick={() => void googleLogout()}>登出</button>
      </main>
    );
  return (
    <Context.Provider value={account}>
      {!account.teacher && account.profile &&
      (!account.profile.configured || !isStudentRole(account.profile.role)) &&
      !teacherPage ? (
        <ProfileForm />
      ) : (
        children
      )}
    </Context.Provider>
  );
}
export function ProfileForm({ onDone }: { onDone?: () => void }) {
  const account = useStudentAccount();
  return (
    <ProfileEditor
      initialProfile={account.profile!}
      email={account.user.email || ""}
      onSave={async profile => {
        await runTransaction(db, async tx => {
          const ref = doc(db, "profiles", account.studentId);
          const snapshot = await tx.get(ref);
          if (!snapshot.exists()) throw new Error("找不到學生帳戶。");
          const current = snapshot.data() as CloudProfile;
          if (!isStudentRole(profile.role)) throw new Error("請選擇角色。");
          if (current.role && current.role !== profile.role)
            throw new Error("角色已鎖定，請重新載入。");
          const ownedCardIds = Array.from(
            new Set([
              ...(current.role ? current.ownedCardIds || [] : []),
              ...giftCards(profile.role, current.className),
            ])
          );
          if (
            !resolveCard(EXPLORER_CARDS, profile.cardId, {
              role: profile.role,
              ownedCardIds,
            })
          )
            throw new Error("只能展示自己角色已擁有的卡片。");
          tx.update(ref, {
            nickname: profile.nickname,
            role: profile.role,
            ownedCardIds,
            cardId: profile.cardId,
            configured: true,
            ...(!current.role && current.cardId
              ? { legacyCardId: current.cardId }
              : {}),
          });
        });
        await account.refresh();
        onDone?.();
      }}
      onLogout={() => void googleLogout()}
    />
  );
}

/** Shared presentation; preview callers supply local-only persistence. */
export function ProfileEditor({
  initialProfile,
  email,
  onSave,
  onLogout,
  onCancel,
}: {
  initialProfile: CloudProfile;
  email: string;
  onSave: (profile: CloudProfile) => Promise<void>;
  onLogout?: () => void;
  onCancel?: () => void;
}) {
  const [profile, setProfile] = useState<CloudProfile>(() => ({
    ...initialProfile,
    avatar: characterKey(initialProfile.avatar),
    nickname: initialProfile.nickname || "歷史小探員",
    cardId: resolveCard(EXPLORER_CARDS, initialProfile.cardId, initialProfile)
      ?.id,
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="profile-page mx-auto min-h-screen max-w-5xl p-5 md:p-8">
      <h1 className="display-title text-3xl">我的卡片</h1>
      <p className="my-3">{email}</p>
      <form
        className="grid gap-5"
        onSubmit={async e => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const next = {
              ...profile,
              name: profile.name.trim(),
              studentNo: profile.studentNo.trim().toUpperCase(),
              nickname: profile.nickname.trim(),
            };
            if (!next.nickname || next.name.length < 2)
              throw new Error("請填寫姓名及暱稱。");
            if (!isStudentRole(next.role))
              throw new Error("請先選擇男學生或女學生。");
            if (initialProfile.role && initialProfile.role !== next.role)
              throw new Error("角色已鎖定。");
            if (!resolveCard(EXPLORER_CARDS, next.cardId, next))
              throw new Error("請選擇已擁有的同角色卡片。");
            await onSave({ ...next, configured: true });
          } catch (err) {
            const permissionDenied =
              typeof err === "object" &&
              err !== null &&
              "code" in err &&
              err.code === "permission-denied";
            setError(
              permissionDenied
                ? "暫時未能儲存卡片，請稍後再試或聯絡老師。你的修改仍保留在此頁。"
                : err instanceof Error
                  ? err.message
                  : "未能儲存，請重試。"
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label>
            班別
            <select
              required
              disabled
              className="comic-input block w-full"
              value={profile.className}
              onChange={e =>
                setProfile({ ...profile, className: e.target.value })
              }
            >
              <option value="">選擇班別</option>
              {profile.className &&
                !CLASS_OPTIONS.includes(profile.className) && (
                  <option value={profile.className}>
                    {displayClass(profile.className)}
                  </option>
                )}
              {CLASS_OPTIONS.map(c => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            姓名
            <input
              required
              minLength={2}
              maxLength={50}
              disabled
              className="comic-input block w-full"
              value={profile.name}
              onChange={e => setProfile({ ...profile, name: e.target.value })}
            />
          </label>
          <label>
            學號
            <input
              required
              pattern="[A-Za-z0-9-]{1,12}"
              disabled
              className="comic-input block w-full"
              value={profile.studentNo}
              onChange={e =>
                setProfile({ ...profile, studentNo: e.target.value })
              }
            />
          </label>
        </div>
        <label>
          暱稱
          <input
            required
            maxLength={20}
            className="comic-input block w-full"
            value={profile.nickname}
            onChange={e => setProfile({ ...profile, nickname: e.target.value })}
          />
        </label>
        {!isStudentRole(initialProfile.role) ? (
          <fieldset className="card-picker">
            <legend>首次選擇角色</legend>
            <p className="my-3">
              儲存後角色永久固定。所有年級獲贈新手卡，中一另獲贈同角色尼羅河卡。
            </p>
            <div className="card-picker-grid">
              {STUDENT_ROLES.map(role => (
                <label
                  className={`card-choice ${profile.role === role ? "selected" : ""}`}
                  key={role}
                >
                  <input
                    type="radio"
                    name="role"
                    required
                    checked={profile.role === role}
                    onChange={() => {
                      const ownedCardIds = giftCards(role, profile.className);
                      setProfile({
                        ...profile,
                        role,
                        ownedCardIds,
                        cardId: ownedCardIds[0],
                      });
                    }}
                  />
                  <span>{role === "studentBoy" ? "男學生" : "女學生"}</span>
                  <img
                    src={`${import.meta.env.BASE_URL}uploads/starter-explorer-${role === "studentBoy" ? "boy" : "girl"}-v1.png`}
                    alt="新手卡"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="card-editor-preview">
          <ExplorerCard
            card={resolveCard(EXPLORER_CARDS, profile.cardId, profile)}
            profile={profile}
          />
        </div>
        <CardPicker
          collection={profile}
          value={profile.cardId}
          onChange={cardId => setProfile({ ...profile, cardId })}
        />
        {error && <p role="alert">{error}</p>}
        <button disabled={busy} className="pixel-button pixel-button-gold">
          {busy ? "儲存中…" : "儲存卡片"}
        </button>
      </form>
      {onCancel ? (
        <button className="mt-5 underline" onClick={onCancel}>
          返回首頁
        </button>
      ) : (
        <a
          className="mt-5 inline-block underline"
          href={import.meta.env.BASE_URL}
        >
          返回首頁
        </a>
      )}
      {onLogout && (
        <button className="ml-6 mt-5 underline" onClick={onLogout}>
          登出 Google 帳戶
        </button>
      )}
    </section>
  );
}
