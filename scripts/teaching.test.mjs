import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash, randomUUID } from "node:crypto";
import {
  markAnswers,
  percentage,
  assessmentVersion,
  missingStudents,
  filterSubmissions,
} from "../client/src/lib/assessment.ts";
import { parseRoster, csvText } from "../client/src/lib/csv.ts";

const questions = [
  {
    id: "q1",
    type: "choice",
    prompt: "選出 A",
    options: ["A", "B"],
    answer: 0,
    points: 10,
    explanation: "答案是 A",
  },
  {
    id: "q2",
    type: "short",
    prompt: "說明原因",
    points: 20,
    explanation: "以史料支持論點",
  },
];
const answers = [
  { question_id: "q1", value: 0 },
  { question_id: "q2", value: "我的分析" },
];
function harness() {
  const props = new Map([
    ["HQ_PIN_SHA256", createHash("sha256").update("123456").digest("hex")],
    ["HQ_SPREADSHEET_ID", "test"],
  ]);
  const sheets = new Map(),
    cache = new Map();
  const makeSheet = name => ({
    name,
    cells: [],
    getName() {
      return name;
    },
    appendRow(row) {
      this.cells.push(row);
    },
    setFrozenRows() {},
    getLastRow() {
      return this.cells.length;
    },
    getDataRange() {
      return { getValues: () => this.cells.map(row => [...row]) };
    },
    getRange(r, c, nr, nc) {
      return {
        getValues: () =>
          this.cells
            .slice(r - 1, r - 1 + nr)
            .map(row => row.slice(c - 1, c - 1 + nc)),
        setValues: values =>
          values.forEach((row, i) => {
            this.cells[r - 1 + i] ||= [];
            row.forEach((v, j) => (this.cells[r - 1 + i][c - 1 + j] = v));
          }),
      };
    },
  });
  const book = {
    getSheetByName: name => sheets.get(name),
    insertSheet(name) {
      const s = makeSheet(name);
      sheets.set(name, s);
      return s;
    },
    getSheets: () => Array.from(sheets.values()),
  };
  const ctx = vm.createContext({
    console,
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_, value) =>
        Array.from(createHash("sha256").update(value).digest()),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => props.get(key),
        setProperty: (key, value) => props.set(key, value),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: key => cache.get(key),
        put: (key, value) => cache.set(key, value),
      }),
    },
    SpreadsheetApp: { openById: () => book },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        hasLock: () => true,
        releaseLock() {},
      }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }),
    },
  });
  vm.runInContext(
    fs.readFileSync(
      new URL("../apps-script/TeachingService.gs", import.meta.url),
      "utf8"
    ),
    ctx
  );
  const post = body =>
    ctx.doPost({
      postData: { contents: JSON.stringify({ api_version: 2, ...body }) },
    });
  const teacher = body => post({ pin: "123456", ...body });
  const task = {
    task_id: "test-task",
    title: "測驗",
    questions,
    version: assessmentVersion(questions),
  };
  assert.equal(teacher({ action: "catalogue", tasks: [task] }).ok, true);
  return { post, teacher, ctx, sheets, book };
}
function submission(extra = {}) {
  return {
    action: "submit",
    attempt_id: "attempt-one",
    task_id: "test-task",
    class_name: "3A",
    student_no: "01",
    student_name: "虛構學生",
    receipt: "a".repeat(72),
    assessment_version: assessmentVersion(questions),
    answers,
    score: 9999,
    ...extra,
  };
}

test("weighted answers stay pending until all short answers are marked", () => {
  const marked = markAnswers(questions, answers);
  assert.equal(percentage(marked), null);
  marked[1].awarded = 10;
  assert.equal(percentage(marked), 67);
  assert.throws(() =>
    markAnswers(questions, [{ question_id: "q1", value: 8 }, answers[1]])
  );
});

test("migrated salted PIN stays valid and legacy clients keep read/write compatibility", () => {
  const { ctx, post, teacher } = harness();
  const properties = ctx.PropertiesService.getScriptProperties();
  properties.setProperty("HQ_PIN_SALT", "legacy-salt:");
  properties.setProperty("HQ_PIN_SHA256", createHash("sha256").update("legacy-salt:123456").digest("hex"));
  assert.equal(teacher({ action: "admin" }).ok, true);
  assert.equal(post({ action: "admin", pin: "000000" }).ok, false);
  const old = { task_id: "test-task", attempt_id: "old-client-attempt", class_name: "3A", student_name: "示範學生", student_no: "01", score: 75, progress: 50 };
  const submit = () => ctx.doPost({ postData: { contents: JSON.stringify(old) } });
  assert.equal(submit().ok, true);
  assert.equal(submit().duplicate, true);
  const result = ctx.doGet({ parameter: { action: "admin", pin: "123456" } });
  assert.equal(result.ok, true);
  assert.equal(result.tasks[0].rows[0].progress, 50);
  assert.equal(result.tasks[0].rows[0].status, "legacy");
  assert.equal(ctx.doGet({ parameter: { action: "admin", pin: "000000" } }).ok, false);
  assert.equal(ctx.doGet({ parameter: { action: "capabilities" } }).api_version, 2);
});

