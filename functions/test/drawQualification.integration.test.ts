import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import {
  getFirestore,
  type Firestore as AdminFirestore,
} from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { ensureDrawQualification } from "../../client/src/lib/drawQualification.ts";
import {
  drawBrowserCard,
  claimLedgerCredit,
} from "../../client/src/lib/browserDraw.ts";
import {
  qualifyDrawRequest,
  auditDrawLedger,
} from "../src/cardDrawQualification.ts";
import { buildCardCatalog } from "../../scripts/card-catalog.mjs";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8185")
  throw Error("Local synthetic emulator only");
process.env.METADATA_SERVER_DETECTION = "none";
const projectId = "demo-browser-draw-auto-tests",
  app = initializeApp({ projectId }, "auto-qualification-tests"),
  admin = getFirestore(app);
let env: RulesTestEnvironment;
const sid = "auto-student",
  email = "auto@example.test",
  uid = "auto_uid";
const token = (mail = email) => ({
  email: mail,
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
});
const client = () => env.authenticatedContext(uid, token()).firestore();
const catalog = buildCardCatalog(
  JSON.parse(fs.readFileSync("client/src/content/settings/cards.json", "utf8"))
);
const initialProfile = {
  role: "studentBoy",
  configured: true,
  avatar: "studentBoy",
  className: "3A",
  studentNo: "12",
  name: "自動核算學生",
  nickname: "探索者",
  cardId: "starter-explorer-boy",
  ownedCardIds: ["starter-explorer-boy"],
};
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
  await env.cleanup();
  await admin.terminate();
  await deleteApp(app);
});
beforeEach(async () => {
  await env.clearFirestore();
  const b = admin.batch();
  b.set(admin.doc("access/" + email), { enabled: true, studentId: sid });
  b.set(admin.doc("profiles/" + sid), initialProfile);
  b.set(admin.doc("cardDraw/status"), {
    enabled: true,
    protocolVersion: 1,
    automaticQualificationEnabled: true,
  });
  b.set(admin.doc("cardCatalog/current"), catalog);
  b.set(admin.doc("coinAccounts/" + sid + "/entries/reward1"), {
    kind: "taskReward",
    amount: 2000,
  });
  await b.commit();
});
async function balance() {
  return (
    await admin.collection("coinAccounts/" + sid + "/entries").get()
  ).docs.reduce((n, r) => n + r.data().amount, 0);
}
async function legacy(credit = 175, debit = 75) {
  await admin
    .doc("coinAccounts/" + sid + "/entries/reward1")
    .set({ kind: "taskReward", amount: credit });
  await admin
    .doc("coinAccounts/" + sid + "/entries/old_debit")
    .set({ kind: "legacyDebit", amount: -debit });
  await admin
    .doc("profiles/" + sid)
    .update({ ownedCardIds: ["starter-explorer-boy", "nile-explorer-boy"] });
}
async function automatic(db = client()) {
  const pending = new Set<Promise<unknown>>(),
    errors: unknown[] = [];
  const stop = admin
    .doc("cardDrawQualificationRequests/" + sid)
    .onSnapshot((snapshot) => {
      if (snapshot.data()?.status !== "pending") return;
      const p = qualifyDrawRequest(admin, sid)
        .catch((e) => errors.push(e))
        .finally(() => pending.delete(p));
      pending.add(p);
    });
  try {
    await ensureDrawQualification(db, uid, sid, email, 5000);
  } finally {
    stop();
    await Promise.all([...pending]);
  }
  assert.deepEqual(errors, []);
  return db;
}
async function queue(db = client(), nonce = crypto.randomUUID()) {
  await setDoc(doc(db, "cardDrawQualificationRequests", sid), {
    studentId: sid,
    uid,
    email,
    nonce,
    status: "pending",
    requestedAt: serverTimestamp(),
  });
}
async function forgedDraw(db: any, id: string, receiptReserve = 0) {
  return runTransaction(db, async (tx) => {
    const w = (await tx.get(doc(db, "coinAccounts", sid))).data()!,
      p = (await tx.get(doc(db, "profiles", sid))).data()!;
    const cardId = "stone-age-explorer-boy",
      price = 100;
    tx.update(doc(db, "profiles", sid), {
      ownedCardIds: [...p.ownedCardIds, cardId],
    });
    tx.set(doc(db, "coinAccounts", sid, "entries", "draw_" + id), {
      kind: "cardDraw",
      requestId: id,
      cardId,
      amount: -price,
      createdAt: serverTimestamp(),
    });
    tx.set(doc(db, "cardDrawReceipts", sid, "requests", id), {
      requestId: id,
      cardId,
      price,
      balance: w.balance - price - receiptReserve,
      revision: w.drawRevision + 1,
      role: p.role,
      catalogHash: catalog.sourceSha256,
      clientCatalogHash: catalog.sourceSha256,
      createdAt: serverTimestamp(),
    });
    tx.update(doc(db, "coinAccounts", sid), {
      balance: w.balance - price,
      spent: w.spent + price,
      drawRevision: w.drawRevision + 1,
      lastRequestId: id,
    });
  });
}

