import {
  assessmentVersion,
  markAnswers,
  type Answer,
  type AnswerRecord,
  type Question,
} from "./assessment.ts";
import { MC_ENCOURAGEMENT_MESSAGES } from "./mcEncouragementMessages.ts";

// Zero-based indexes of sentences asserting an exact percentage, not a future goal.
const EXACT_RATIO_MESSAGES: Record<number, readonly number[]> = {
  20: [0],
  30: [0],
  40: [0, 8],
  50: [0, 1, 6],
  60: [1, 7],
  70: [0, 5],
  80: [0, 5],
  90: [0, 6],
};

export type McEncouragement = NonNullable<
  ReturnType<typeof getMcEncouragement>
>;

export function getMcEncouragement(attemptId: string, answers: AnswerRecord[]) {
  const choices = answers.filter(a => a.type === "choice");
  if (
    !attemptId ||
    !choices.length ||
    choices.some(a => a.awarded === null || a.points <= 0)
  )
    return null;
  const correct = choices.filter(a => a.awarded === a.points).length;
  const total = choices.length;
  const band =
    correct === 0
      ? 0
      : correct === total
        ? 100
        : Math.max(10, Math.floor((correct * 10) / total) * 10);
  const exact = correct * 100 === band * total;
  const candidates = MC_ENCOURAGEMENT_MESSAGES[band].filter(
    (_, i) => exact || !EXACT_RATIO_MESSAGES[band]?.includes(i)
  );
  // Stable across devices, refreshes, grading of short answers, and re-renders.
  let hash = 2166136261;
  for (const char of attemptId)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return {
    correct,
    total,
    band,
    awarded: choices.reduce((sum, a) => sum + a.awarded!, 0),
    points: choices.reduce((sum, a) => sum + a.points, 0),
    message: candidates[(hash >>> 0) % candidates.length],
  };
}

export function getSubmissionMcEncouragement(
  attemptId: string,
  submission: {
    version: string;
    answers: Answer[];
    grade?: { answers?: AnswerRecord[] };
  },
  currentQuestions?: Question[]
) {
  if (submission.grade?.answers)
    return getMcEncouragement(attemptId, submission.grade.answers);
  // Students cannot read the teacher-only catalogue. Never apply a new answer key
  // to an old pending submission; its feedback appears after versioned marking.
  if (
    !currentQuestions ||
    assessmentVersion(currentQuestions) !== submission.version
  )
    return null;
  try {
    return getMcEncouragement(
      attemptId,
      markAnswers(currentQuestions, submission.answers)
    );
  } catch {
    return null;
  }
}
