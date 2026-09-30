import { useEffect, useState } from 'react';
import { doc, getDocFromServer, type DocumentSnapshot } from 'firebase/firestore';
import { useStudentAccount } from '../contexts/StudentAccount';
import { db } from '../lib/firebase';
import { games } from '../lib/games/registry';
import { loadGameSessions, loadWrongQuestions, type GameSession } from '../lib/games/store';
type Row = GameSession & { id: string; name: string; title: string };
function SessionCard({ row }: { row: Row }) {
  const [questions, setQuestions] = useState<Awaited<ReturnType<typeof loadWrongQuestions>> | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError('');
    try { setQuestions(await loadWrongQuestions(row.id, row.gameId, row.version)); }
    catch { setError('錯題載入失敗，請重試。'); }
    finally { setBusy(false); }
  }
  return <article className="my-4 border-2 p-4">
    <h2 className="display-title text-xl">{row.title} · {row.name}</h2>
    <p className="text-sm">場次 {row.id.slice(0, 8)}</p>
    <p className="my-3 font-bold">總作答 {row.attempts} 次 · 答對 {row.correct} 次</p>
    <button className="pixel-button pixel-button-paper" disabled={busy} onClick={() => void load()}>{busy ? '讀取中…' : '查看該局錯題庫'}</button>
    {error && <p role="alert">{error}</p>}
    {questions?.length === 0 && <p className="mt-3">這一局沒有答錯的題目。</p>}
    {questions?.map(q => <section key={q.id} className="mt-4 border-t pt-3">
      <h3 className="font-bold">{q.title}</h3><p>{q.prompt}</p>
      {!!q.items.length && <ol className="my-2 list-decimal pl-6">{q.items.map((item, i) => <li key={i}>{item}</li>)}</ol>}
      {!!q.choices.length && <ul className="my-2 list-disc pl-6">{q.choices.map((item, i) => <li key={i}>{item}</li>)}</ul>}
    </section>)}
  </article>;
}
export default function GameRecords() {
  const account = useStudentAccount();
  const [rows, setRows] = useState<Row[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [cursor, setCursor] = useState<DocumentSnapshot>(), [more, setMore] = useState(false);
  async function load(next = false) {
    setBusy(true); setError('');
    try {
      const result = await loadGameSessions(account.teacher ? undefined : account.studentId, next ? cursor : undefined);
      const profiles = new Map<string, string>();
      const incoming: Row[] = [];
      for (const d of result.docs) {
        const session = d.data() as GameSession;
        if (!profiles.has(session.studentId)) {
          const p = await getDocFromServer(doc(db, 'profiles', session.studentId));
          profiles.set(session.studentId, p.exists() ? [p.data().className, p.data().studentNo, p.data().name].filter(Boolean).join(' ') : session.studentId);
        }
        incoming.push({ ...session, id: d.id, name: profiles.get(session.studentId)!, title: games[session.gameId]?.title || session.gameId });
      }
      setRows(old => next ? [...old, ...incoming].filter((r, i, all) => all.findIndex(x => x.id === r.id) === i) : incoming);
      setCursor(result.docs.at(-1)); setMore(result.size === 30);
    } catch { setError('場次載入失敗，請重試；若持續失敗，請老師確認規則與索引已發布。'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [account.studentId]);
  return <main className="paper-texture min-h-screen p-6"><div className="mx-auto max-w-4xl">
    <a className="pixel-button pixel-button-paper" href={import.meta.env.BASE_URL}>返回探索館</a>
    <h1 className="display-title my-6 text-3xl">{account.teacher ? '學生遊戲場次' : '我的遊戲場次'}</h1>
    <p>各局獨立保存。每次提交作答計一次；同一題錯多次只列一次，之後答對仍保留在該局錯題庫。</p>
    <button className="pixel-button pixel-button-paper my-4" disabled={busy} onClick={() => void load()}>重新整理</button>
    {error && <p role="alert">{error}</p>}
    {!busy && !error && !rows.length && <p>尚未有已完成並同步的場次。</p>}
    {rows.map(row => <SessionCard key={row.id} row={row} />)}
    {more && <button className="pixel-button pixel-button-paper" disabled={busy} onClick={() => void load(true)}>載入更早的 30 局</button>}
  </div></main>;
}
