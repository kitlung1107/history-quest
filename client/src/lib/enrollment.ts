import {
  collection, doc, documentId, getDoc, getDocs, getDocsFromServer, limit, orderBy, query, runTransaction, serverTimestamp, startAfter,
  type Firestore, type QueryDocumentSnapshot, type Transaction,
} from "firebase/firestore";
import { isDrawCertified } from "./drawQualification.ts";
import { auditDrawLedger } from "./drawLedgerAudit.ts";
import { collectEnrollmentAuditPages } from "./enrollmentAuditPages.ts";

export const ENROLLMENT_QUALIFICATION_PROTOCOL = "teacher-enrollment/1";
// Each row introduces distinct getAfter profile/access checks. Four rows leave
// room under the 20-document Rules limit, including the shared revision guard.
export const ENROLLMENT_CHUNK_SIZE = 4;
type Identity = { name: string; className: string; studentNo: string };
export type EnrollmentChange = {
  id: string; email: string; identity?: Identity; oldEmail?: string;
  enabled?: boolean; requireExisting?: boolean; requireNew?: boolean;
};
export type EnrollmentPreparation = {
  studentId: string; email: string; nonce: string; enrollmentRevision: number;
  ready: boolean; enabled: boolean;
};
export type EnrollmentReport = { ready: number; pending: number; rejected: number; disabled: number };
const idOK = (id: string) => /^[A-Za-z0-9_-]{1,150}$/.test(id);
/** Only the verified existing Kitlung teacher can persist this certificate.
 * Server queries include orphan subcollections even when the root is absent.
 * Re-reading every named document and the wallet in the transaction guards
 * zero-to-positive changes, claims and receipts. New positive appends are safe:
 * they cannot add debt; Rules prohibit new historical negative entries. */
export async function auditEnrollmentLedger(tx: Transaction, db: Firestore, sid: string, requireZero: boolean) {
  const wallet = await tx.get(doc(db, "coinAccounts", sid));
  const groups = await Promise.all([
    collection(db, "coinAccounts", sid, "entries"),
    collection(db, "coinAccounts", sid, "creditClaims"),
    collection(db, "cardDrawReceipts", sid, "requests"),
  ].map(source => collectEnrollmentAuditPages<QueryDocumentSnapshot>(async (size, after) => {
    const page = await getDocsFromServer(query(source, orderBy(documentId()),
      ...(after ? [startAfter(after)] : []), limit(size)));
    return page.docs;
  })));
  if (requireZero && (wallet.exists() || groups.some(group => group.length > 0))) throw Error("新 SID 已有歷史帳項；請核對並連結原有帳戶，未儲存、未扣款。");
  const rows = await Promise.all(groups.map(group => Promise.all(group.map(async row => {
    const current = await tx.get(row.ref);
    if (!current.exists()) throw Error("核算期間帳項改變；請重試，未儲存、未扣款。");
    return { id: row.id, data: current.data() };
  }))));
  const { ledgerVersion, ...audit } = auditDrawLedger(rows[0], wallet.data(), rows[1], new Map(rows[2].map(row => [row.id, row.data])));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ledgerVersion));
  return { ...audit, ledgerHash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("") };
}
/** Teacher roster/access and a fully audited certificate commit together.
 * No runner, wallet creation, coin minting or inventory migration occurs. */
export async function commitEnrollmentChunk(
  db: Firestore, changes: EnrollmentChange[], expectedRevision: number,
  review?: { email: string; newProfile: boolean }
) {
  if (!changes.length || changes.length > ENROLLMENT_CHUNK_SIZE ||
      changes.some(p => !idOK(p.id) || !p.email || p.email.includes("/")) ||
      new Set(changes.map(p => p.id)).size !== changes.length ||
      new Set(changes.map(p => p.email)).size !== changes.length)
    throw new Error("學生名單格式無效。");
  return runTransaction(db, async tx => {
    const metaRef = doc(db, "metadata", "enrollment");
    const meta = await tx.get(metaRef);
    const revision = meta.data()?.revision || 0;
    if (revision !== expectedRevision) throw new Error("名單已變更，請重新讀取後再操作。");
    const application = review ? await tx.get(doc(db, "accessRequests", review.email)) : undefined;
    if (review && (!application?.exists() || application.data()?.status !== "pending"))
      throw new Error("此申請已處理，請重新載入。");
    const reads = await Promise.all(changes.map(async change => {
      const [profile, binding, oldBinding, eligibility] = await Promise.all([
        tx.get(doc(db, "profiles", change.id)),
        tx.get(doc(db, "access", change.email)),
        change.oldEmail ? tx.get(doc(db, "access", change.oldEmail)) : Promise.resolve(undefined),
        tx.get(doc(db, "cardDrawEligibility", change.id)),
      ]);
      if ((change.requireExisting || !change.identity) && !profile.exists()) throw new Error("學生紀錄不存在。");
      if (change.requireNew && profile.exists()) throw new Error("學生帳號已存在，請重新操作。");
      if (review?.newProfile && profile.exists()) throw new Error("學生帳號已存在，請重新操作。");
      if (binding.exists() && binding.data().studentId !== change.id) throw new Error("此電郵已連結另一學生，請核對身分。");
      if (oldBinding && (!oldBinding.exists() || oldBinding.data()?.studentId !== change.id)) throw new Error("電郵連結已變更，請重新讀取名單。");
      const enabled = change.enabled ?? (binding.exists() ? binding.data().enabled : oldBinding?.data()?.enabled ?? true);
      const audit = !enabled || isDrawCertified(eligibility.data()) ? undefined
        : await auditEnrollmentLedger(tx, db, change.id, change.requireNew === true || review?.newProfile === true);
      return { change, profile, binding, oldBinding, audit, preparation: {
        studentId: change.id, email: change.email, nonce: crypto.randomUUID(),
        enrollmentRevision: revision + 1, ready: isDrawCertified(eligibility.data()) || !!audit, enabled,
      } as EnrollmentPreparation };
    }));
    for (const { change, profile, binding, oldBinding, preparation, audit } of reads) {
      if (change.identity) tx.set(doc(db, "profiles", change.id), profile.exists()
        ? { ...profile.data(), ...change.identity }
        : { ...change.identity, nickname: change.identity.name.slice(0, 20), avatar: "explorer", configured: false });
      tx.set(doc(db, "access", change.email), {
        studentId: change.id, enabled: preparation.enabled,
        testing: binding.exists() ? binding.data().testing === true : oldBinding?.data()?.testing === true,
      });
      if (change.oldEmail && change.oldEmail !== change.email) tx.delete(doc(db, "access", change.oldEmail));
      if (audit) tx.set(doc(db, "cardDrawEligibility", change.id), {
        verified: true, walletModel: "immutable-positive-rewards-v1", openingBalance: 0,
        ...audit, studentId: change.id, email: change.email,
        enrollmentRevision: revision + 1, nonce: preparation.nonce,
        protocol: "teacher-browser-ledger-audit/1", verifiedAt: serverTimestamp(),
      });
    }
    tx.set(metaRef, { revision: revision + 1 });
    if (review) tx.update(doc(db, "accessRequests", review.email), {
      status: "approved", studentId: changes[0].id, reviewedAt: serverTimestamp(),
    });
    return { revision: revision + 1, preparations: reads.map(p => p.preparation) };
  });
}

