import { auditDrawLedger } from "../src/cardDrawQualification.ts";
import fs from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { buildCardCatalog } from "../../scripts/card-catalog.mjs";
// Hard fail before initialization: only the named loopback emulator project.
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8185")
  throw new Error(
    "Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8185; synthetic fixtures only"
  );
process.env.METADATA_SERVER_DETECTION = "none";
const projectId = "demo-browser-draw-preview";
const env = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: "127.0.0.1",
    port: 8185,
    rules: fs.readFileSync("integration/assessment/compatible.rules", "utf8"),
  },
});
const app = initializeApp({ projectId }, "seed-browser-preview"),
  db = getFirestore(app);
await env.clearFirestore();
const catalog = buildCardCatalog(
  JSON.parse(fs.readFileSync("client/src/content/settings/cards.json", "utf8"))
);
const writes: Array<[string, any]> = [
  ["metadata/enrollment", { revision: 1 }],
  ["cardCatalog/current", catalog],
  [
    "cardDraw/status",
    { enabled: true, protocolVersion: 1, automaticQualificationEnabled: true },
  ],
  [
    "rewardAutomation/status",
    { enabled: true, activatedAt: Timestamp.fromMillis(0) },
  ],
  ["taskAccess/demo_earn_task", { enabled: true, grade: 1 }],
  [
    "coinRules/demo_earn_task",
    { mode: "fixed", amount: 120, metric: "score", tiers: [] },
  ],
  [
    "assessmentVersions/demo_earn_task--draw-preview-v1",
    {
      taskId: "demo_earn_task",
      version: "draw-preview-v1",
      title: "本機賺幣驗收任務",
      enabled: true,
      acceptFrom: Timestamp.fromMillis(0),
      questionCount: 3,
      shortCount: 0,
      totalPoints: 30,
      questions: [
        {
          id: "q1",
          type: "choice",
          prompt: "尼羅河流域孕育了哪個文明？",
          points: 10,
          options: ["古埃及", "古羅馬", "明朝"],
        },
        {
          id: "q2",
          type: "choice",
          prompt: "研究歷史應參考哪一項？",
          points: 10,
          options: ["憑空推測", "史料及文物", "只看廣告"],
        },
        {
          id: "q3",
          type: "choice",
          prompt: "新卡符合哪個條件才會進入你的抽卡池？",
          points: 10,
          options: [
            "每人自動獲得",
            "可以重複抽同一張",
            "同性別、可抽且尚未擁有",
          ],
        },
      ],
    },
  ],
  [
    "assessmentKeys/demo_earn_task--draw-preview-v1",
    {
      taskId: "demo_earn_task",
      version: "draw-preview-v1",
      questions: [0, 1, 2].map((answer, i) => ({
        id: `q${i + 1}`,
        answer,
        explanation: "本機合成驗收題目。",
      })),
    },
  ],
];
const preparations: Array<[string, any]> = [];
function add(
  sid: string,
  email: string,
  role: string,
  className: string,
  scenario: string
) {
  preparations.push([`cardDrawEnrollmentRequests/${sid}`, {
    studentId: sid, email, nonce: `enroll_${sid}`, status: "pending",
    enrollmentRevision: 1, protocol: "teacher-enrollment/1", requestedAt: Timestamp.now(),
  }]);
  const starter =
    role === "studentBoy" ? "starter-explorer-boy" : "starter-explorer-girl";
  writes.push(
    [`access/${email}`, { enabled: true, studentId: sid, testing: true }],
    [
      `profiles/${sid}`,
      {
        configured: true,
        role,
        avatar: role,
        className,
        studentNo: "12",
        name: "陳小明（示範）",
        nickname: "歷史小探險",
        cardId: starter,
        ownedCardIds:
          scenario === "empty"
            ? Object.keys(catalog.cards).filter(
                (id) => catalog.cards[id].role === role
              )
            : scenario === "legacy"
              ? [
                  starter,
                  role === "studentBoy"
                    ? "nile-explorer-boy"
                    : "nile-explorer-girl",
                ]
              : [starter],
      },
    ]
  );
  if (scenario !== "earn")
    writes.push([
      `coinAccounts/${sid}/entries/demo_reward`,
      {
        kind: "taskReward",
        amount: scenario === "poor" ? 99 : scenario === "legacy" ? 175 : 2000,
      },
    ]);
  if (scenario === "legacy")
    writes.push([
      `coinAccounts/${sid}/entries/demo_legacy_debit`,
      { kind: "legacyDebit", amount: -75 },
    ]);
}
for (const role of ["studentBoy", "studentGirl"])
  for (const grade of ["1A", "2A", "3A", "S4", "S5", "S6"])
    for (const scenario of ["normal", "poor", "empty", "earn", "legacy"])
      for (let slot = 0; slot < 6; slot++) {
        const sid = `demo-${role === "studentBoy" ? "boy" : "girl"}-${grade}-${scenario}-${slot}`;
        add(sid, `${sid}@example.test`, role, grade, scenario);
      }
add("demo-priv-tang", "tangkl@ctshkpcc.edu.hk", "studentBoy", "3A", "normal");
add("demo-priv-kit", "kitlung1107@gmail.com", "studentBoy", "3A", "normal");
for (let i = 0; i < writes.length; i += 200) {
  const batch = db.batch();
  for (const [path, data] of writes.slice(i, i + 200))
    batch.set(db.doc(path), data);
  await batch.commit();
}
// Emulator-only setup audits the complete synthetic ledger. No daemon runs.
for (const [requestPath] of preparations) {
  const sid = requestPath.split("/")[1];
  const ledger = await db.collection(`coinAccounts/${sid}/entries`).get();
  const audit = auditDrawLedger(ledger.docs.map(row => ({ id: row.id, data: row.data() })), undefined, [], new Map());
  await db.doc("cardDrawEligibility/" + sid).set({ verified: true, walletModel: "immutable-positive-rewards-v1", openingBalance: 0, ...audit, protocol: "synthetic-preview-audit/1" });
}
console.log(
  `Seeded ${writes.length} synthetic documents in ${projectId} at 127.0.0.1:8185; no real accounts/balances touched.`
);
await env.cleanup();
await db.terminate();
await deleteApp(app);
