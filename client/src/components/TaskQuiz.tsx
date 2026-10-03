import { readRulesResult,privateQuestions } from "@/lib/rulesAssessmentStore";
import { rulesAssessmentEnabled } from "@/lib/localAssessment";
import McFeedback from "./McFeedback";
import RewardStatus from "./RewardStatus";
import { getMcEncouragement } from "@/lib/mcEncouragement";
import { useEffect, useRef, useState } from "react";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import "./task-quiz.css";
import {
  getQuestions,
  taskAssessmentVersion,
  validatePublicAnswers,
  markAnswers,
  percentage,
  type Answer,
  type AnswerRecord,
  type Question,
} from "@/lib/assessment";
import type { HistoryTask } from "@/lib/historyQuest";
import { useScoreSync } from "@/contexts/ScoreSyncContext";

function QuizText({ children }: { children: string }) {
  return children.includes("![") ? (
    <Streamdown
      rehypePlugins={Object.entries(defaultRehypePlugins).map(
        ([name, plugin]) =>
          name === "harden" && Array.isArray(plugin)
            ? ([
                plugin[0],
                { ...plugin[1], defaultOrigin: location.origin },
              ] as typeof plugin)
            : plugin
      )}
    >
      {children}
    </Streamdown>
  ) : (
    <>{children}</>
  );
}

function QuestionFeedback({
  question: q,
  answer,
}: {
  question: Question;
  answer: AnswerRecord;
}) {
  const state =
    q.type === "choice" && answer.awarded === q.points
      ? "correct"
      : q.type === "choice" && answer.awarded === 0
        ? "wrong"
        : "neutral";
  return (
    <div
      className="quiz-answer-feedback mt-4 space-y-3 text-sm leading-6"
      data-state={state}
    >
      <p className="quiz-answer-score font-bold">
        {state !== "neutral" && (
          <span
            className="quiz-answer-symbol"
            role="img"
            aria-label={state === "correct" ? "答對" : "答錯"}
          >
            {state === "correct" ? "✓" : "✗"}
          </span>
        )}
        {answer.awarded === null
          ? "待老師批改"
          : `本題 ${answer.awarded} / ${q.points} 分`}
      </p>
      {state === "wrong" && (
        <div className="quiz-answer-correct quiz-prompt">
          <strong>正確答案：</strong>
          {Number.isInteger(q.answer) &&
          q.options?.[q.answer!] !== undefined ? (
            <>
              <strong>{String.fromCharCode(65 + q.answer!)}．</strong>
              <QuizText>{q.options[q.answer!]}</QuizText>
            </>
          ) : (
            "題庫未提供正確答案。"
          )}
        </div>
      )}
      {q.explanation && (
        <div className="quiz-answer-explanation quiz-prompt">
          <strong>解說：</strong>
          <QuizText>{q.explanation}</QuizText>
        </div>
      )}
    </div>
  );
}

