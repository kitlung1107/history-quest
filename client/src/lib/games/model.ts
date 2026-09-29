export type Question = { title: string; prompt: string; type: string; validator: string; answer: number[]; choices: string[]; items: string[]; maxIndex: number[]; distinct: boolean };
export type Game = { gameId: string; title: string; taskId: string; url: string; version: string; questions: Record<string, Question> };
export type GameEvent = { eventId: string; sessionId: string; sequence: number } & (
  { type: 'start' } | { type: 'answer'; questionId: string; answer: number[] } |
  { type: 'end'; outcome: 'completed' | 'abandoned'; attempts: number }
);
export const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(v);
export function validAnswer(q: Question, answer: unknown): answer is number[] {
  return q.validator === 'index-array/1' && Array.isArray(answer) && answer.length === q.answer.length
    && answer.every((v, i) => Number.isInteger(v) && v >= 0 && v <= q.maxIndex[i])
    && (!q.distinct || new Set(answer).size === answer.length);
}
export function validEvent(e: any, game: Game): e is GameEvent {
  if (!e || !isId(e.eventId) || !isId(e.sessionId) || !Number.isSafeInteger(e.sequence) || e.sequence < 0) return false;
  if (e.type === 'start') return e.sequence === 0;
  if (e.type === 'end') return ['completed', 'abandoned'].includes(e.outcome) && Number.isSafeInteger(e.attempts) && e.attempts >= 0 && e.sequence === e.attempts + 1;
  return e.type === 'answer' && isId(e.questionId) && !!game.questions[e.questionId] && validAnswer(game.questions[e.questionId], e.answer) && e.sequence > 0;
}
export function isCorrect(q: Question, answer: number[]) { return validAnswer(q, answer) && JSON.stringify(answer) === JSON.stringify(q.answer); }
export function summarize(events: { questionId: string; correct: boolean }[]) {
  return { attempts: events.length, correct: events.filter(e => e.correct).length,
    wrongIds: Array.from(new Set(events.filter(e => !e.correct).map(e => e.questionId))) };
}
