import { test } from "node:test";
import assert from "node:assert/strict";
import { publicTopics, publicTasks, filterTasks } from "./contentModel.ts";

const grades = [
  { grade: 1, title: "中一", visible: true },
  { grade: 2, title: "中二", visible: false },
];
const topics = [
  { id: "ancient", title: "古代", grade: 1, order: 2, visible: true },
  { id: "modern", title: "近代", grade: 1, order: 1, visible: true },
  { id: "hidden", title: "未公開", grade: 1, order: 0, visible: false },
  { id: "grade-hidden", title: "中二課題", grade: 2, order: 0, visible: true },
];
const entry = (
  id: string,
  topicId: string,
  order = 1,
  featured = false,
  visible = true
) => ({ task_id: id, title: id, topicId, order, featured, visible });

test("hidden grade and topic suppress their tasks; unknown topics fail closed", () => {
  const visible = publicTopics(topics, grades);
  assert.deepEqual(
    visible.map(t => t.id),
    ["modern", "ancient"]
  );
  const tasks = publicTasks(
    [
      entry("a", "ancient"),
      entry("b", "hidden"),
      entry("c", "grade-hidden"),
      entry("d", "missing"),
      entry("e", "modern", 1, true, false),
    ],
    visible
  );
  assert.deepEqual(
    tasks.map(t => t.id),
    ["a"]
  );
});

test("renaming or moving a topic preserves task and score identity", () => {
  const tasks = publicTasks(
    [entry("existing-score-key", "ancient")],
    [{ ...topics[0], title: "新名稱", grade: 3 }]
  );
  assert.equal(tasks[0].id, "existing-score-key");
  assert.equal(tasks[0].topic, "新名稱");
  assert.equal(tasks[0].grade, 3);
});

test("featured homepage, all tasks, grade and specific topic are distinct", () => {
  const tasks = publicTasks(
    [entry("a", "ancient", 20, true), entry("b", "modern", 10)],
    publicTopics(topics, grades)
  );
  assert.deepEqual(
    tasks.map(t => t.id),
    ["b", "a"]
  );
  assert.deepEqual(
    filterTasks(tasks, null, null, false).map(t => t.id),
    ["a"]
  );
  assert.equal(filterTasks(tasks, null, null, true).length, 2);
  assert.deepEqual(
    filterTasks(tasks, 1, "modern", false).map(t => t.id),
    ["b"]
  );
  assert.equal(filterTasks(tasks, 1, null, false).length, 2);
  assert.equal(filterTasks(tasks, 2, null, false).length, 0);
});
