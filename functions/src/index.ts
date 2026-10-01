import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { settleReward } from "./rewards.ts";

initializeApp();
const db = getFirestore();
// Repeated / out-of-order delivery is expected. Transaction reads current
// state and the shared student/task ledger key before minting any coins.
export const settleNewSubmission = onDocumentWritten(
  { document: "submissions/{attempt}", region: "asia-east2", retry: true },
  async event => {
    if (event.data?.after.exists)
      await settleReward(db, "taskReward", event.params.attempt);
  }
);
export const settleVerifiedGame = onDocumentWritten(
  {
    document: "trustedGameCompletions/{session}",
    region: "asia-east2",
    retry: true,
  },
  async event => {
    if (event.data?.after.exists)
      await settleReward(db, "gameReward", event.params.session);
  }
);
// An end event can arrive after a trusted proof. Re-check without treating the
// browser's completion flag itself as proof of success.
export const settleFinishedGame = onDocumentWritten(
  { document: "gameSessions/{session}", region: "asia-east2", retry: true },
  async event => {
    if (event.data?.after.data()?.status === "completed")
      await settleReward(db, "gameReward", event.params.session);
  }
);

export const retryMyReward = onCall({ region: "asia-east2" }, async request => {
  const token = request.auth?.token;
  if (
    !token ||
    token.email_verified !== true ||
    token.firebase?.sign_in_provider !== "google.com" ||
    typeof token.email !== "string"
  )
    throw new HttpsError("unauthenticated", "請以已核准的 Google 帳戶登入。");
  const { kind, sourceId } = request.data || {};
  if (
    !["taskReward", "gameReward"].includes(kind) ||
    typeof sourceId !== "string" ||
    !/^[A-Za-z0-9_-]{1,150}$/.test(sourceId)
  )
    throw new HttpsError("invalid-argument", "重試來源無效。");
  const [access, source] = await Promise.all([
    db.doc(`access/${token.email.toLowerCase()}`).get(),
    db
      .doc(
        `${kind === "taskReward" ? "submissions" : "gameSessions"}/${sourceId}`
      )
      .get(),
  ]);
  if (
    access.data()?.enabled !== true ||
    access.data()?.studentId !== source.data()?.studentId ||
    (kind === "gameReward" && source.data()?.uid !== request.auth?.uid)
  )
    throw new HttpsError("permission-denied", "只能重試自己的獎勵核算。");
  try {
    return await settleReward(db, kind, sourceId, {
      email: token.email.toLowerCase(),
      uid: request.auth!.uid,
    });
  } catch {
    throw new HttpsError(
      "unavailable",
      "未能完成核算，請稍後重試；不會重複派發。"
    );
  }
});
