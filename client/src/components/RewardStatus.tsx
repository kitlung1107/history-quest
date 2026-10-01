import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import { db } from "@/lib/firebase";
import { useOptionalStudentAccount } from "@/contexts/StudentAccount";

const functions = getFunctions(db.app, "asia-east2");
if (import.meta.env.DEV && import.meta.env.VITE_GAME_EMULATORS === "1")
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);

export default function RewardStatus({
  taskId,
  sourceId,
  kind = "taskReward",
  studentId,
}: {
  taskId: string;
  sourceId: string;
  kind?: "taskReward" | "gameReward";
  studentId?: string;
}) {
  const account = useOptionalStudentAccount();
  const sid = account?.teacher && studentId ? studentId : account?.studentId;
  const scope = `${sid}:${taskId}:${kind}:${sourceId}`;
  const [state, setState] = useState<{
    scope: string;
    earned?: number;
    status?: string;
    active?: boolean;
    historical?: boolean;
    error?: boolean;
  }>({ scope: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setNotice("");
    if (!sid || !sourceId) return;
    setState({ scope });
    let active = true;
    let cutoff: number | undefined;
    let created: number | undefined;
    let ready = false,
      enabled = false;
    const update = (patch: Partial<typeof state>) => {
      if (active)
        setState(previous =>
          previous.scope === scope ? { ...previous, ...patch } : previous
        );
    };
    const failed = () => update({ error: true });
    const stop = [
      onSnapshot(
        doc(db, "coinAccounts", sid, "entries", taskId),
        snapshot => update({ earned: Number(snapshot.data()?.amount) || 0 }),
        failed
      ),
      onSnapshot(
        doc(db, "rewardResults", sid, "attempts", `${kind}_${sourceId}`),
        snapshot => update({ status: snapshot.data()?.status }),
        failed
      ),
      onSnapshot(
        doc(db, "rewardAutomation", "status"),
        { includeMetadataChanges: true },
        snapshot => {
          cutoff = typeof snapshot.data()?.activatedAt?.toMillis === "function" ? snapshot.data()?.activatedAt.toMillis() : undefined;
          ready = !snapshot.metadata.fromCache && snapshot.data()?.enabled === true && cutoff !== undefined;
          update({
            active: ready && enabled,
            historical:
              cutoff !== undefined && created !== undefined && created < cutoff,
          });
        },
        failed
      ),
      onSnapshot(
        doc(db, "rewardPolicies", taskId),
        { includeMetadataChanges: true },
        snapshot => {
          enabled =
            !snapshot.metadata.fromCache && snapshot.data()?.enabled === true && snapshot.data()?.source === (kind === "taskReward" ? "assessment" : "game");
          update({ active: ready && enabled });
        },
        failed
      ),
      onSnapshot(
        doc(
          db,
          kind === "taskReward" ? "submissions" : "gameSessions",
          sourceId
        ),
        snapshot => {
          created = snapshot.data()?.createdAt?.toMillis();
          update({
            historical:
              cutoff !== undefined && created !== undefined && created < cutoff,
          });
        },
        failed
      ),
    ];
    return () => {
      active = false;
      stop.forEach(unsubscribe => unsubscribe());
    };
  }, [scope]);

  async function retry() {
    setBusy(true);
    setNotice("");
    try {
      await httpsCallable(functions, "retryMyReward")({ kind, sourceId });
    } catch {
      setNotice("核算暫未成功，請稍後重試；不會重複領取。");
    } finally {
      setBusy(false);
    }
  }
  if (!sid || state.scope !== scope) return null;
  const earned = state.earned || 0;
  const message =
    earned > 0
      ? `此任務已獲得 ${earned.toLocaleString("zh-HK")} 探索幣；不會重複發放。`
      : state.error
        ? "未能讀取獎勵狀態，請檢查連線。"
        : state.historical
          ? "這是啟用前的紀錄，未自動補派探索幣。"
          : !state.active
            ? kind === "gameReward"
              ? "此遊戲獎勵尚未啟用；待可信通關驗證接通後啟用。"
              : "此任務獎勵尚未啟用。"
            : state.status === "pending-grading"
              ? "待老師完成必要批改，符合條件後發放探索幣。"
              : state.status === "pending-verification"
                ? "通關驗證尚未完成，暫未發放探索幣。"
                : state.status === "not-qualified"
                  ? "本次沒有符合正數獎勵的條件。"
                  : "探索幣正在由後端核算，完成後會更新。";
  return (
    <div className="my-3 text-sm leading-6" role="status" aria-live="polite">
      <p>{message}</p>
      {!account?.teacher && state.active && !state.historical && !earned && (
        <button
          type="button"
          disabled={busy}
          className="underline underline-offset-4"
          onClick={() => void retry()}
        >
          {busy ? "核算中…" : "重試獎勵核算"}
        </button>
      )}
      {notice && <p>{notice}</p>}
    </div>
  );
}
