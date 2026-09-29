import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const ctx = vm.createContext({ URL });
vm.runInContext(
  fs.readFileSync(
    new URL("../client/public/cms/editor-model.js", import.meta.url),
    "utf8"
  ),
  ctx
);
const model = ctx.HQEditor;
const tasks = fs
  .readdirSync(new URL("../client/src/content/tasks/", import.meta.url))
  .filter(f => f.endsWith(".json"))
  .map(f =>
    JSON.parse(
      fs.readFileSync(
        new URL(`../client/src/content/tasks/${f}`, import.meta.url),
        "utf8"
      )
    )
  );
const json = obj => JSON.parse(JSON.stringify(obj));
test("type-specific required fields allow reading and games without a quiz", () => {
  const base = {
    ...tasks[0],
    label: undefined,
    questions: [],
    question: undefined,
  };
  assert.deepEqual(json(model.issues({ ...base, type: "article" })), []);
  assert.match(
    model.issues({ ...base, type: "article", article: "" }).join(),
    /文章正文/
  );
  const game = {
    ...base,
    type: "game",
    article: undefined,
    gameUrl: "https://example.com/game",
  };
  assert.deepEqual(json(model.issues(game)), []);
  assert.match(model.issues({ ...game, gameUrl: "" }).join(), /遊戲連結/);
  assert.match(model.issues({ ...base, type: "quiz" }).join(), /1–30/);
  const choice = {
    id: "q_12345678-1234-1234-1234-123456789012",
    type: "choice",
    prompt: "問題",
    points: 10,
    options: ["甲", "乙"],
    answer: 1,
  };
  assert.deepEqual(
    json(
      model.issues({
        ...base,
        type: "quiz",
        article: undefined,
        questions: [choice],
      })
    ),
    []
  );
  assert.match(
    model
      .issues({
        ...base,
        type: "quiz",
        questions: [{ ...choice, points: undefined }],
      })
      .join(),
    /分數/
  );
});
test("all existing tasks round-trip through grouped editor without changing stored content", () => {
  for (const task of tasks) {
    assert.deepEqual(json(model.flatten(model.group(task))), task);
    assert.deepEqual(json(model.issues(model.group(task))), []);
  }
});
test("invalid cover, quiz answer and external links are reported before saving", () => {
  const bad = {
    ...tasks[0],
    image: "",
    videoUrl: "https://example.com/video",
    gameUrl: "javascript:alert(1)",
    questions: [
      {
        id: "q1",
        type: "choice",
        prompt: "題目",
        explanation: "解說",
        points: 10,
        options: ["A", "B"],
        answer: 2,
      },
    ],
  };
  const messages = model.issues(bad).join("\n");
  for (const pattern of [/封面圖片/, /影片連結/, /HTTPS/, /答案序號/])
    assert.match(messages, pattern);
});
test("restore preserves task identity and rejects a different task or malformed backup", () => {
  const task = tasks[0],
    backup = { ...task, title: "先前標題", _preview: "discard" };
  assert.equal(
    model.restore(model.group(task), backup, "tasks").title,
    "先前標題"
  );
  assert.equal(model.restore(task, backup, "tasks")._preview, undefined);
  assert.throws(
    () => model.restore(task, { ...backup, task_id: "another" }, "tasks"),
    /相同任務/
  );
  assert.throws(
    () =>
      model.restore(
        { ...task, type: "quiz" },
        { ...backup, type: "quiz", questions: [] },
        "tasks_quiz"
      ),
    /測驗/
  );
  assert.throws(
    () => model.restore(task, { ...backup, type: "quiz" }, "tasks_article"),
    /相同任務類型/
  );
  assert.throws(() => model.restore(task, [], "tasks"), /JSON/);
});
test("changing grouped values overrides old flat fields and excludes editor-only fields", () => {
  const grouped = model.group(tasks[0]);
  grouped.cover.image = "https://example.com/new.png";
  grouped.image = "https://example.com/stale.png";
  grouped._tools = { restore: tasks[0] };
  assert.equal(model.flatten(grouped).image, "https://example.com/new.png");
  assert.equal(model.flatten(grouped)._tools, undefined);
  assert.deepEqual(
    json(model.flatten({ ...grouped, assessment: null }).questions),
    []
  );
  assert.deepEqual(
    json(
      model.flatten({ ...grouped, assessment: { questions: null } }).questions
    ),
    []
  );
});

test("saving a restored existing entry replaces content without changing score identity or saving restore metadata", () => {
  let hook;
  const context = vm.createContext({
    URL,
    crypto: { randomUUID },
    location: { href: "http://localhost/cms/index.html" },
    createClass: x => x,
    CMS: {
      registerWidget() {},
      registerPreviewTemplate() {},
      registerEventListener: event => {
        hook = event.handler;
      },
    },
  });
  for (const name of ["editor-model.js", "teaching-tools.js"])
    vm.runInContext(
      fs.readFileSync(
        new URL(`../client/public/cms/${name}`, import.meta.url),
        "utf8"
      ),
      context
    );
  const map = obj => ({
    toJS: () => obj,
    get: key => obj[key],
    set: (key, value) => map({ ...obj, [key]: value }),
    delete: key =>
      map(Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key))),
  });
  const original = tasks[0],
    restored = { ...original, title: "歷史版本" };
  const data = map({
    ...context.HQEditor.group({
      ...original,
      gameUrl: "https://example.com/stale",
    }),
    _tools: { restore: restored },
  });
  const output = context.HQEditor.flatten(
    hook({
      entry: {
        get: key =>
          ({ collection: `tasks_${original.type}`, newRecord: false, data })[
            key
          ],
      },
    }).toJS()
  );
  assert.equal(output.title, "歷史版本");
  assert.equal(output.task_id, original.task_id);
  assert.equal(output.gameUrl, original.gameUrl);
  assert.equal(output._tools, undefined);
  for (const type of ["article", "game", "quiz"]) {
    const draft = {
      ...original,
      type,
      gameUrl: "https://example.com/game",
      questions:
        type === "quiz"
          ? [{ id: "q1", type: "short", prompt: "問題", points: 10 }]
          : [],
    };
    const save = (input, fresh = false) =>
      context.HQEditor.flatten(
        hook({
          entry: {
            get: key =>
              ({
                collection: `tasks_${type}`,
                newRecord: fresh,
                data: map(context.HQEditor.group(input)),
              })[key],
          },
        }).toJS()
      );
    const created = save(draft, true);
    assert.notEqual(created.task_id, original.task_id);
    assert.equal(created.visible, false);
    assert.deepEqual(json(save(created)), json(created));
    assert.deepEqual(
      json(
        save({
          ...created,
          image: "https://example.com/new.png",
          imagePosition: { x: 20, y: 70 },
        }).imagePosition
      ),
      { x: 20, y: 70 }
    );
  }
});
