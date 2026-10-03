import type { Game } from './model';
const modules = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<string,Game>;
export const games: Record<string, Game> = Object.fromEntries(Object.values(modules).map(game=>[
  game.gameId,
  { ...game, url: import.meta.env.DEV && import.meta.env.VITE_GAME_EMULATORS === '1' && game.gameId==='cold-war-maze' ? 'http://127.0.0.1:8186/' : game.url },
]));
export const gameForTask = (taskId: string) => Object.values(games).find(g => g.taskId === taskId);
export const gameEntry = (id: string) => `${import.meta.env.BASE_URL}?game=${encodeURIComponent(id)}`;
