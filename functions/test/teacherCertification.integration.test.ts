import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp, runTransaction, collection, getDocs } from "firebase/firestore";
import { commitEnrollmentChunk, importStudentEnrollments, reviewStudentAccessRequest, EnrollmentImportError, auditEnrollmentLedger } from "../../client/src/lib/enrollment.ts";
import { requirePreparedDrawQualification } from "../../client/src/lib/drawQualification.ts";
import { drawBrowserCard } from "../../client/src/lib/browserDraw.ts";
import { buildCardCatalog } from "../../scripts/card-catalog.mjs";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8185") throw Error("Synthetic emulator only");
process.env.METADATA_SERVER_DETECTION = "none";
const projectId = "demo-browser-teacher-certification-tests", app = initializeApp({ projectId }, "teacher-certification-tests"), admin = getFirestore(app);
let env: RulesTestEnvironment;
const teacherEmail = "kitlung1107@gmail.com", email = "enrolled@example.test", sid = "enrolled-student";
const token = (mail = email, verified = true, provider = "google.com") => ({ email: mail, email_verified: verified, firebase: { sign_in_provider: provider } });
const teacher = () => env.authenticatedContext("teacher_uid", token(teacherEmail)).firestore();
const student = () => env.authenticatedContext("student_uid", token()).firestore();
const identity = { name: "合成學生", className: "1A", studentNo: "01" };
const profile = { ...identity, nickname: "原有暱稱", avatar: "studentBoy", configured: true, role: "studentBoy", cardId: "starter-explorer-boy", ownedCardIds: ["starter-explorer-boy", "nile-explorer-boy"] };
const certificate = { verified: true, walletModel: "immutable-positive-rewards-v1", openingBalance: 0, legacySpent: 0, legacyDebits: {}, protocol: "automatic-ledger-audit/1" };
const catalog = buildCardCatalog(JSON.parse(fs.readFileSync("client/src/content/settings/cards.json", "utf8")));
const change = (id = sid, mail = email) => ({ id, email: mail, identity, requireNew: true });
const snapshot = async (path: string) => (await admin.doc(path).get()).data();
const exists = async (path: string) => (await admin.doc(path).get()).exists;
before(async () => { env = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8185, rules: fs.readFileSync("integration/assessment/compatible.rules", "utf8") } }); });
beforeEach(async () => { await env.clearFirestore(); await admin.doc("metadata/enrollment").set({ revision: 0 }); await admin.doc("cardDraw/status").set({ enabled: true, protocolVersion: 1, automaticQualificationEnabled: false }); await admin.doc("cardCatalog/current").set(catalog); });
after(async () => { await env.cleanup(); await admin.terminate(); await deleteApp(app); });

test("teacher synchronously commits audited zero-history certificate with roster, without runner, wallet or cards", async () => {
 const result = await commitEnrollmentChunk(teacher(), [change()], 0);
 assert.equal(result.preparations[0].ready, true);
 const cert = (await snapshot("cardDrawEligibility/" + sid))!;
 assert.equal(cert.protocol, "teacher-browser-ledger-audit/1"); assert.equal(cert.entryCount, 0); assert.equal(cert.legacySpent, 0); assert.equal(cert.openingBalance, 0);
 assert.equal(await exists("cardDrawEnrollmentRequests/" + sid), false); assert.equal(await exists("coinAccounts/" + sid), false);
 assert.equal((await snapshot("profiles/" + sid))!.ownedCardIds, undefined);
 await requirePreparedDrawQualification(student(), sid);
});

test("all S1-S6 imports prepare eligibility synchronously in bounded chunks", async () => {
 const changes = ["1A", "2A", "3A", "S4", "S5", "S6"].map((className, i) => ({ ...change("grade-" + i, `grade${i}@example.test`), identity: { ...identity, className, studentNo: String(i + 1) } }));
 const result = await importStudentEnrollments(teacher(), changes, 0);
 assert.deepEqual(result.report, { ready: 6, pending: 0, rejected: 0, disabled: 0 });
 for (const c of changes) { assert.equal((await snapshot("cardDrawEligibility/" + c.id))!.entryCount, 0); assert.equal(await exists("coinAccounts/" + c.id), false); }
});

test("old unlinked SID reserves every historical debit and retains old cards/roles/profile/entries", async () => {
 await admin.doc("profiles/" + sid).set(profile);
 await admin.doc(`coinAccounts/${sid}/entries/earned`).set({ kind: "taskReward", amount: 175 });
 await admin.doc(`coinAccounts/${sid}/entries/legacy`).set({ kind: "legacyDebit", amount: -75 });
 const prior = await snapshot("profiles/" + sid);
 await commitEnrollmentChunk(teacher(), [{ id: sid, email, enabled: true, requireExisting: true }], 0);
 const cert = (await snapshot("cardDrawEligibility/" + sid))!;
 assert.equal(cert.legacySpent, 75); assert.equal(cert.verifiedAtLedgerBalance, 100); assert.deepEqual(cert.legacyDebits, { legacy: -75 });
 assert.deepEqual(await snapshot("profiles/" + sid), prior); assert.equal(await exists("coinAccounts/" + sid), false);
 assert.equal((await snapshot(`coinAccounts/${sid}/entries/legacy`))!.amount, -75);
});

