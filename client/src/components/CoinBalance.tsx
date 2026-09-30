import { useEffect, useState } from "react";
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
        <svg
          className="exploration-coin"
          viewBox="0 0 32 36"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M14 2h5c7 0 11 7 11 16S26 34 19 34h-5Z"
            fill="#d99a32"
            stroke="#82502c"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="m21 5 4 1M25 12l4 1M26 24l3-1M21 31l4-1"
            stroke="#a8672b"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <ellipse
            cx="14"
            cy="18"
            rx="12"
            ry="16"
            fill="#f6cd58"
            stroke="#82502c"
            strokeWidth="2"
          />
          <ellipse
            cx="14"
            cy="18"
            rx="8.5"
            ry="12"
            fill="#efb83e"
            stroke="#b87930"
            strokeWidth="1.4"
          />
          <path
            d="M7 12c1-4 3-6 6-7"
            fill="none"
            stroke="#fff0b1"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M12.5 11h3v14h-3Z" fill="#98602e" />
          <path d="M15.5 12v12" stroke="#ffe699" strokeWidth="1" />
        </svg>
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
