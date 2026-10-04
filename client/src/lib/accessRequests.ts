import { isCurrentClass } from "./classOptions.ts";
import { collection, getDoc, getDocs, doc, runTransaction, serverTimestamp, type Firestore, type Timestamp } from "firebase/firestore";
import type { CloudProfile } from "@/contexts/StudentAccount";
import { db } from "./firebase";
import { reviewStudentAccessRequest } from "./enrollment.ts";

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
export async function reviewAccessRequest(email: string, studentId: string | null, reason: string, newProfile?: CloudProfile, database: Firestore = db) {
  return reviewStudentAccessRequest(database, email, studentId, reason, newProfile);
}
