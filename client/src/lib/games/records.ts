import type { Question } from './model';

export type WrongQuestion = {
  id: string; gameId: string; version: string; count: number;
  question: Question | null;
};
export function countWrongAnswers(answers: { questionId: string; correct: boolean }[]) {
  const counts = new Map<string, number>();
  for (const a of answers) if (a.correct === false) counts.set(a.questionId, (counts.get(a.questionId) || 0) + 1);
  return counts;
}
// Include content, not just the ID: IDs can be reused by a revised catalogue.
export function questionKey(q: WrongQuestion) {
  const p = q.question;
  return JSON.stringify([q.gameId, q.id, p ? [p.type, p.title, p.prompt, p.items, p.choices, p.answer] : q.version]);
}
export function mergeWrongQuestions(rows: WrongQuestion[]) {
  const merged = new Map<string, WrongQuestion>();
  for (const row of rows) {
    const key = questionKey(row), old = merged.get(key);
    merged.set(key, old ? { ...old, count: old.count + row.count } : { ...row });
  }
  return Array.from(merged.values()).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}
export const questionTypes: Record<string, string> = { mc: '選擇題', order: '排序題', match: '配對題', classify: '分類題', correct: '改錯題' };
export function correctAnswerLines(q: Question): string[] {
  const choice = (i: number) => q.choices?.[i] ?? '原版答案資料不完整';
  const item = (i: number) => q.items?.[i] ?? '原版題目資料不完整';
  switch (q.type) {
    case 'mc': return [choice(q.answer[0])];
    case 'order': return q.answer.map((i, n) => `${n + 1}. ${choice(i)}`);
    case 'match': case 'classify': return q.answer.map((i, n) => `${item(n)} → ${choice(i)}`);
    case 'correct': return [`錯誤片段：${item(q.answer[0])}`, `改為：${choice(q.answer[1])}`, `修正後：${q.items.map((s, i) => i === q.answer[0] ? choice(q.answer[1]) : s).join('')}`];
    default: return ['此題型暫未支援答案顯示'];
  }
}

export async function collectPages<T, C>(load: (cursor?: C) => Promise<{ rows: T[]; cursor?: C; more: boolean }>) {
  const rows: T[] = [];
  let cursor: C | undefined;
  do {
    const page = await load(cursor);
    rows.push(...page.rows);
    if (!page.more) return rows;
    if (page.cursor === undefined) throw new Error('缺少下一頁游標');
    cursor = page.cursor;
  } while (true);
}
