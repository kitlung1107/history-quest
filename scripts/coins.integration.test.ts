import { beforeAll, afterAll, beforeEach, test, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  runTransaction,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../client/src/lib/firebase", () => ({
  get db() {
    return state.db;
  },
}));
import {
  prepareCoinAward,
  confirmGameCoins,
} from "../client/src/lib/coinStore";
import { markSubmission, saveGrade } from "../client/src/lib/cloudStore";
import { defaultCoinRule } from "../client/src/lib/coinModel";
let env: RulesTestEnvironment;
const claims = (email: string) => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
});
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-coins",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  state.db = env
    .authenticatedContext("teacher", claims("kitlung1107@gmail.com"))
    .firestore();
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), "access", "student@example.test"), {
      studentId: "s1",
      enabled: true,
    });
    for (const attempt of ["a1", "a2"])
      await setDoc(doc(c.firestore(), "submissions", attempt), {
        studentId: "s1",
        taskId: "t1",
      });
  });
});
async function grade(attemptId: string, score: number | null) {
  await runTransaction(state.db, async tx => {
    const award = await prepareCoinAward(tx, "s1", "t1", attemptId, score, 100);
    tx.update(doc(state.db, "submissions", attemptId), {
      grade: { score, status: score === null ? "pending" : "graded" },
    });
    award();
  });
}
test("pending grades do not award; concurrent attempts/retries/updates mint once, persist rule snapshot", async () => {
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "fixed",
    amount: 37,
  });
  await grade("a1", null);
  expect(
    (await getDocs(collection(state.db, "coinAccounts", "s1", "entries"))).size
  ).toBe(0);
  await Promise.all([grade("a1", 50), grade("a2", 50)]);
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "fixed",
    amount: 999,
  });
  await grade("a1", 100);
  const entries = await getDocs(
    collection(state.db, "coinAccounts", "s1", "entries")
  );
  expect(entries.size).toBe(1);
  expect(entries.docs[0].data().amount).toBe(37);
  expect(entries.docs[0].data().rule.amount).toBe(37);
  const student = env
    .authenticatedContext("student", claims("student@example.test"))
    .firestore();
  expect(
    (await getDoc(doc(student, "coinAccounts", "s1", "entries", "t1"))).data()
      ?.amount
  ).toBe(37);
});
test("default, fixed zero and unmet thresholds leave eligibility open", async () => {
  await grade("a1", 0);
  const ref = doc(state.db, "coinAccounts", "s1", "entries", "t1");
  expect((await getDoc(ref)).exists()).toBe(false);
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "fixed",
    amount: 0,
  });
  await grade("a1", 100);
  expect((await getDoc(ref)).exists()).toBe(false);
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "tiers",
    tiers: [{ minimum: 80, amount: 20 }],
  });
  await grade("a1", 50);
  expect((await getDoc(ref)).exists()).toBe(false);
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "fixed",
    amount: 20,
  });
  await grade("a2", 100);
  expect(
    (await getDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"))).data()
      ?.amount
  ).toBe(20);
});
test("legacy zero upgrades once under concurrent transactions; positive funds stay unchanged", async () => {
  const ref = doc(state.db, "coinAccounts", "s1", "entries", "t1");
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), "coinAccounts", "s1", "entries", "t1"), {
      kind: "taskReward",
      taskId: "t1",
      amount: 0,
      attemptId: "a1",
    });
    await setDoc(doc(c.firestore(), "coinAccounts", "s1", "entries", "other"), {
      amount: 17,
    });
  });
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "fixed",
    amount: 23,
  });
  const student = env
    .authenticatedContext("student", claims("student@example.test"))
    .firestore();
  await assertFails(
    updateDoc(doc(student, "coinAccounts", "s1", "entries", "t1"), {
      amount: 23,
    })
  );
  await assertFails(updateDoc(ref, { amount: 23 })); // no valid graded source
  // Rules can reject a losing zero->positive update before the SDK retries it.
  // The caller can safely retry; it must preserve the winner's positive award.
  const results = await Promise.allSettled([grade("a1", 80), grade("a2", 90)]);
  expect(results.some(r => r.status === "fulfilled")).toBe(true);
  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") await grade(i === 0 ? "a1" : "a2", 90);
  }
  await grade("a1", 100);
  expect((await getDoc(ref)).data()?.amount).toBe(23);
  expect(
    (
      await getDocs(collection(state.db, "coinAccounts", "s1", "entries"))
    ).docs.reduce((sum, d) => sum + d.data().amount, 0)
  ).toBe(40);
  await assertFails(
    updateDoc(ref, { amount: 24, createdAt: serverTimestamp() })
  );
});
test("different tasks accumulate from zero; aborted transaction does not mint", async () => {
  expect(
    (await getDocs(collection(state.db, "coinAccounts", "s1", "entries"))).size
  ).toBe(0);
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "fixed",
    amount: 11,
  });
  await expect(
    runTransaction(state.db, async tx => {
      const award = await prepareCoinAward(tx, "s1", "t1", "a1", 100, 100);
      award();
      throw new Error("interrupted");
    })
  ).rejects.toThrow("interrupted");
  expect(
    (await getDocs(collection(state.db, "coinAccounts", "s1", "entries"))).size
  ).toBe(0);
  await grade("a1", 100);
  await env.withSecurityRulesDisabled(async c =>
    setDoc(doc(c.firestore(), "submissions", "b1"), {
      studentId: "s1",
      taskId: "t2",
      grade: { status: "graded", score: 75, progress: 100, revision: 1 },
    })
  );
  await setDoc(doc(state.db, "coinRules", "t2"), {
    ...defaultCoinRule,
    mode: "fixed",
    amount: 29,
  });
  await markSubmission("b1");
  await markSubmission("b1");
  expect(
    (
      await getDocs(collection(state.db, "coinAccounts", "s1", "entries"))
    ).docs.reduce((sum, d) => sum + d.data().amount, 0)
  ).toBe(40);
});
test("already graded zero can be reconsidered without regrading after rule changes", async () => {
  const oldGrade = {
    status: "graded",
    score: 80,
    progress: 100,
    revision: 3,
    feedback: "keep",
  };
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), "submissions", "a1"), {
      studentId: "s1",
      taskId: "t1",
      grade: oldGrade,
    });
    await setDoc(doc(c.firestore(), "coinAccounts", "s1", "entries", "t1"), {
      amount: 0,
    });
  });
  await markSubmission("a1");
  expect(
    (await getDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"))).data()
      ?.amount
  ).toBe(0);
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "fixed",
    amount: 19,
  });
  expect(await markSubmission("a1")).toEqual(oldGrade);
  expect(
    (await getDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"))).data()
      ?.amount
  ).toBe(19);
});
test("real short-answer grading awards on completion and never repeats after correction", async () => {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), "submissions", "a1"), {
      studentId: "s1",
      taskId: "t1",
      version: "v1",
      answers: [{ question_id: "q1", value: "answer" }],
    });
    await setDoc(doc(c.firestore(), "catalogue", "t1--v1"), {
      title: "test",
      questions: [{ id: "q1", type: "short", prompt: "test", points: 10 }],
    });
  });
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "tiers",
    tiers: [
      { minimum: 50, amount: 13 },
      { minimum: 100, amount: 71 },
    ],
  });
  expect((await markSubmission("a1")).score).toBe(null);
  expect(
    (
      await getDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"))
    ).exists()
  ).toBe(false);
  await saveGrade("a1", 1, [{ question_id: "q1", awarded: 0 }], "");
  expect(
    (
      await getDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"))
    ).exists()
  ).toBe(false);
  await saveGrade("a1", 2, [{ question_id: "q1", awarded: 5 }], "");
  await saveGrade("a1", 3, [{ question_id: "q1", awarded: 10 }], "");
  await markSubmission("a1");
  expect(
    (await getDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"))).data()
      ?.amount
  ).toBe(13);
});
test("completed game uses verified answer rate and shares task deduplication", async () => {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), "gameCatalog", "g1", "versions", "v1"), {
      taskId: "t1",
    });
    await setDoc(doc(c.firestore(), "gameSessions", "g1"), {
      studentId: "s1",
      gameId: "g1",
      version: "v1",
      status: "completed",
      attempts: 4,
      correct: 2,
    });
    await setDoc(doc(c.firestore(), "gameSessions", "empty"), {
      studentId: "s1",
      gameId: "g1",
      version: "v1",
      status: "completed",
      attempts: 0,
      correct: 0,
    });
  });
  await confirmGameCoins("g1");
  expect(
    (
      await getDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"))
    ).exists()
  ).toBe(false);
  await env.withSecurityRulesDisabled(async c =>
    setDoc(doc(c.firestore(), "coinAccounts", "s1", "entries", "t1"), {
      amount: 0,
    })
  );
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "tiers",
    tiers: [
      { minimum: 50, amount: 23 },
      { minimum: 100, amount: 81 },
    ],
  });
  await expect(confirmGameCoins("empty")).rejects.toThrow();
  await confirmGameCoins("g1");
  await confirmGameCoins("g1");
  await grade("a1", 100);
  const entry = (
    await getDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"))
  ).data();
  expect(entry?.amount).toBe(23);
  expect(entry?.score).toBe(50);
  expect(entry?.kind).toBe("gameReward");
});
test("rules deny minting, tampering, other students, anonymous access and ungraded credits", async () => {
  const student = env
    .authenticatedContext("student", claims("student@example.test"))
    .firestore();
  await assertFails(setDoc(doc(student, "coinRules", "t1"), defaultCoinRule));
  await assertFails(
    setDoc(doc(student, "coinAccounts", "s1", "entries", "t1"), { amount: 999 })
  );
  await assertFails(
    setDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"), {
      kind: "taskReward",
      taskId: "t1",
      attemptId: "a1",
      amount: 10,
      score: 50,
      progress: 100,
      rule: defaultCoinRule,
      createdAt: serverTimestamp(),
    })
  );
  await grade("a1", 50);
  await assertFails(setDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"), {
    kind: "taskReward", taskId: "t1", attemptId: "a1", amount: 0,
    score: 50, progress: 100, rule: defaultCoinRule, createdAt: serverTimestamp(),
  }));
  await setDoc(doc(state.db, "coinRules", "t1"), {
    ...defaultCoinRule,
    mode: "fixed",
    amount: 10,
  });
  await grade("a1", 50);
  await assertSucceeds(
    getDocs(collection(student, "coinAccounts", "s1", "entries"))
  );
  await assertFails(
    getDocs(collection(student, "coinAccounts", "s2", "entries"))
  );
  await assertFails(
    getDoc(
      doc(
        env.unauthenticatedContext().firestore(),
        "coinAccounts",
        "s1",
        "entries",
        "t1"
      )
    )
  );
  await assertFails(
    updateDoc(doc(student, "coinAccounts", "s1", "entries", "t1"), {
      amount: 100,
    })
  );
  await assertFails(
    deleteDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"))
  );
  await assertFails(
    updateDoc(doc(state.db, "coinAccounts", "s1", "entries", "t1"), {
      amount: 100,
    })
  );
});