/** Saving has already synchronously committed eligibility or failed atomically. */
export async function waitForEnrollmentPreparations(_db: Firestore, preparations: EnrollmentPreparation[], _waitMs?: number): Promise<EnrollmentReport> {
  return { ready: preparations.filter(p => p.enabled && p.ready).length,
    pending: 0, rejected: 0, disabled: preparations.filter(p => !p.enabled).length };
}
export function enrollmentNotice(report: EnrollmentReport) {
  return `抽卡資料：${report.ready} 人已準備好` +
    (report.pending ? `，${report.pending} 人仍在準備（未扣幣，毋須另行審批）` : "") +
    (report.rejected ? `，${report.rejected} 人帳簿未能安全核算（未扣幣）` : "") +
    (report.disabled ? `，${report.disabled} 人登入維持停用` : "") + "。";
}
export class EnrollmentImportError extends Error {
  saved: number; revision: number; report: EnrollmentReport;
  constructor(saved: number, revision: number, report: EnrollmentReport, cause: unknown) {
    super(`已完成 ${saved} 人；${cause instanceof Error ? cause.message : "未能完成"} ${enrollmentNotice(report)}重新讀取名單後可重試。`);
    this.saved = saved; this.revision = revision; this.report = report;
  }
}
export async function importStudentEnrollments(db: Firestore, changes: EnrollmentChange[], revision: number, onChunk?: (saved: number) => void) {
  let saved = 0; const preparations: EnrollmentPreparation[] = [];
  try {
    for (let offset = 0; offset < changes.length; offset += ENROLLMENT_CHUNK_SIZE) {
      const chunk = changes.slice(offset, offset + ENROLLMENT_CHUNK_SIZE);
      const result = await commitEnrollmentChunk(db, chunk, revision);
      revision = result.revision; saved += chunk.length; preparations.push(...result.preparations); onChunk?.(saved);
    }
  } catch (cause) {
    throw new EnrollmentImportError(saved, revision, await waitForEnrollmentPreparations(db, preparations), cause);
  }
  return { saved, revision, report: await waitForEnrollmentPreparations(db, preparations) };
}
export async function reviewStudentAccessRequest(db: Firestore, email: string, studentId: string | null, reason: string, identity?: Identity) {
  if (reason.trim().length > 200) throw new Error("拒絕原因最多 200 字。");
  if (!studentId) {
    if (!reason.trim()) throw new Error("請填寫拒絕原因，讓學生知道如何修正。");
    await runTransaction(db, async tx => {
      const ref = doc(db, "accessRequests", email), request = await tx.get(ref);
      if (!request.exists() || request.data().status !== "pending") throw new Error("此申請已處理，請重新載入。");
      tx.update(ref, { status: "rejected", reason: reason.trim(), reviewedAt: serverTimestamp() });
    });
    return undefined;
  }
  const expected = (await getDoc(doc(db, "metadata", "enrollment"))).data()?.revision || 0;
  if (identity) {
    const profiles = await getDocs(collection(db, "profiles"));
    if (profiles.docs.some(p => p.data().className === identity.className && p.data().studentNo === identity.studentNo)) throw new Error("此班別及學號已有帳號，請選擇連結現有學生。");
  }
  const result = await commitEnrollmentChunk(db, [{ id: studentId, email, identity, enabled: true, requireExisting: !identity }], expected, { email, newProfile: !!identity });
  return waitForEnrollmentPreparations(db, result.preparations);
}
