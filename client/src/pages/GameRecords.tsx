import { useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { useStudentAccount } from '../contexts/StudentAccount';
import { db } from '../lib/firebase';
import { games } from '../lib/games/registry';
import { confirmGameCoins } from '../lib/coinStore';
import { loadAllGameSessions, loadCumulativeWrongQuestions, loadWrongQuestions, type SavedSession } from '../lib/games/store';
import { correctAnswerLines, questionKey, questionTypes, type WrongQuestion } from '../lib/games/records';

function WrongList({ rows }: { rows: WrongQuestion[] }) {
  const [shown, setShown] = useState(20);
  return <div>
    <p className="my-3 font-bold">共 {rows.length} 題 · 累積答錯 {rows.reduce((n, q) => n + q.count, 0)} 次</p>
    {!rows.length && <p>沒有答錯的題目。</p>}
    {rows.slice(0, shown).map(row => {
      const q = row.question;
      return <section key={questionKey(row)} className="my-4 border-2 border-stone-400 bg-white/70 p-4 break-words">
        <p className="text-sm">{games[row.gameId]?.title || row.gameId} · {q ? questionTypes[q.type] || q.type : row.id}</p>
        <h3 className="my-2 text-lg font-bold">{q?.title || '原版題目暫缺'} <span className="inline-block text-red-800">答錯 {row.count} 次</span></h3>
        {q ? <>
          <p className="whitespace-pre-wrap">{q.prompt}</p>
          {!!q.items?.length && <><h4 className="mt-3 font-bold">題目內容</h4><ol className="list-decimal pl-6">{q.items.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
          {!!q.choices?.length && <><h4 className="mt-3 font-bold">{q.type === 'correct' ? '替換選項' : '選項'}</h4><ol className="list-decimal pl-6">{q.choices.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
          <div className="mt-4 border-l-4 border-green-700 bg-green-50 p-3 text-green-950"><h4 className="font-bold">正確答案{q.type === 'order' ? '（由先至後）' : ''}</h4>{correctAnswerLines(q).map((s, i) => <p className="mt-1 whitespace-pre-wrap" key={i}>{s}</p>)}</div>
        </> : <p role="alert">原版本 {row.version} 的題目未能找到，已保留答錯次數。請老師檢查原版題庫，再重新整理。</p>}
      </section>;
    })}
    {shown < rows.length && <button className="pixel-button pixel-button-paper" onClick={() => setShown(n => n + 20)}>顯示更多錯題（尚餘 {rows.length - shown} 題）</button>}
  </div>;
}
function WrongBank({ sessions, single = false }: { sessions: SavedSession[]; single?: boolean }) {
  const [rows, setRows] = useState<WrongQuestion[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [expanded, setExpanded] = useState(true);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  async function load() {
    const request = ++generation.current;
    setBusy(true); setError(''); setRows(null); setExpanded(true);
    try {
      const s = sessions[0];
      const result = single ? await loadWrongQuestions(s.id, s.gameId, s.version) : await loadCumulativeWrongQuestions(sessions);
      if (request === generation.current) setRows(result);
    } catch { if (request === generation.current) setError('錯題載入失敗，未顯示不完整統計。請重試。'); }
    finally { if (request === generation.current) setBusy(false); }
  }
  return <div>
    <button className="pixel-button pixel-button-paper my-3" disabled={busy} onClick={() => void load()}>{busy ? '正在統計所有作答…' : rows ? '重新載入錯題' : single ? '查看該局錯題庫' : '查看累積錯題庫'}</button>
    {busy && <p role="status">正在讀取 {sessions.length} 局的錯題，場次較多時需稍候。</p>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {rows && <button className="pixel-button pixel-button-paper my-3 sm:ml-3" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? '收起錯題' : '展開錯題'}</button>}
    {rows && expanded && <WrongList rows={rows} />}
  </div>;
}
function SessionCard({ row, teacher = false }: { row: SavedSession; teacher?: boolean }) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function confirm() {
    setBusy(true); setNotice('');
    try { await confirmGameCoins(row.id); setNotice('已確認探索幣結算；如呢項任務之前已結算，餘額保持不變。'); }
    catch (e) { setNotice(e instanceof Error ? e.message : '結算失敗，請重試。'); }
    finally { setBusy(false); }
  }
  return <article className="my-4 border-2 p-4">
    <h3 className="display-title text-xl">{games[row.gameId]?.title || row.gameId}</h3>
    <p className="mt-2 text-sm break-all">{row.createdAt?.toDate().toLocaleString('zh-HK')} · 場次 {row.id}</p>
    <p className="my-3 font-bold">總作答 {row.attempts} 次 · 答對 {row.correct} 次 · 答錯 {row.attempts - row.correct} 次</p>
    {teacher && <><p className="text-sm">確認後按本局答對率及任務探索幣設定結算；每人每任務只限首次確認，重做同重複確認唔會再加幣。</p><button disabled={busy} className="pixel-button pixel-button-gold my-3" onClick={() => void confirm()}>{busy ? '結算中…' : '確認本局探索幣'}</button>{notice && <p role="status">{notice}</p>}</>}
    <WrongBank sessions={[row]} single />
  </article>;
}
export default function GameRecords() {
  const account = useStudentAccount();
  // A changed login remounts all data and invalidates in-flight reads.
  return <Records key={`${account.user.uid}:${account.studentId}:${account.teacher}`} studentId={account.studentId} teacher={account.teacher} />;
}
function Records({ studentId, teacher }: { studentId: string; teacher: boolean }) {
  const [rows, setRows] = useState<SavedSession[]>([]), [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [selected, setSelected] = useState(''), [view, setView] = useState<'sessions' | 'wrong'>('sessions');
  const [shown, setShown] = useState(30), [revision, setRevision] = useState(0);
  const generation = useRef(0);
  async function load() {
    const request = ++generation.current;
    setBusy(true); setError(''); setRows([]); setNames({}); setShown(30); setRevision(n => n + 1);
    try {
      const result = await loadAllGameSessions(teacher ? undefined : studentId);
      const profiles: Record<string, string> = {};
      // Profile failures must not hide a student's results; the stable ID remains usable.
      if (teacher) for (const sid of Array.from(new Set(result.map(s => s.studentId)))) {
        try {
          const p = await getDocFromServer(doc(db, 'profiles', sid));
          profiles[sid] = p.exists() ? [p.data().className, p.data().studentNo, p.data().name].filter(Boolean).join(' ') || sid : sid;
        } catch { profiles[sid] = `${sid}（姓名未能載入）`; }
      }
      if (request === generation.current) { setRows(result); setNames(profiles); }
    } catch { if (request === generation.current) setError('場次載入失敗，請重新整理；若持續失敗，請老師確認規則與索引已發布。'); }
    finally { if (request === generation.current) setBusy(false); }
  }
  useEffect(() => { void load(); return () => { generation.current++; }; }, []);
  const students = Array.from(new Set(rows.map(s => s.studentId)));
  const current = teacher ? rows.filter(s => s.studentId === selected) : rows;
  return <main className="paper-texture min-h-screen p-4 sm:p-6"><div className="mx-auto max-w-4xl">
    <a className="pixel-button pixel-button-paper" href={import.meta.env.BASE_URL}>返回探索館</a>
    <h1 className="display-title my-6 text-3xl">{teacher ? '學生遊戲紀錄與錯題庫' : '我的遊戲紀錄與錯題庫'}</h1>
    <p>各局獨立保存。累積錯題涵蓋所有已完成並同步的場次；每次答錯均計一次，後來答對也不會抹去。相同題目合併，內容或答案不同的版本分開列出。</p>
    <button className="pixel-button pixel-button-paper my-4" disabled={busy} onClick={() => void load()}>重新整理</button>
    {busy && <p role="status">正在載入全部已完成場次…</p>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {!busy && !error && <>
      {!rows.length ? <p>尚未有已完成並同步的場次。</p> : <>
        {teacher && <>
          <section className="my-4 border-2 bg-white/40 p-4"><h2 className="display-title text-2xl">全體學生整體錯題庫</h2><p className="mt-2">涵蓋 {students.length} 位玩家、{rows.length} 局，按累積答錯次數排列。</p><WrongBank key={`all:${revision}`} sessions={rows} /></section>
          <label htmlFor="record-player" className="mt-6 block font-bold">按玩家查看</label>
          <select id="record-player" className="my-2 w-full min-w-0 border-2 bg-white p-3" value={selected} onChange={e => { setSelected(e.target.value); setShown(30); setView('sessions'); }}><option value="">請選擇玩家</option>{students.sort((a, b) => (names[a] || a).localeCompare(names[b] || b, 'zh-HK', { numeric: true })).map(sid => <option key={sid} value={sid}>{names[sid] || sid}（{rows.filter(s => s.studentId === sid).length} 局）</option>)}</select>
        </>}
        {(!teacher || selected) && <section key={`${selected}:${revision}`}>
          <h2 className="display-title my-4 text-2xl">{teacher ? names[selected] || selected : '我的紀錄'}</h2>
          <p>已完成 {current.length} 局 · 總作答 {current.reduce((n, s) => n + s.attempts, 0)} 次 · 答對 {current.reduce((n, s) => n + s.correct, 0)} 次</p>
          <div className="my-4 flex flex-wrap gap-3"><button className={`pixel-button ${view === 'sessions' ? 'pixel-button-gold' : 'pixel-button-paper'}`} aria-pressed={view === 'sessions'} onClick={() => setView('sessions')}>每局結果及錯題</button><button className={`pixel-button ${view === 'wrong' ? 'pixel-button-gold' : 'pixel-button-paper'}`} aria-pressed={view === 'wrong'} onClick={() => setView('wrong')}>個人累積錯題</button></div>
          {view === 'wrong' ? <WrongBank sessions={current} /> : <>{current.slice(0, shown).map(row => <SessionCard key={row.id} row={row} teacher={teacher} />)}{shown < current.length && <button className="pixel-button pixel-button-paper" onClick={() => setShown(n => n + 30)}>載入更早的 30 局（尚餘 {current.length - shown} 局）</button>}</>}
        </section>}
      </>}
    </>}
  </div></main>;
}