test("new student automatically qualifies through own authenticated queue, then pays once; qualifier never creates wallet or changes holdings/entries", async () => {
  assert.equal(
    (await admin.doc("cardDrawEligibility/" + sid).get()).exists,
    false
  );
  const db = await automatic();
  assert.equal((await admin.doc("coinAccounts/" + sid).get()).exists, false);
  assert.deepEqual(
    (await admin.doc("profiles/" + sid).get()).data(),
    initialProfile
  );
  assert.equal(await balance(), 2000);
  const receipt = await drawBrowserCard(
    db,
    sid,
    "auto_new",
    catalog.sourceSha256
  );
  assert.equal(receipt.balance, 1900);
  assert.deepEqual(
    {
      ...(await drawBrowserCard(db, sid, "auto_new", catalog.sourceSha256)),
      createdAt: undefined,
    },
    { ...receipt, createdAt: undefined }
  );
  assert.equal(await balance(), 1900);
});
test("old student with 175 rewards minus 75 historical debit automatically uses exactly 100; all old cards and ledger rows remain", async () => {
  await legacy();
  const db = await automatic();
  const certification = (
    await admin.doc("cardDrawEligibility/" + sid).get()
  ).data()!;
  assert.equal(certification.legacySpent, 75);
  assert.deepEqual(certification.legacyDebits, { old_debit: -75 });
  await claimLedgerCredit(db, sid, "reward1");
  await assertFails(forgedDraw(db, "forged_balance"));
  const receipt = await drawBrowserCard(
    db,
    sid,
    "auto_old",
    catalog.sourceSha256
  );
  assert.equal(receipt.balance, 0);
  assert.equal(await balance(), 0);
  const owned = (await admin.doc("profiles/" + sid).get()).data()!.ownedCardIds;
  assert(owned.includes("nile-explorer-boy"));
  assert.equal(owned.length, 3);
  assert.equal(
    (
      await admin.doc("coinAccounts/" + sid + "/entries/old_debit").get()
    ).data()!.amount,
    -75
  );
  assert.equal(
    (await admin.doc("coinAccounts/" + sid + "/entries/reward1").get()).data()!
      .amount,
    175
  );
  assert.deepEqual(
    {
      ...(await drawBrowserCard(db, sid, "auto_old", catalog.sourceSha256)),
      createdAt: undefined,
    },
    { ...receipt, createdAt: undefined }
  );
  await assert.rejects(
    drawBrowserCard(db, sid, "auto_old_again", catalog.sourceSha256),
    (e: any) => e.code === "insufficient-coins"
  );
  assert.equal(await balance(), 0);
});
test("modified browser cannot ignore signed historical reserve: 125-75=50 cannot pay100 even with all four artifacts", async () => {
  await legacy(125, 75);
  const db = await automatic();
  await claimLedgerCredit(db, sid, "reward1");
  await assertFails(forgedDraw(db, "skip_reserve", 75));
  await assertFails(
    updateDoc(doc(db, "cardDrawEligibility", sid), {
      legacySpent: 0,
      legacyDebits: {},
    })
  );
  await assert.rejects(
    drawBrowserCard(db, sid, "too_poor", catalog.sourceSha256),
    (e: any) => e.code === "insufficient-coins"
  );
  assert.equal(await balance(), 50);
  assert.equal(
    (await admin.collection("cardDrawReceipts/" + sid + "/requests").get())
      .size,
    0
  );
});
test("old debt remains reserved; future immutable rewards can cover it without a teacher or new certification", async () => {
  await legacy(75, 200);
  const db = await automatic();
  await assert.rejects(
    drawBrowserCard(db, sid, "old_debt", catalog.sourceSha256),
    (e: any) => e.code === "insufficient-coins"
  );
  assert.equal(await balance(), -125);
  await admin
    .doc("coinAccounts/" + sid + "/entries/reward2")
    .set({ kind: "taskReward", amount: 226 });
  const receipt = await drawBrowserCard(
    db,
    sid,
    "covered_debt",
    catalog.sourceSha256
  );
  assert.equal(receipt.balance, 1);
  assert.equal(await balance(), 1);
});
test("qualification requests cannot claim balances/approval, impersonate another UID/email/student, or update trusted certificates", async () => {
  const db = client(),
    request = {
      studentId: sid,
      uid,
      email,
      nonce: "nonce_test",
      status: "pending",
      requestedAt: serverTimestamp(),
    };
  for (const patch of [
    { verified: true },
    { balance: 9999 },
    { uid: "other_uid" },
    { email: "other@example.test" },
    { studentId: "other" },
    { status: "qualified" },
  ])
    await assertFails(
      setDoc(doc(db, "cardDrawQualificationRequests", sid), {
        ...request,
        ...patch,
      })
    );
  await assertFails(
    setDoc(doc(db, "cardDrawQualificationRequests", "other"), {
      ...request,
      studentId: "other",
    })
  );
  await assertFails(
    setDoc(doc(db, "cardDrawEligibility", sid), {
      verified: true,
      openingBalance: 0,
      walletModel: "immutable-positive-rewards-v1",
    })
  );
  for (const unauthorized of [
    env.unauthenticatedContext().firestore(),
    env
      .authenticatedContext(uid, { ...token(), email_verified: false })
      .firestore(),
    env
      .authenticatedContext(uid, {
        ...token(),
        firebase: { sign_in_provider: "password" },
      })
      .firestore(),
  ])
    await assertFails(
      setDoc(doc(unauthorized, "cardDrawQualificationRequests", sid), request)
    );
  await automatic(db);
  await assertFails(
    updateDoc(doc(db, "cardDrawQualificationRequests", sid), {
      status: "pending",
      nonce: "new_nonce",
    })
  );
});
test("unknown positive credit and unsafe ledger values fail closed, while queue metadata never creates or rewrites coins", async () => {
  await admin
    .doc("coinAccounts/" + sid + "/entries/unknown")
    .set({ kind: "manualCredit", amount: 9999 });
  const db = client();
  await queue(db);
  assert.deepEqual(await qualifyDrawRequest(admin, sid), {
    status: "rejected",
    reason: "unsupported-credit-source",
  });
  assert.equal(
    (await admin.doc("cardDrawEligibility/" + sid).get()).exists,
    false
  );
  assert.equal((await admin.doc("coinAccounts/" + sid).get()).exists, false);
  assert.equal(await balance(), 11999);
  assert.throws(
    () =>
      auditDrawLedger(
        [{ id: "unsafe", data: { kind: "taskReward", amount: 1.5 } }],
        undefined,
        [],
        new Map()
      ),
    /invalid-ledger-entry/
  );
});
test("unproven historical cardDraw and incompatible proof wallet are rejected rather than classified as harmless history", async () => {
  await admin
    .doc("coinAccounts/" + sid + "/entries/draw_fake")
    .set({
      kind: "cardDraw",
      requestId: "fake",
      cardId: "nile-explorer-boy",
      amount: -100,
    });
  await queue();
  assert.deepEqual(await qualifyDrawRequest(admin, sid), {
    status: "rejected",
    reason: "unproven-draw-debit",
  });
  assert.equal(
    (await admin.doc("cardDrawEligibility/" + sid).get()).exists,
    false
  );
  assert.throws(
    () =>
      auditDrawLedger(
        [{ id: "r", data: { kind: "taskReward", amount: 100 } }],
        { balance: 9999 },
        [],
        new Map()
      ),
    /incompatible-proof-wallet/
  );
});
test("trusted re-audit after a real draw preserves its credit/debit proofs and reserves old debits exactly once", async () => {
  await legacy();
  const db = await automatic();
  const first = await drawBrowserCard(
    db,
    sid,
    "before_reaudit",
    catalog.sourceSha256
  );
  assert.equal(first.balance, 0);
  const w = (await admin.doc("coinAccounts/" + sid).get()).data();
  await admin.doc("cardDrawEligibility/" + sid).delete();
  await admin.doc("cardDrawQualificationRequests/" + sid).delete();
  await automatic(db);
  assert.deepEqual((await admin.doc("coinAccounts/" + sid).get()).data(), w);
  assert.equal(
    (await admin.doc("cardDrawEligibility/" + sid).get()).data()!.legacySpent,
    75
  );
  await assert.rejects(
    drawBrowserCard(db, sid, "after_reaudit", catalog.sourceSha256),
    (e: any) => e.code === "insufficient-coins"
  );
  assert.equal(await balance(), 0);
});
test("parallel automatic requests/auditors and different draw requests cannot duplicate credit, reserve, debit or card", async () => {
  await legacy();
  const a = client(),
    b = client();
  await Promise.all([automatic(a), automatic(b)]);
  const draws = await Promise.allSettled(
    ["parallel_auto1", "parallel_auto2", "parallel_auto3"].map((id) =>
      drawBrowserCard(client(), sid, id, catalog.sourceSha256)
    )
  );
  assert.equal(draws.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await balance(), 0);
  assert.equal(
    (await admin.collection("coinAccounts/" + sid + "/creditClaims").get())
      .size,
    1
  );
  assert.equal(
    (await admin.collection("cardDrawReceipts/" + sid + "/requests").get())
      .size,
    1
  );
});
test("new rewards racing a transactional audit remain claimable once, and disabled access cannot be certified", async () => {
  await Promise.all([
    automatic(),
    admin
      .doc("coinAccounts/" + sid + "/entries/new_reward")
      .set({ kind: "taskReward", amount: 37 }),
  ]);
  assert.equal(
    (await drawBrowserCard(client(), sid, "reward_race", catalog.sourceSha256))
      .balance,
    1937
  );
  assert.equal(await balance(), 1937);
});
test("revoked account and stopped global automation leave no certificate or financial changes", async () => {
  await queue();
  await admin.doc("access/" + email).update({ enabled: false });
  assert.deepEqual(await qualifyDrawRequest(admin, sid), {
    status: "rejected",
    reason: "account-not-active",
  });
  assert.equal(
    (await admin.doc("cardDrawEligibility/" + sid).get()).exists,
    false
  );
  assert.equal(await balance(), 2000);
  await admin
    .doc("cardDrawQualificationRequests/" + sid)
    .update({ status: "pending" });
  await admin
    .doc("cardDraw/status")
    .update({ automaticQualificationEnabled: false });
  assert.deepEqual(await qualifyDrawRequest(admin, sid), {
    status: "disabled",
  });
  assert.equal((await admin.doc("coinAccounts/" + sid).get()).exists, false);
});
test("missing trusted query/transaction permissions abort before writes; no fallback self-certification", async () => {
  let writes = 0;
  const denied = Object.assign(new Error("permission denied"), { code: 7 });
  const stub = {
    doc: (id: string) => ({ id }),
    collection: () => ({ limit: () => ({}) }),
    runTransaction: (fn: any) =>
      fn({
        get: async () => {
          throw denied;
        },
        set: () => writes++,
        update: () => writes++,
      }),
  } as unknown as AdminFirestore;
  await assert.rejects(qualifyDrawRequest(stub, sid), (e) => e === denied);
  assert.equal(writes, 0);
});
test("automatic qualification timeout and retry stay pending without financial changes, then resume when trusted processing returns", async () => {
  const db = client();
  await assert.rejects(
    ensureDrawQualification(db, uid, sid, email, 30),
    (e: any) => e.code === "qualification-pending"
  );
  const request = (
    await admin.doc("cardDrawQualificationRequests/" + sid).get()
  ).data()!;
  assert.equal(request.status, "pending");
  assert.equal((await admin.doc("coinAccounts/" + sid).get()).exists, false);
  assert.equal(await balance(), 2000);
  await qualifyDrawRequest(admin, sid);
  await ensureDrawQualification(db, uid, sid, email, 30);
  assert.equal(
    (await admin.doc("cardDrawQualificationRequests/" + sid).get()).data()!
      .nonce,
    request.nonce
  );
  assert.equal(
    (await drawBrowserCard(db, sid, "after_timeout", catalog.sourceSha256))
      .balance,
    1900
  );
});
test("new zero-balance student qualifies automatically once; a later first-positive reward funds a draw without recertification", async () => {
  await admin
    .doc("coinAccounts/" + sid + "/entries/reward1")
    .set({ kind: "taskReward", amount: 0 });
  const db = await automatic();
  await assert.rejects(
    drawBrowserCard(db, sid, "zero_before_reward", catalog.sourceSha256),
    (e: any) => e.code === "insufficient-coins"
  );
  const approval = (await admin.doc("cardDrawEligibility/" + sid).get()).data();
  assert.equal((await admin.doc("coinAccounts/" + sid).get()).exists, false);
  await admin
    .doc("coinAccounts/" + sid + "/entries/reward1")
    .set({ kind: "taskReward", amount: 100 });
  const receipt = await drawBrowserCard(
    db,
    sid,
    "positive_after_zero",
    catalog.sourceSha256
  );
  assert.equal(receipt.balance, 0);
  assert.equal(await balance(), 0);
  assert.deepEqual(
    (await admin.doc("cardDrawEligibility/" + sid).get()).data(),
    approval
  );
});
