import { createHash } from "node:crypto";
import {
  FieldValue,
  type Firestore,
  type DocumentData,
} from "firebase-admin/firestore";

export const QUALIFICATION_PROTOCOL = "automatic-ledger-audit/1";
export { QualificationError, MAX_AUDIT_ENTRIES } from "../../client/src/lib/drawLedgerAudit.ts";
import { auditDrawLedger as auditLedger, QualificationError, MAX_AUDIT_ENTRIES } from "../../client/src/lib/drawLedgerAudit.ts";
const idOK = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(v);
const fail = (code: string): never => { throw new QualificationError(code); };
export function auditDrawLedger(...args: Parameters<typeof auditLedger>) {
  const { ledgerVersion, ...result } = auditLedger(...args);
  return { ...result, ledgerHash: createHash("sha256").update(ledgerVersion).digest("hex") };
}

/** Trusted queue processor; caller needs full, transactional ledger reads.
 * The wrapper is emulator-only until separately approved IAM/runner setup.
 * Two metadata writes only; no entries, wallets, access or profiles are changed. */
export async function qualifyDrawRequest(db: Firestore, sid: string) {
  if (!idOK(sid)) fail("invalid-student-id");
  return db.runTransaction(async (tx) => {
    const requestRef = db.doc("cardDrawQualificationRequests/" + sid),
      eligibilityRef = db.doc("cardDrawEligibility/" + sid);
    const [
      requestSnapshot,
      statusSnapshot,
      eligibilitySnapshot,
      walletSnapshot,
      ledger,
      claims,
    ] = await Promise.all([
      tx.get(requestRef),
      tx.get(db.doc("cardDraw/status")),
      tx.get(eligibilityRef),
      tx.get(db.doc("coinAccounts/" + sid)),
      tx.get(
        db
          .collection("coinAccounts/" + sid + "/entries")
          .limit(MAX_AUDIT_ENTRIES + 1)
      ),
      tx.get(
        db
          .collection("coinAccounts/" + sid + "/creditClaims")
          .limit(MAX_AUDIT_ENTRIES + 1)
      ),
    ]);
    const request = requestSnapshot.data(),
      status = statusSnapshot.data();
    if (!request || request.status !== "pending")
      return { status: "unchanged" };
    if (
      status?.enabled !== true ||
      status.protocolVersion !== 1 ||
      status.automaticQualificationEnabled !== true
    )
      return { status: "disabled" };
    let result: ReturnType<typeof auditDrawLedger> | undefined,
      reason = "";
    try {
      if (
        request.studentId !== sid ||
        typeof request.email !== "string" ||
        typeof request.uid !== "string" ||
        !request.uid ||
        !idOK(request.nonce)
      )
        fail("invalid-qualification-request");
      const access = (await tx.get(db.doc("access/" + request.email))).data();
      if (access?.enabled !== true || access.studentId !== sid)
        fail("account-not-active");
      const drawRows = ledger.docs.filter(
        (row) => row.data().amount < 0 && row.data().kind === "cardDraw"
      );
      if (drawRows.some((row) => !idOK(row.data().requestId)))
        fail("unproven-draw-debit");
      const receiptSnapshots = drawRows.length
        ? await tx.getAll(
            ...drawRows.map((row) =>
              db.doc(
                "cardDrawReceipts/" + sid + "/requests/" + row.data().requestId
              )
            )
          )
        : [];
      result = auditDrawLedger(
        ledger.docs.map((row) => ({ id: row.id, data: row.data() })),
        walletSnapshot.data(),
        claims.docs.map((row) => ({ id: row.id, data: row.data() })),
        new Map(
          receiptSnapshots
            .filter((row) => row.exists)
            .map((row) => [row.id, row.data()!])
        )
      );
    } catch (error) {
      if (!(error instanceof QualificationError)) throw error;
      reason = error.code;
    }
    if (result) {
      tx.set(eligibilityRef, {
        verified: true,
        walletModel: "immutable-positive-rewards-v1",
        openingBalance: 0,
        protocol: QUALIFICATION_PROTOCOL,
        ...result,
        verifiedAt: FieldValue.serverTimestamp(),
      });
      tx.update(requestRef, {
        status: "qualified",
        protocol: QUALIFICATION_PROTOCOL,
        processedAt: FieldValue.serverTimestamp(),
      });
      return { status: "qualified", legacySpent: result.legacySpent };
    }
    if (eligibilitySnapshot.exists)
      tx.set(eligibilityRef, {
        ...eligibilitySnapshot.data(),
        verified: false,
        reason,
        checkedAt: FieldValue.serverTimestamp(),
      });
    tx.update(requestRef, {
      status: "rejected",
      reason,
      protocol: QUALIFICATION_PROTOCOL,
      processedAt: FieldValue.serverTimestamp(),
    });
    return { status: "rejected", reason };
  });
}
