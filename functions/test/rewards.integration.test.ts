import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { settleReward } from "../src/rewards.ts";
import { defaultCoinRule } from "../../client/src/lib/coinModel.ts";

// Hard fail outside this explicitly named, local, disposable test environment.
if (!["127.0.0.1:8080","127.0.0.1:8191"].includes(process.env.FIRESTORE_EMULATOR_HOST??''))
  throw new Error("本測試只准使用本機 Firestore 模擬器。");
const projectId = "demo-automatic-coins";
process.env.METADATA_SERVER_DETECTION = "none";
const app = initializeApp({ projectId }, "automatic-reward-tests");
const db = getFirestore(app);
let env: RulesTestEnvironment;
const claim = (email: string) => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
});
const student = () =>
  env.authenticatedContext("u1", claim("student@example.test")).firestore();
const fixed = { ...defaultCoinRule, mode: "fixed" as const, amount: 37 };
const tiered = {
  ...defaultCoinRule,
  mode: "tiers" as const,
  tiers: [
    { minimum: 50, amount: 23 },
    { minimum: 90, amount: 81 },
  ],
};
const question = {
  id: "q1",
  type: "choice",
  prompt: "測試客觀題",
  points: 10,
  options: ["正確", "錯誤"],
  answer: 0,
};
before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_HOST!.split(':')[1]),
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});
after(async () => {
  await env?.cleanup();
  await db.terminate();
  await deleteApp(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  const batch = db.batch();
  batch.set(db.doc("rewardAutomation/status"), {
    enabled: true,
    activatedAt: Timestamp.fromMillis(2000),
  });
  batch.set(db.doc("access/student@example.test"), {
    studentId: "s1",
    enabled: true,
  });
  batch.set(db.doc("profiles/s1"), {
    className: "S5",
    name: "測試學生",
    studentNo: "1",
  });
  batch.set(db.doc("taskAccess/quiz"), { grade: 5, enabled: true });
  batch.set(db.doc("taskAccess/game"), { grade: 5, enabled: true });
  batch.set(db.doc("rewardPolicies/quiz"), {
    source: "assessment",
    enabled: true,
  });
  batch.set(db.doc("rewardPolicies/game"), { source: "game", enabled: false });
  batch.set(db.doc("catalogue/quiz--v1"), {
    source: "assessment",
    title: "測試測驗",
    questions: [question],
  });
  batch.set(db.doc("coinRules/quiz"), fixed);
  await batch.commit();
});
async function submission(
  id = "a1",
  answers = [{ question_id: "q1", value: 0 }],
  patch: Record<string, any> = {}
) {
  await db
    .doc(`submissions/${id}`)
    .set({
      studentId: "s1",
      taskId: "quiz",
      version: "v1",
      answers,
      createdAt: Timestamp.fromMillis(3000),
      ...patch,
    });
  await db
    .doc("progress/s1/tasks/quiz")
    .set({ attemptId: id, progress: 100, score: 0 });
}
const ledger = (task = "quiz") => db.doc(`coinAccounts/s1/entries/${task}`);
test('legacy trigger leaves versioned grades and pending sources untouched, including concurrent retries',async()=>{
  const grade={status:'graded',score:67,revision:2,mcPoints:20,shortMarks:[null],rewardAmount:23,tierIndex:0};
  await submission('protocol-graded',undefined,{protocol:'rules-assessment/1',version:'opaque-v1',grade});
  const before=(await db.doc('submissions/protocol-graded').get()).updateTime;
  const results=await Promise.all(Array.from({length:4},()=>settleReward(db,'taskReward','protocol-graded')));
  assert.ok(results.every(r=>r.status==='protocol-owned'&&r.amount===0));
  assert.deepEqual((await db.doc('submissions/protocol-graded').get()).data()?.grade,grade);
  assert.ok((await db.doc('submissions/protocol-graded').get()).updateTime!.isEqual(before!));
  assert.equal((await ledger().get()).exists,false);
  assert.equal((await db.collection('rewardResults/s1/attempts').get()).size,0);
  await submission('protocol-pending',undefined,{protocol:'rules-assessment/1',version:'opaque-v1'});
  assert.equal((await settleReward(db,'taskReward','protocol-pending')).status,'protocol-owned');
  await submission('unknown-protocol',undefined,{protocol:'unknown'});
  assert.equal((await settleReward(db,'taskReward','unknown-protocol')).status,'unsupported-protocol');
  await db.doc('catalogue/quiz--opaque-v1').set({source:'assessment',protocol:'rules-assessment/1',questions:[question]});
  await submission('downgrade-source',undefined,{version:'opaque-v1'});
  assert.equal((await settleReward(db,'taskReward','downgrade-source')).status,'protocol-owned');
  assert.equal((await db.doc('submissions/downgrade-source').get()).data()?.grade,undefined);
});
test('legacy Functions cannot mint or rewrite a Rules-verified Cold War session',async()=>{
  const ref=db.doc('gameSessions/rules-cold-war');
  await ref.set({protocol:'rules-game/1',studentId:'s1',uid:'u1',gameId:'cold-war-maze',status:'completed',attempts:16,correct:15});
  const before=await ref.get();
  const results=await Promise.all(Array.from({length:8},()=>settleReward(db,'gameReward','rules-cold-war')));
  assert.ok(results.every(r=>r.status==='protocol-owned'&&r.amount===0));
  const after=await ref.get();assert.ok(after.updateTime.isEqual(before.updateTime));
  assert.deepEqual(after.data(),before.data());
  assert.equal((await db.doc('coinAccounts/s1/entries/S5_ColdWar_Maze').get()).exists,false);
  assert.equal((await db.collection('rewardResults/s1/attempts').get()).size,0);
});
const reward = (id = "a1") => settleReward(db, "taskReward", id);

test("客觀題重新核算且固定獎勵採用教師設定，成績與帳本一致", async () => {
  await submission();
  assert.equal((await reward()).amount, 37);
  assert.equal((await ledger().get()).data()?.amount, 37);
  assert.equal((await db.doc("submissions/a1").get()).data()?.grade.score, 100);
  assert.equal(
    (await db.doc("progress/s1/tasks/quiz").get()).data()?.score,
    100
  );
  assert.equal(
    (await db.doc("rewardResults/s1/attempts/taskReward_a1").get()).data()
      ?.automatic,
    true
  );
});
test("不採用學生上報的分數、進度或金額，分級只取符合門檻", async () => {
  await db.doc("coinRules/quiz").set(tiered);
  await db
    .doc("catalogue/quiz--v1")
    .update({ questions: [question, { ...question, id: "q2" }] });
  await submission(
    "a1",
    [
      { question_id: "q1", value: 0 },
      { question_id: "q2", value: 1 },
    ],
    { score: 100, amount: 999, completed: true }
  );
  await db.doc("progress/s1/tasks/quiz").update({ score: 100 });
  assert.equal((await reward()).score, 50);
  assert.equal((await ledger().get()).data()?.amount, 23);
});
test("未符合門檻不派幣；其後新的合格提交仍可首次領取", async () => {
  await db.doc("coinRules/quiz").set(tiered);
  await submission("a1", [{ question_id: "q1", value: 1 }]);
  assert.equal((await reward()).status, "not-qualified");
  assert.equal((await ledger().get()).exists, false);
  await submission("a2");
  await reward("a2");
  assert.equal((await ledger().get()).data()?.amount, 81);
});
test("未設定、停用、固定零幣均不建立帳本或鎖定領取資格", async () => {
  for (const [index, rule] of [
    undefined,
    defaultCoinRule,
    { ...fixed, amount: 0 },
  ].entries()) {
    if (rule) await db.doc("coinRules/quiz").set(rule);
    else await db.doc("coinRules/quiz").delete();
    await submission(`a${index}`);
    await reward(`a${index}`);
    assert.equal((await ledger().get()).exists, false);
  }
});
test("完成程度只取 100% 的有效級別，不能發放較低門檻的最高單項", async () => {
  await db.doc("coinRules/quiz").set({
    ...tiered,
    metric: "progress",
    tiers: [
      { minimum: 50, amount: 500 },
      { minimum: 100, amount: 19 },
    ],
  });
  await submission();
  await reward();
  assert.equal((await ledger().get()).data()?.amount, 19);
});
test("多次重交、重新整理、並行來源與重複事件只建立一筆正數帳本", async () => {
  await submission("a1");
  await submission("a2");
  await Promise.all(
    Array.from({ length: 8 }, (_, i) => reward(i % 2 ? "a1" : "a2"))
  );
  for (let i = 0; i < 3; i++) await reward();
  const entries = await db.collection("coinAccounts/s1/entries").get();
  assert.equal(entries.size, 1);
  assert.equal(
    entries.docs.reduce((sum, row) => sum + row.data().amount, 0),
    37
  );
});
test("已領取歷史正數保持原額與原來源，不因新規則或新提交重派", async () => {
  await ledger().set({
    amount: 11,
    taskId: "quiz",
    attemptId: "old",
    kind: "taskReward",
    createdAt: Timestamp.fromMillis(1000),
  });
  await submission();
  assert.equal((await reward()).status, "already-awarded");
  assert.equal((await ledger().get()).data()?.amount, 11);
  assert.equal((await ledger().get()).data()?.attemptId, "old");
});
test("歷史零幣可由新的合格提交原位升級，其他任務餘額保持", async () => {
  await ledger().set({ amount: 0 });
  await db.doc("coinAccounts/s1/entries/other").set({ amount: 17 });
  await submission();
  await Promise.all([reward(), reward()]);
  assert.equal((await ledger().get()).data()?.amount, 37);
  const entries = await db.collection("coinAccounts/s1/entries").get();
  assert.equal(
    entries.docs.reduce((sum, row) => sum + row.data().amount, 0),
    54
  );
});
test("短答須待所有必要批改完成才結算，客觀題仍由後端重算", async () => {
  await db.doc("coinRules/quiz").set(tiered);
  await db
    .doc("catalogue/quiz--v1")
    .update({
      questions: [
        question,
        { id: "q2", type: "short", prompt: "測試短答", points: 10 },
      ],
    });
  await submission("a1", [
    { question_id: "q1", value: 0 },
    { question_id: "q2", value: "測試答案" },
  ] as any);
  assert.equal((await reward()).status, "pending-grading");
  assert.equal((await ledger().get()).exists, false);
  const before = (await db.doc("submissions/a1").get()).data()!.grade;
  const teacher = env
    .authenticatedContext("teacher", claim("kitlung1107@gmail.com"))
    .firestore();
  await updateDoc(doc(teacher, "submissions", "a1"), {
    grade: {
      ...before,
      status: "graded",
      revision: 2,
      score: 100,
      answers: before.answers.map((a: any) => ({
        ...a,
        awarded: a.type === "short" ? 0 : 999,
      })),
    },
  });
  assert.equal((await reward()).score, 50);
  assert.equal((await ledger().get()).data()?.amount, 23);
  await db
    .doc("submissions/a1")
    .update({
      "grade.answers": before.answers.map((a: any) => ({ ...a, awarded: 10 })),
      "grade.score": 100,
      "grade.revision": 3,
    });
  await reward();
  assert.equal((await ledger().get()).data()?.amount, 23);
});
test("啟用前的舊提交及舊局不補派，停用自動流程亦不結算", async () => {
  await submission("old", [{ question_id: "q1", value: 0 }], {
    createdAt: Timestamp.fromMillis(1000),
  });
  assert.equal((await reward("old")).status, "historical");
  assert.equal((await ledger().get()).exists, false);
  await submission();
  await db.doc("rewardAutomation/status").update({ enabled: false });
  assert.equal((await reward()).status, "inactive");
  assert.equal((await ledger().get()).exists, false);
});
test("問卷來源、重複／缺漏答案及未核准帳戶不會誤觸遊戲或測驗獎勵", async () => {
  await submission("questionnaire", [{ question_id: "q1", value: 0 }], {
    taskId: "game",
  });
  assert.equal((await reward("questionnaire")).status, "wrong-source");
  assert.equal((await ledger("game").get()).exists, false);
  await db.doc("catalogue/quiz--v1").update({ source: "questionnaire" });
  await submission("wrong-catalogue");
  assert.equal((await reward("wrong-catalogue")).status, "wrong-source");
  assert.equal((await ledger().get()).exists, false);
  await db.doc("catalogue/quiz--v1").update({ source: "assessment" });
  await submission("bad", [
    { question_id: "q1", value: 0 },
    { question_id: "q1", value: 0 },
  ]);
  assert.equal((await reward("bad")).status, "invalid");
  await submission();
  await db.doc("access/student@example.test").update({ enabled: false });
  assert.equal((await reward()).status, "unauthorised");
  assert.equal((await ledger().get()).exists, false);
});
test("題庫或設定暫時失敗沒有部分入帳，修正後可安全重試", async () => {
  await submission();
  await db.doc("catalogue/quiz--v1").delete();
  await assert.rejects(reward(), /題庫/);
  assert.equal((await ledger().get()).exists, false);
  assert.equal((await db.doc("submissions/a1").get()).data()?.grade, undefined);
  await db
    .doc("catalogue/quiz--v1")
    .set({ source: "assessment", questions: [question] });
  await db.doc("coinRules/quiz").update({ amount: -1 });
  await assert.rejects(reward(), /設定/);
  assert.equal((await ledger().get()).exists, false);
  await db.doc("coinRules/quiz").set(fixed);
  await Promise.all([reward(), reward()]);
  assert.equal((await ledger().get()).data()?.amount, 37);
});
test("重試請求在原子交易內再次核對本人授權，不接受另一名學生", async () => {
  await submission();
  assert.equal(
    (
      await settleReward(db, "taskReward", "a1", {
        email: "other@example.test",
        uid: "u2",
      })
    ).status,
    "unauthorised"
  );
  assert.equal((await ledger().get()).exists, false);
  assert.equal(
    (
      await settleReward(db, "taskReward", "a1", {
        email: "student@example.test",
        uid: "u1",
      })
    ).amount,
    37
  );
});
async function game(proof = false) {
  await db.doc("rewardPolicies/game").set({ source: "game", enabled: true });
  await db.doc("coinRules/game").set(tiered);
  await db
    .doc("trustedGameVerifiers/g1--v1")
    .set({ enabled: true, verifier: "authoritative-maze-v2-test" });
  await db
    .doc("gameCatalog/g1/versions/v1")
    .set({ enabled: true, taskId: "game" });
  await db
    .doc("gameCatalog/g1/versions/v1/questions/q1")
    .set({
      validator: "index-array/1",
      answer: [0],
      maxIndex: [1],
      distinct: false,
    });
  await db
    .doc("gameSessions/good")
    .set({
      studentId: "s1",
      uid: "u1",
      gameId: "g1",
      version: "v1",
      status: "completed",
      attempts: 2,
      correct: 1,
      createdAt: Timestamp.fromMillis(3000),
    });
  for (let i = 0; i < 2; i++)
    await db
      .doc(`gameSessions/good/answers/e${i}`)
      .set({
        questionId: "q1",
        answer: [i],
        correct: i === 0,
        sequence: i + 1,
      });
  if (proof)
    await db
      .doc("trustedGameCompletions/good")
      .set({
        studentId: "s1",
        uid: "u1",
        gameId: "g1",
        version: "v1",
        verifier: "authoritative-maze-v2-test",
        outcome: "completed",
        verifiedAt: Timestamp.fromMillis(4000),
      });
}
test("瀏覽器完成旗標沒有可信證明不派幣，無效／零作答亦拒絕", async () => {
  await game();
  assert.equal(
    (await settleReward(db, "gameReward", "good")).status,
    "pending-verification"
  );
  assert.equal((await ledger("game").get()).exists, false);
  await game(true);
  await db.doc("gameSessions/good").update({ attempts: 0 });
  assert.equal(
    (await settleReward(db, "gameReward", "good")).status,
    "invalid"
  );
  assert.equal((await ledger("game").get()).exists, false);
});
test("可信遊戲證明成立才重核答案及答對率，並行事件仍只派一次", async () => {
  await game(true);
  await Promise.all(
    Array.from({ length: 4 }, () => settleReward(db, "gameReward", "good"))
  );
  assert.equal((await ledger("game").get()).data()?.amount, 23);
  assert.equal((await ledger("game").get()).data()?.score, 50);
  assert.equal((await db.collection("coinAccounts/s1/entries").get()).size, 1);
});
test("學生只可讀本年級單筆獎勵及自己帳本，不可改規則、證明或派發結果", async () => {
  const client = student();
  await assertSucceeds(getDoc(doc(client, "coinRules", "quiz")));
  await assertSucceeds(getDoc(doc(client, "rewardPolicies", "quiz")));
  await assertSucceeds(getDoc(doc(client, "rewardAutomation", "status")));
  await assertFails(getDocs(collection(client, "coinRules")));
  await assertFails(setDoc(doc(client, "coinRules", "quiz"), fixed));
  await assertFails(
    setDoc(doc(client, "trustedGameCompletions", "good"), {
      studentId: "s1",
      outcome: "completed",
    })
  );
  await assertFails(
    setDoc(doc(client, "rewardResults", "s1", "attempts", "taskReward_a1"), {
      amount: 999,
    })
  );
  await assertFails(
    setDoc(doc(client, "coinAccounts", "s1", "entries", "quiz"), { amount: 37 })
  );
  await assertFails(
    getDocs(collection(client, "coinAccounts", "s2", "entries"))
  );
  await db
    .doc("coinRules/quiz")
    .update({ teacherPrivateNote: "不可向學生公開" });
  await assertFails(getDoc(doc(client, "coinRules", "quiz")));
  await db.doc("coinRules/quiz").set(fixed);
  await db.doc("taskAccess/quiz").update({ grade: 6 });
  await assertFails(getDoc(doc(client, "coinRules", "quiz")));
  await db.doc("access/student@example.test").update({ testing: true });
  await assertSucceeds(getDoc(doc(client, "coinRules", "quiz")));
  await db.doc("access/student@example.test").update({ enabled: false });
  await assertFails(getDoc(doc(client, "coinRules", "quiz")));
  await assertFails(
    getDoc(doc(env.unauthenticatedContext().firestore(), "coinRules", "quiz"))
  );
});
