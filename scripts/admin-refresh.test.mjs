import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function compile(path, modules) {
  const source = fs.readFileSync(new URL(path, import.meta.url), "utf8")
    .replaceAll("import.meta.env.BASE_URL", '"/"');
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const context = { exports: {}, require: id => {
    assert.ok(id in modules, `Unexpected import: ${id}`);
    return modules[id];
  } };
  vm.runInNewContext(js, context);
  return context.exports;
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const row = id => ({ attempt_id: id, revision: 0, class_name: "3A", student_no: id, student_name: "Test", task_title: "History" });
const snapshot = (id, grade) => ({ id, data: () => ({ studentId: id, taskId: "task", version: "v1", grade }) });

function workspace() {
  const state = [], refs = [], effects = [], calls = [];
  let index = 0, refIndex = 0;
  const control = { failSync: false, failIds: new Set(), pages: [[snapshot("a")]], gate: null };
  const modules = {
    react: {
      useState(value) { const i = index++; if (!(i in state)) state[i] = value; return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }]; },
      useRef(value) { const i = refIndex++; return refs[i] ||= { current: value }; },
      useEffect(fn) { if (!effects.length) effects.push(fn); },
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    wouter: { Link: "link" },
    "firebase/firestore": { collection() {}, getDocs: async () => ({ docs: [] }) },
    "@/lib/firebase": { db: {}, googleLogout() {} },
    "@/lib/cloudStore": {
      async syncCatalogue() { calls.push("sync"); if (control.gate) await control.gate; if (control.failSync) throw Error("offline"); calls.push("synced"); },
      async loadSubmissions(_, cursor) { const i = cursor ?? 0; calls.push(`load:${i}`); return { docs: control.pages[i] || [], cursor: i + 1, more: i + 1 < control.pages.length }; },
      asRow: (id, data) => data.grade || row(id),
      async markSubmission(id) { calls.push(`mark:${id}`); if (control.failIds.has(id)) throw Error("missing version"); return { ...row(id), revision: 1 }; },
    },
    "@/components/TeachingWorkspace": { default: "workspace" },
    "@/components/AccountManager": { default: "accounts" },
    "@/contexts/StudentAccount": { useStudentAccount: () => ({ user: { email: "teacher" } }) },
  };
  const Admin = compile("../client/src/pages/Admin.tsx", modules).default;
  function render() { index = refIndex = 0; return Admin(); }
  function nodes(n) { return !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]; }
  function click(label) { const button = nodes(render()).find(n => n.type === "button" && n.props.children === label); assert.ok(button, label); button.props.onClick(); }
  render();
  return { control, calls, state, click, mount: () => effects[0](), data: () => nodes(render()).find(n => n.type === "workspace")?.props.initial };
}

test("opening syncs before marking; repeated effect and rapid clicks do not overlap", async () => {
  const w = workspace(); let release;
  w.control.gate = new Promise(resolve => { release = resolve; });
  w.mount(); w.mount(); w.click("正在整理與核算……");
  await settle();
  assert.equal(w.calls.filter(c => c === "sync").length, 1);
  assert.ok(!w.calls.includes("mark:a"));
  release(); await settle();
  assert.ok(w.calls.indexOf("synced") < w.calls.indexOf("mark:a"));
  assert.equal(w.data().rows[0].revision, 1);
});

test("sync failure leaves submissions readable and refresh retries without premature marking", async () => {
  const w = workspace(); w.control.failSync = true; w.mount(); await settle();
  assert.equal(w.data().rows.length, 1);
  assert.ok(!w.calls.includes("mark:a"));
  assert.ok(w.state.some(s => typeof s === "string" && s.includes("同步失敗")));
  w.control.failSync = false; w.click("重新整理"); await settle();
  assert.ok(w.calls.includes("mark:a"));
});

test("per-submission failure continues, identifies failed attempt, preserves pending short-answer grades", async () => {
  const w = workspace();
  const existing = { ...row("short"), revision: 2, status: "pending", feedback: "keep" };
  w.control.pages = [[snapshot("bad"), snapshot("good"), snapshot("short", existing)]];
  w.control.failIds.add("bad"); w.mount(); await settle();
  assert.ok(w.calls.includes("mark:good"));
  assert.ok(!w.calls.includes("mark:short"));
  assert.equal(w.data().rows[2], existing);
  assert.ok(w.state.some(s => typeof s === "string" && s.includes("提交 bad") && s.includes("重新整理")));
  w.control.failIds.clear(); w.click("重新整理"); await settle();
  assert.equal(w.data().rows[0].revision, 1);
});

test("load more marks only its page; refresh retries every loaded page", async () => {
  const w = workspace(); w.control.pages = [[snapshot("a")], [snapshot("b")], [snapshot("c")]];
  w.mount(); await settle();
  assert.ok(!w.calls.includes("mark:b"));
  w.click("載入更早的 100 份"); await settle();
  assert.equal(w.data().rows.length, 2);
  assert.equal(w.calls.filter(c => c === "mark:a").length, 1);
  w.click("重新整理"); await settle();
  assert.equal(w.calls.filter(c => c === "mark:b").length, 2);
  assert.ok(!w.calls.includes("mark:c"));
  assert.equal(w.data().rows.length, 2);
  assert.ok(w.state.some(s => typeof s === "string" && s.includes("尚有未載入")));
});

function cloud(grade) {
  const reads = [], writes = [];
  const data = { studentId: "s", taskId: "task", version: "old-version", answers: [] , grade };
  const modules = {
    "firebase/firestore": {
      doc: (_, ...parts) => parts.join("/"),
      runTransaction: async (_, fn) => fn({
        get: async ref => { reads.push(ref); const value = ref === "submissions/a" ? data : ref.startsWith("catalogue/") ? { questions: [], title: "Old title" } : {}; return { data: () => value, exists: () => true }; },
        update: (ref, value) => writes.push({ ref, value }),
      }),
    },
    "./firebase": { db: {} }, "./historyQuest": { HISTORY_TASKS: [] },
    "./assessment": { markAnswers: () => [], percentage: () => null },
  };
  return { mark: compile("../client/src/lib/cloudStore.ts", modules).markSubmission, reads, writes };
}

test("transaction returns existing grade without overwriting scores or feedback", async () => {
  const grade = { revision: 3, score: 85, feedback: "teacher feedback" };
  const c = cloud(grade);
  assert.equal(await c.mark("a"), grade);
  assert.equal(c.writes.length, 0);
  assert.equal(c.reads.length, 1);
});

test("transaction uses submitted version and returns pending short-answer grade", async () => {
  const c = cloud();
  const grade = await c.mark("a");
  assert.ok(c.reads.includes("catalogue/task--old-version"));
  assert.equal(grade.status, "pending");
  assert.equal(grade.revision, 1);
  assert.equal(c.writes[0].value.grade, grade);
});
