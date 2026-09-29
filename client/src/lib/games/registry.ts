import coldWar from './cold-war-maze.json';
import type { Game } from './model';
const localGameUrl = import.meta.env.DEV && import.meta.env.VITE_GAME_EMULATORS === '1' ? 'http://127.0.0.1:8186/' : coldWar.url;
export const games: Record<string, Game> = { [coldWar.gameId]: { ...coldWar, url: localGameUrl } };
export const gameForTask = (taskId: string) => Object.values(games).find(g => g.taskId === taskId);
export const gameEntry = (id: string) => `${import.meta.env.BASE_URL}?game=${encodeURIComponent(id)}`;
