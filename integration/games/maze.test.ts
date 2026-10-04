import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const release=JSON.parse(readFileSync('integration/games/trusted-mazes.json','utf8'));
test('all 128 trusted maps preserve the original 21×13 tree, three scattered files, doors, optional rewards and reachable exit',()=>{
 expect(release.layouts).toHaveLength(128);const ids=new Set();
 for(const m of release.layouts){ids.add(m.id);expect(m.width).toBe(21);expect(m.height).toBe(13);expect(m.floors).toHaveLength(119);expect(m.doors.length).toBeGreaterThanOrEqual(10);expect(m.doors.length).toBeLessThanOrEqual(13);expect(m.chests).toHaveLength(6);expect(m.towers).toHaveLength(3);expect(m.shortcuts.length).toBeLessThanOrEqual(3);
  const cells=new Set<number>(m.floors),distance=new Map([[m.start,0]]),queue=[m.start];for(let i=0;i<queue.length;i++)for(const n of [queue[i]-21,queue[i]+1,queue[i]+21,queue[i]-1])if(cells.has(n)&&Math.abs(n%21-queue[i]%21)+Math.abs(Math.floor(n/21)-Math.floor(queue[i]/21))===1&&!distance.has(n)){distance.set(n,distance.get(queue[i])!+1);queue.push(n);}
  expect(distance.size).toBe(119);expect(new Set([m.start,m.finish,...m.files]).size).toBe(5);for(const f of m.files)expect(distance.get(f)).toBeGreaterThanOrEqual(10);expect(distance.has(m.finish)).toBe(true);for(const d of m.doors)expect(cells.has(d)).toBe(true);
 }
 expect(ids.size).toBe(128);expect(createHash('sha256').update(JSON.stringify({protocol:release.protocol,gameId:release.gameId,questionVersion:release.questionVersion,layouts:release.layouts})).digest('hex').slice(0,32)).toBe(release.mazeVersion);
 const game=JSON.parse(readFileSync('client/src/lib/games/cold-war-maze.json','utf8'));expect(Object.keys(game.questions)).toHaveLength(400);expect(game.version).toBe(release.questionVersion);expect(game.mazeVersion).toBe(release.mazeVersion);
});
