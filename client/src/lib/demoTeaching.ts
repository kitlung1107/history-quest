import type { TeachingData } from "@/components/TeachingWorkspace";
import { HISTORY_TASKS } from "./historyQuest";
export function demoTeaching(): TeachingData {
  return {
    roster_revision: 0,
    roster: [
      { class_name: "3A", student_no: "01", student_name: "示例學生甲" },
      { class_name: "3A", student_no: "02", student_name: "示例學生乙" },
      { class_name: "3A", student_no: "03", student_name: "示例學生丙" },
    ],
    rows: [
      {
        attempt_id: "demo-1",
        task_id: HISTORY_TASKS[0]?.id || "demo-task",
        task_title: "示範：史料分析",
        timestamp: new Date().toISOString(),
        class_name: "3A",
        student_no: "01",
        student_name: "示例學生甲",
        score: null,
        progress: 100,
        status: "pending",
        revision: 1,
        feedback: "",
        answers: [
          {
            question_id: "q1",
            type: "choice",
            prompt: "這份資料屬於哪類史料？",
            response: "文字史料",
            points: 10,
            awarded: 10,
            explanation: "資料以文字記述事件。",
            feedback: "",
          },
          {
            question_id: "q2",
            type: "short",
            prompt: "說明這份史料的一項限制。",
            response: "作者可能有自己的立場，需要比較其他來源。",
            points: 10,
            awarded: null,
            explanation: "留意作者立場與寫作背景。",
            feedback: "",
          },
        ],
      },
      {
        attempt_id: "demo-2",
        task_id: HISTORY_TASKS[0]?.id || "demo-task",
        task_title: "示範：史料分析",
        timestamp: new Date().toISOString(),
        class_name: "3A",
        student_no: "02",
        student_name: "示例學生乙",
        score: 80,
        progress: 100,
        status: "graded",
        revision: 1,
        feedback: "能指出限制，可補充例子。",
        answers: [
          {
            question_id: "q2",
            type: "short",
            prompt: "說明這份史料的一項限制。",
            response: "只有一方的觀點。",
            points: 10,
            awarded: 8,
            explanation: "",
            feedback: "可進一步說明作者背景。",
          },
        ],
      },
    ],
  };
}
