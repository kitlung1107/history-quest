import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as assessment from "../client/src/lib/assessment.ts";
import * as encouragement from "../client/src/lib/mcEncouragement.ts";
import { MC_ENCOURAGEMENT_MESSAGES as messages } from "../client/src/lib/mcEncouragementMessages.ts";

const choice = (correct, points = 1) => ({ type: "choice", question_id: "q", prompt: "MC", response: "A", awarded: correct ? points : 0, points, feedback: "", explanation: "" });
const short = { ...choice(false), type: "short", prompt: "Short", awarded: null, points: 100, feedback: "" };
const records = (correct, total) => Array.from({ length: total }, (_, i) => choice(i < correct));

test("all 110 original messages have ten entries per band", () => {
  assert.equal(Object.keys(messages).length, 11);
  for (const list of Object.values(messages)) assert.equal(list.length, 10);
  assert.equal(new Set(Object.values(messages).flat()).size, 110);
  assert.equal(messages[0][0], "今次未答中，唔緊要，我哋由一題開始慢慢嚟！");
  assert.equal(messages[100][9], "全對真係值得開心，帶住呢份信心繼續探索啦！");
});

test("bands use unrounded question counts, including low and nearly perfect rates", () => {
  for (const [correct, total, band] of [[0, 3, 0], [1, 1000, 10], [9, 100, 10], [1, 3, 30], [2, 3, 60], [999, 1000, 90], [3, 3, 100]]) {
    assert.equal(encouragement.getMcEncouragement("attempt", records(correct, total)).band, band);
  }
  assert.equal(encouragement.getMcEncouragement("attempt", []), null);
  assert.equal(encouragement.getMcEncouragement("attempt", [short]), null);
});

test("weighted MC points and short-answer marks do not affect the encouragement band", () => {
  const mc = [choice(true, 1), choice(false, 99)];
  const expected = encouragement.getMcEncouragement("attempt", mc);
  assert.equal(expected.band, 50);
  assert.equal(expected.awarded, 1);
  assert.equal(expected.points, 100);
  assert.deepEqual(encouragement.getMcEncouragement("attempt", [...mc, short]), expected);
  assert.deepEqual(encouragement.getMcEncouragement("attempt", [...mc, { ...short, awarded: 100, feedback: "teacher" }]), expected);
});

test("non-exact deciles never select exact-percentage claims; exact deciles can use all ten", () => {
  const exactOnly = { 20: [0], 30: [0], 40: [0, 8], 50: [0, 1, 6], 60: [1, 7], 70: [0, 5], 80: [0, 5], 90: [0, 6] };
  for (let band = 10; band <= 90; band += 10) {
    const exactSeen = new Set();
    for (let id = 0; id < 200; id++) {
      const exact = encouragement.getMcEncouragement(String(id), records(band, 100));
      exactSeen.add(exact.message);
      const nonExact = encouragement.getMcEncouragement(String(id), records(band + 5, 100));
      assert.equal(nonExact.band, band);
      assert.ok(!(exactOnly[band] || []).some(i => messages[band][i] === nonExact.message));
    }
    assert.equal(exactSeen.size, 10);
  }
});

const questions = [
  { id: "q1", type: "choice", prompt: "MC", points: 1, options: ["A", "B"], answer: 0, explanation: "" },
  { id: "q2", type: "short", prompt: "Short", points: 99, explanation: "" },
];
const answers = [{ question_id: "q1", value: 0 }, { question_id: "q2", value: "response" }];

test("same attempt agrees across immediate, ungraded history and graded history; changed key is not applied", () => {
  const marked = assessment.markAnswers(questions, answers);
  const expected = encouragement.getMcEncouragement("same-id", marked);
  const submission = { version: assessment.assessmentVersion(questions), answers };
  assert.deepEqual(encouragement.getSubmissionMcEncouragement("same-id", submission, questions), expected);
  assert.deepEqual(encouragement.getSubmissionMcEncouragement("same-id", { ...submission, grade: { answers: marked } }), expected);
  assert.equal(encouragement.getSubmissionMcEncouragement("same-id", submission, [{ ...questions[0], answer: 1 }, questions[1]]), null);
  assert.equal(encouragement.getSubmissionMcEncouragement("same-id", submission), null);
  assert.deepEqual(encouragement.getMcEncouragement("same-id", structuredClone(marked)), expected);
});

function compile(path, modules, suffix = "") {
  const source = fs.readFileSync(new URL(path, import.meta.url), "utf8") + suffix;
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const context = { exports: {}, require: id => { assert.ok(id in modules, id); return modules[id]; } };
  vm.runInNewContext(js, context);
  return context.exports;
}
const McFeedback = compile("../client/src/components/McFeedback.tsx", { "react/jsx-runtime": jsx }).default;

