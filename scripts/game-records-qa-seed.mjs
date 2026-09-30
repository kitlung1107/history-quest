// Synthetic records for local UI verification; never connects to production.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, writeBatch, Timestamp } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId:'demo-game-sync', firestore:{host:'127.0.0.1',port:8086,rules:readFileSync('firestore.rules','utf8')} });
try { await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore(), game = JSON.parse(readFileSync('client/src/lib/games/cold-war-maze.json','utf8'));
  const ids = []; const types = new Set();
  for(const [id,q] of Object.entries(game.questions)) if(!types.has(q.type)){types.add(q.type);ids.push(id);}
  const batch = writeBatch(db);
  for(let n=0;n<33;n++) {
    const sid=n===32?'qa-student-2':'qa-student-1', id=`records-qa-${String(n).padStart(2,'0')}`;
    const wrong=n===0?ids:[ids[0],ids[0]];
    batch.set(doc(db,'gameSessions',id),{uid:sid,studentId:sid,gameId:game.gameId,version:game.version,status:'completed',attempts:wrong.length+1,correct:1,lastEventId:'right',createdAt:Timestamp.fromMillis(1700000000000+n*60000),completedAt:Timestamp.fromMillis(1700000000000+n*60000+30000)});
    wrong.forEach((qid,i)=>batch.set(doc(db,'gameSessions',id,'answers',`wrong-${i}`),{questionId:qid,answer:[0],correct:false,sequence:i+1}));
    batch.set(doc(db,'gameSessions',id,'answers','right'),{questionId:ids[0],answer:game.questions[ids[0]].answer,correct:true,sequence:wrong.length+1});
  }
  await batch.commit();
  console.log('33 completed sessions: student one 32 sessions / 67 errors; all students 33 sessions / 69 errors. MC totals 63 / 65.');
}); } finally { await env.cleanup(); }
