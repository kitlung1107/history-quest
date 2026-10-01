import { useEffect, useState } from "react";
import ExplorationCoin from "./ExplorationCoin";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useOptionalStudentAccount } from "@/contexts/StudentAccount";

export default function CoinBalance() {
  const sid = useOptionalStudentAccount()?.studentId;
  const [state, setState] = useState<{
    sid?: string;
    balance?: number;
    error?: boolean;
  }>({});
  useEffect(() => {
    if (!sid) return;
    setState({ sid });
    return onSnapshot(
      collection(db, "coinAccounts", sid, "entries"),
      snapshot => {
        setState({
          sid,
          balance: snapshot.docs.reduce(
            (sum, entry) => sum + entry.data().amount,
            0
          ),
        });
      },
      () => setState({ sid, error: true })
    );
  }, [sid]);
  return (
    <div className="coin-balance" role="status">
      <span className="coin-balance-label">探索幣</span>
      <div className="coin-balance-count">
        <ExplorationCoin />
        <span className="coin-balance-times" aria-hidden="true">
          ×
        </span>
        <strong>
          {!sid
            ? "—"
            : state.sid !== sid
              ? "載入中"
              : state.error
                ? "未能讀取"
                : state.balance === undefined
                  ? "載入中"
                  : state.balance.toLocaleString("zh-HK")}
        </strong>
      </div>
    </div>
  );
}
