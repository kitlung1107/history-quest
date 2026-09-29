import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId:'demo-game-sync', firestore:{ host:'127.0.0.1', port:8086, rules:readFileSync('firestore.rules','utf8') } });
try {
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [i,email] of ['qa-one@example.test','qa-two@example.test'].entries()) {
      const studentId = `qa-student-${i+1}`;
      await setDoc(doc(db,'access',email), { studentId, enabled:true });
      await setDoc(doc(db,'profiles',studentId), { className:'S5',studentNo:String(i+1),name:`測試學生${i+1}`,nickname:`測試${i+1}`,avatar:'explorer',configured:true,role:'studentBoy',cardId:'starter-explorer-boy',ownedCardIds:['starter-explorer-boy'] });
    }
    const game = JSON.parse(readFileSync('client/src/lib/games/cold-war-maze.json','utf8'));
    const batch = writeBatch(db);
    for (const [id,q] of Object.entries(game.questions)) batch.set(doc(db,'gameCatalog',game.gameId,'versions',game.version,'questions',id),q);
    batch.set(doc(db,'gameCatalog',game.gameId,'versions',game.version), { enabled:true,title:game.title,taskId:game.taskId,questionCount:Object.keys(game.questions).length });
    await batch.commit();
  });
  console.log('Seeded local-only QA students and versioned questions');
} finally { await env.cleanup(); }
