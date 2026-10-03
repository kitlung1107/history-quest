import {localAssessments,localIdentity} from "../lib/localAssessment";
import { HISTORY_TASKS } from '../lib/historyQuest';
import { canPlayGrade } from '../lib/gradeAccess';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useStudentAccount } from './StudentAccount';
import { auth, db } from '../lib/firebase';
import { games } from '../lib/games/registry';
import { validEvent, type GameEvent } from '../lib/games/model';
import { submitGameEvent, type QueuedEvent } from '../lib/games/store';
type Sync = { authorized: boolean; pending: number; message: string; enqueue: (gameId: string, version: string, event: GameEvent) => boolean; retry: () => void };
const Context = createContext<Sync | null>(null);
export const useGameSync = () => useContext(Context);
export function GameSyncProvider({ children }: { children: ReactNode }) {
  const account = useStudentAccount();
  const [authorized, setAuthorized] = useState(false);
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState('正在核對遊戲紀錄授權…');
  const active = useRef(false), running = useRef(false);
  const persistenceFailed = useRef(false);
  const prefix = `hq-events-v1:${encodeURIComponent(account.user.uid)}:${encodeURIComponent(account.studentId)}:`;
  const alive = useRef(true);
  function queued() {
    const rows: { key: string; item: QueuedEvent }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith(prefix)) {
        const item = JSON.parse(localStorage.getItem(key)!);
        if (item.uid !== account.user.uid || item.studentId !== account.studentId) throw new Error('待同步紀錄身分不符，未合併');
        rows.push({ key, item });
      }
    }
    return rows.sort((a, b) => a.item.event.sessionId.localeCompare(b.item.event.sessionId) || a.item.event.sequence - b.item.event.sequence);
  }
  async function flush() {
    if (running.current || !active.current || (localAssessments?localIdentity.uid:auth.currentUser?.uid) !== account.user.uid) return;
    running.current = true;
    try {
      const rows = queued(); setPending(rows.length);
      const blocked = new Set<string>();
      let failure = '';
      for (const { key, item } of rows) {
        if (!alive.current || !active.current || (localAssessments?localIdentity.uid:auth.currentUser?.uid) !== account.user.uid) break;
        if (blocked.has(item.event.sessionId)) continue;
        try {
          await submitGameEvent(item);
          localStorage.removeItem(key);
        } catch (error) {
          blocked.add(item.event.sessionId);
          const code = (error as { code?: string })?.code;
          failure = code === 'permission-denied' ? '授權或題庫核對失敗，請重新登入或聯絡老師' : '請檢查網絡後重試';
        }
      }
      if (alive.current) {
        const count = queued().length; setPending(count);
        setMessage(persistenceFailed.current ? '未能保存部分紀錄；請保持遊戲開啟並允許瀏覽器儲存後重試' : count ? `待同步 ${count} 筆；${failure || '連線恢復後會重試'}` : '同步成功');
      }
    } catch { if (alive.current) setMessage('無法存取待同步紀錄；請允許瀏覽器儲存，並保持遊戲開啟後重試'); }
    finally { running.current = false; }
  }
  useEffect(() => {
    alive.current = true;
    const stop = onSnapshot(doc(db, 'access', account.user.email!.toLowerCase()), { includeMetadataChanges: true }, snapshot => {
      // A cached grant may not unlock a new game. A known live session can keep queuing offline.
      const allowed = account.teacher || snapshot.exists() && snapshot.data().enabled === true && snapshot.data().studentId === account.studentId && (localAssessments?localIdentity.uid:auth.currentUser?.uid) === account.user.uid;
      if (!snapshot.metadata.fromCache || !allowed) { active.current = allowed; setAuthorized(allowed); }
      if (active.current) void flush();
      else setMessage('尚未取得學生遊戲授權；請重新登入或聯絡老師');
    }, () => { active.current = false; setAuthorized(false); setMessage('遊戲授權已失效，請重新登入'); });
    const retry = () => void flush();
    window.addEventListener('online', retry);
    const interval = setInterval(retry, 5000);
    return () => { alive.current = false; active.current = false; stop(); clearInterval(interval); window.removeEventListener('online', retry); };
  }, [prefix]);
  function enqueue(gameId: string, version: string, event: GameEvent) {
    const game = games[gameId];
    const task = HISTORY_TASKS.find(t => t.id === game?.taskId);
    if (!task || !canPlayGrade(account, task.grade)) return false;
    if (!active.current || (localAssessments?localIdentity.uid:auth.currentUser?.uid) !== account.user.uid || !game || game.version !== version || !validEvent(event, game)) return false;
    try {
      const key = prefix + event.eventId;
      const raw = JSON.stringify({ uid: account.user.uid, studentId: account.studentId, gameId, version, event });
      const old = localStorage.getItem(key);
      if (old && old !== raw) throw new Error('事件內容不一致');
      // A repeated message after a successful flush remains safe: server transactions deduplicate it.
      localStorage.setItem(key, raw);
      persistenceFailed.current = false;
      setPending(queued().length); setMessage('待同步'); void flush(); return true;
    } catch { persistenceFailed.current = true; setMessage('無法保存待同步紀錄；請保持本頁開啟，允許瀏覽器儲存後重試'); return false; }
  }
  return <Context.Provider value={{ authorized, pending, message, enqueue, retry: () => void flush() }}>{children}</Context.Provider>;
}