export default function TaskQuiz({
  task,
  preview = false,
}: {
  task: HistoryTask;
  preview?: boolean;
}) {
  const publicQuestions=getQuestions(task);
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [result, setResult] = useState<AnswerRecord[] | null>(null);
  const [attemptId, setAttemptId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [review, setReview] = useState(false);
  const [visitedReview, setVisitedReview] = useState(false);
  const [feedbackQuestions,setFeedbackQuestions]=useState<Question[]|null>(null);
  const questions=feedbackQuestions??publicQuestions;
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [current, review, result]);
  const { completeTask, syncError, retry, syncing } = useScoreSync();
  const answered = (q: (typeof questions)[number]) =>
    q.type === "choice"
      ? Number.isInteger(values[q.id]) &&
        Number(values[q.id]) >= 0 &&
        Number(values[q.id]) < (q.options?.length || 0)
      : typeof values[q.id] === "string" &&
        Boolean(String(values[q.id]).trim());
  const missing = questions.flatMap((q, i) => (answered(q) ? [] : [i]));
  const count = questions.length - missing.length;
  function updateValue(id: string, value: string | number) {
    setValues(previous => ({ ...previous, [id]: value }));
    setError("");
  }
  function openReview() {
    setReview(true);
    setVisitedReview(true);
    setError("");
  }
  function openQuestion(index: number) {
    setCurrent(index);
    setReview(false);
    setError("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || busy || result || !review || !questions.length)
      return;
    if (missing.length) {
      setError(
        `尚有 ${missing.length} 題未作答：第 ${missing.map(i => i + 1).join("、")} 題。請填妥後再提交。`
      );
      return;
    }
    submitting.current = true;
    setError("");
    setBusy(true);
    try {
      const answers: Answer[] = questions.map(q => ({
        question_id: q.id,
        value: values[q.id],
      }));
      validatePublicAnswers(publicQuestions,answers);
      let marked:AnswerRecord[];
      if (preview) {
        const previewQuestions=rulesAssessmentEnabled(task)?await privateQuestions(task):questions;
        marked=markAnswers(previewQuestions,answers);
        setFeedbackQuestions(previewQuestions);
        setAttemptId(crypto.randomUUID());
      }
      else {
        const submitted = await completeTask(task, answers);
        if (submitted.version !== taskAssessmentVersion(task)) {
          throw new Error(
            "先前作答已傳送，但題目版本已更新。請到「我的提交」查看該次結果，或重新作答目前版本。"
          );
        }
        setAttemptId(submitted.id);
        setValues(
          Object.fromEntries(
            submitted.answers.map(answer => [answer.question_id, answer.value])
          )
        );
        if(rulesAssessmentEnabled(task)){const trusted=await readRulesResult(submitted.id);marked=trusted.row.answers!;setFeedbackQuestions(trusted.questions);}
        else marked = markAnswers(questions, submitted.answers);
      }
      setResult(marked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能儲存，請重試。");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="quiz-panel mt-9" onSubmit={submit} noValidate>
      <p className="comic-kicker">
        {preview
          ? "試答預覽 · 不會提交成績"
          : "讀畢測驗 · 客觀題由系統核算正式成績，短答由老師批改"}
      </p>
      <p className="mt-2 text-sm">
        已填 {count} / {questions.length} 題 · 共{" "}
        {questions.reduce((n, q) => n + q.points, 0)} 分。短答由老師批改。
      </p>
      <h3
        ref={heading}
        tabIndex={-1}
        className="quiz-step-heading mt-5 font-black"
        aria-live="polite"
      >
        {result
          ? "作答結果"
          : review
            ? "答案總覽"
            : questions.length
              ? `第 ${current + 1} 題 / 共 ${questions.length} 題`
              : "目前沒有題目"}
      </h3>
      {!result && questions.length > 0 && (
        <>
          <progress
            className="quiz-progress mt-3"
            value={count}
            max={questions.length}
            aria-label="已作答題數"
          />
          <p className="mt-2 text-sm text-ink/75">
            {review
              ? "檢查所有答案，可直接修改或返回逐題作答。確認後才提交全部答案。"
              : "可用上一題、下一題切換，已選答案會保留。最後先檢查答案總覽。"}
          </p>
        </>
      )}
      {review && !result && missing.length > 0 && (
        <div role="status" className="quiz-missing mt-4">
          <p className="font-black">
            尚有 {missing.length} 題未作答，請填妥後再提交。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map(index => (
              <button
                key={index}
                type="button"
                className="quiz-question-link"
                disabled={busy}
                onClick={() => openQuestion(index)}
              >
                前往第 {index + 1} 題
              </button>
            ))}
          </div>
        </div>
      )}
      {questions.map(
        (q, index) =>
          (review || result || index === current) && (
            <fieldset
              key={q.id}
              disabled={Boolean(result) || busy}
              className="mt-6 border-t-2 border-ink/20 pt-4"
            >
              <legend className="font-black">
                第 {index + 1} 題（{q.points} 分）
                {review && !result && !answered(q) && " · 未作答"}
              </legend>
              <div className="quiz-prompt mt-2 font-bold">
                <QuizText>{q.prompt}</QuizText>
              </div>
              {q.type === "short" ? (
                <textarea
                  aria-label={`第 ${index + 1} 題答案`}
                  className="comic-input mt-3 min-h-28 w-full"
                  maxLength={4000}
                  required
                  value={values[q.id] || ""}
                  onChange={e => updateValue(q.id, e.target.value)}
                />
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {q.options?.map((option, i) => (
                    <label
                      key={i}
                      className={`answer-tile ${values[q.id] === i ? "bg-gold/30" : ""}`}
                    >
                      <input
                        type="radio"
                        required
                        name={`${task.id}-${q.id}`}
                        checked={values[q.id] === i}
                        onChange={() => updateValue(q.id, i)}
                      />
                      <span>{String.fromCharCode(65 + i)}</span>
                      <div className="quiz-prompt min-w-0">
                        <QuizText>{option}</QuizText>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {review && !result && (
                <button
                  type="button"
                  className="quiz-question-link mt-3"
                  disabled={busy}
                  onClick={() => openQuestion(index)}
                >
                  返回第 {index + 1} 題
                </button>
              )}
              {result && (
                <QuestionFeedback question={q} answer={result[index]} />
              )}
            </fieldset>
          )
      )}
      {error && (
        <p role="alert" className="mt-4 text-red">
          {error}
        </p>
      )}
      {!result && questions.length > 0 && !review && (
        <nav className="quiz-navigation mt-6" aria-label="題目切換">
          <button
            type="button"
            disabled={current === 0 || busy}
            className="pixel-button pixel-button-paper"
            onClick={() => openQuestion(current - 1)}
          >
            上一題
          </button>
          {visitedReview && (
            <button
              type="button"
              className="quiz-question-link"
              disabled={busy}
              onClick={openReview}
            >
              返回答案總覽
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            className="pixel-button pixel-button-teal quiz-next"
            onClick={() =>
              current === questions.length - 1
                ? openReview()
                : openQuestion(current + 1)
            }
          >
            {current === questions.length - 1 ? "檢查答案總覽" : "下一題"}
          </button>
        </nav>
      )}
      {!result && review ? (
        <div className="quiz-navigation mt-6">
          <button
            type="button"
            disabled={busy}
            className="pixel-button pixel-button-paper"
            onClick={() => openQuestion(current)}
          >
            返回逐題作答
          </button>
          <button
            type="submit"
            disabled={busy || !questions.length}
            className="pixel-button pixel-button-teal quiz-next"
          >
            {busy ? "儲存中…" : "提交全部答案"}
          </button>
        </div>
      ) : result ? (
        <div className="result-strip mt-6">
          <McFeedback
            feedback={getMcEncouragement(attemptId, result)}
            provisional={preview || !rulesAssessmentEnabled(task)}
          />
          <strong>
            {percentage(result) === null
              ? "非 MC 題目等待老師批改。"
              : `${preview || !rulesAssessmentEnabled(task) ? "暫計成績" : "正式成績"}：${percentage(result)} / 100`}
          </strong>
          <p>
            {preview
              ? "這是預覽，沒有儲存或傳送學生資料。"
              : "答案已保留。正式成績與老師評語可在「我的提交」查看。"}
          </p>
          {!preview && <RewardStatus taskId={task.id} sourceId={attemptId} rulesAssessment={rulesAssessmentEnabled(task)} />}
        </div>
      ) : null}
      {!preview && syncError && (
        <div className="mt-4" role="status">
          <p>{syncError}</p>
          <button
            type="button"
            disabled={syncing}
            className="pixel-button pixel-button-paper mt-2"
            onClick={() => void retry()}
          >
            重新傳送
          </button>
        </div>
      )}
    </form>
  );
}