for (const [path, data] of [
 [`coinAccounts/${sid}/entries/orphan`, { kind: "legacyDebit", amount: -75 }],
 [`coinAccounts/${sid}/creditClaims/orphan`, { creditId: "orphan", amount: 100, revision: 1 }],
 [`cardDrawReceipts/${sid}/requests/orphan`, { price: 100 }],
 [`coinAccounts/${sid}`, { balance: 999 }],
] as const) test("new SID server-check rejects orphan history: " + path, async () => {
 await admin.doc(path).set(data);
 await assert.rejects(commitEnrollmentChunk(teacher(), [change()], 0), /新 SID/);
 assert.equal(await exists("profiles/" + sid), false); assert.equal(await exists("access/" + email), false); assert.equal(await exists("cardDrawEligibility/" + sid), false);
 assert.deepEqual(await snapshot(path), data); assert.equal((await snapshot("metadata/enrollment"))!.revision, 0);
});

for (const [kind, amount] of [["unknown", 100], ["taskReward", 1.5]] as const) test("existing history fails atomically on invalid source/amount " + kind + amount, async () => {
 await admin.doc("profiles/" + sid).set(profile); await admin.doc(`coinAccounts/${sid}/entries/bad`).set({ kind, amount });
 await assert.rejects(commitEnrollmentChunk(teacher(), [{ id: sid, email, enabled: true, requireExisting: true }], 0));
 assert.equal(await exists("access/" + email), false); assert.equal(await exists("cardDrawEligibility/" + sid), false); assert.deepEqual(await snapshot("profiles/" + sid), profile);
});

test("existing wallet or orphan receipt fails safe", async () => {
 await admin.doc("profiles/" + sid).set(profile); await admin.doc(`cardDrawReceipts/${sid}/requests/unknown`).set({ price: 100 });
 await assert.rejects(commitEnrollmentChunk(teacher(), [{ id: sid, email, requireExisting: true }], 0), /orphan-draw-receipt/);
 assert.equal(await exists("cardDrawEligibility/" + sid), false);
});

test("valid old qualifications are retained verbatim with inventory, role and testing flag", async () => {
 await admin.doc("profiles/" + sid).set(profile); await admin.doc("cardDrawEligibility/" + sid).set(certificate); await admin.doc("access/" + email).set({ studentId: sid, enabled: true, testing: true });
 // Deliberately invalid historical row proves this path never re-audits valid certificates.
 await admin.doc(`coinAccounts/${sid}/entries/no_reaudit`).set({ kind: "unknown", amount: 100 });
 const result = await importStudentEnrollments(teacher(), [{ id: sid, email, identity: { ...identity, name: "更正姓名" }, enabled: true, requireExisting: true }], 0);
 assert.equal(result.report.ready, 1); assert.deepEqual(await snapshot("cardDrawEligibility/" + sid), certificate);
 assert.deepEqual(await snapshot("profiles/" + sid), { ...profile, name: "更正姓名" }); assert.equal((await snapshot("access/" + email))!.testing, true);
});

test("disable/re-enable retains valid certificate; disabled account cannot draw", async () => {
 await admin.doc("profiles/" + sid).set(profile); await admin.doc("cardDrawEligibility/" + sid).set(certificate); await admin.doc("access/" + email).set({ studentId: sid, enabled: true });
 await commitEnrollmentChunk(teacher(), [{ id: sid, email, enabled: false, requireExisting: true }], 0);
 await assertFails(getDoc(doc(student(), "cardDrawEligibility", sid)));
 await commitEnrollmentChunk(teacher(), [{ id: sid, email, enabled: true, requireExisting: true }], 1);
 assert.deepEqual(await snapshot("cardDrawEligibility/" + sid), certificate); assert.deepEqual(await snapshot("profiles/" + sid), profile);
});

test("disabled uncertified account is saved without granting eligibility", async () => {
 const result = await commitEnrollmentChunk(teacher(), [{ ...change(), enabled: false }], 0);
 assert.equal(result.preparations[0].enabled, false); assert.equal(await exists("cardDrawEligibility/" + sid), false);
});

