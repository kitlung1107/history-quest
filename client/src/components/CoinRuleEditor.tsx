import { useEffect, useState } from "react";
import { doc, getDocFromServer, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { HISTORY_TASKS } from "@/lib/historyQuest";
import { coinSettingsError } from "@/lib/coinSettingsError";
import {
  defaultCoinRule,
  validateCoinRule,
  type CoinRule,
} from "@/lib/coinModel";

export default function CoinRuleEditor({
  preview = false,
}: {
  preview?: boolean;
}) {
  const [taskId, setTaskId] = useState(HISTORY_TASKS[0]?.id || "");
  const [rule, setRule] = useState<CoinRule>(defaultCoinRule);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(preview);
  const [notice, setNotice] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setNotice("");
    setLoadFailed(false);
    setReady(preview);
    setRule(defaultCoinRule);
    if (!preview)
      getDocFromServer(doc(db, "coinRules", taskId))
        .then(s => {
          if (active) {
            setRule(s.exists() ? (s.data() as CoinRule) : defaultCoinRule);
            setReady(true);
          }
        })
        .catch(error => {
          if (active) {
            setLoadFailed(true);
            setNotice(coinSettingsError(error, db.app.options.projectId || "未知專案"));
          }
        });
    return () => {
      active = false;
    };
  }, [taskId, preview, retry]);
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      validateCoinRule(rule);
      if (!preview) await setDoc(doc(db, "coinRules", taskId), rule);
      setNotice(
        preview ? "設定有效；本機預覽唔會寫入正式資料。" : "探索幣設定已儲存。"
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "儲存失敗，請重試。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="my-6 border-2 border-ink bg-white/60 p-4">
      <summary className="cursor-pointer font-bold">
        任務探索幣設定{preview ? "（本機預覽）" : ""}
      </summary>
      {loadFailed && <button type="button" className="pixel-button pixel-button-paper my-3" onClick={() => setRetry(n => n + 1)}>重試讀取設定</button>}
      <p className="my-3 text-sm">
        新學生餘額由 0 開始，不同任務獎勵會累積。完成並取得有效正式成績後，按老師設定派幣。未設獎勵、未達門檻或 0 幣唔會鎖定日後資格；每人每任務只派一次正數獎勵，之後唔重複派發或補差額。改規則後可按工作室「重新整理」檢查已載入成績。短答要等老師批改完成。
      </p>
      <label className="block my-3">
        任務
        <select
          className="block w-full border p-2"
          disabled={busy}
          value={taskId}
          onChange={e => setTaskId(e.target.value)}
        >
          {HISTORY_TASKS.map(t => (
            <option key={t.id} value={t.id}>
              {t.title}（{t.id}）
            </option>
          ))}
        </select>
      </label>
      <p className="my-3 text-sm">
        遊戲任務：到「學生遊戲場次與錯題庫」選擇玩家，按「確認本局探索幣」。成績按該局答對次數
        ÷ 總作答次數計算並四捨五入；完成程度為
        100%。未完成或零作答場次唔會發幣。
      </p>
      <fieldset disabled={!ready || busy} className="space-y-3">
        <label className="block">
          獎勵方式
          <select
            className="block border p-2"
            value={rule.mode}
            onChange={e =>
              setRule({ ...rule, mode: e.target.value as CoinRule["mode"] })
            }
          >
            <option value="off">不發探索幣</option>
            <option value="fixed">固定獎勵</option>
            <option value="tiers">分級獎勵</option>
          </select>
        </label>
        {rule.mode === "fixed" && (
          <label className="block">
            探索幣數量
            <input
              className="block border p-2"
              type="number"
              min="0"
              max="100000"
              step="1"
              value={rule.amount}
              onChange={e =>
                setRule({
                  ...rule,
                  amount: e.target.value === "" ? NaN : Number(e.target.value),
                })
              }
            />
          </label>
        )}
        {rule.mode === "tiers" && (
          <>
            <label className="block">
              分級依據
              <select
                className="block border p-2"
                value={rule.metric}
                onChange={e =>
                  setRule({
                    ...rule,
                    metric: e.target.value as CoinRule["metric"],
                  })
                }
              >
                <option value="score">正式成績（百分比）</option>
                <option value="progress">完成程度（目前只會以 100% 結算）</option>
              </select>
            </label>
            <p className="text-sm">
              只取符合嘅最高門檻，唔會累加；未達最低門檻為零幣。
            </p>
            {rule.metric === "progress" && <p className="text-sm">現有任務只喺完成後以 100% 結算，未有部分完成派幣；因此會選取 100% 符合嘅最高門檻。想按答題表現分級，請選「正式成績」。</p>}
            {rule.tiers.map((tier, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <label>
                  最低百分比
                  <input
                    aria-label={`級別 ${i + 1} 最低百分比`}
                    className="block border p-2 w-28"
                    type="number"
                    min="0"
                    max="100"
                    value={tier.minimum}
                    onChange={e =>
                      setRule({
                        ...rule,
                        tiers: rule.tiers.map((t, j) =>
                          j === i
                            ? {
                                ...t,
                                minimum:
                                  e.target.value === ""
                                    ? NaN
                                    : Number(e.target.value),
                              }
                            : t
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  探索幣
                  <input
                    aria-label={`級別 ${i + 1} 探索幣`}
                    className="block border p-2 w-28"
                    type="number"
                    min="0"
                    max="100000"
                    step="1"
                    value={tier.amount}
                    onChange={e =>
                      setRule({
                        ...rule,
                        tiers: rule.tiers.map((t, j) =>
                          j === i
                            ? {
                                ...t,
                                amount:
                                  e.target.value === ""
                                    ? NaN
                                    : Number(e.target.value),
                              }
                            : t
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setRule({
                      ...rule,
                      tiers: rule.tiers.filter((_, j) => j !== i),
                    })
                  }
                >
                  移除級別 {i + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={rule.tiers.length >= 20}
              className="pixel-button pixel-button-paper"
              onClick={() =>
                setRule({
                  ...rule,
                  tiers: [...rule.tiers, { minimum: 0, amount: 0 }],
                })
              }
            >
              加入級別
            </button>
          </>
        )}
        <button
          type="button"
          className="pixel-button pixel-button-gold block"
          onClick={() => void save()}
        >
          {busy ? "儲存中…" : "儲存探索幣設定"}
        </button>
      </fieldset>
      {notice && (
        <p role="status" className="my-3">
          {notice}
        </p>
      )}
    </details>
  );
}
