import fs from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { auditDrawLedger } from "../src/cardDrawQualification.ts";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8185") throw Error("Synthetic emulator only");
process.env.METADATA_SERVER_DETECTION = "none";
const projectId = "demo-browser-enrollment-preview";
const env = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8185, rules: fs.readFileSync("integration/assessment/compatible.rules", "utf8") } });
const app = initializeApp({ projectId }, "seed-enrollment-demo"), db = getFirestore(app);
await env.clearFirestore();
const base = { nickname: "歷史探索", avatar: "studentBoy", configured: true, role: "studentBoy", cardId: "starter-explorer-boy", ownedCardIds: ["starter-explorer-boy", "nile-explorer-boy"] };
const batch = db.batch();
for (const [path, data] of [
 ["metadata/enrollment", { revision: 0 }],
 ["profiles/preview-unlinked", { ...base, name: "示範未連結學生", className: "2A", studentNo: "02" }],
 ["coinAccounts/preview-unlinked/entries/earned", { kind: "taskReward", amount: 175 }],
 ["coinAccounts/preview-unlinked/entries/legacy", { kind: "legacyDebit", amount: -75 }],
 ["profiles/preview-ready", { ...base, name: "示範已有資格學生", className: "S4", studentNo: "01" }],
 ["access/ready.preview@gmail.com", { studentId: "preview-ready", enabled: true, testing: true }],
 ["coinAccounts/preview-ready/entries/earned", { kind: "taskReward", amount: 120 }],
 ["cardDrawEligibility/preview-ready", { verified: true, walletModel: "immutable-positive-rewards-v1", openingBalance: 0, protocol: "automatic-ledger-audit/1", verifiedAt: Timestamp.fromMillis(0), ...auditDrawLedger([{ id: "earned", data: { kind: "taskReward", amount: 120 } }], undefined, [], new Map()) }],
 ["profiles/preview-disabled", { ...base, name: "示範停用學生", className: "1B", studentNo: "03" }],
 ["access/disabled@example.test", { studentId: "preview-disabled", enabled: false }],
 ["accessRequests/applicant@example.test", { name: "示範申請學生", className: "3A", studentNo: "12", status: "pending", submittedAt: Timestamp.now() }],
] as Array<[string, any]>) batch.set(db.doc(path), data);
await batch.commit();
console.log("Seeded isolated demo-browser-enrollment-preview only; no formal roster, balances or inventory accessed.");
await env.cleanup(); await db.terminate(); await deleteApp(app);
