import { CLASS_OPTIONS, displayClass, matchesClass } from "@/lib/classOptions";
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
} from "firebase/firestore";
import { db, OWNER_EMAIL } from "@/lib/firebase";
import {
  csvText,
  downloadCsv,
  parseAccountRoster,
  type AccountRosterRow,
} from "@/lib/csv";
import type { CloudProfile } from "@/contexts/StudentAccount";
type Entry = { id: string; profile: CloudProfile };
type Access = { email: string; studentId: string; enabled: boolean };
type Plan = { row: AccountRosterRow; id: string; existing: boolean };
export default function AccountManager({
  onChanged,
  previewOnly = false,
}: {
  onChanged: () => Promise<void>;
  previewOnly?: boolean;
}) {
  const [profiles, setProfiles] = useState<Entry[]>([]),
    [access, setAccess] = useState<Access[]>([]);
  const [csv, setCsv] = useState(""),
    [plan, setPlan] = useState<Plan[]>([]),
    [email, setEmail] = useState(""),
    [sid, setSid] = useState("");
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState(""),
    [classFilter, setClassFilter] = useState("");
  const [deleting, setDeleting] = useState<Access | null>(null);
  const [loggedInStudents, setLoggedInStudents] = useState<Set<string>>(
    new Set()
  );
  const [loginFilter, setLoginFilter] = useState("");
  const hasLoggedIn = (entry: Entry) =>
    loggedInStudents.has(entry.id) || entry.profile.configured;
  async function deleteAccount() {
    if (previewOnly) throw new Error("示範預覽：不會刪除真實帳戶。");
    if (!deleting) return;
    await runTransaction(db, async tx => {
      const metaRef = doc(db, "metadata", "enrollment");
      const meta = await tx.get(metaRef);
      const accountRef = doc(db, "access", deleting.email);
      const account = await tx.get(accountRef);
      if (
        (meta.data()?.revision || 0) !== revision ||
        !account.exists() ||
        account.data().studentId !== deleting.studentId
      )
        throw new Error("名單已變更，請重新讀取名單後再操作。");
      tx.delete(accountRef);
      tx.set(metaRef, { revision: revision + 1 });
    });
    setDeleting(null);
    setEditor(null);
    setAddMode(null);
    setPlan([]);
    setNotice(
      "已刪除登入帳戶；學生資料、成績及學習紀錄保留，需要時可重新連結電郵。"
    );
    await refresh();
    await onChanged();
  }
  const [editor, setEditor] = useState<{
    id: string;
    oldEmail: string;
    email: string;
    className: string;
    studentNo: string;
    name: string;
  } | null>(null);
  const [addMode, setAddMode] = useState<"manual" | "gmail" | "csv" | null>(
    null
  );
  function edit(entry: Entry, oldEmail: string) {
    setAddMode(null);
    setNotice("");
    setEditor({
      id: entry.id,
      oldEmail,
      email: oldEmail,
      className: entry.profile.className,
      studentNo: entry.profile.studentNo,
      name: entry.profile.name,
    });
  }
  async function saveStudent() {
    if (previewOnly) throw new Error("示範預覽：不會儲存或修改真實帳戶。");
    if (!editor) return;
    // Legacy classes may be retained, but new selections use the current class list.
    const previous = profiles.find(p => p.id === editor.id)?.profile;
    const legacy =
      !!previous &&
      previous.className === editor.className &&
      !CLASS_OPTIONS.includes(editor.className);
    const [validated] = parseAccountRoster(
      csvText([
        ["email", "班別", "學號", "姓名"],
        [
          editor.email,
          legacy ? displayClass(editor.className) : editor.className,
          editor.studentNo,
          editor.name,
        ],
      ])
    );
    const { email: nextEmail, ...identity } = validated;
    if (legacy) identity.className = editor.className;
    if (nextEmail === OWNER_EMAIL) throw new Error("管理帳戶不能設為學生。");
    if (
      profiles.some(
        p =>
          p.id !== editor.id &&
          p.profile.className === identity.className &&
          p.profile.studentNo === identity.studentNo
      )
    )
      throw new Error("此班別及學號已有學生，請編輯現有學生或連結 Gmail。");
    const id = editor.id || crypto.randomUUID();
    await runTransaction(db, async tx => {
      const metaRef = doc(db, "metadata", "enrollment");
      const meta = await tx.get(metaRef);
      if ((meta.data()?.revision || 0) !== revision)
        throw new Error("名單已變更，請重新讀取名單後再儲存。");
      const profileRef = doc(db, "profiles", id);
      const current = await tx.get(profileRef);
      const bindingRef = doc(db, "access", nextEmail);
      const binding = await tx.get(bindingRef);
      const oldBinding = editor.oldEmail
        ? await tx.get(doc(db, "access", editor.oldEmail))
        : null;
      if (editor.id && !current.exists())
        throw new Error("學生紀錄不存在，請重新讀取名單。");
      if (binding.exists() && binding.data().studentId !== id)
        throw new Error("此電郵已連結另一名學生，不能覆蓋。");
      if (
        oldBinding &&
        (!oldBinding.exists() || oldBinding.data()?.studentId !== id)
      )
        throw new Error("電郵連結已變更，請重新讀取名單。");
      const profile: CloudProfile = current.exists()
        ? { ...(current.data() as CloudProfile), ...identity }
        : {
            ...identity,
            nickname: identity.name.slice(0, 20),
            avatar: "explorer",
            configured: false,
          };
      tx.set(profileRef, profile);
      tx.set(bindingRef, {
        studentId: id,
        enabled: binding.exists()
          ? binding.data().enabled
          : (oldBinding?.data()?.enabled ?? true),
      });
      if (editor.oldEmail && editor.oldEmail !== nextEmail)
        tx.delete(doc(db, "access", editor.oldEmail));
      tx.set(metaRef, { revision: revision + 1 });
    });
    setEditor(null);
    setAddMode(null);
    setPlan([]);
    setNotice(
      editor.id
        ? "學生資料已更新，原有進度及成績保留。"
        : "已新增學生並連結登入電郵。"
    );
    await refresh();
    await onChanged();
  }
  const visibleProfiles = profiles
    .filter(
      p =>
        matchesClass(p.profile.className, classFilter) &&
        (!loginFilter ||
          (loginFilter === "logged-in" ? hasLoggedIn(p) : !hasLoggedIn(p))) &&
        [
          p.profile.name,
          p.profile.studentNo,
          p.profile.className,
          ...access.filter(a => a.studentId === p.id).map(a => a.email),
        ].some(value =>
          value.toLowerCase().includes(query.trim().toLowerCase())
        )
    )
    .sort(
      (a, b) =>
        a.profile.className.localeCompare(b.profile.className) ||
        a.profile.studentNo.localeCompare(b.profile.studentNo, undefined, {
          numeric: true,
        })
    );
  async function refresh() {
    if (previewOnly) {
      const samples = [
        {
          id: "demo-1",
          name: "示例學生甲",
          className: "1A",
          studentNo: "01",
          configured: true,
        },
        {
          id: "demo-2",
          name: "示例學生乙",
          className: "1A",
          studentNo: "02",
          configured: false,
        },
        {
          id: "demo-3",
          name: "示例學生丙",
          className: "2B",
          studentNo: "03",
          configured: false,
        },
        {
          id: "demo-4",
          name: "示例學生丁",
          className: "S4",
          studentNo: "04",
          configured: true,
        },
      ];
      setProfiles(
        samples.map(({ id, ...profile }) => ({
          id,
          profile: { ...profile, nickname: profile.name, avatar: "explorer" },
        }))
      );
      setAccess(
        samples.map((p, i) => ({
          email: `demo.student${i + 1}@gmail.com`,
          studentId: p.id,
          enabled: i !== 3,
        }))
      );
      setLoggedInStudents(new Set(["demo-1", "demo-4"]));
      return;
    }
    const [ps, acs, meta, logins] = await Promise.all([
      getDocs(collection(db, "profiles")),
      getDocs(collection(db, "access")),
      getDoc(doc(db, "metadata", "enrollment")),
      getDocs(collection(db, "studentLogins")),
    ]);
    setProfiles(
      ps.docs.map(d => ({ id: d.id, profile: d.data() as CloudProfile }))
    );
    setAccess(acs.docs.map(d => ({ email: d.id, ...d.data() }) as Access));
    setRevision(meta.data()?.revision || 0);
    setLoggedInStudents(new Set(logins.docs.map(d => d.id)));
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void run(refresh);
  }, []);
  function preview() {
    const rows = parseAccountRoster(csv);
    const ids = new Set<string>();
    const next = rows.map(row => {
      if (row.email === OWNER_EMAIL)
        throw new Error("管理帳戶不能匯入為學生。");
      const binding = access.find(a => a.email === row.email);
      const id = binding?.studentId || crypto.randomUUID();
      if (ids.has(id))
        throw new Error("兩個 email 對應同一名學生；名單只保留主要 email。");
      ids.add(id);
      return { row, id, existing: !!binding };
    });
    const effective = new Map(profiles.map(p => [p.id, p.profile]));
    next.forEach(p =>
      effective.set(p.id, {
        ...p.row,
        nickname: p.row.name.slice(0, 20),
        avatar: "explorer",
        configured: false,
      })
    );
    const identities = new Set<string>();
    for (const p of Array.from(effective.values())) {
      const key = `${p.className}:${p.studentNo}`;
      if (identities.has(key))
        throw new Error(
          `${key} 已有其他學生紀錄；如屬同一人，請在下方連結 Gmail，勿另建紀錄。`
        );
      identities.add(key);
    }
    setPlan(next);
  }
  async function commit() {
    if (previewOnly) throw new Error("示範預覽：不會匯入真實帳戶。");
    let expected = revision;
    let saved = 0;
    try {
      for (let offset = 0; offset < plan.length; offset += 100) {
        const chunk = plan.slice(offset, offset + 100);
        await runTransaction(db, async tx => {
          const metaRef = doc(db, "metadata", "enrollment");
          const meta = await tx.get(metaRef);
          if ((meta.data()?.revision || 0) !== expected)
            throw new Error("名單已被其他操作更新，請重新檢查匯入。");
          for (const item of chunk) {
            const prior = profiles.find(p => p.id === item.id)?.profile;
            const { email, ...identity } = item.row;
            const profile: CloudProfile = {
              ...identity,
              nickname: prior?.nickname || identity.name.slice(0, 20),
              avatar: prior?.avatar || "explorer",
              configured: prior?.configured || false,
            };
            tx.set(doc(db, "profiles", item.id), profile);
            tx.set(doc(db, "access", email), {
              studentId: item.id,
              enabled: true,
            });
          }
          tx.set(metaRef, { revision: expected + 1 });
        });
        expected++;
        saved += chunk.length;
      }
      setNotice(`已匯入 ${saved} 人。學生登入後會自動帶出身分。`);
      setPlan([]);
      setCsv("");
    } catch (e) {
      throw new Error(
        `已完成 ${saved} 人；${e instanceof Error ? e.message : "未能完成"}。重新讀取名單後可重試。`
      );
    } finally {
      await refresh();
      await onChanged();
    }
  }
  async function link(email: string, studentId: string, enabled: boolean) {
    if (previewOnly) throw new Error("示範預覽：不會修改真實電郵連結。");
    await runTransaction(db, async tx => {
      const ref = doc(db, "metadata", "enrollment");
      const meta = await tx.get(ref);
      if ((meta.data()?.revision || 0) !== revision)
        throw new Error("名單已變更，請重新載入後再操作。");
      const profile = await tx.get(doc(db, "profiles", studentId));
      if (!profile.exists()) throw new Error("學生紀錄不存在。");
      tx.set(doc(db, "access", email), { studentId, enabled });
      tx.set(ref, { revision: revision + 1 });
    });
    await refresh();
    setPlan([]);
  }
  const editorForm = editor && (
    <form
      className="my-4 grid gap-3 border-2 p-4"
      onSubmit={e => {
        e.preventDefault();
        void run(saveStudent);
      }}
    >
      <h3 className="display-title text-xl">
        {editor.id ? "編輯學生" : "學生資料"}
      </h3>
      <p>
        {editor.id
          ? "修改此登入電郵會移除舊電郵的登入連結；其他已連結電郵及學習紀錄保留。"
          : "填寫新學生資料，以學校電郵或 Gmail 連結這位學生。"}
      </p>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <label>
          登入電郵
          <input
            required
            type="email"
            className="comic-input block w-full"
            value={editor.email}
            onChange={e => setEditor({ ...editor, email: e.target.value })}
          />
        </label>
        <label>
          班別
          <select
            className="comic-input block w-full"
            value={editor.className}
            onChange={e => setEditor({ ...editor, className: e.target.value })}
          >
            {!CLASS_OPTIONS.includes(editor.className) && (
              <option value={editor.className}>
                {editor.className}（原班別）
              </option>
            )}
            {CLASS_OPTIONS.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          學號
          <input
            required
            maxLength={12}
            className="comic-input block w-full"
            value={editor.studentNo}
            onChange={e => setEditor({ ...editor, studentNo: e.target.value })}
          />
        </label>
        <label>
          姓名
          <input
            required
            minLength={2}
            maxLength={50}
            className="comic-input block w-full"
            value={editor.name}
            onChange={e => setEditor({ ...editor, name: e.target.value })}
          />
        </label>
      </fieldset>
      <div className="flex gap-3">
        <button disabled={busy} className="pixel-button pixel-button-teal">
          {busy ? "儲存中…" : "儲存學生"}
        </button>
        <button
          disabled={busy}
          type="button"
          className="pixel-button pixel-button-paper"
          onClick={() => {
            setEditor(null);
            setAddMode(null);
          }}
        >
          取消
        </button>
      </div>
    </form>
  );
  return (
    <section className="admin-panel mt-8 p-6">
      <h2 className="display-title text-2xl">學生帳戶名單</h2>
      <p className="my-3">
        可直接新增或編輯學生，也可匯入
        email、班別、學號、姓名。學生只能選角色和暱稱，不能修改身分。學號 01 與
        1 不同，請統一格式。
      </p>
      <button
        disabled={busy}
        className="pixel-button pixel-button-teal"
        onClick={() => {
          setNotice("");
          setAddMode("manual");
          setEditor({
            id: "",
            oldEmail: "",
            email: "",
            className: "1A",
            studentNo: "",
            name: "",
          });
        }}
      >
        新增學生
      </button>
      <button
        disabled={busy}
        className="pixel-button pixel-button-paper"
        onClick={() =>
          void run(async () => {
            setPlan([]);
            await refresh();
          })
        }
      >
        重新讀取名單
      </button>
      {deleting && (
        <div
          role="alertdialog"
          aria-labelledby="delete-account-title"
          aria-describedby="delete-account-description"
          className="my-4 border-2 border-red-700 p-4"
        >
          <h3 id="delete-account-title" className="font-bold">
            確認刪除帳戶
          </h3>
          <p id="delete-account-description" className="my-3 break-all">
            將刪除{" "}
            {profiles.find(p => p.id === deleting.studentId)?.profile.name}{" "}
            的登入電郵 {deleting.email}
            。此電郵將不能登入；其他連結電郵及學生學習紀錄保留。此操作不會刪除
            Google 帳戶。
          </p>
          <div className="flex gap-3">
            <button
              disabled={busy}
              className="pixel-button pixel-button-paper text-red-800"
              onClick={() => void run(deleteAccount)}
            >
              確認刪除
            </button>
            <button
              disabled={busy}
              className="pixel-button pixel-button-paper"
              onClick={() => setDeleting(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="my-4 border-2 p-3">
          {notice}
        </p>
      )}
      {addMode && (
        <div className="my-4 border-2 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="display-title text-xl">新增學生</h3>
            <button
              disabled={busy}
              className="ml-auto underline"
              onClick={() => {
                setAddMode(null);
                setEditor(null);
              }}
            >
              關閉
            </button>
          </div>
          <div
            className="my-4 flex flex-wrap gap-3"
            role="group"
            aria-label="新增方式"
          >
            {(
              [
                ["manual", "手動新增"],
                ["gmail", "連結現有學生 Gmail"],
                ["csv", "CSV 批量匯入"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                disabled={busy}
                aria-pressed={addMode === mode}
                className={`pixel-button ${addMode === mode ? "pixel-button-teal" : "pixel-button-paper"}`}
                onClick={() => {
                  setAddMode(mode);
                  setNotice("");
                  if (mode === "manual" && !editor)
                    setEditor({
                      id: "",
                      oldEmail: "",
                      email: "",
                      className: "1A",
                      studentNo: "",
                      name: "",
                    });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {addMode === "csv" && (
            <div>
              {" "}
              <div className="flex gap-3">
                <button
                  className="pixel-button pixel-button-paper"
                  onClick={() =>
                    downloadCsv("學生帳戶名單範本.csv", [
                      ["email", "班別", "學號", "姓名"],
                      ["example@ctshkpcc.edu.hk", "1A", "01", "示例學生"],
                    ])
                  }
                >
                  下載 CSV 範本
                </button>
              </div>
              <label className="my-4 block">
                讀取 CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file)
                      void run(async () => {
                        if (file.size > 1000000)
                          throw new Error("CSV 不可超過 1 MB。");
                        setCsv(await file.text());
                        setPlan([]);
                      });
                  }}
                />
              </label>
              <label>
                或貼上 CSV
                <textarea
                  className="comic-input my-3 block min-h-28 w-full"
                  value={csv}
                  disabled={busy}
                  onChange={e => {
                    setCsv(e.target.value);
                    setPlan([]);
                  }}
                />
              </label>
              <button
                disabled={busy}
                className="pixel-button pixel-button-paper"
                onClick={() => void run(async () => preview())}
              >
                檢查及預覽名單
              </button>
              {!!plan.length && (
                <div className="my-4 border-2 p-4">
                  <p>將核准／更新 {plan.length} 人：</p>
                  <ul className="max-h-52 overflow-auto">
                    {plan.map(p => (
                      <li key={p.id}>
                        {p.row.email} → {displayClass(p.row.className)} ·{" "}
                        {p.row.studentNo} · {p.row.name}（
                        {p.existing ? "更新現有紀錄" : "新增"}）
                      </li>
                    ))}
                  </ul>
                  <button
                    disabled={busy}
                    className="pixel-button pixel-button-teal mt-3"
                    onClick={() => void run(commit)}
                  >
                    確認匯入以上名單
                  </button>
                </div>
              )}
            </div>
          )}
          {addMode === "gmail" && (
            <div>
              {" "}
              <h3 className="display-title mt-8 text-xl">連結校外 Gmail</h3>
              <p className="my-2">
                選擇現有學生，把私人 Gmail
                連到同一紀錄。原帳戶仍可使用；需要取消時，按名單上的「停用」。
              </p>
              <form
                className="grid gap-3"
                onSubmit={e => {
                  e.preventDefault();
                  void run(async () => {
                    const clean = email.trim().toLowerCase();
                    if (
                      !/^[^/\s@]+@gmail\.com$/.test(clean) ||
                      clean === OWNER_EMAIL
                    )
                      throw new Error("請輸入學生的 Gmail，不可使用管理帳戶。");
                    const previous = access.find(a => a.email === clean);
                    if (previous && previous.studentId !== sid)
                      throw new Error(
                        "此 Gmail 已對應另一名學生，請先核對身份，不能直接覆蓋。"
                      );
                    await link(clean, sid, true);
                    setEmail("");
                    setNotice("已核准 Gmail，角色及進度共用同一份紀錄。");
                  });
                }}
              >
                <label>
                  學生 Gmail
                  <input
                    required
                    type="email"
                    className="comic-input block w-full"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  對應學生
                  <select
                    required
                    className="comic-input block w-full"
                    value={sid}
                    onChange={e => setSid(e.target.value)}
                  >
                    <option value="">請選擇</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>
                        {displayClass(p.profile.className)} ·{" "}
                        {p.profile.studentNo} · {p.profile.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={busy}
                  className="pixel-button pixel-button-gold"
                >
                  核准並連結
                </button>
              </form>
            </div>
          )}
          {addMode === "manual" && editorForm}
        </div>
      )}
      {!addMode && editorForm}
      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <label>
          搜尋學生
          <input
            type="search"
            className="comic-input block w-full"
            placeholder="姓名、電郵、班別或學號"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
        <label>
          班別篩選
          <select
            className="comic-input block w-full"
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
          >
            <option value="">全部班別</option>
            {CLASS_OPTIONS.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          登入狀態
          <select
            className="comic-input block w-full"
            value={loginFilter}
            onChange={e => setLoginFilter(e.target.value)}
          >
            <option value="">全部登入狀態</option>
            <option value="pending">待首次登入</option>
            <option value="logged-in">已首次登入</option>
          </select>
        </label>
      </div>
      <p>
        顯示 {visibleProfiles.length} / {profiles.length} 位學生
      </p>
      <p className="my-2 text-sm">
        登入狀態以學生為單位。舊生已完成角色設定會列為已首次登入；未完成設定的舊登入無法追溯，需再次登入才會更新。按「重新讀取名單」取得最新狀態。
      </p>
      <ul className="my-4 max-h-96 overflow-auto">
        {visibleProfiles.map(entry => {
          const bindings = access.filter(a => a.studentId === entry.id);
          return (
            <li key={entry.id} className="my-3 border-2 p-3">
              <p className="font-bold">
                {displayClass(entry.profile.className)} ·{" "}
                {entry.profile.studentNo} · {entry.profile.name}
              </p>
              {bindings.map(a => (
                <div
                  key={a.email}
                  className="mt-2 flex flex-wrap items-center gap-3"
                >
                  <span className="break-all">
                    {a.email} · {a.enabled ? "已核准" : "已停用"}
                  </span>
                  <span
                    className="rounded border px-2 py-1 text-sm"
                    title="以學生為單位；任何已連結電郵登入均會記錄。舊生已完成角色設定亦視為曾登入。"
                  >
                    {hasLoggedIn(entry) ? "已首次登入" : "待首次登入"}
                  </span>
                  <button
                    disabled={busy}
                    className="underline"
                    onClick={() => edit(entry, a.email)}
                  >
                    編輯
                  </button>
                  <button
                    disabled={busy}
                    className="underline"
                    onClick={() =>
                      void run(async () =>
                        link(a.email, a.studentId, !a.enabled)
                      )
                    }
                  >
                    {a.enabled ? "停用" : "恢復"}
                  </button>
                  <button
                    disabled={busy}
                    className="underline text-red-800"
                    onClick={() => {
                      setNotice("");
                      setDeleting(a);
                    }}
                  >
                    刪除帳戶
                  </button>
                </div>
              ))}
              {!bindings.length && (
                <button
                  disabled={busy}
                  className="underline"
                  onClick={() => edit(entry, "")}
                >
                  編輯／連結電郵
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!visibleProfiles.length && (
        <p className="my-3">
          {profiles.length
            ? "沒有符合條件的學生。"
            : "尚未有學生，可新增學生或匯入 CSV。"}
        </p>
      )}
    </section>
  );
}
