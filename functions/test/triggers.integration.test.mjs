import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8082") throw Error("事件測試只准使用本機模擬器。");
const projectId = "demo-automatic-events";
process.env.METADATA_SERVER_DETECTION = "none";
const app = initializeApp({ projectId }, "reward-trigger-tests");
const db = getFirestore(app);
let env;
const claims = email => ({ email, email_verified: true, firebase: { sign_in_provider: "google.com" } });
const question = { id: "q1", type: "choice", prompt: "測試", points: 10, options: ["正確", "錯誤"], answer: 0 };
async function waitFor(fn) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw Error("未在時限內收到後端事件結果。");
}
const readEntry = async () => (await db.doc("coinAccounts/s1/entries/quiz").get()).data();
function token(email = "student@example.test", uid = "u1") {
  const now = Math.floor(Date.now() / 1000);
  return [Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ iss: `https://securetoken.google.com/${projectId}`, aud: projectId, auth_time: now, iat: now, exp: now + 3600, sub: uid, user_id: uid, email, email_verified: true, firebase: { sign_in_provider: "google.com" } })).toString("base64url"), ""].join(".");
}
async function retry(sourceId, jwt = token()) {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/asia-east2/retryMyReward`, { method: "POST", headers: { "content-type": "application/json", ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) }, body: JSON.stringify({ data: { kind: "taskReward", sourceId, amount: 99999, score: 100 } }) });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8082, rules: readFileSync("firestore.rules", "utf8") } });
});
after(async () => { await env?.cleanup(); await db.terminate(); await deleteApp(app); });
beforeEach(async () => {
  await env.clearFirestore();
  const batch = db.batch();
  for (const [path, data] of Object.entries({
    "rewardAutomation/status": { enabled: true, activatedAt: Timestamp.fromMillis(Date.now() - 10000) },
    "access/student@example.test": { enabled: true, studentId: "s1" },
    "profiles/s1": { className: "S5", name: "測試學生", studentNo: "1" },
    "taskAccess/quiz": { enabled: true, grade: 5 },
    "rewardPolicies/quiz": { enabled: true, source: "assessment" },
    "coinRules/quiz": { mode: "tiers", amount: 0, metric: "score", tiers: [{ minimum: 50, amount: 23 }, { minimum: 90, amount: 81 }] },
    "catalogue/quiz--v1": { source: "assessment", title: "測試", questions: [question] },
  })) batch.set(db.doc(path), data);
  await batch.commit();
});
test("真實新提交事件會自動核算及派幣，不需教師開啟工作室", async () => {
  const id = `choice-${Date.now()}`;
  const client = env.authenticatedContext("u1", claims("student@example.test")).firestore();
  await setDoc(doc(client, "submissions", id), { studentId: "s1", taskId: "quiz", version: "v1", answers: [{ question_id: "q1", value: 0 }], createdAt: serverTimestamp() });
  const entry = await waitFor(readEntry);
  assert.equal(entry.amount, 81); assert.equal(entry.attemptId, id);
  const replays = await Promise.all([retry(id), retry(id)]);
  assert.ok(replays.every(r => r.status === 200));
  assert.equal((await readEntry()).amount, 81);
  assert.equal((await db.collection("coinAccounts/s1/entries").get()).size, 1);
});
test("教師批改事件成立後即派發按分級計算的實際金額", async () => {
  await db.doc("catalogue/quiz--v1").update({ questions: [{ id: "q1", type: "short", prompt: "測試短答", points: 10 }] });
  const id = `short-${Date.now()}`;
  await db.doc(`submissions/${id}`).set({ studentId: "s1", taskId: "quiz", version: "v1", answers: [{ question_id: "q1", value: "測試答案" }], createdAt: FieldValue.serverTimestamp() });
  const grade = await waitFor(async () => (await db.doc(`submissions/${id}`).get()).data()?.grade);
  assert.equal(grade.status, "pending"); assert.equal(await readEntry(), undefined);
  const teacher = env.authenticatedContext("teacher", claims("kitlung1107@gmail.com")).firestore();
  await updateDoc(doc(teacher, "submissions", id), { grade: { ...grade, status: "graded", revision: 2, score: 100, answers: grade.answers.map(a => ({ ...a, awarded: 5 })) } });
  const entry = await waitFor(readEntry);
  assert.equal(entry.amount, 23); assert.equal(entry.score, 50);
});
test("背景觸發失敗後可用本人重試端點完成，同時拒絕匿名與其他學生", async () => {
  await db.doc("catalogue/quiz--v1").delete();
  const id = `retry-${Date.now()}`;
  await db.doc(`submissions/${id}`).set({ studentId: "s1", taskId: "quiz", version: "v1", answers: [{ question_id: "q1", value: 0 }], createdAt: FieldValue.serverTimestamp() });
  const failed = await retry(id);
  assert.equal(failed.status, 503); assert.equal(await readEntry(), undefined);
  const anonymous = await retry(id, ""); assert.equal(anonymous.status, 401);
  const other = await retry(id, token("other@example.test", "u2")); assert.equal(other.status, 403);
  await db.doc("catalogue/quiz--v1").set({ source: "assessment", questions: [question] });
  const retried = await retry(id); assert.equal(retried.status, 200);
  assert.equal((await waitFor(readEntry)).amount, 81);
});
