import { initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { createCardDrawClient } from "./cardDrawClient";
import {
  submitAndSettle,
  type PublicAssessment,
  type RawAnswer,
} from "./rulesAssessment";
import type { BrowserDrawReceipt } from "./browserDraw";
export type LocalReceipt = BrowserDrawReceipt;
type Session = { sid: string; email: string; full: boolean };
let session: Session | undefined,
  db: Firestore | undefined,
  engine: ReturnType<typeof createCardDrawClient> | undefined;
function fixture(): Session {
  const q = new URLSearchParams(location.search),
    account = q.get("account");
  if (
    ["tangkl@ctshkpcc.edu.hk", "kitlung1107@gmail.com"].includes(account ?? "")
  )
    return {
      sid: account!.startsWith("tangkl") ? "demo-priv-tang" : "demo-priv-kit",
      email: account!,
      full: true,
    };
  const role = q.get("role") === "studentGirl" ? "girl" : "boy",
    grade = ["1A", "2A", "3A", "S4", "S5", "S6"].includes(q.get("class") ?? "")
      ? q.get("class")!
      : "3A";
  const scenario = ["poor", "empty", "earn", "legacy"].includes(
      q.get("scenario") ?? ""
    )
      ? q.get("scenario")!
      : "normal",
    slot = Math.max(0, Math.min(5, Number(q.get("slot")) || 0));
  const sid = `demo-${role}-${grade}-${scenario}-${slot}`;
  return { sid, email: `${sid}@example.test`, full: false };
}
function connect() {
  if (
    !import.meta.env.DEV ||
    !["localhost", "127.0.0.1"].includes(location.hostname)
  )
    throw new Error("示範只可在本機運行。");
  if (!session) session = fixture();
  if (!db) {
    db = getFirestore(
      initializeApp(
        {
          projectId: "demo-browser-draw-preview",
          apiKey: "emulator-only",
          appId: "emulator-only",
        },
        session.sid
      )
    );
    connectFirestoreEmulator(db, "127.0.0.1", 8185, {
      mockUserToken: {
        sub: session.sid,
        email: session.email,
        email_verified: true,
        firebase: { sign_in_provider: "google.com" },
      },
    });
    engine = createCardDrawClient(db, session.sid, session.sid, session.email);
  }
  return db;
}
export async function localDrawState() {
  connect();
  const state = await engine!.state();
  return {
    ...state,
    profile: { ...state.profile, demoFullAccess: session!.full },
  };
}
export async function localDraw() {
  connect();
  return engine!.draw();
}
export function pendingLocalDraw() {
  return engine?.pending();
}
export function finishLocalDraw() {
  engine?.finish();
}
export function resetLocalDraw() {
  engine?.finish();
  const q = new URLSearchParams(location.search);
  q.set("slot", String(((Number(q.get("slot")) || 0) + 1) % 6));
  history.replaceState(null, "", `${location.pathname}?${q}`);
}
export async function localEarnState() {
  const client = connect(),
    sid = session!.sid;
  const [metadata, earned, submission] = await Promise.all([
    getDoc(
      doc(client, "assessmentVersions", "demo_earn_task--draw-preview-v1")
    ),
    getDoc(doc(client, "coinAccounts", sid, "entries", "demo_earn_task")),
    getDoc(doc(client, "submissions", `earn_${sid}`)),
  ]);
  return {
    metadata: metadata.data() as PublicAssessment,
    earned: earned.data()?.amount ?? 0,
    answers: submission.data()?.answers as RawAnswer[] | undefined,
  };
}
export async function localEarn(answers: RawAnswer[]) {
  const client = connect(),
    state = await localEarnState();
  return submitAndSettle(
    client,
    `earn_${session!.sid}`,
    session!.sid,
    state.metadata,
    answers
  );
}