test("pure MC is read-only for teachers, mixed/non-MC allow manual comments and preserve old MC comments", () => {
  const Review = compile("../client/src/components/TeachingWorkspace.tsx", {
    "react/jsx-runtime": jsx, react: React,
    "@/lib/teachingExport": {}, "@/lib/classOptions": {}, "@/lib/historyQuest": {},
    "@/lib/assessment": assessment, "@/lib/csv": {}, "@/lib/teachingApi": {},
    "./McFeedback": { default: McFeedback }, "@/lib/mcEncouragement": encouragement,
  }, "\nexport { Review };").Review;
  for (const [items, mc, manual] of [[[choice(true)], true, false], [[choice(true), short], true, true], [[short], false, true]]) {
    const row = { attempt_id: "a", answers: items, feedback: "old teacher feedback" };
    const html = renderToStaticMarkup(React.createElement(Review, { row, save() {}, close() {}, busy: false }));
    assert.equal(html.includes("MC 自動回饋"), mc);
    assert.equal(html.includes("儲存批改與評語"), manual);
    assert.equal(html.includes("非 MC 題目總評語"), manual);
    assert.ok(html.includes("old teacher feedback"));
  }
});

test("immediate pure MC, mixed and non-MC results label only MC feedback as provisional", () => {
  for (const items of [[choice(true)], [choice(true), short], [short]]) {
    const values = [{}, items, "a", false, ""];
    const TaskQuiz = compile("../client/src/components/TaskQuiz.tsx", {
      "react/jsx-runtime": jsx, react: { useState: () => [values.shift(), () => {}] },
      "./McFeedback": { default: McFeedback }, "@/lib/mcEncouragement": encouragement,
      "@/lib/assessment": assessment, "@/contexts/ScoreSyncContext": { useScoreSync: () => ({}) },
    }).default;
    const html = renderToStaticMarkup(React.createElement(TaskQuiz, { task: { questions: [] } }));
    assert.equal(html.includes("MC 自動回饋（練習參考）"), items.some(a => a.type === "choice"));
    if (items.some(a => a.type === "short")) assert.ok(html.includes("非 MC 題目等待老師批改"));
  }
});

test("submitting uses the persisted attempt ID and answers for immediate feedback", async () => {
  const state = [{ q1: 1, q2: "new input" }];
  let index = 0;
  const pending = { id: "queued-attempt", version: assessment.assessmentVersion(questions), answers };
  const TaskQuiz = compile("../client/src/components/TaskQuiz.tsx", {
    "react/jsx-runtime": jsx,
    react: { useState(value) { const i = index++; if (!(i in state)) state[i] = value; return [state[i], next => { state[i] = next; }]; } },
    "./McFeedback": { default: McFeedback }, "@/lib/mcEncouragement": encouragement,
    "@/lib/assessment": assessment,
    "@/contexts/ScoreSyncContext": { useScoreSync: () => ({ completeTask: async () => pending }) },
  }).default;
  const render = () => { index = 0; return TaskQuiz({ task: { questions } }); };
  await render().props.onSubmit({ preventDefault() {} });
  assert.equal(state[2], pending.id);
  assert.equal(state[0].q1, 0);
  assert.deepEqual(encouragement.getMcEncouragement(state[2], state[1]), encouragement.getSubmissionMcEncouragement(pending.id, pending, questions));
  const html = renderToStaticMarkup(render());
  assert.ok(html.includes(encouragement.getMcEncouragement(state[2], state[1]).message));
  assert.equal(renderToStaticMarkup(render()), html);
});

test("submission history separates MC feedback from manual comments for all three paper types", () => {
  for (const items of [[choice(true)], [choice(true), short], [short]]) {
    const feedback = encouragement.getMcEncouragement("a", items);
    const values = [[{ attempt_id: "a", answers: items, revision: 1, mcFeedback: feedback, feedback: "preserved teacher comment" }], undefined, false, "", false];
    const MySubmissions = compile("../client/src/pages/MySubmissions.tsx", {
      "react/jsx-runtime": jsx,
      react: { useState: () => [values.shift(), () => {}], useEffect() {} },
      "@/components/McFeedback": { default: McFeedback }, "@/lib/mcEncouragement": encouragement,
      "@/lib/assessment": assessment, "@/lib/historyQuest": { HISTORY_TASKS: [] },
      wouter: { Link: "a" }, "@/lib/cloudStore": {},
      "@/contexts/StudentAccount": { useStudentAccount: () => ({}) },
    }).default;
    const html = renderToStaticMarkup(React.createElement(MySubmissions));
    assert.equal(html.includes("MC 自動回饋"), items.some(a => a.type === "choice"));
    assert.equal(html.includes("非 MC 題目老師總評語"), items.some(a => a.type !== "choice"));
    assert.ok(html.includes("preserved teacher comment"));
  }
});
