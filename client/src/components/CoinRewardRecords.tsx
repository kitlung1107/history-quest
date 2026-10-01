import { useState } from "react";
import { collection, getDocsFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useStudentAccount } from "@/contexts/StudentAccount";

export default function CoinRewardRecords() {
  const account = useStudentAccount();
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [entries, setEntries] = useState<
    {
      id: string;
      amount: number;
      attemptId?: string;
      kind?: string;
      createdAt?: { toDate(): Date };
    }[]
  >([]);
  const [sid, setSid] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  if (!account.teacher) return null;
  async function loadStudents() {
    setBusy(true);
    setNotice("");
    try {
      const snapshot = await getDocsFromServer(collection(db, "profiles"));
      setStudents(
        snapshot.docs.map(d => ({
          id: d.id,
          name: `${d.data().className} ${d.data().studentNo} ${d.data().name}`,
        }))
      );
    } catch {
      setNotice("未能載入學生名單，請重試。");
    } finally {
      setBusy(false);
    }
  }
  async function loadEntries() {
    setBusy(true);
    setNotice("");
    setEntries([]);
    try {
      const snapshot = await getDocsFromServer(
        collection(db, "coinAccounts", sid, "entries")
      );
      setEntries(
        snapshot.docs.map(
          d => ({ id: d.id, ...d.data() }) as (typeof entries)[number]
        )
      );
      if (snapshot.empty) setNotice("此學生尚未有探索幣派發紀錄。");
    } catch {
      setNotice("未能載入帳本，請重試。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="my-6 border-2 border-ink bg-white/60 p-4">
      <summary className="cursor-pointer font-bold">探索幣派發紀錄</summary>
      <button
        type="button"
        disabled={busy}
        className="pixel-button pixel-button-paper my-3"
        onClick={() => void loadStudents()}
      >
        載入學生名單
      </button>
      {students.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="查閱探索幣帳本的學生"
            className="min-w-0 max-w-full border p-2"
            value={sid}
            disabled={busy}
            onChange={e => {
              setSid(e.target.value);
              setEntries([]);
              setNotice("");
            }}
          >
            <option value="">請選擇學生</option>
            {students.map(student => (
              <option value={student.id} key={student.id}>
                {student.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !sid}
            className="pixel-button pixel-button-paper"
            onClick={() => void loadEntries()}
          >
            查閱帳本
          </button>
        </div>
      )}
      <ul className="mt-3 space-y-3 text-sm">
        {entries.map(entry => (
          <li key={entry.id} className="border-t pt-3 break-words">
            <strong>
              {entry.id}：{entry.amount.toLocaleString("zh-HK")} 探索幣
            </strong>
            <p>
              {entry.kind === "gameReward" ? "遊戲場次" : "測驗提交"}：
              {entry.attemptId}
            </p>
            <p>{entry.createdAt?.toDate().toLocaleString("zh-HK")}</p>
          </li>
        ))}
      </ul>
      {notice && (
        <p role="status" className="my-3">
          {notice}
        </p>
      )}
    </details>
  );
}