test("long short-answer submissions survive Sheets cell limits and grading", () => {
  const { post, teacher, sheets } = harness();
  const longQuestions = Array.from({ length: 30 }, (_, i) => ({
    id: `q${i}`,
    type: "short",
    prompt: "題目",
    points: 10,
    explanation: "解說",
  }));
  assert.equal(
    teacher({
      action: "catalogue",
      tasks: [
        {
          task_id: "long",
          title: "長答案測驗",
          questions: longQuestions,
          version: assessmentVersion(longQuestions),
        },
      ],
    }).ok,
    true
  );
  const result = post(
    submission({
      task_id: "long",
      assessment_version: assessmentVersion(longQuestions),
      answers: longQuestions.map(q => ({
        question_id: q.id,
        value: "答".repeat(4000),
      })),
    })
  );
  assert.equal(result.ok, true);
  assert.ok(
    sheets
      .get("HQ_submissions")
      .cells[1].slice(1)
      .every(cell => cell.length <= 45000)
  );
  const grade = teacher({
    action: "grade",
    attempt_id: "attempt-one",
    revision: 1,
    marks: longQuestions.map(q => ({
      question_id: q.id,
      awarded: 10,
      feedback: "評".repeat(2000),
    })),
  });
  assert.equal(grade.row.score, 100);
  assert.equal(
    teacher({ action: "admin" }).rows[0].answers[29].response.length,
    4000
  );
});

