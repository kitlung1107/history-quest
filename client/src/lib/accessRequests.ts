import { isCurrentClass } from "./classOptions.ts";
import { collection, getDoc, getDocs, doc, runTransaction, serverTimestamp, type Timestamp } from "firebase/firestore";
import type { CloudProfile } from "@/contexts/StudentAccount";
import { db } from "./firebase";

export type AccessRequest = {
  name: string; className: string; studentNo: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: Timestamp; reviewedAt?: Timestamp; studentId?: string; reason?: string;
};
export async function submitAccessRequest(email: string, identity: Pick<AccessRequest, "name" | "className" | "studentNo">) {
  const clean = { name: identity.name.trim(), className: identity.className, studentNo: identity.studentNo.trim().toUpperCase() };
  if (clean.name.length < 2 || clean.name.length > 50 || !isCurrentClass(clean.className) || !/^[A-Z0-9-]{1,12}$/.test(clean.studentNo)) throw new Error("請填寫有效的班別、學號及姓名。");
  await runTransaction(db, async tx => {
    const ref = doc(db, "accessRequests", email);
    const previous = await tx.get(ref);
    if (previous.exists() && previous.data().status !== "rejected") throw new Error("申請已提交或已批准，請重新檢查狀態。");
    tx.set(ref, { ...clean, status: "pending", submittedAt: serverTimestamp() });
  });
}
export async function reviewAccessRequest(email: string, studentId: string | null, reason: string, newProfile?: CloudProfile) {
  if (reason.trim().length > 200) throw new Error("拒絕原因最多 200 字。");
  const metaRef = doc(db, "metadata", "enrollment");
  // Read revision before the roster: any concurrent enrollment invalidates this snapshot.
  const expected = newProfile ? (await getDoc(metaRef)).data()?.revision || 0 : 0;
  if (newProfile) {
    const profiles = await getDocs(collection(db, "profiles"));
    if (profiles.docs.some(p => p.data().className === newProfile.className && p.data().studentNo === newProfile.studentNo)) throw new Error("此班別及學號已有帳號，請選擇連結現有學生。");
  }
  await runTransaction(db, async tx => {
    const ref = doc(db, "accessRequests", email);
    const request = await tx.get(ref);
    if (!request.exists() || request.data().status !== "pending") throw new Error("此申請已處理，請重新載入。");
    if (studentId) {
      const profile = await tx.get(doc(db, "profiles", studentId));
      const access = await tx.get(doc(db, "access", email));
      const meta = await tx.get(metaRef);
      if (newProfile) {
        if ((meta.data()?.revision || 0) !== expected) throw new Error("名單已更新，請重新載入後重試。");
        if (profile.exists()) throw new Error("學生帳號已存在，請重新操作。");
      } else if (!profile.exists()) throw new Error("請先匯入學生帳戶名單，再選擇對應學生。");
      if (access.exists() && access.data().studentId !== studentId) throw new Error("此電郵已連結另一學生，請核對身分。");
      if (newProfile) tx.set(doc(db, "profiles", studentId), newProfile);
      tx.set(doc(db, "access", email), { studentId, enabled: true });
      tx.set(metaRef, { revision: (meta.data()?.revision || 0) + 1 });
      tx.update(ref, { status: "approved", studentId, reviewedAt: serverTimestamp() });
    } else {
      if (!reason.trim()) throw new Error("請填寫拒絕原因，讓學生知道如何修正。");
      tx.update(ref, { status: "rejected", reason: reason.trim(), reviewedAt: serverTimestamp() });
    }
  });
}
