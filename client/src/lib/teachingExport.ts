import { displayClass } from "./classOptions.ts";
import type { SubmissionRow } from "./assessment.ts";

export function submissionExport(rows: SubmissionRow[], detailed = false): unknown[][] {
  const header = detailed
    ? ["時間", "班別", "原班別", "學號", "姓名", "任務", "題目", "學生答案", "得分", "滿分", "評語"]
    : ["時間", "班別", "原班別", "學號", "姓名", "任務", "百分制成績", "狀態", "總評語"];
  const identity = (r: SubmissionRow) => [r.timestamp, displayClass(r.class_name), r.class_name, r.student_no, r.student_name, r.task_title || r.task_id];
  const values = detailed
    ? rows.flatMap(r => (r.answers || []).map(a => [...identity(r), a.prompt, a.response, a.awarded ?? "待批改", a.points, a.feedback]))
    : rows.map(r => [...identity(r), r.score ?? "", r.status === "pending" ? "待批改" : r.status === "legacy" ? "舊紀錄" : "已評分", r.feedback || ""]);
  return [header, ...values];
}
