import {
  FieldValue,
  type Firestore,
  type Transaction,
  type DocumentData,
} from "firebase-admin/firestore";
import {
  coinAward,
  defaultCoinRule,
  type CoinRule,
} from "../../client/src/lib/coinModel.ts";
import {
  markAnswers,
  percentage,
  type AnswerRecord,
  type Question,
} from "../../client/src/lib/assessment.ts";
import { studentGrade } from "../../client/src/lib/gradeAccess.ts";
import {
  isCorrect,
  validAnswer,
  type Question as GameQuestion,
} from "../../client/src/lib/games/model.ts";

type Kind = "taskReward" | "gameReward";
type Result = {
  status: string;
  amount: number;
  taskId?: string;
  score?: number | null;
};
const safeId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(value);
const timestamp = (value: any): number | null =>
  typeof value?.toMillis === "function" && Number.isFinite(value.toMillis())
    ? value.toMillis()
    : null;

async function authorised(
  tx: Transaction,
  db: Firestore,
  sid: string,
  taskId: string
) {
  const [access, profile, task] = await Promise.all([
    tx.get(
      db
        .collection("access")
        .where("studentId", "==", sid)
        .where("enabled", "==", true)
    ),
    tx.get(db.doc(`profiles/${sid}`)),
    tx.get(db.doc(`taskAccess/${taskId}`)),
  ]);
  const own = studentGrade(profile.data()?.className);
  const grade = task.data()?.grade;
  const allowed =
    Number.isInteger(grade) &&
    grade >= 1 &&
    grade <= 6 &&
    own !== null &&
    (own <= 3 ? grade === own : grade >= 4 && grade <= own);
  return (
    task.data()?.enabled === true &&
    profile.exists &&
    access.docs.some(a => a.data().testing === true || allowed)
  );
}

function validQuestions(questions: unknown): questions is Question[] {
  if (!Array.isArray(questions) || !questions.length || questions.length > 30)
    return false;
  return (
    new Set(questions.map(q => q?.id)).size === questions.length &&
    questions.every(
      q =>
        safeId(q?.id) &&
        ["choice", "short"].includes(q.type) &&
        typeof q.prompt === "string" &&
        Number.isInteger(q.points) &&
        q.points >= 1 &&
        q.points <= 100 &&
        (q.type === "short" ||
          (Array.isArray(q.options) &&
            q.options.length >= 2 &&
            Number.isInteger(q.answer) &&
            q.answer >= 0 &&
            q.answer < q.options.length))
    )
  );
}

// Never consume the student progress document or a submitted score/amount.
function assess(
  source: DocumentData,
  questions: Question[]
): AnswerRecord[] | null {
  if (
    !Array.isArray(source.answers) ||
    source.answers.length !== questions.length ||
    new Set(source.answers.map((a: any) => a?.question_id)).size !==
      questions.length ||
    source.answers.some(
      (a: any) => !questions.some(q => q.id === a?.question_id)
    )
  )
    return null;
  try {
    return markAnswers(questions, source.answers);
  } catch {
    return null;
  }
}

function applyTeacherMarks(
  baseline: AnswerRecord[],
  source: DocumentData
): AnswerRecord[] | null {
  const grade = source.grade;
  if (
    grade?.status !== "graded" ||
    !Array.isArray(grade.answers) ||
    grade.answers.length !== baseline.length
  )
    return null;
  return baseline.map(answer => {
    if (answer.type !== "short") return answer;
    const marks = grade.answers.filter(
      (a: any) => a?.question_id === answer.question_id
    );
    const mark = marks[0];
    if (
      marks.length !== 1 ||
      mark.response !== answer.response ||
      mark.type !== "short" ||
      mark.points !== answer.points ||
      !Number.isFinite(mark.awarded) ||
      mark.awarded < 0 ||
      mark.awarded > answer.points
    )
      return { ...answer, awarded: null };
    return {
      ...answer,
      awarded: mark.awarded,
      feedback: typeof mark.feedback === "string" ? mark.feedback : "",
    };
  });
}