test("CMS duplicates get distinct identities, existing edits preserve identity, invalid questions fail", () => {
  let hook;
  const context = vm.createContext({
    URL,
    location: { href: "http://localhost:3001/cms/index.html" },
    crypto: { randomUUID },
    CMS: {
      registerPreviewTemplate() {},
      registerWidget() {},
      registerEventListener(event) {
        hook = event.handler;
      },
    },
    createClass: x => x,
  });
  vm.runInContext(
    fs.readFileSync(
      new URL("../client/public/cms/editor-model.js", import.meta.url),
      "utf8"
    ),
    context
  );
  vm.runInContext(
    fs.readFileSync(
      new URL("../client/public/cms/teaching-tools.js", import.meta.url),
      "utf8"
    ),
    context
  );
  const immutable = value => ({
    get: key =>
      Array.isArray(value[key]) ? { toJS: () => value[key] } : value[key],
    set: (key, v) => immutable({ ...value, [key]: v }),
    delete: key =>
      immutable(
        Object.fromEntries(Object.entries(value).filter(([k]) => k !== key))
      ),
    toJS: () => value,
  });
  const entry = fresh => ({
    get: key =>
      ({
        collection: "tasks",
        newRecord: fresh,
        data: immutable({
          title: "示範",
          topicId: "topic",
          description: "簡介",
          article: "內文",
          image: "https://example.com/image.png",
          type: "quiz",
          duration: 10,
          difficulty: 2,
          order: 1,
          label: "任務",
          accent: "gold",
          task_id: "original",
          visible: true,
          featured: true,
          questions,
        }),
      })[key],
  });
  const first = context.HQEditor.flatten(hook({ entry: entry(true) }).toJS());
  const second = context.HQEditor.flatten(hook({ entry: entry(true) }).toJS());
  assert.notEqual(first.task_id, second.task_id);
  assert.equal(first.visible, false);
  assert.equal(first.featured, false);
  assert.equal(hook({ entry: entry(false) }).toJS().task_id, "original");
  const bad = {
    get: key =>
      ({
        collection: "tasks",
        data: immutable({ questions: [questions[0], questions[0]] }),
      })[key],
  };
  assert.throws(() => hook({ entry: bad }), /識別碼/);
});
test("GAS calculates scores, authenticates teacher access and validates receipts", () => {
  const { post, teacher } = harness();
  assert.equal(post(submission()).ok, true);
  assert.equal(post({ action: "admin", pin: "654321" }).ok, false);
  assert.equal(
    post({ action: "result", attempt_id: "attempt-one", receipt: "bad" }).ok,
    false
  );
  const row = teacher({ action: "admin" }).rows[0];
  assert.equal(row.score, null);
  assert.equal(row.answers[0].awarded, 10);
  assert.equal(row.receipt_hash, undefined);
  const result = post({
    action: "result",
    attempt_id: "attempt-one",
    receipt: "a".repeat(72),
  });
  assert.equal(result.row.student_name, undefined);
});
test("grading rejects invalid marks and stale updates; retries never replace a grade", () => {
  const { post, teacher } = harness();
  post(submission());
  assert.equal(
    teacher({
      action: "grade",
      attempt_id: "attempt-one",
      revision: 1,
      marks: [{ question_id: "q2", awarded: 21 }],
    }).ok,
    false
  );
  const graded = teacher({
    action: "grade",
    attempt_id: "attempt-one",
    revision: 1,
    marks: [{ question_id: "q2", awarded: 15, feedback: "有理據" }],
    feedback: "繼續努力",
  });
  assert.equal(graded.row.score, 83);
  assert.equal(graded.row.status, "graded");
  assert.equal(
    teacher({
      action: "grade",
      attempt_id: "attempt-one",
      revision: 1,
      marks: [{ question_id: "q2", awarded: 0 }],
    }).ok,
    false
  );
  assert.equal(post(submission()).ok, true);
  const data = teacher({ action: "admin" });
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].score, 83);
});
test("question changes reject old submissions without losing old results", () => {
  const { post, teacher } = harness();
  post(submission());
  const changed = questions.map(q => ({ ...q, points: 5 }));
  teacher({
    action: "catalogue",
    tasks: [
      {
        task_id: "test-task",
        title: "新版",
        questions: changed,
        version: assessmentVersion(changed),
      },
    ],
  });
  assert.equal(post(submission({ attempt_id: "new-attempt" })).ok, false);
  assert.equal(teacher({ action: "admin" }).rows.length, 1);
});
test("roster merges private records and missing list uses class plus number", () => {
  const { teacher, post } = harness();
  const students = [
    { class_name: "3A", student_no: "01", student_name: "甲" },
    { class_name: "3B", student_no: "01", student_name: "乙" },
  ];
  assert.equal(post({ action: "roster", students, revision: 0 }).ok, false);
  assert.equal(
    teacher({ action: "roster", students, revision: 0 }).roster.length,
    2
  );
  assert.equal(
    teacher({
      action: "roster",
      students: [{ ...students[0], student_name: "改名" }],
      revision: 1,
    }).roster.length,
    2
  );
  assert.equal(teacher({ action: "roster", students, revision: 0 }).ok, false);
  post(submission());
  const data = teacher({ action: "admin" });
  assert.deepEqual(
    missingStudents(data.roster, data.rows, "test-task", "").map(
      s => s.class_name
    ),
    ["3B"]
  );
});
test("CSV handles BOM, quotes, leading-zero numbers and spreadsheet formula text", () => {
  const rows = parseRoster('\uFEFF班別,學號,姓名\r\n3A,01,"示例,學生"');
  assert.equal(rows[0].student_no, "01");
  assert.equal(rows[0].student_name, "示例,學生");
  assert.throws(() => parseRoster("班別,學號,姓名\n3A,01,甲\n3a,01,乙"));
  assert.match(csvText([["=1+1", "+SUM(A1)", "普通文字"]]), /'=/);
});
test("date filtering respects Hong Kong date boundaries", () => {
  const rows = [
    {
      task_id: "t",
      class_name: "3A",
      student_name: "甲",
      student_no: "01",
      timestamp: "2026-09-23T16:30:00Z",
      status: "pending",
    },
  ];
  assert.equal(
    filterSubmissions(rows, {
      task: "",
      className: "",
      search: "",
      from: "2026-09-24",
      to: "2026-09-24",
      status: "pending",
    }).length,
    1
  );
});
test("legacy score tabs are read without being overwritten", () => {
  const { teacher, book } = harness();
  const old = book.insertSheet("old-task");
  old.appendRow([
    "attempt_id",
    "task_id",
    "student_no",
    "class_name",
    "score",
    "timestamp",
    "student_name",
    "progress",
  ]);
  old.appendRow([
    "old-id",
    "old-task",
    "1",
    "3A",
    60,
    "2026-09-01",
    "舊學生",
    100,
  ]);
  assert.equal(teacher({ action: "admin" }).rows[0].status, "legacy");
  assert.equal(old.cells.length, 2);
});
