import {
  doc,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { coinAward, defaultCoinRule, type CoinRule } from "./coinModel";

// Read before any writes. Positive rewards are immutable; legacy zero entries
// can be replaced by the first positive reward in the same transaction.
export async function prepareCoinAward(
  tx: Transaction,
  sid: string,
  taskId: string,
  attemptId: string,
  score: number | null,
  progress: number,
  kind = "taskReward"
) {
  const ref = doc(db, "coinAccounts", sid, "entries", taskId);
  const existing = await tx.get(ref);
  const settings = await tx.get(doc(db, "coinRules", taskId));
  if (existing.exists() && existing.data().amount !== 0) return () => {};
  const rule = (settings.data() as CoinRule | undefined) ?? defaultCoinRule;
  const amount = coinAward(rule, score, progress);
  return () => {
    if (amount !== null && amount > 0)
      tx.set(ref, {
        kind,
        taskId,
        attemptId,
        amount,
        score,
        progress,
        rule,
        createdAt: serverTimestamp(),
      });
  };
}

export async function confirmGameCoins(sessionId: string) {
  return runTransaction(db, async tx => {
    const session = (await tx.get(doc(db, "gameSessions", sessionId))).data();
    if (
      !session ||
      session.status !== "completed" ||
      !Number.isInteger(session.attempts) ||
      session.attempts <= 0 ||
      !Number.isInteger(session.correct) ||
      session.correct < 0 ||
      session.correct > session.attempts
    )
      throw new Error("呢局未完成或未有有效作答成績。");
    const version = (
      await tx.get(
        doc(db, "gameCatalog", session.gameId, "versions", session.version)
      )
    ).data();
    if (!version?.taskId) throw new Error("搵唔到呢局對應嘅任務。");
    const award = await prepareCoinAward(
      tx,
      session.studentId,
      version.taskId,
      sessionId,
      Math.round((100 * session.correct) / session.attempts),
      100,
      "gameReward"
    );
    award();
  });
}