test("approval atomically creates roster and eligibility with no second approval", async () => {
 await admin.doc("accessRequests/" + email).set({ ...identity, status: "pending" });
 const report = await reviewStudentAccessRequest(teacher(), email, sid, "", identity);
 assert.equal(report?.ready, 1); assert.equal((await snapshot("accessRequests/" + email))!.status, "approved"); assert.equal((await snapshot("cardDrawEligibility/" + sid))!.verified, true);
});

test("conflicting roster revisions and parallel retries grant once", async () => {
 const results = await Promise.allSettled([commitEnrollmentChunk(teacher(), [change()], 0), commitEnrollmentChunk(teacher(), [change()], 0)]);
 assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal((await snapshot("metadata/enrollment"))!.revision, 1);
 assert.equal((await admin.collection("cardDrawEligibility").get()).size, 1); assert.equal((await admin.collection("cardDrawEnrollmentRequests").get()).size, 0);
});

test("four-row chunk fits Rules budget and preserves every atomic result", async () => {
 const changes = Array.from({ length: 4 }, (_, i) => change("four-" + i, `four${i}@example.test`));
 assert.equal((await commitEnrollmentChunk(teacher(), changes, 0)).preparations.filter(p => p.ready).length, 4);
});

test("CSV partial failure reports completed chunks and does not write failed chunk", async () => {
 const changes = Array.from({ length: 5 }, (_, i) => change("partial-" + i, `partial${i}@example.test`));
 await admin.doc("access/partial4@example.test").set({ studentId: "other", enabled: true });
 await assert.rejects(importStudentEnrollments(teacher(), changes, 0), e => e instanceof EnrollmentImportError && e.saved === 4 && e.report.ready === 4 && e.revision === 1);
 assert.equal(await exists("profiles/partial-4"), false);
});

for (const [label, mail, verified, provider] of [["student", email, true, "google.com"], ["Tang full-card", "tangkl@ctshkpcc.edu.hk", true, "google.com"], ["unverified Kitlung", teacherEmail, false, "google.com"], ["nonGoogle Kitlung", teacherEmail, true, "password"]] as const)
 test(label + " cannot certify, even with valid-shaped certificate and revision", async () => {
  const db = env.authenticatedContext("unprivileged", token(mail, verified, provider)).firestore();
  await assert.rejects(commitEnrollmentChunk(db, [change()], 0)); assert.equal(await exists("cardDrawEligibility/" + sid), false);
 });

test("teacher cannot mutate existing valid eligibility or attach funds/arbitrary fields", async () => {
 await admin.doc("profiles/" + sid).set(profile); await admin.doc("access/" + email).set({ studentId: sid, enabled: true }); await admin.doc("cardDrawEligibility/" + sid).set(certificate);
 await assertFails(updateDoc(doc(teacher(), "cardDrawEligibility", sid), { legacySpent: 0, verifiedAt: serverTimestamp() }));
 await assertFails(setDoc(doc(teacher(), "cardDrawEligibility", "forged"), { ...certificate, balance: 9000 }));
 assert.deepEqual(await snapshot("cardDrawEligibility/" + sid), certificate);
});

test("teacher-browser audit guards a concurrent zero-to-positive row change by rereading transaction docs", async () => {
 await admin.doc("profiles/" + sid).set(profile); await admin.doc(`coinAccounts/${sid}/entries/reward`).set({ kind: "taskReward", amount: 0 });
 let changed = false;
 const db = teacher();
 const result = await runTransaction(db, async tx => {
  const guarded = new Proxy(tx, { get(target, key) {
   if (key === "get") return async (ref: any) => {
    if (ref.path.endsWith("/entries/reward") && !changed) { changed = true; await admin.doc(ref.path).set({ kind: "taskReward", amount: 120 }); }
    return target.get(ref);
   };
   const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  }});
  return auditEnrollmentLedger(guarded, db, sid, false);
 });
 assert.equal(result.verifiedAtLedgerBalance, 120); assert.equal(result.entryCount, 1);
});

test("qualified old SID credits ledger once, pays100, grants once and retries same receipt", async () => {
 await admin.doc("profiles/" + sid).set(profile); await admin.doc(`coinAccounts/${sid}/entries/earned`).set({ kind: "taskReward", amount: 200 });
 await commitEnrollmentChunk(teacher(), [{ id: sid, email, enabled: true, requireExisting: true }], 0);
 const result = await drawBrowserCard(student(), sid, "teacher-sync-draw", catalog.sourceSha256); const replay = await drawBrowserCard(student(), sid, "teacher-sync-draw", catalog.sourceSha256);
 assert.equal(result.cardId, replay.cardId); assert.equal((await snapshot("coinAccounts/" + sid))!.spent, 100);
 assert.equal((await admin.collection(`cardDrawReceipts/${sid}/requests`).get()).size, 1);
 assert.equal((await snapshot("profiles/" + sid))!.ownedCardIds.length, profile.ownedCardIds.length + 1);
});
