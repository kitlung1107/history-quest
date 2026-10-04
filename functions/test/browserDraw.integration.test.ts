import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import {
  getFirestore,
  Timestamp as AdminTimestamp,
} from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  browserRandomIndex,
  claimLedgerCredit,
  drawBrowserCard,
  prepareBrowserCredits,
  type BrowserDrawReceipt,
} from "../../client/src/lib/browserDraw.ts";
import { buildCardCatalog } from "../../scripts/card-catalog.mjs";
import { initialOwnedCards } from "../../client/src/lib/cardModel.ts";
import { submitAndSettle } from "../../client/src/lib/rulesAssessment.ts";
import { makeAssessment } from "../../integration/assessment/fixtures.mjs";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8185")
  throw new Error("Local synthetic emulator only");
process.env.METADATA_SERVER_DETECTION = "none";
const projectId = "demo-browser-draw-tests",
  adminApp = initializeApp({ projectId }, "browser-draw-tests"),
  admin = getFirestore(adminApp);
let env: RulesTestEnvironment;
const claim = (email = "student@example.test") => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
});
const student = () =>
  env.authenticatedContext("student_uid", claim()).firestore();
const catalog = buildCardCatalog(
  JSON.parse(fs.readFileSync("client/src/content/settings/cards.json", "utf8"))
);
const sid = "student001";
const profile = (role = "studentBoy", className = "1A") => ({
  role,
  className,
  configured: true,
  avatar: role,
  name: "測試學生",
  nickname: "探索者",
  studentNo: "12",
  cardId:
    role === "studentBoy" ? "starter-explorer-boy" : "starter-explorer-girl",
  ownedCardIds: [
    role === "studentBoy" ? "starter-explorer-boy" : "starter-explorer-girl",
  ],
});
before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8185,
      rules: fs.readFileSync("integration/assessment/compatible.rules", "utf8"),
    },
  });
});
after(async () => {
  await env?.cleanup();
  await admin.terminate();
  await deleteApp(adminApp);
});
beforeEach(async () => {
  await env.clearFirestore();
  const batch = admin.batch();
  batch.set(admin.doc(`access/student@example.test`), {
    enabled: true,
    studentId: sid,
  });
  batch.set(admin.doc(`profiles/${sid}`), profile());
  batch.set(admin.doc(`coinAccounts/${sid}/entries/reward001`), {
    kind: "taskReward",
    amount: 2000,
  });
  batch.set(admin.doc("cardCatalog/current"), catalog);
  batch.set(admin.doc("cardDraw/status"), {
    enabled: true,
    protocolVersion: 1,
  });
  batch.set(admin.doc(`cardDrawEligibility/${sid}`), {
    verified: true,
    walletModel: "immutable-positive-rewards-v1",
    openingBalance: 0,
  });
  await batch.commit();
});
async function wallet() {
  return (await admin.doc(`coinAccounts/${sid}`).get()).data();
}
async function ledgerBalance() {
  return (
    await admin.collection(`coinAccounts/${sid}/entries`).get()
  ).docs.reduce((n, d) => n + d.data().amount, 0);
}
async function rawDraw(
  client: any,
  id = "raw001",
  patch: Record<string, any> = {},
  omit = ""
) {
  return runTransaction(client, async (tx) => {
    const w = (await tx.get(doc(client, "coinAccounts", sid))).data()!,
      p = (await tx.get(doc(client, "profiles", sid))).data()!;
    const cardId = patch.cardId ?? "nile-explorer-boy",
      price = patch.price ?? 100;
    const receipt: Record<string, any> = {
      requestId: id,
      cardId,
      price,
      balance: w.balance - price,
      revision: w.drawRevision + 1,
      role: p.role,
      catalogHash: catalog.sourceSha256,
      clientCatalogHash: catalog.sourceSha256,
      createdAt: serverTimestamp(),
      ...patch,
    };
    if (omit !== "profile")
      tx.update(doc(client, "profiles", sid), {
        ownedCardIds: [...p.ownedCardIds, cardId],
      });
    if (omit !== "debit")
      tx.set(doc(client, "coinAccounts", sid, "entries", `draw_${id}`), {
        kind: "cardDraw",
        requestId: id,
        cardId,
        amount: -price,
        createdAt: serverTimestamp(),
      });
    if (omit !== "receipt")
      tx.set(doc(client, "cardDrawReceipts", sid, "requests", id), receipt);
    if (omit !== "wallet")
      tx.update(doc(client, "coinAccounts", sid), {
        balance: w.balance - price,
        spent: w.spent + price,
        drawRevision: receipt.revision,
        lastRequestId: id,
      });
    return receipt;
  });
}
test("uniform browser index uses rejection sampling; altered client can intentionally choose an eligible card", async () => {
  let calls = 0;
  assert.equal(
    browserRandomIndex(3, () => (++calls === 1 ? 0xffffffff : 5)),
    2
  );
  assert.equal(calls, 2);
  const result = await drawBrowserCard(
    student(),
    sid,
    "chosen001",
    catalog.sourceSha256,
    () => "nile-explorer-boy"
  );
  assert.equal(result.cardId, "nile-explorer-boy");
  assert.equal(result.balance, 1900);
});
test("ledger-backed credit cannot be inflated/reclaimed; old reward stays immutable", async () => {
  const client = student();
  await claimLedgerCredit(client, sid, "reward001");
  assert.equal((await wallet())?.balance, 2000);
  await Promise.all([
    claimLedgerCredit(client, sid, "reward001"),
    claimLedgerCredit(client, sid, "reward001"),
  ]);
  assert.equal((await wallet())?.balance, 2000);
  await assertFails(
    updateDoc(doc(client, "coinAccounts", sid), {
      balance: 999999,
      credited: 999999,
    })
  );
  await assertFails(
    setDoc(doc(client, "coinAccounts", sid, "creditClaims", "fake001"), {
      creditId: "reward001",
      amount: 2000,
      revision: 2,
      createdAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(client, "coinAccounts", sid, "entries", "reward001"), {
      amount: 999999,
    })
  );
  assert.equal(
    (await admin.doc(`coinAccounts/${sid}/entries/reward001`).get()).data()
      ?.amount,
    2000
  );
});
test("no wallet can be initialized from client balance without a real uniquely paired credit", async () => {
  await assertFails(
    setDoc(doc(student(), "coinAccounts", sid), {
      schemaVersion: 1,
      balance: 2000,
      credited: 2000,
      spent: 0,
      creditRevision: 1,
      drawRevision: 0,
      lastCreditId: "reward001",
      lastRequestId: "",
    })
  );
  assert.equal(await wallet(), undefined);
});
test("100 separate one-coin entries can fund a draw without a Rules collection sum or access-limit failure", async () => {
  await admin.doc(`coinAccounts/${sid}/entries/reward001`).delete();
  const batch = admin.batch();
  for (let i = 0; i < 100; i++)
    batch.set(admin.doc(`coinAccounts/${sid}/entries/small_${i}`), {
      kind: "taskReward",
      amount: 1,
    });
  await batch.commit();
  const receipt = await drawBrowserCard(
    student(),
    sid,
    "many001",
    catalog.sourceSha256
  );
  assert.equal(receipt.balance, 0);
  assert.equal(await ledgerBalance(), 0);
  assert.equal(
    (await admin.collection(`coinAccounts/${sid}/creditClaims`).get()).size,
    100
  );
});
test("each four-write draw passes the 10-per-write / 20-per-transaction Rules limits and leaves real card selection unchanged", async () => {
  const result = await drawBrowserCard(
    student(),
    sid,
    "atomic001",
    catalog.sourceSha256
  );
  assert.equal(result.price, 100);
  assert.equal((await wallet())?.balance, 1900);
  assert.equal(await ledgerBalance(), 1900);
  const p = (await admin.doc(`profiles/${sid}`).get()).data()!;
  assert.equal(p.cardId, "starter-explorer-boy");
  assert.equal(p.ownedCardIds.length, 2);
});
test("forged price, role, revision, cross-gender, disabled, unavailable, unowned unknown and repeated cards are denied atomically", async () => {
  const client = student();
  await prepareBrowserCredits(client, sid);
  const c = structuredClone(catalog);
  c.cards["stone-age-explorer-boy"].enabled = false;
  c.cards["hk-port-boy"].drawEnabled = false;
  await admin.doc("cardCatalog/current").set(c);
  for (const [i, patch] of [
    { price: 1 },
    { price: 0 },
    { price: -100 },
    { role: "studentGirl" },
    { revision: 99 },
    { cardId: "nile-explorer-girl" },
    { cardId: "stone-age-explorer-boy" },
    { cardId: "hk-port-boy" },
    { cardId: "fake-card" },
    { cardId: "starter-explorer-boy" },
  ].entries())
    await assertFails(rawDraw(client, `forged_${i}`, patch));
  assert.equal((await wallet())?.balance, 2000);
  assert.equal(await ledgerBalance(), 2000);
  assert.equal(
    (await admin.doc(`profiles/${sid}`).get()).data()?.ownedCardIds.length,
    1
  );
});
test("missing any artifact rejects the entire transaction; neither isolated debit nor free card is accepted", async () => {
  const client = student();
  await prepareBrowserCredits(client, sid);
  for (const omitted of ["profile", "debit", "receipt", "wallet"])
    await assertFails(rawDraw(client, `omit_${omitted}`, {}, omitted));
  assert.equal((await wallet())?.balance, 2000);
  assert.equal(await ledgerBalance(), 2000);
  await assertFails(
    updateDoc(doc(client, "profiles", sid), {
      ownedCardIds: ["starter-explorer-boy", "nile-explorer-boy"],
    })
  );
});
test("same request retries and concurrent calls return exactly one original card and one debit", async () => {
  const client = student();
  await prepareBrowserCredits(client, sid);
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      drawBrowserCard(student(), sid, "retry001", catalog.sourceSha256)
    )
  );
  assert.equal(new Set(results.map((r) => r.cardId)).size, 1);
  assert.equal((await wallet())?.balance, 1900);
  const replay = await drawBrowserCard(
    client,
    sid,
    "retry001",
    catalog.sourceSha256,
    () => "nile-explorer-girl"
  );
  assert.equal(replay.cardId, results[0].cardId);
  await assertFails(
    rawDraw(client, "retry001", { cardId: "stone-age-explorer-boy" })
  );
});
test("different requests concurrently cannot overspend or duplicate cards", async () => {
  await admin
    .doc(`coinAccounts/${sid}/entries/reward001`)
    .update({ amount: 200 });
  const client = student();
  await prepareBrowserCredits(client, sid);
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      drawBrowserCard(student(), sid, `parallel_${i}`, catalog.sourceSha256)
    )
  );
  const ok = results.filter(
    (r) => r.status === "fulfilled"
  ) as PromiseFulfilledResult<BrowserDrawReceipt>[];
  assert.equal(ok.length, 2);
  assert.equal(new Set(ok.map((r) => r.value.cardId)).size, 2);
  assert.equal(await ledgerBalance(), 0);
});
test("insufficient coins and empty pool cause no draw debit; CMS server price remains authoritative", async () => {
  const client = student();
  await admin
    .doc(`coinAccounts/${sid}/entries/reward001`)
    .update({ amount: 99 });
  await assert.rejects(
    drawBrowserCard(client, sid, "poor001", catalog.sourceSha256),
    (e: any) => e.code === "insufficient-coins"
  );
  assert.equal(await ledgerBalance(), 99);
  await admin.doc(`profiles/${sid}`).update({
    ownedCardIds: Object.keys(catalog.cards).filter(
      (id) => catalog.cards[id].role === "studentBoy"
    ),
  });
  await assert.rejects(
    drawBrowserCard(client, sid, "empty001", catalog.sourceSha256),
    (e: any) => e.code === "pool-empty"
  );
  assert.equal(await ledgerBalance(), 99);
  assert.equal(
    (await admin.collection(`cardDrawReceipts/${sid}/requests`).get()).size,
    0
  );
});
test("new rewards can be claimed after earlier draws without retroactive changes or double credit", async () => {
  const client = student();
  await drawBrowserCard(client, sid, "before001", catalog.sourceSha256);
  await admin
    .doc(`coinAccounts/${sid}/entries/new_reward`)
    .set({ kind: "gameReward", amount: 37 });
  await Promise.all([
    claimLedgerCredit(client, sid, "new_reward"),
    claimLedgerCredit(client, sid, "new_reward"),
  ]);
  assert.equal((await wallet())?.balance, 1937);
  assert.equal(await ledgerBalance(), 1937);
});
test("anonymous, disabled, cross-student wallet/credit/profile/receipt operations stay denied", async () => {
  await prepareBrowserCredits(student(), sid);
  const other = env
    .authenticatedContext("other_uid", claim("other@example.test"))
    .firestore();
  await assertFails(getDoc(doc(other, "coinAccounts", sid)));
  await assertFails(claimLedgerCredit(other, sid, "reward001"));
  await assertFails(rawDraw(other));
  await admin.doc("access/student@example.test").update({ enabled: false });
  await assertFails(
    drawBrowserCard(student(), sid, "disabled001", catalog.sourceSha256)
  );
  await assertFails(
    getDoc(
      doc(env.unauthenticatedContext().firestore(), "cardCatalog", "current")
    )
  );
});
test("credit proof requires exactly its source ID, amount, revision and paired wallet; no combined or partial credit mint", async () => {
  const client = student();
  await admin
    .doc(`coinAccounts/${sid}/entries/reward002`)
    .set({ kind: "gameReward", amount: 37 });
  for (const patch of [
    { amount: 9999 },
    { creditId: "reward002" },
    { revision: 99 },
  ]) {
    const batch = writeBatch(client);
    batch.set(doc(client, "coinAccounts", sid), {
      schemaVersion: 1,
      balance: 2000,
      credited: 2000,
      spent: 0,
      creditRevision: 1,
      drawRevision: 0,
      lastCreditId: "reward001",
      lastRequestId: "",
    });
    batch.set(doc(client, "coinAccounts", sid, "creditClaims", "reward001"), {
      creditId: "reward001",
      amount: 2000,
      revision: 1,
      createdAt: serverTimestamp(),
      ...patch,
    });
    await assertFails(batch.commit());
  }
  await assertFails(
    setDoc(doc(client, "coinAccounts", sid, "creditClaims", "reward001"), {
      creditId: "reward001",
      amount: 2000,
      revision: 1,
      createdAt: serverTimestamp(),
    })
  );
  const batch = writeBatch(client);
  batch.set(doc(client, "coinAccounts", sid), {
    schemaVersion: 1,
    balance: 2037,
    credited: 2037,
    spent: 0,
    creditRevision: 2,
    drawRevision: 0,
    lastCreditId: "reward002",
    lastRequestId: "",
  });
  for (const [id, amount] of [
    ["reward001", 2000],
    ["reward002", 37],
  ] as const)
    batch.set(doc(client, "coinAccounts", sid, "creditClaims", id), {
      creditId: id,
      amount,
      revision: 2,
      createdAt: serverTimestamp(),
    });
  await assertFails(batch.commit());
  assert.equal(await wallet(), undefined);
});
test("CMS price changes are authoritative; arbitrary wallet sequence changes fail", async () => {
  await admin.doc("cardCatalog/current").set({ ...catalog, drawPrice: 37 });
  const result = await drawBrowserCard(
    student(),
    sid,
    "price037",
    catalog.sourceSha256
  );
  assert.equal(result.price, 37);
  assert.equal(result.balance, 1963);
  for (const patch of [
    { drawRevision: 99 },
    { creditRevision: 99 },
    { spent: 0, balance: 2000 },
    { lastRequestId: "made_up" },
    { balance: -1 },
  ])
    await assertFails(updateDoc(doc(student(), "coinAccounts", sid), patch));
  assert.equal((await wallet())?.balance, 1963);
});
test("all six grades and both roles exhaust the same-role pool once each; no grade gate or duplicates", async () => {
  const client = student();
  for (const role of ["studentBoy", "studentGirl"])
    for (const grade of ["1A", "2A", "3A", "S4", "S5", "S6"]) {
      // New synthetic account history per iteration; never a production inventory.
      await admin.recursiveDelete(admin.doc(`coinAccounts/${sid}`));
      await admin.recursiveDelete(admin.doc(`cardDrawReceipts/${sid}`));
      await admin.doc(`profiles/${sid}`).set(profile(role, grade));
      await admin
        .doc(`coinAccounts/${sid}/entries/reward001`)
        .set({ kind: "taskReward", amount: 2000 });
      const expected = Object.keys(catalog.cards).filter(
          (id) => catalog.cards[id].role === role && !id.startsWith("starter")
        ),
        cards: string[] = [];
      for (let i = 0; i < expected.length; i++)
        cards.push(
          (
            await drawBrowserCard(
              client,
              sid,
              `grade_${grade}_${role}_${i}`,
              catalog.sourceSha256
            )
          ).cardId
        );
      assert.deepEqual([...cards].sort(), expected.sort());
      assert.equal(new Set(cards).size, expected.length);
      const before = (await wallet())!.balance;
      await assert.rejects(
        drawBrowserCard(
          client,
          sid,
          `full_${grade}_${role}`,
          catalog.sourceSha256
        ),
        (e: any) => e.code === "pool-empty"
      );
      assert.equal((await wallet())?.balance, before);
    }
});
test("new S1-S6 students initialize only same-sex starter; existing holdings remain exact and editable", async () => {
  for (const role of ["studentBoy", "studentGirl"])
    for (const grade of ["1A", "2A", "3A", "S4", "S5", "S6"]) {
      const id = `new_${role}_${grade}`,
        email = `${id}@example.test`,
        client = env.authenticatedContext(id, claim(email)).firestore();
      const base = {
        className: grade,
        studentNo: "1",
        name: "新學生",
        nickname: "探索者",
        avatar: role,
        configured: false,
      };
      await admin.doc(`access/${email}`).set({ enabled: true, studentId: id });
      await admin.doc(`profiles/${id}`).set(base);
      const p = { ...profile(role, grade), ...base, configured: true };
      await assertSucceeds(setDoc(doc(client, "profiles", id), p));
      assert.equal(p.ownedCardIds.length, 1);
      await assertFails(
        updateDoc(doc(client, "profiles", id), {
          ownedCardIds: [
            ...p.ownedCardIds,
            role === "studentBoy" ? "nile-explorer-boy" : "nile-explorer-girl",
          ],
        })
      );
    }
  const owned = [
    "starter-explorer-boy",
    "nile-explorer-boy",
    "unknown-historical-card",
    "renaissance-explorer-boy",
  ];
  await admin.doc(`profiles/${sid}`).update({ ownedCardIds: owned });
  assert.deepEqual(
    initialOwnedCards(
      { role: "studentBoy", ownedCardIds: owned },
      "studentBoy",
      "1A"
    ),
    owned
  );
  await assertSucceeds(
    updateDoc(doc(student(), "profiles", sid), {
      nickname: "新暱稱",
      cardId: "renaissance-explorer-boy",
    })
  );
  await assertFails(
    updateDoc(doc(student(), "profiles", sid), {
      ownedCardIds: owned.slice(0, 1),
    })
  );
  await drawBrowserCard(student(), sid, "retain001", catalog.sourceSha256);
  assert.deepEqual(
    (await admin.doc(`profiles/${sid}`).get())
      .data()
      ?.ownedCardIds.slice(0, owned.length),
    owned
  );
});
test("specified full-card accounts retain cross-role selection but still pay verified draw price; teacher cannot freely grant/revoke", async () => {
  for (const email of ["tangkl@ctshkpcc.edu.hk", "kitlung1107@gmail.com"]) {
    await admin.doc(`access/${email}`).set({ enabled: true, studentId: sid });
    const client = env
      .authenticatedContext("privileged_uid", claim(email))
      .firestore();
    await assertSucceeds(
      updateDoc(doc(client, "profiles", sid), { cardId: "nile-explorer-girl" })
    );
    await assertFails(
      setDoc(doc(client, "coinAccounts", sid), { balance: 99999 })
    );
    const receipt = await drawBrowserCard(
      client,
      sid,
      email.startsWith("tang") ? "priv_tang" : "priv_kit",
      catalog.sourceSha256
    );
    assert.equal(receipt.price, 100);
    assert.equal(catalog.cards[receipt.cardId].role, "studentBoy");
  }
  const teacher = env
    .authenticatedContext("teacher_uid", claim("kitlung1107@gmail.com"))
    .firestore();
  const p = (await admin.doc(`profiles/${sid}`).get()).data()!;
  await assertSucceeds(
    updateDoc(doc(teacher, "profiles", sid), { name: "新姓名" })
  );
  await assertFails(
    updateDoc(doc(teacher, "profiles", sid), { ownedCardIds: [] })
  );
  await assertFails(
    updateDoc(doc(teacher, "profiles", sid), {
      ownedCardIds: [...p.ownedCardIds, "fake-card"],
    })
  );
});
test("incompatible legacy wallet or negative history fails closed in the normal client", async () => {
  await admin
    .doc(`coinAccounts/${sid}`)
    .set({ drawRevision: 1, lastRequestId: "legacy" });
  await assert.rejects(
    drawBrowserCard(student(), sid, "legacy001", catalog.sourceSha256),
    (e: any) => e.code === "wallet-incompatible"
  );
  await admin.doc(`coinAccounts/${sid}`).delete();
  await admin
    .doc(`coinAccounts/${sid}/entries/legacy_debit`)
    .set({ kind: "unknown", amount: -20 });
  await assert.rejects(
    drawBrowserCard(student(), sid, "legacy002", catalog.sourceSha256),
    (e: any) => e.code === "ledger-incompatible"
  );
  assert.equal(
    (await admin.collection(`cardDrawReceipts/${sid}/requests`).get()).size,
    0
  );
});
test("existing teacher-confirmed positive rewards and legacy zero replacement still back the wallet exactly once", async () => {
  const teacher = env
      .authenticatedContext("teacher_uid", claim("kitlung1107@gmail.com"))
      .firestore(),
    client = student();
  await drawBrowserCard(client, sid, "reward_before", catalog.sourceSha256);
  for (const [id, amount] of [
    ["new_task", 37],
    ["legacy_zero", 23],
  ] as const) {
    await admin.doc(`submissions/attempt_${id}`).set({
      studentId: sid,
      taskId: id,
      grade: { status: "graded", score: 100 },
    });
    if (id === "legacy_zero")
      await admin
        .doc(`coinAccounts/${sid}/entries/${id}`)
        .set({ kind: "taskReward", amount: 0 });
    const data = {
      kind: "taskReward",
      taskId: id,
      attemptId: `attempt_${id}`,
      amount,
      score: 100,
      progress: 100,
      rule: { mode: "fixed", amount },
      createdAt: serverTimestamp(),
    };
    await assertFails(
      setDoc(doc(client, "coinAccounts", sid, "entries", id), data)
    );
    await assertSucceeds(
      setDoc(doc(teacher, "coinAccounts", sid, "entries", id), data)
    );
    await claimLedgerCredit(client, sid, id);
    await claimLedgerCredit(client, sid, id);
    await assertFails(
      updateDoc(doc(teacher, "coinAccounts", sid, "entries", id), {
        amount: amount + 1,
      })
    );
  }
  assert.equal((await wallet())?.balance, 1960);
  assert.equal(await ledgerBalance(), 1960);
});
async function earningFixture(taskId: string, amount: number) {
  const fixture = makeAssessment(taskId, 3),
    batch = admin.batch();
  batch.set(
    admin.doc(`assessmentVersions/${taskId}--${fixture.meta.version}`),
    { ...fixture.meta, acceptFrom: AdminTimestamp.fromMillis(0) }
  );
  batch.set(
    admin.doc(`assessmentKeys/${taskId}--${fixture.meta.version}`),
    fixture.key
  );
  batch.set(admin.doc(`taskAccess/${taskId}`), { enabled: true, grade: 1 });
  batch.set(admin.doc(`coinRules/${taskId}`), {
    mode: "fixed",
    amount,
    metric: "score",
    tiers: [],
  });
  batch.set(admin.doc("rewardAutomation/status"), {
    enabled: true,
    activatedAt: AdminTimestamp.fromMillis(0),
  });
  await batch.commit();
  return fixture;
}
test("main a0df assessment earns 120 via compatible Rules, then 100 buys the real card; replay neither mints nor charges twice", async () => {
  await admin.doc(`coinAccounts/${sid}/entries/reward001`).delete();
  const f = await earningFixture("earn_draw", 120),
    client = student();
  const answers = f.meta.questions.map((q: any, i: number) => ({
    question_id: q.id,
    value: i % 3,
  }));
  await assertFails(
    getDoc(doc(client, "assessmentKeys", `earn_draw--${f.meta.version}`))
  );
  const grade = await submitAndSettle(
    client,
    "earned_attempt",
    sid,
    f.meta,
    answers
  );
  assert.equal(grade.score, 100);
  assert.equal(await ledgerBalance(), 120);
  await assertFails(
    updateDoc(doc(client, "coinAccounts", sid, "entries", "earn_draw"), {
      amount: 999999,
    })
  );
  const receipt = await drawBrowserCard(
    client,
    sid,
    "earned_draw",
    catalog.sourceSha256
  );
  assert.equal(receipt.balance, 20);
  await submitAndSettle(client, "earned_attempt", sid, f.meta, answers);
  assert.equal(
    (await drawBrowserCard(client, sid, "earned_draw", catalog.sourceSha256))
      .cardId,
    receipt.cardId
  );
  assert.equal(await ledgerBalance(), 20);
  assert.equal(
    (await admin.doc(`profiles/${sid}`).get()).data()?.ownedCardIds.length,
    2
  );
});
test("earning a new main-protocol reward concurrently with requests cannot create counterfeit funds or duplicate debit", async () => {
  await admin
    .doc(`coinAccounts/${sid}/entries/reward001`)
    .update({ amount: 120 });
  await prepareBrowserCredits(student(), sid);
  const f = await earningFixture("parallel_reward", 37),
    answers = f.meta.questions.map((q: any, i: number) => ({
      question_id: q.id,
      value: i % 3,
    }));
  const earn = submitAndSettle(
    student(),
    "parallel_earn",
    sid,
    f.meta,
    answers
  );
  const draws = await Promise.allSettled(
    Array.from({ length: 4 }, (_, i) =>
      drawBrowserCard(student(), sid, `earndraw_${i}`, catalog.sourceSha256)
    )
  );
  await earn;
  await prepareBrowserCredits(student(), sid);
  assert.equal(draws.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await ledgerBalance(), 57);
  assert.equal((await wallet())?.balance, 57);
});
test("uncertified historical funds are denied by Rules even if a modified browser bypasses client ledger checks", async () => {
  const client = student();
  await prepareBrowserCredits(client, sid);
  await admin.doc(`cardDrawEligibility/${sid}`).delete();
  await assertFails(rawDraw(client, "uncertified"));
  await assertFails(
    setDoc(doc(client, "cardDrawEligibility", sid), {
      verified: true,
      walletModel: "immutable-positive-rewards-v1",
      openingBalance: 0,
    })
  );
  await assertFails(
    setDoc(doc(client, "cardDraw", "status"), {
      enabled: true,
      protocolVersion: 1,
    })
  );
  await admin.doc(`cardDrawEligibility/${sid}`).set({
    verified: true,
    walletModel: "immutable-positive-rewards-v1",
    openingBalance: 99,
  });
  await assertFails(rawDraw(client, "opening_fake"));
  assert.equal(await ledgerBalance(), 2000);
  assert.equal((await wallet())?.balance, 2000);
});
test("old page/catalogue version and missing client version cannot buy new CMS cards; refreshed matching version can", async () => {
  const source = JSON.parse(
    fs.readFileSync("client/src/content/settings/cards.json", "utf8")
  );
  source.cards.push({
    ...source.cards.find((c: any) => c.id === "nile-explorer-boy"),
    id: "demo-new-boy",
    name: "本機新卡",
    drawEnabled: true,
  });
  const fresh = buildCardCatalog(source);
  await admin.doc("cardCatalog/current").set(fresh);
  await assert.rejects(
    drawBrowserCard(student(), sid, "old_tab", catalog.sourceSha256),
    (e: any) => e.code === "catalog-outdated"
  );
  assert.equal(await wallet(), undefined);
  assert.equal(await ledgerBalance(), 2000);
  const receipt = await drawBrowserCard(
    student(),
    sid,
    "fresh_tab",
    fresh.sourceSha256,
    () => "demo-new-boy"
  );
  assert.equal(receipt.cardId, "demo-new-boy");
  await assertFails(
    rawDraw(student(), "missing_ver", {
      cardId: "stone-age-explorer-boy",
      clientCatalogHash: null,
      catalogHash: fresh.sourceSha256,
    })
  );
  assert.equal(await ledgerBalance(), 1900);
});
