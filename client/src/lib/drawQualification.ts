import {
  doc,
  getDocFromServer,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { BrowserDrawError } from "./browserDraw.ts";
export const isDrawCertified = (data: any) =>
  data?.verified === true &&
  data.walletModel === "immutable-positive-rewards-v1" &&
  data.openingBalance === 0 &&
  Number.isSafeInteger(data.legacySpent ?? 0) &&
  (data.legacySpent ?? 0) >= 0;
const certified = isDrawCertified;
/** Enrollment prepares eligibility before students arrive. A draw never starts
 * an audit, creates a request, or waits for a scheduled worker. */
export async function requirePreparedDrawQualification(db: Firestore, sid: string) {
  const data = (await getDocFromServer(doc(db, "cardDrawEligibility", sid))).data();
  if (!certified(data)) throw new BrowserDrawError(
    data?.verified === false ? "qualification-rejected" : "qualification-pending",
    data?.verified === false ? "帳簿未能安全核算；未扣幣。" : "帳戶抽卡資料仍未準備好；未扣幣。"
  );
}
/** Enqueue only an authenticated identity request. The browser cannot submit a
 * balance, declare eligibility, change the reserve or process its own request. */
export async function ensureDrawQualification(
  db: Firestore,
  uid: string,
  sid: string,
  email: string,
  waitMs = 20_000
) {
  const eligibilityRef = doc(db, "cardDrawEligibility", sid),
    requestRef = doc(db, "cardDrawQualificationRequests", sid);
  if (certified((await getDocFromServer(eligibilityRef)).data())) return;
  const nonce = await runTransaction(db, async (tx) => {
    const [eligibility, request, status] = await Promise.all([
      tx.get(eligibilityRef),
      tx.get(requestRef),
      tx.get(doc(db, "cardDraw", "status")),
    ]);
    if (certified(eligibility.data())) return "";
    if (status.data()?.enabled !== true || status.data()?.protocolVersion !== 1)
      throw new BrowserDrawError("draw-disabled", "抽卡尚未啟用；未扣幣。");
    if (status.data()?.automaticQualificationEnabled !== true)
      throw new BrowserDrawError(
        "qualification-unavailable",
        "自動核算尚未啟用；未扣幣。"
      );
    const previous = request.data();
    if (previous?.status === "pending") return previous.nonce as string;
    if (previous?.requestedAt?.toMillis() > Date.now() - 30_000)
      throw new BrowserDrawError(
        "qualification-pending",
        "正在自動核實探索幣，稍後再試；未扣幣。"
      );
    const next = crypto.randomUUID();
    tx.set(requestRef, {
      studentId: sid,
      uid,
      email,
      nonce: next,
      status: "pending",
      requestedAt: serverTimestamp(),
    });
    return next;
  });
  if (!nonce) return;
  await new Promise<void>((resolve, reject) => {
    let stop: () => void = () => {};
    const timer = setTimeout(() => {
      stop();
      reject(
        new BrowserDrawError(
          "qualification-pending",
          "正在自動核實探索幣，稍後再試；未扣幣。"
        )
      );
    }, waitMs);
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      stop();
      if (error) reject(error);
      else resolve();
    };
    stop = onSnapshot(
      requestRef,
      (snapshot) => {
        const data = snapshot.data();
        if (data?.nonce !== nonce) return;
        if (data.status === "rejected")
          finish(
            new BrowserDrawError(
              "qualification-rejected",
              "帳簿資料未能安全核算；未扣幣。"
            )
          );
        if (data.status === "qualified")
          void getDocFromServer(eligibilityRef)
            .then((eligible) => {
              if (certified(eligible.data())) finish();
              else
                finish(
                  new BrowserDrawError(
                    "qualification-rejected",
                    "帳簿資料未能安全核算；未扣幣。"
                  )
                );
            })
            .catch(finish);
      },
      finish
    );
  });
}
