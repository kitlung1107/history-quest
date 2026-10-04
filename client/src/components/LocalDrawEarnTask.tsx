import { useEffect, useState } from "react";
import { localEarn, localEarnState } from "@/lib/localDrawClient";
import type { PublicAssessment } from "@/lib/rulesAssessment";
/** Same main assessment settlement functions and compatible Rules; no fake
 * balance adjustment. This form exists only inside the loopback demo route. */
export default function LocalDrawEarnTask({
  onEarn,
}: {
  onEarn: () => Promise<unknown>;
}) {
  const [meta, setMeta] = useState<PublicAssessment>(),
    [values, setValues] = useState<number[]>([]),
    [earned, setEarned] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    void localEarnState()
      .then((state) => {
        setMeta(state.metadata);
        setEarned(state.earned);
        if (state.answers) setValues(state.answers.map((a) => Number(a.value)));
      })
      .catch((e) => setError(e.message));
  }, []);
  async function submit() {
    if (!meta || busy) return;
    setBusy(true);
    setError("");
    try {
      await localEarn(
        meta.questions.map((q, i) => ({ question_id: q.id, value: values[i] }))
      );
      const state = await localEarnState();
      setEarned(state.earned);
      await onEarn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "核算失敗，請以原答案重試。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="paper-texture p-4 my-3" aria-label="本機賺幣驗收任務">
      <h2>先完成任務賺 120 探索幣，再抽卡</h2>
      {meta?.questions.map((q, i) => (
        <fieldset key={q.id} className="my-3">
          <legend>{q.prompt}</legend>
          {q.options?.map((option, j) => (
            <label key={j} className="block py-1">
              <input
                type="radio"
                name={q.id}
                value={j}
                checked={values[i] === j}
                disabled={busy || earned > 0}
                onChange={() =>
                  setValues((old) => {
                    const next = [...old];
                    next[i] = j;
                    return next;
                  })
                }
              />{" "}
              {option}
            </label>
          ))}
        </fieldset>
      ))}
      <button
        className="ml-12 sm:ml-0 rounded-lg border-2 px-3 py-2"
        disabled={
          busy ||
          earned > 0 ||
          !meta ||
          meta.questions.some((_, i) => !Number.isInteger(values[i]))
        }
        onClick={() => void submit()}
      >
        {busy ? "正由 Rules 核算…" : "提交答案並核算探索幣"}
      </button>
      {earned > 0 && (
        <p role="status">已核實派 {earned} 幣；同一任務不會再派。</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
