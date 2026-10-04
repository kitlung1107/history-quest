export type Question = { title: string; prompt: string; type: string; validator: string; answer: number[]; choices: string[]; items: string[]; maxIndex: number[]; distinct: boolean };
export type Game = { gameId: string; title: string; taskId: string; url: string; version: string; rulesProtocol?:string; mazeVersion?:string; questions: Record<string, Question> };
export type GameTarget={kind:'door'|'shortcut'|'chest'|'tower';cell:number};
export type GameEvent = { eventId: string; sessionId: string; sequence: number; protocol?:'rules-game/1' } & (
  { type: 'start';mapId?:string;mazeVersion?:string } | { type:'route';path:number[] } | { type: 'answer'; questionId: string; answer: number[];attempt?:number;target?:GameTarget } |
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
  const rules=e.protocol==='rules-game/1';
  if(e.protocol!==undefined&&!rules)return false;
  if(rules&&game.rulesProtocol!=='rules-game/1')return false;
  if (e.type === 'start') return e.sequence === 0 && (!rules || isId(e.mapId)&&e.mazeVersion===game.mazeVersion);
  if(e.type==='route')return rules&&e.sequence>0&&Array.isArray(e.path)&&e.path.length>=1&&e.path.length<=2&&e.path.every((n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<273);
  if (e.type === 'end') return ['completed', 'abandoned'].includes(e.outcome) && Number.isSafeInteger(e.attempts) && e.attempts >= 0 && (rules?e.sequence>0:e.sequence === e.attempts + 1);
  if(rules&&(!Number.isSafeInteger(e.attempt)||e.attempt<1||!e.target||!['door','shortcut','chest','tower'].includes(e.target.kind)||!Number.isInteger(e.target.cell)||e.target.cell<0||e.target.cell>=273))return false;
  return e.type === 'answer' && isId(e.questionId) && !!game.questions[e.questionId] && validAnswer(game.questions[e.questionId], e.answer) && e.sequence > 0;
}
export function isCorrect(q: Question, answer: number[]) { return validAnswer(q, answer) && JSON.stringify(answer) === JSON.stringify(q.answer); }
export function summarize(events: { questionId: string; correct: boolean }[]) {
  return { attempts: events.length, correct: events.filter(e => e.correct).length,
    wrongIds: Array.from(new Set(events.filter(e => !e.correct).map(e => e.questionId))) };
}
