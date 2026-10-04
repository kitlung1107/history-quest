import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  planCoreCatalogue,
  syncCoreCatalogue,
  CORE_INDEX_PATH,
} from "../client/src/lib/coreCatalogue.ts";
import { coreRestStore } from "./core-catalogue-rest.mjs";
import { coreReleaseContext, localCoreSource } from "./sync-core-catalogue.mjs";
const q = {
  id: "q1",
  type: "choice",
  prompt: "測試",
  points: 10,
  options: ["甲", "乙"],
  answer: 0,
};
const quiz = {
  id: "quiz",
  grade: 1,
  type: "quiz",
  title: "測試小測",
  questions: [q],
};
const game = {
  gameId: "new-game",
  taskId: "game-task",
  version: "v1",
  title: "新遊戲",
  questions: {
    q1: {
      validator: "index-array/1",
      answer: [0],
      maxIndex: [1],
      distinct: false,
    },
  },
};
const task = { id: "game-task", grade: 5, type: "game", title: "測試遊戲" };
function store() {
  const rows = new Map(),
    calls = [];
  return {
    rows,
    calls,
    fail: null,
    async read(path) {
      return rows.get(path);
    },
    async atomic(paths, build) {
      const changes = build(new Map(paths.map(p => [p, rows.get(p)])));
      if (changes.some(c => c.path === this.fail))
        throw Error("Injected batch failure");
      for (const c of changes) rows.set(c.path, structuredClone(c.data));
      calls.push(changes);
    },
  };
}
test("new quiz and connected game get complete metadata atomically; rewards absent", async () => {
  const s = store();
  await syncCoreCatalogue(s, planCoreCatalogue([quiz, task], [game]));
  assert.equal(s.rows.get("taskAccess/quiz").enabled, true);
  assert.equal(s.rows.get("taskAccess/game-task").grade, 5);
  assert.ok([...s.rows.keys()].some(p => p.startsWith("catalogue/quiz--")));
  assert.equal(s.rows.get("gameCatalog/new-game/versions/v1").questionCount, 1);
  assert.ok(
    ![...s.rows.keys()].some(p => /reward|coin|submission|progress/.test(p))
  );
});
test("question updates retain old catalogue and game versions; same version immutable", async () => {
  const s = store();
  await syncCoreCatalogue(s, planCoreCatalogue([quiz, task], [game]));
  const oldKeys = [...s.rows.keys()];
  await syncCoreCatalogue(
    s,
    planCoreCatalogue(
      [{ ...quiz, questions: [{ ...q, answer: 1 }] }, task],
      [{ ...game, version: "v2" }]
    )
  );
  for (const k of oldKeys) assert.ok(s.rows.has(k));
  assert.equal(
    [...s.rows.keys()].filter(
      p => p.startsWith("catalogue/") && p !== CORE_INDEX_PATH
    ).length,
    2
  );
  await assert.rejects(
    syncCoreCatalogue(
      s,
      planCoreCatalogue(
        [quiz, task],
        [{ ...game, questions: { q1: { ...game.questions.q1, answer: [1] } } }]
      )
    ),
    /同版本/
  );
});
test("hidden/deleted task revoked; grade edits update grant; old answers retained", async () => {
  const s = store();
  await syncCoreCatalogue(s, planCoreCatalogue([quiz, task], [game]));
  await syncCoreCatalogue(s, planCoreCatalogue([{ ...quiz, grade: 2 }], []));
  assert.deepEqual(s.rows.get("taskAccess/game-task"), {
    grade: 5,
    enabled: false,
  });
  assert.equal(s.rows.get("taskAccess/quiz").grade, 2);
  assert.ok(s.rows.has("gameCatalog/new-game/versions/v1"));
});
test("failed task commit never enables an orphan; retry resumes and is no-op thereafter", async () => {
  const s = store();
  s.fail = "taskAccess/game-task";
  await assert.rejects(
    syncCoreCatalogue(s, planCoreCatalogue([quiz, task], [game])),
    /已確認完成 1 項/
  );
  assert.ok(s.rows.has("taskAccess/quiz"));
  assert.ok(!s.rows.has("taskAccess/game-task"));
  assert.ok(!s.rows.has("gameCatalog/new-game/versions/v1"));
  s.fail = null;
  await syncCoreCatalogue(s, planCoreCatalogue([quiz, task], [game]));
  s.calls.length = 0;
  await syncCoreCatalogue(s, planCoreCatalogue([quiz, task], [game]));
  assert.ok(s.calls.every(c => c.length === 0));
});
test("game questionnaire retained without activating auto reward; standalone links do not claim game integration", () => {
  const p = planCoreCatalogue([{ ...task, questions: [q] }], []);
  assert.equal(
    p[0].documents.find(d => d.path.startsWith("catalogue/")).data.source,
    "questionnaire"
  );
  assert.equal(p[0].game, undefined);
  assert.ok(!p[0].documents.some(d => d.path.startsWith("gameCatalog/")));
});
test("invalid IDs, grades, question counts and duplicate games fail before writes", () => {
  for (const t of [
    { ...quiz, id: "../x" },
    { ...quiz, grade: 7 },
    {
      ...quiz,
      questions: Array.from({ length: 31 }, (_, i) => ({ ...q, id: "q" + i })),
    },
    { ...quiz, questions: [q, q] },
  ])
    assert.throws(() => planCoreCatalogue([t], []));
  assert.throws(() => planCoreCatalogue([task], [game, game]));
});
test("disabled game manifest is not re-enabled by refresh", async () => {
  const s = store();
  s.rows.set("gameCatalog/new-game/versions/v1", {
    enabled: false,
    taskId: task.id,
    questionCount: 1,
  });
  await assert.rejects(
    syncCoreCatalogue(s, planCoreCatalogue([task], [game])),
    /版本已停用/
  );
  assert.ok(!s.rows.has("taskAccess/game-task"));
});
test("cached teacher repair cannot revoke new tasks or undo newer grade/disable settings", async () => {
  const s = store();
  s.rows.set("taskAccess/quiz", { grade: 2, enabled: false });
  s.rows.set("taskAccess/future-task", { grade: 5, enabled: true });
  await syncCoreCatalogue(s, planCoreCatalogue([quiz], []), {
    repairOnly: true,
  });
  assert.deepEqual(s.rows.get("taskAccess/quiz"), { grade: 2, enabled: false });
  assert.equal(s.rows.get("taskAccess/future-task").enabled, true);
  assert.ok([...s.rows.keys()].some(p => p.startsWith("catalogue/quiz--")));
});
test("REST adapter CAS conflicts retry from fresh metadata; permission denial does not retry", async () => {
  let commits = 0;
  const request = async (method, resource) => {
    if (method === "GET") return null;
    commits++;
    const e = Error("denied");
    e.status = commits === 1 ? 409 : 403;
    throw e;
  };
  const s = coreRestStore({ project: "demo", request });
  await assert.rejects(
    s.atomic(["taskAccess/x"], () => [
      { path: "taskAccess/x", data: { grade: 1, enabled: true } },
    ]),
    /denied/
  );
  assert.equal(commits, 2);
  await assert.rejects(
    s.atomic(["profiles/s1"], () => []),
    /Non-core/
  );
});
test("new release requires distinct explicit approval before credential access", () => {
  assert.throws(() => coreReleaseContext({}), /explicit approval/);
});
test("Pages cannot deploy before successful core sync; dry-run/build checks required", () => {
  const w = fs.readFileSync(
    new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
    "utf8"
  );
  assert.ok(
    w.indexOf("Sync and verify core teaching metadata") <
      w.indexOf("Deploy to GitHub Pages")
  );
  assert.ok(w.includes("CORE_CATALOG_SYNC_ENABLED"));
  assert.ok(w.includes("scripts/sync-core-catalogue.mjs --public-plan"));
  assert.ok(w.includes("coreReleaseContext(process.env)"));
});
test("exact-ID migration revokes known removed tasks and deliberately leaves unknown orphans untouched", async () => {
  const s = store(),
    reads = [];
  s.rows.set("taskAccess/legacy", { grade: 3, enabled: true });
  s.rows.set("taskAccess/unidentified-orphan", { grade: 4, enabled: true });
  const atomic = s.atomic.bind(s);
  s.atomic = async (paths, build) => {
    reads.push(...paths);
    return atomic(paths, build);
  };
  await syncCoreCatalogue(s, planCoreCatalogue([quiz], []), {
    knownTasks: [
      { id: "legacy", grade: 3 },
      { id: "deleted-before-index", grade: 2 },
    ],
  });
  assert.deepEqual(s.rows.get("taskAccess/legacy"), {
    grade: 3,
    enabled: false,
  });
  assert.deepEqual(s.rows.get("taskAccess/deleted-before-index"), {
    grade: 2,
    enabled: false,
  });
  assert.equal(s.rows.get("taskAccess/unidentified-orphan").enabled, true);
  assert.ok(!reads.includes("taskAccess/unidentified-orphan"));
  assert.equal(s.rows.get(CORE_INDEX_PATH).tasks.legacy.enabled, false);
  assert.ok(
    s.rows
      .get(CORE_INDEX_PATH)
      .tasks.quiz.versions[0].startsWith("catalogue/quiz--")
  );
  s.calls.length = 0;
  await syncCoreCatalogue(s, planCoreCatalogue([quiz], []), {
    knownTasks: [
      { id: "legacy", grade: 3 },
      { id: "deleted-before-index", grade: 2 },
    ],
  });
  assert.ok(s.calls.every(c => c.length === 0));
});
test("publication keeps version history and tombstones across removal, recreation and no-op retries", async () => {
  const s = store();
  await syncCoreCatalogue(s, planCoreCatalogue([quiz, task], [game]));
  await syncCoreCatalogue(
    s,
    planCoreCatalogue(
      [{ ...quiz, questions: [{ ...q, answer: 1 }] }, task],
      [{ ...game, version: "v2" }]
    )
  );
  assert.equal(s.rows.get(CORE_INDEX_PATH).tasks.quiz.versions.length, 2);
  assert.equal(s.rows.get(CORE_INDEX_PATH).tasks[task.id].versions.length, 2);
  await syncCoreCatalogue(s, []);
  assert.equal(s.rows.get(CORE_INDEX_PATH).tasks[task.id].enabled, false);
  assert.equal(s.rows.get(CORE_INDEX_PATH).tasks[task.id].versions.length, 2);
  s.rows.delete("taskAccess/quiz");
  await syncCoreCatalogue(s, planCoreCatalogue([quiz], []), {
    repairOnly: true,
  });
  assert.equal(
    s.rows.get("taskAccess/quiz").enabled,
    false,
    "stale repair must restore disabled, not active, grant"
  );
  await assert.rejects(
    syncCoreCatalogue(
      s,
      planCoreCatalogue([{ ...quiz, id: "unpublished" }], []),
      { repairOnly: true }
    ),
    /已發布索引/
  );
  assert.ok(!s.rows.has("taskAccess/unpublished"));
  await syncCoreCatalogue(s, planCoreCatalogue([quiz], []));
  assert.equal(
    s.rows.get("taskAccess/quiz").enabled,
    true,
    "explicit CMS reinstatement is supported"
  );
});
test("cached repair uses published grade for a missing grant, and does not modify release index", async () => {
  const s = store();
  await syncCoreCatalogue(s, planCoreCatalogue([{ ...quiz, grade: 2 }], []));
  const before = structuredClone(s.rows.get(CORE_INDEX_PATH));
  s.rows.delete("taskAccess/quiz");
  await syncCoreCatalogue(s, planCoreCatalogue([quiz], []), {
    repairOnly: true,
  });
  assert.deepEqual(s.rows.get("taskAccess/quiz"), { grade: 2, enabled: true });
  assert.deepEqual(s.rows.get(CORE_INDEX_PATH), before);
});
test("grant and release index fail together; corrupt index stops before any write", async () => {
  const s = store();
  s.fail = CORE_INDEX_PATH;
  await assert.rejects(
    syncCoreCatalogue(s, planCoreCatalogue([quiz], [])),
    /核心同步失敗/
  );
  assert.equal(s.rows.size, 0);
  s.fail = null;
  s.rows.set(CORE_INDEX_PATH, { schemaVersion: 2, tasks: {} });
  await assert.rejects(
    syncCoreCatalogue(s, planCoreCatalogue([quiz], [])),
    /索引無效/
  );
  assert.equal(s.rows.size, 1);
});
test("REST core adapter rejects collection listing and needs only exact document get/create/update", async () => {
  const rows = new Map(),
    requests = [];
  const { fields } = await import("./core-catalogue-rest.mjs");
  const request = async (method, resource, body) => {
    requests.push({ method, resource });
    const base = "projects/demo/databases/(default)/documents";
    if (method === "GET") {
      assert.ok(!resource.includes("?") && resource.startsWith(base + "/"));
      const p = resource.slice(base.length + 1);
      assert.ok(
        p.split("/").length % 2 === 0,
        "collection enumeration is forbidden"
      );
      return rows.get(p) || null;
    }
    assert.equal(method, "POST");
    assert.equal(resource, base + ":commit");
    for (const w of body.writes) {
      assert.ok(!w.delete);
      const p = w.update.name.slice(base.length + 1);
      rows.set(p, { ...w.update, updateTime: "1" });
    }
    return {};
  };
  rows.set("taskAccess/legacy", {
    fields: fields({ grade: 3, enabled: true }),
    updateTime: "0",
  });
  const s = coreRestStore({ project: "demo", request });
  await syncCoreCatalogue(s, planCoreCatalogue([quiz, task], [game]), {
    knownTasks: [{ id: "legacy", grade: 3 }],
  });
  const count = requests.filter(r => r.method === "POST").length;
  await syncCoreCatalogue(s, planCoreCatalogue([quiz, task], [game]));
  assert.equal(requests.filter(r => r.method === "POST").length, count);
  await assert.rejects(s.read("taskAccess"), /Non-core/);
});
test("migration seed and current CMS supply explicit IDs without fixing future task or question counts", async () => {
  // This source-shape test must also run in a clean checkout. The private
  // resolver supplies synthetic values; real answer keys stay outside Git.
  const resolved = [];
  const source = await localCoreSource(undefined, {
    resolvePrivate: async task => {
      resolved.push(task.task_id);
      return {
        privateKey: {
          taskId: task.task_id,
          version: task.assessmentVersion,
          questions: task.questions.map(question => ({
            id: question.id,
            answer: question.type === "choice" ? 0 : null,
          })),
        },
        metadata: {
          taskId: task.task_id,
          version: task.assessmentVersion,
          questions: structuredClone(task.questions),
        },
      };
    },
  });
  const publicSource = await localCoreSource(undefined, { publicOnly: true });
  assert.deepEqual(
    resolved.sort(),
    publicSource.publicTasks.filter(task => task.privateVersion).map(task => task.id).sort()
  );
  assert.ok(
    source.knownTasks.some(t => t.id === "S1_AncientCivilisations_EgyptQuiz")
  );
  for (const p of source.plan)
    assert.ok(source.knownTasks.some(t => t.id === p.id));
  assert.equal(
    new Set(source.knownTasks.map(t => t.id)).size,
    source.knownTasks.length
  );
});
test("a new CMS deletion after a partial failed release revokes its successful task using the persisted index", async () => {
  const s = store();
  s.fail = "taskAccess/game-task";
  await assert.rejects(
    syncCoreCatalogue(s, planCoreCatalogue([quiz, task], [game])),
    /已確認完成 1 項/
  );
  assert.equal(s.rows.get(CORE_INDEX_PATH).tasks.quiz.enabled, true);
  assert.equal(s.rows.get(CORE_INDEX_PATH).tasks[task.id], undefined);
  s.fail = null;
  await syncCoreCatalogue(s, []);
  assert.equal(s.rows.get("taskAccess/quiz").enabled, false);
  await syncCoreCatalogue(s, planCoreCatalogue([quiz], []), {
    repairOnly: true,
  });
  await assert.rejects(
    syncCoreCatalogue(s, planCoreCatalogue([task], [game]), {
      repairOnly: true,
    }),
    /已發布索引/
  );
  assert.equal(s.rows.get("taskAccess/quiz").enabled, false);
  assert.equal(s.rows.get("taskAccess/game-task"), undefined);
});
