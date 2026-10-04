import { collection, doc, getDocFromServer, getDocsFromServer, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, where, writeBatch, type DocumentSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { isCorrect, type Game, type GameEvent, type Question } from './model';
import { collectPages, countWrongAnswers, mergeWrongQuestions, type WrongQuestion } from './records';
import {submitRulesGameEvent} from './rulesGame';
export type QueuedEvent = { uid: string; studentId: string; gameId: string; version: string; event: GameEvent };
export type GameSession = { uid: string; studentId: string; gameId: string; version: string; status: 'open' | 'completed' | 'abandoned'; attempts: number; correct: number; lastEventId: string };
export const versionRef = (game: Pick<Game, 'gameId' | 'version'>) => doc(db, 'gameCatalog', game.gameId, 'versions', game.version);
export async function submitGameEvent(item: QueuedEvent) {
  if(item.event.protocol==='rules-game/1')return submitRulesGameEvent(item);
  if(item.event.type==='route')throw Error('移動紀錄缺少通關協定');
  if (auth.currentUser?.uid !== item.uid) throw new Error('身分不符');
  const e = item.event, ref = doc(db, 'gameSessions', e.sessionId);
  try { return await runTransaction(db, async tx => {
    if (auth.currentUser?.uid !== item.uid) throw new Error('登入已變更');
    const snapshot = await tx.get(ref);
    if (e.type === 'start') {
      if (snapshot.exists()) {
        const old = snapshot.data();
        if (old.uid !== item.uid || old.studentId !== item.studentId || old.gameId !== item.gameId || old.version !== item.version) throw new Error('場次身分不符');
        return;
      }
      tx.set(ref, { uid: item.uid, studentId: item.studentId, gameId: item.gameId, version: item.version, status: 'open', attempts: 0, correct: 0, lastEventId: '', createdAt: serverTimestamp() });
      return;
    }
    const current = snapshot.data() as GameSession | undefined;
    if (!current || current.uid !== item.uid || current.studentId !== item.studentId || current.version !== item.version || current.gameId !== item.gameId) throw new Error('找不到相符場次');
    if (e.type === 'answer') {
      const eventRef = doc(ref, 'answers', e.eventId);
      const existing = await tx.get(eventRef);
      if (existing.exists()) {
        const old = existing.data();
        if (old.questionId !== e.questionId || old.sequence !== e.sequence || JSON.stringify(old.answer) !== JSON.stringify(e.answer)) throw new Error('重送內容不一致');
        return;
      }
      if (current.status !== 'open' || current.attempts + 1 !== e.sequence) throw new Error('等待前一筆作答同步');
      const question = await tx.get(doc(versionRef(item), 'questions', e.questionId));
      if (!question.exists()) throw new Error('原版本題庫尚未發布');
      const correct = isCorrect(question.data() as Question, e.answer);
      tx.set(eventRef, { questionId: e.questionId, answer: e.answer, correct, sequence: e.sequence, createdAt: serverTimestamp() });
      tx.update(ref, { attempts: current.attempts + 1, correct: current.correct + Number(correct), lastEventId: e.eventId });
    } else {
      if (current.status === e.outcome && current.attempts === e.attempts) return;
      if (current.status !== 'open' || current.attempts !== e.attempts) throw new Error('等待全部作答同步後結算');
      tx.update(ref, { status: e.outcome, completedAt: serverTimestamp() });
    }
  }); } catch (error) {
    // Two tabs may drain the same durable queue concurrently. Rules can reject the
    // loser after the winner commits; acknowledge only an identical committed event.
    const saved = await getDocFromServer(ref);
    const s = saved.data() as GameSession | undefined;
    if (s?.uid === item.uid && s.studentId === item.studentId && s.gameId === item.gameId && s.version === item.version) {
      if (e.type === 'start') return;
      if (e.type === 'end' && s.status === e.outcome && s.attempts === e.attempts) return;
      if (e.type === 'answer') {
        const answer = await getDocFromServer(doc(ref, 'answers', e.eventId));
        if (answer.exists() && answer.data().questionId === e.questionId && answer.data().sequence === e.sequence && JSON.stringify(answer.data().answer) === JSON.stringify(e.answer)) return;
      }
    }
    throw error;
  }
}
// Published versions and questions are immutable; historical sessions retain readable prompts.
export async function publishGame(game: Game) {
  const manifest = await getDocFromServer(versionRef(game));
  if (manifest.exists()) {
    if (!manifest.data().enabled) throw new Error('此題庫版本已停用，請聯絡管理員');
    return;
  }
  const entries = Object.entries(game.questions);
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db);
    for (const [id, question] of entries.slice(i, i + 400)) batch.set(doc(versionRef(game), 'questions', id), question);
    await batch.commit();
  }
  const batch = writeBatch(db);
  batch.set(versionRef(game), { enabled: true, title: game.title, taskId: game.taskId, questionCount: entries.length });
  await batch.commit();
}
export async function loadGameSessions(studentId?: string, cursor?: DocumentSnapshot) {
  return getDocsFromServer(query(collection(db, 'gameSessions'), ...(studentId !== undefined ? [where('studentId', '==', studentId)] : []), where('status', '==', 'completed'), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(30)));
}
export type SavedSession = GameSession & { id: string; createdAt?: { toDate(): Date } };
export async function loadAllGameSessions(studentId?: string): Promise<SavedSession[]> {
  return collectPages<SavedSession, DocumentSnapshot>(async cursor => {
    const result = await loadGameSessions(studentId, cursor);
    return { rows: result.docs.map(d => ({ ...d.data() as GameSession, id: d.id })), cursor: result.docs.at(-1), more: result.size === 30 };
  });
}
type QuestionCache = Map<string, Promise<Question | null>>;
export async function loadWrongQuestions(sessionId: string, gameId: string, version: string, cache: QuestionCache = new Map()): Promise<WrongQuestion[]> {
  const answers = await getDocsFromServer(query(collection(db, 'gameSessions', sessionId, 'answers'), where('correct', '==', false)));
  const counts = countWrongAnswers(answers.docs.map(d => d.data() as { questionId: string; correct: boolean }));
  const rows: WrongQuestion[] = [];
  for (const [id, count] of Array.from(counts)) {
    const key = JSON.stringify([gameId, version, id]);
    if (!cache.has(key)) cache.set(key, getDocFromServer(doc(versionRef({ gameId, version }), 'questions', id)).then(q => q.exists() ? q.data() as Question : null));
    rows.push({ id, gameId, version, count, question: await cache.get(key)! });
  }
  return rows;
}
export async function loadCumulativeWrongQuestions(sessions: SavedSession[]) {
  const cache: QuestionCache = new Map(), rows: WrongQuestion[] = [];
  // Bound concurrent reads, and only publish a total after every session succeeds.
  for (let i = 0; i < sessions.length; i += 5) {
    const batch = await Promise.all(sessions.slice(i, i + 5).map(s => loadWrongQuestions(s.id, s.gameId, s.version, cache)));
    rows.push(...batch.flat());
  }
  return mergeWrongQuestions(rows);
}