export async function settleReward(
  db: Firestore,
  kind: Kind,
  sourceId: string,
  requester?: { email: string; uid: string }
): Promise<Result> {
  if (!safeId(sourceId)) return { status: "invalid", amount: 0 };
  const sourceRef = db.doc(
    `${kind === "taskReward" ? "submissions" : "gameSessions"}/${sourceId}`
  );
  return db.runTransaction(async tx => {
    // Re-read current documents on every delivery: event ordering is not trusted.
    const [sourceSnapshot, automation] = await Promise.all([
      tx.get(sourceRef),
      tx.get(db.doc("rewardAutomation/status")),
    ]);
    const source = sourceSnapshot.data();
    const activatedAt = timestamp(automation.data()?.activatedAt);
    const createdAt = timestamp(source?.createdAt);
    if (!source || !safeId(source.studentId))
      return { status: "invalid", amount: 0 };
    if (requester) {
      const access = await tx.get(db.doc(`access/${requester.email}`));
      if (
        access.data()?.enabled !== true ||
        access.data()?.studentId !== source.studentId ||
        (kind === "gameReward" && requester.uid !== source.uid)
      )
        return { status: "unauthorised", amount: 0 };
    }
    if (automation.data()?.enabled !== true || activatedAt === null)
      return { status: "inactive", amount: 0 };
    if (createdAt === null || createdAt < activatedAt)
      return { status: "historical", amount: 0 };

    let taskId = source.taskId;
    let version: DocumentData | undefined;
    let proof: DocumentData | undefined;
    let verifier: DocumentData | undefined;
    if (kind === "gameReward") {
      if (!safeId(source.gameId) || !safeId(source.version))
        return { status: "invalid", amount: 0 };
      const [manifest, verified, verifierSnapshot] = await Promise.all([
        tx.get(
          db.doc(`gameCatalog/${source.gameId}/versions/${source.version}`)
        ),
        tx.get(db.doc(`trustedGameCompletions/${sourceId}`)),
        tx.get(
          db.doc(`trustedGameVerifiers/${source.gameId}--${source.version}`)
        ),
      ]);
      version = manifest.data();
      proof = verified.data();
      verifier = verifierSnapshot.data();
      taskId = version?.taskId;
    }
    if (!safeId(taskId)) return { status: "invalid", amount: 0 };
    const sid = source.studentId;
    if (!(await authorised(tx, db, sid, taskId)))
      return { status: "unauthorised", amount: 0 };
    const policy = (await tx.get(db.doc(`rewardPolicies/${taskId}`))).data();
    const expectedSource = kind === "taskReward" ? "assessment" : "game";
    if (policy?.source !== expectedSource)
      return { status: "wrong-source", amount: 0 };

    const resultRef = db.doc(
      `rewardResults/${sid}/attempts/${kind}_${sourceId}`
    );
    const entryRef = db.doc(`coinAccounts/${sid}/entries/${taskId}`);
    const [entry, settings, profile] = await Promise.all([
      tx.get(entryRef),
      tx.get(db.doc(`coinRules/${taskId}`)),
      tx.get(db.doc(`profiles/${sid}`)),
    ]);
    const existingAmount = entry.data()?.amount;
    let score: number | null = null;
    let grade: DocumentData | undefined;
    let needsGrade = false;
    let progressRef: ReturnType<Firestore["doc"]> | undefined;
    let updateProgress = false;
    let status = "not-qualified";

    if (policy.enabled !== true) status = "inactive";
    else if (kind === "taskReward") {
      if (!safeId(source.version)) return { status: "invalid", amount: 0 };
      const catalogue = (
        await tx.get(db.doc(`catalogue/${taskId}--${source.version}`))
      ).data();
      // The explicit catalogue source excludes old game test questionnaires.
      if (
        !catalogue ||
        catalogue.source !== "assessment" ||
        !validQuestions(catalogue.questions)
      ) {
        // A missing version may be published shortly after a new submission.
        if (!catalogue) throw new Error("教師題庫版本尚未就緒；稍後安全重試。");
        return { status: "wrong-source", amount: 0 };
      }
      const baseline = assess(source, catalogue.questions);
      if (!baseline) return { status: "invalid", amount: 0 };
      const hasShort = baseline.some(a => a.type === "short");
      const answers = hasShort
        ? (applyTeacherMarks(baseline, source) ?? baseline)
        : baseline;
      score = percentage(answers);
      status = score === null ? "pending-grading" : "not-qualified";
      grade = {
        attempt_id: sourceId,
        task_id: taskId,
        task_title: catalogue.title || taskId,
        timestamp: source.createdAt.toDate().toISOString(),
        class_name: profile.data()?.className || "",
        student_name: profile.data()?.name || "",
        student_no: profile.data()?.studentNo || "",
        score,
        progress: 100,
        status: score === null ? "pending" : "graded",
        answers,
        feedback:
          typeof source.grade?.feedback === "string"
            ? source.grade.feedback
            : "",
        revision:
          Number.isSafeInteger(source.grade?.revision) &&
          source.grade.revision >= 1
            ? source.grade.revision
            : 1,
      };
      needsGrade =
        !source.grade ||
        source.grade.score !== grade.score ||
        source.grade.status !== grade.status ||
        JSON.stringify(source.grade.answers) !== JSON.stringify(grade.answers);
      progressRef = db.doc(`progress/${sid}/tasks/${taskId}`);
      const progress = await tx.get(progressRef);
      updateProgress =
        progress.data()?.attemptId === sourceId &&
        progress.data()?.score !== (score ?? 0);
    } else {
      // Only a trusted game server may create this proof. Current iframe end
      // events cannot create it, even for teachers; game rewards stay disabled
      // until an authoritative three-document / exit verifier is integrated.
      if (
        source.status !== "completed" ||
        version?.enabled !== true ||
        !proof ||
        proof.studentId !== sid ||
        proof.uid !== source.uid ||
        proof.gameId !== source.gameId ||
        proof.version !== source.version ||
        proof.verifier !== verifier?.verifier ||
        verifier?.enabled !== true ||
        typeof verifier.verifier !== "string" ||
        !verifier.verifier ||
        timestamp(proof.verifiedAt) === null ||
        timestamp(proof.verifiedAt)! < createdAt ||
        proof.outcome !== "completed"
      )
        status = "pending-verification";
      else {
        const attempts = await tx.get(
          sourceRef.collection("answers").orderBy("sequence")
        );
        if (!attempts.size || attempts.size !== source.attempts)
          return { status: "invalid", amount: 0 };
        let correct = 0;
        const questions = new Map<string, GameQuestion>();
        for (const [index, row] of attempts.docs.entries()) {
          const answer = row.data();
          if (answer.sequence !== index + 1 || !safeId(answer.questionId))
            return { status: "invalid", amount: 0 };
          let question = questions.get(answer.questionId);
          if (!question) {
            question = (
              await tx.get(
                db.doc(
                  `gameCatalog/${source.gameId}/versions/${source.version}/questions/${answer.questionId}`
                )
              )
            ).data() as GameQuestion | undefined;
            if (!question) return { status: "invalid", amount: 0 };
            questions.set(answer.questionId, question);
          }
          if (!validAnswer(question, answer.answer))
            return { status: "invalid", amount: 0 };
          correct += Number(isCorrect(question, answer.answer));
        }
        if (correct !== source.correct) return { status: "invalid", amount: 0 };
        score = Math.round((100 * correct) / attempts.size);
      }
    }

    let amount = 0;
    let rule: CoinRule = (settings.data() as CoinRule) ?? defaultCoinRule;
    if (score !== null && policy.enabled === true) {
      if (typeof existingAmount === "number" && existingAmount > 0)
        status = "already-awarded";
      else if (existingAmount !== undefined && existingAmount !== 0)
        status = "invalid-ledger";
      else {
        // Invalid settings abort instead of silently recording a successful zero.
        amount = coinAward(rule, score, 100) ?? 0;
        status = amount > 0 ? "awarded" : "not-qualified";
      }
    }

    // All reads precede all writes. Entry, grade, progress and result commit
    // together. Balance remains the sum of entries; no parallel balance field.
    if (needsGrade) tx.update(sourceRef, { grade });
    if (updateProgress && progressRef)
      tx.update(progressRef, { score: score ?? 0 });
    if (amount > 0)
      tx.set(entryRef, {
        kind,
        taskId,
        attemptId: sourceId,
        amount,
        score,
        progress: 100,
        rule,
        createdAt: FieldValue.serverTimestamp(),
      });
    const result: Result = { status, amount, taskId, score };
    tx.set(resultRef, {
      ...result,
      kind,
      sourceId,
      automatic: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
}
