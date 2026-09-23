export type Question = {
  id: string;
  type: "choice" | "short";
  prompt: string;
  points: number;
  options?: string[];
  answer?: number;
  explanation: string;
};
export type Answer = { question_id: string; value: string | number };
export type AnswerRecord = {
  question_id: string;
  type: "choice" | "short";
  prompt: string;
  response: string;
  points: number;
  awarded: number | null;
  explanation: string;
  feedback: string;
};
export type SubmissionRow = {
  attempt_id: string;
  task_id: string;
  task_title?: string;
  timestamp: string;
  class_name: string;
  student_name: string;
  student_no: string;
  score: number | string | null;
  progress: number | string;
  status?: "pending" | "graded" | "legacy";
  answers?: AnswerRecord[];
  feedback?: string;
  revision?: number;
};
export type RosterStudent = {
  class_name: string;
  student_no: string;
  student_name: string;
};

export function getQuestions(task: {
  questions?: Question[];
  question?: {
    prompt: string;
    options: string[];
    answer: number;
    explanation: string;
  };
}): Question[] {
  if (task.questions?.length) return task.questions;
  return task.question
    ? [{ ...task.question, id: "q1", type: "choice", points: 100 }]
    : [];
}
export function assessmentVersion(questions: Question[]) {
  const canonical = questions.map(q => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt.trim(),
    points: q.points,
    options: q.options?.map(option => option.trim()) || [],
    answer: q.answer ?? null,
    explanation: q.explanation?.trim() || "",
  }));
  let hash = 2166136261;
  for (const c of JSON.stringify(canonical))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
export function markAnswers(
  questions: Question[],
  answers: Answer[]
): AnswerRecord[] {
  return questions.map(q => {
    const value = answers.find(a => a.question_id === q.id)?.value;
    if (
      q.type === "choice" &&
      (!Number.isInteger(value) ||
        Number(value) < 0 ||
        Number(value) >= (q.options?.length || 0))
    )
      throw new Error("請完成所有選擇題。");
    if (
      q.type === "short" &&
      (typeof value !== "string" || !value.trim() || value.length > 4000)
    )
      throw new Error("短答須填寫 1 至 4000 字。");
    return {
      question_id: q.id,
      type: q.type,
      prompt: q.prompt,
      response:
        q.type === "choice" ? q.options![Number(value)] : String(value).trim(),
      points: q.points,
      awarded: q.type === "short" ? null : value === q.answer ? q.points : 0,
      explanation: q.explanation,
      feedback: "",
    };
  });
}
export function percentage(answers: AnswerRecord[]) {
  if (answers.some(a => a.awarded === null)) return null;
  const max = answers.reduce((n, a) => n + a.points, 0);
  return max
    ? Math.round(
        (100 * answers.reduce((n, a) => n + (a.awarded || 0), 0)) / max
      )
    : 0;
}
export function studentKey(student: {
  class_name: string;
  student_no: string;
}) {
  return `${student.class_name.trim().toUpperCase()}:${student.student_no.trim().toUpperCase()}`;
}
export function missingStudents(
  roster: RosterStudent[],
  rows: SubmissionRow[],
  task: string,
  className: string
) {
  const submitted = new Set(
    rows
      .filter(row => row.task_id === task && Number(row.progress) === 100)
      .map(studentKey)
  );
  return roster.filter(
    student =>
      (!className || student.class_name === className) &&
      !submitted.has(studentKey(student))
  );
}
export function filterSubmissions(
  rows: SubmissionRow[],
  filters: {
    task: string;
    className: string;
    search: string;
    from: string;
    to: string;
    status: string;
  }
) {
  return rows.filter(row => {
    const date = new Date(row.timestamp);
    const day = Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleDateString("sv-SE", { timeZone: "Asia/Hong_Kong" });
    return (
      (!filters.task || row.task_id === filters.task) &&
      (!filters.className || row.class_name === filters.className) &&
      (!filters.search ||
        `${row.student_name} ${row.student_no}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())) &&
      (!filters.from || day >= filters.from) &&
      (!filters.to || day <= filters.to) &&
      (!filters.status || (row.status || "legacy") === filters.status)
    );
  });
}
