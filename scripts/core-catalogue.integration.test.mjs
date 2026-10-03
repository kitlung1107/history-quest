import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import * as sdk from "firebase/firestore";
import * as assessment from "../client/src/lib/assessment.ts";
import * as model from "../client/src/lib/games/model.ts";
import {
  planCoreCatalogue,
  syncCoreCatalogue,
  CORE_INDEX_PATH,
} from "../client/src/lib/coreCatalogue.ts";
import { firestoreCoreStore } from "../client/src/lib/coreCatalogueFirestore.ts";
import { coreRestStore } from "./core-catalogue-rest.mjs";
import { localCoreSource } from "./sync-core-catalogue.mjs";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8190")
  throw Error("Only dedicated localhost:8190 emulator allowed");
const rulePath = process.env.CORE_TEST_RULES;
if (!rulePath) throw Error("Explicit downloaded production rules required");
const claims = email => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
});
let env, teacher, s1, s5;
const q = {
  id: "q1",
  type: "choice",
  prompt: "合成小測",
  points: 10,
  options: ["甲", "乙"],
  answer: 0,
};
const quiz = {
  id: "new-quiz",
  grade: 1,
  type: "quiz",
  title: "合成小測",
  questions: [q],
};
const task = { id: "new-game-task", grade: 5, type: "game", title: "合成遊戲" };
const game = {
  gameId: "new-game",
  taskId: task.id,
  version: "v1",
  title: "合成遊戲",
  questions: {
    q1: {
      title: "合成題",
      prompt: "甲",
      type: "mc",
      choices: ["甲", "乙"],
      items: [],
      validator: "index-array/1",
      answer: [0],
      maxIndex: [1],
      distinct: false,
    },
  },
};
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-core-catalogue",
    firestore: {
      host: "127.0.0.1",
      port: 8190,
      rules: fs.readFileSync(rulePath, "utf8"),
    },
  });
  teacher = env
    .authenticatedContext("teacher", claims("kitlung1107@gmail.com"))
    .firestore();
  s1 = env.authenticatedContext("u1", claims("one@example.test")).firestore();
  s5 = env.authenticatedContext("u5", claims("five@example.test")).firestore();
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    for (const [sid, email, className] of [
      ["s1", "one@example.test", "1A"],
      ["s5", "five@example.test", "S5"],
    ]) {
      await sdk.setDoc(sdk.doc(c.firestore(), "access", email), {
        studentId: sid,
        enabled: true,
      });
      await sdk.setDoc(sdk.doc(c.firestore(), "profiles", sid), { className });
    }
  });
});
const sync = (
  tasks = [quiz, task],
  games = [game],
  store = firestoreCoreStore(teacher)
) => syncCoreCatalogue(store, planCoreCatalogue(tasks, games));
function compile(file, modules) {
  const source = fs.readFileSync(
    new URL("../" + file, import.meta.url),
    "utf8"
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function("exports", "require", js)(exports, id => {
    assert.ok(id in modules, id);
    return modules[id];
  });
  return exports;
}
function cloud(db) {
  return compile("client/src/lib/cloudStore.ts", {
    "firebase/firestore": sdk,
    "./firebase": { db },
    "./historyQuest": { HISTORY_TASKS: [] },
    "./assessment": assessment,
    "./coreCatalogueStore": { syncBrowserCore: async () => {} },
  });
}
function events(db, uid) {
  return compile("client/src/lib/games/store.ts", {
    "firebase/firestore": sdk,
    "../firebase": { db, auth: { currentUser: { uid } } },
    "./model": model,
    "./records": {},
  }).submitGameEvent;
}
const submit = (db = s1, id = "a1", t = quiz, sid = "s1") =>
  cloud(db).submitCloud(
    sid,
    id,
    t.id,
    assessment.assessmentVersion(assessment.getQuestions(t)),
    [
      {
        question_id: "q1",
        value: t.questions[0].type === "short" ? "合成答案" : 0,
      },
    ]
  );
async function raw(path) {
  let value;
  await env.withSecurityRulesDisabled(async c => {
    value = (await sdk.getDoc(sdk.doc(c.firestore(), path))).data();
  });
  return value;
}
test("new quiz fails before core sync; succeeds and retries after sync without reward policy", async () => {
  await assertFails(submit());
  await sync([quiz], []);
  await assertSucceeds(submit());
  await assertSucceeds(submit());
  assert.equal((await raw("progress/s1/tasks/new-quiz")).score, 0);
  assert.equal(await raw("rewardPolicies/new-quiz"), undefined);
  assert.equal(await raw("coinAccounts/s1/entries/new-quiz"), undefined);
});
test("new connected game has atomic trusted questions and saves start/answer/completion with deduplication", async () => {
  await sync();
  const send = events(s5, "u5");
  const item = {
    uid: "u5",
    studentId: "s5",
    gameId: game.gameId,
    version: "v1",
  };
  for (const event of [
    { type: "start", eventId: "start", sessionId: "session1", sequence: 0 },
    {
      type: "answer",
      eventId: "answer1",
      sessionId: "session1",
      sequence: 1,
      questionId: "q1",
      answer: [0],
    },
    {
      type: "end",
      eventId: "end",
      sessionId: "session1",
      sequence: 2,
      attempts: 1,
      outcome: "completed",
    },
  ]) {
    await assertSucceeds(send({ ...item, event }));
    await assertSucceeds(send({ ...item, event }));
  }
  assert.equal((await raw("gameSessions/session1")).status, "completed");
  assert.equal((await raw("gameSessions/session1")).correct, 1);
  assert.equal(await raw("coinAccounts/s5/entries/new-game-task"), undefined);
});
test("short-answer grading remains pending; no automatic coins introduced", async () => {
  const short = {
    ...quiz,
    questions: [{ id: "q1", type: "short", prompt: "合成短答", points: 10 }],
  };
  await sync([short], []);
  await submit(s1, "short", short);
  const grade = await cloud(teacher).markSubmission("short");
  assert.equal(grade.status, "pending");
  assert.equal(grade.score, null);
  assert.equal(await raw("coinAccounts/s1/entries/new-quiz"), undefined);
});
test("question and game version updates preserve prior records and original grading catalogue", async () => {
  await sync();
  await submit();
  const oldVersion = assessment.assessmentVersion(quiz.questions);
  const changed = { ...quiz, questions: [{ ...q, answer: 1 }] };
  await sync([changed, task], [{ ...game, version: "v2" }]);
  assert.ok(await raw("catalogue/new-quiz--" + oldVersion));
  assert.ok(await raw("gameCatalog/new-game/versions/v1"));
  assert.ok(await raw("gameCatalog/new-game/versions/v2"));
  assert.equal((await cloud(teacher).markSubmission("a1")).score, 100);
});
test("removed/hidden task revoked, old catalogue retained, reinstatement explicit in current CMS plan", async () => {
  await sync();
  const v = assessment.assessmentVersion(quiz.questions);
  await sync([], []);
  await assertFails(submit());
  assert.equal((await raw("taskAccess/new-quiz")).enabled, false);
  assert.ok(await raw("catalogue/new-quiz--" + v));
  await sync([quiz], []);
  await assertSucceeds(submit());
});
test("year change, disabled identity, unverified/anonymous and other student all denied", async () => {
  await sync([{ ...quiz, grade: 2 }], []);
  await assertFails(submit());
  await sync([quiz], []);
  await assertFails(submit(s1, "other", quiz, "s5"));
  await assertFails(submit(env.unauthenticatedContext().firestore(), "anon"));
  await assertFails(
    submit(
      env
        .authenticatedContext("fake", {
          ...claims("one@example.test"),
          email_verified: false,
        })
        .firestore(),
      "fake"
    )
  );
  await env.withSecurityRulesDisabled(async c =>
    sdk.updateDoc(sdk.doc(c.firestore(), "access", "one@example.test"), {
      enabled: false,
    })
  );
  await assertFails(submit());
});
test("students cannot synchronize grants/catalogues or read other submitted answers", async () => {
  await sync([quiz], []);
  await assertFails(sync([quiz], [], firestoreCoreStore(s1)));
  await submit();
  await assertFails(sdk.getDoc(sdk.doc(s5, "submissions", "a1")));
  await assertFails(
    sdk.setDoc(sdk.doc(s1, "taskAccess", quiz.id), { grade: 1, enabled: true })
  );
});
test("task batch failure cannot activate a game without its questions; completed tasks survive retry", async () => {
  const actual = firestoreCoreStore(teacher);
  let fail = true;
  const injected = {
    ...actual,
    atomic: async (paths, build) => {
      if (fail && paths.includes("taskAccess/new-game-task"))
        throw Error("Injected offline");
      return actual.atomic(paths, build);
    },
  };
  await assert.rejects(sync([quiz, task], [game], injected), /核心同步失敗/);
  assert.ok(await raw("taskAccess/new-quiz"));
  assert.equal(await raw("taskAccess/new-game-task"), undefined);
  assert.equal(await raw("gameCatalog/new-game/versions/v1"), undefined);
  fail = false;
  await sync([quiz, task], [game], injected);
  await sync([quiz, task], [game], injected);
  assert.ok(await raw("gameCatalog/new-game/versions/v1/questions/q1"));
});
test("actual 400-question Cold War catalogue fits live rules atomic transaction", async () => {
  const cold = JSON.parse(
    fs.readFileSync(
      new URL("../client/src/lib/games/cold-war-maze.json", import.meta.url),
      "utf8"
    )
  );
  await sync([{ ...task, id: cold.taskId }], [cold]);
  assert.equal(
    (await raw(`gameCatalog/${cold.gameId}/versions/${cold.version}`))
      .questionCount,
    400
  );
  assert.ok(
    await raw(
      `gameCatalog/${cold.gameId}/versions/${cold.version}/questions/400`
    )
  );
  const [questionId, question] = Object.entries(cold.questions)[0];
  const send = events(s5, "u5");
  const item = {
    uid: "u5",
    studentId: "s5",
    gameId: cold.gameId,
    version: cold.version,
  };
  for (const event of [
    {
      type: "start",
      eventId: "cold-start",
      sessionId: "cold-session",
      sequence: 0,
    },
    {
      type: "answer",
      eventId: "cold-answer",
      sessionId: "cold-session",
      sequence: 1,
      questionId,
      answer: question.answer,
    },
    {
      type: "end",
      eventId: "cold-end",
      sessionId: "cold-session",
      sequence: 2,
      attempts: 1,
      outcome: "completed",
    },
  ]) {
    await assertSucceeds(send({ ...item, event }));
    await assertSucceeds(send({ ...item, event }));
  }
  assert.equal((await raw("gameSessions/cold-session")).status, "completed");
  assert.equal((await raw("gameSessions/cold-session")).correct, 1);
});
test("guarded release REST adapter publishes new metadata and verified no-op retry on demo emulator", async () => {
  const request = async (method, resource, body) => {
    if (method === "GET") {
      assert.ok(!resource.includes("?"), "no collection queries permitted");
      assert.ok(
        resource.split("/documents/")[1]?.split("/").length % 2 === 0,
        "exact document get only"
      );
    }
    const r = await fetch("http://127.0.0.1:8190/v1/" + resource, {
      method,
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (r.status === 404 && method === "GET") return null;
    if (!r.ok) {
      const e = Error("Emulator " + r.status);
      e.status = r.status;
      throw e;
    }
    return r.json();
  };
  const rest = coreRestStore({ project: "demo-core-catalogue", request });
  await sync([quiz, task], [game], rest);
  await sync([quiz, task], [game], rest);
  await assertSucceeds(submit());
});
function cmsFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-cms-no-list-"));
  const write = (p, value) => {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), JSON.stringify(value));
  };
  const qPath = "client/src/content/tasks/quiz.json",
    gPath = "client/src/content/tasks/game.json";
  const rawQuiz = {
    ...quiz,
    task_id: quiz.id,
    visible: true,
    featured: false,
    order: 0,
    topicId: "g1",
  };
  const rawGame = {
    ...task,
    task_id: task.id,
    visible: true,
    featured: false,
    order: 1,
    topicId: "g5",
    gameUrl: "https://example.test/connected-game",
  };
  delete rawQuiz.id;
  delete rawGame.id;
  write("client/src/content/settings/grades.json", {
    grades: [
      { grade: 1, visible: true },
      { grade: 5, visible: true },
    ],
  });
  write("client/src/content/topics/g1.json", {
    id: "g1",
    grade: 1,
    title: "合成中一",
    visible: true,
    order: 0,
  });
  write("client/src/content/topics/g5.json", {
    id: "g5",
    grade: 5,
    title: "合成中五",
    visible: true,
    order: 1,
  });
  write(qPath, rawQuiz);
  write(gPath, rawGame);
  write("client/src/lib/games/game.json", game);
  write("scripts/core-catalogue-legacy-ids.json", {
    schemaVersion: 1,
    sourceCommit: "1".repeat(40),
    tasks: [],
  });
  return {
    root,
    write,
    rawQuiz,
    rawGame,
    qPath,
    gPath,
    remove: p => fs.unlinkSync(path.join(root, p)),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
const publishCms = async fixture => {
  const source = await localCoreSource(fixture.root);
  await syncCoreCatalogue(firestoreCoreStore(teacher), source.plan, {
    knownTasks: source.knownTasks,
  });
  return source;
};
const gameItem = {
  uid: "u5",
  studentId: "s5",
  gameId: game.gameId,
  version: "v1",
};
test("CMS public navigation -> exact-ID metadata -> real quiz and connected-game records; hiding blocks open-page writes", async () => {
  const f = cmsFixture();
  try {
    assert.deepEqual(
      (await publishCms(f)).plan.map(t => t.id),
      [quiz.id, task.id]
    );
    await assertSucceeds(submit(s1, "before-hide"));
    const send = events(s5, "u5");
    for (const event of [
      {
        type: "start",
        eventId: "cms-complete-start",
        sessionId: "cms-completed",
        sequence: 0,
      },
      {
        type: "answer",
        eventId: "cms-complete-answer",
        sessionId: "cms-completed",
        sequence: 1,
        questionId: "q1",
        answer: [0],
      },
      {
        type: "end",
        eventId: "cms-complete-end",
        sessionId: "cms-completed",
        sequence: 2,
        attempts: 1,
        outcome: "completed",
      },
    ]) {
      await assertSucceeds(send({ ...gameItem, event }));
      await assertSucceeds(send({ ...gameItem, event }));
    }
    assert.equal((await raw("gameSessions/cms-completed")).status, "completed");
    const start = {
      ...gameItem,
      event: {
        type: "start",
        eventId: "cms-start",
        sessionId: "cms-open",
        sequence: 0,
      },
    };
    await assertSucceeds(send(start));
    f.write(f.qPath, { ...f.rawQuiz, visible: false });
    f.write(f.gPath, { ...f.rawGame, visible: false });
    assert.equal(
      (await publishCms(f)).plan.length,
      0,
      "same publicTasks filter used by website removes hidden tasks"
    );
    await assertFails(submit(s1, "after-hide"));
    await assertFails(
      send({
        ...gameItem,
        event: { ...start.event, sessionId: "cms-new-after-hide" },
      })
    );
    await assertFails(
      send({
        ...gameItem,
        event: {
          type: "answer",
          eventId: "late-answer",
          sessionId: "cms-open",
          sequence: 1,
          questionId: "q1",
          answer: [0],
        },
      })
    );
    await assertFails(
      send({
        ...gameItem,
        event: {
          type: "end",
          eventId: "late-end",
          sessionId: "cms-open",
          sequence: 1,
          attempts: 0,
          outcome: "completed",
        },
      })
    );
    await assertSucceeds(submit(s1, "before-hide"));
    await assertSucceeds(send(start));
    assert.equal(await raw("submissions/after-hide"), undefined);
    assert.equal(await raw("gameSessions/cms-new-after-hide"), undefined);
    assert.equal((await raw("gameSessions/cms-open")).status, "open");
    assert.equal(
      await raw("gameSessions/cms-open/answers/late-answer"),
      undefined
    );
    await syncCoreCatalogue(
      firestoreCoreStore(teacher),
      planCoreCatalogue([quiz, task], [game]),
      { repairOnly: true }
    );
    await assertFails(submit(s1, "stale-after-hide"));
    assert.equal((await raw(CORE_INDEX_PATH)).tasks[quiz.id].enabled, false);
  } finally {
    f.cleanup();
  }
});
test("CMS deletion after partial publication stays tracked; grade/topic hiding, reinstatement and version updates retain history", async () => {
  const f = cmsFixture();
  try {
    await publishCms(f);
    const version1 = assessment.assessmentVersion(quiz.questions);
    f.write(f.qPath, { ...f.rawQuiz, questions: [{ ...q, answer: 1 }] });
    f.write("client/src/lib/games/game.json", { ...game, version: "v2" });
    await publishCms(f);
    assert.equal(
      (await raw(CORE_INDEX_PATH)).tasks[quiz.id].versions.length,
      2
    );
    assert.ok(await raw("catalogue/" + quiz.id + "--" + version1));
    f.remove(f.qPath);
    f.remove(f.gPath);
    const deleted = await publishCms(f);
    assert.equal(deleted.plan.length, 0);
    assert.equal(deleted.knownTasks.length, 0);
    await publishCms(f);
    await assertFails(submit(s1, "after-delete"));
    await assertFails(
      events(
        s5,
        "u5"
      )({
        ...gameItem,
        event: {
          type: "start",
          eventId: "deleted",
          sessionId: "deleted",
          sequence: 0,
        },
      })
    );
    await syncCoreCatalogue(
      firestoreCoreStore(teacher),
      planCoreCatalogue([quiz], []),
      { repairOnly: true }
    );
    assert.equal((await raw("taskAccess/" + quiz.id)).enabled, false);
    f.write(f.qPath, f.rawQuiz);
    await publishCms(f);
    await assertSucceeds(submit(s1, "reinstated"));
    f.write("client/src/content/topics/g1.json", {
      id: "g1",
      grade: 1,
      title: "合成中一",
      visible: false,
      order: 0,
    });
    assert.equal((await publishCms(f)).plan.length, 0);
    await assertFails(submit(s1, "topic-hidden"));
    f.write("client/src/content/topics/g1.json", {
      id: "g1",
      grade: 1,
      title: "合成中一",
      visible: true,
      order: 0,
    });
    f.write("client/src/content/settings/grades.json", {
      grades: [
        { grade: 1, visible: false },
        { grade: 5, visible: true },
      ],
    });
    assert.equal((await publishCms(f)).plan.length, 0);
    await assertFails(submit(s1, "grade-hidden"));
  } finally {
    f.cleanup();
  }
});
test("legacy migration uses known IDs only; deleted tombstones defeat stale teacher refresh, unknown orphans explicitly remain", async () => {
  await env.withSecurityRulesDisabled(async c => {
    await sdk.setDoc(sdk.doc(c.firestore(), "taskAccess", "known-legacy"), {
      grade: 1,
      enabled: true,
    });
    await sdk.setDoc(sdk.doc(c.firestore(), "taskAccess", "unknown-orphan"), {
      grade: 1,
      enabled: true,
    });
  });
  await syncCoreCatalogue(
    firestoreCoreStore(teacher),
    planCoreCatalogue([quiz], []),
    {
      knownTasks: [
        { id: "known-legacy", grade: 1 },
        { id: "missing-legacy", grade: 2 },
      ],
    }
  );
  assert.equal((await raw("taskAccess/known-legacy")).enabled, false);
  assert.equal((await raw("taskAccess/missing-legacy")).enabled, false);
  assert.equal((await raw("taskAccess/unknown-orphan")).enabled, true);
  await syncCoreCatalogue(
    firestoreCoreStore(teacher),
    planCoreCatalogue([{ ...quiz, id: "known-legacy" }], []),
    { repairOnly: true }
  );
  assert.equal((await raw("taskAccess/known-legacy")).enabled, false);
  await assert.rejects(
    syncCoreCatalogue(
      firestoreCoreStore(teacher),
      planCoreCatalogue([{ ...quiz, id: "unknown-orphan" }], []),
      { repairOnly: true }
    ),
    /已發布索引/
  );
});
test("REST cached repair racing with revocation cannot recreate an enabled missing grant", async () => {
  await sync([quiz], []);
  await env.withSecurityRulesDisabled(async c =>
    sdk.deleteDoc(sdk.doc(c.firestore(), "taskAccess", quiz.id))
  );
  let revokeAtCommit = true,
    commits = 0;
  const request = async (method, resource, body) => {
    if (method === "GET") {
      assert.ok(!resource.includes("?"));
      assert.ok(resource.split("/documents/")[1]?.split("/").length % 2 === 0);
    }
    if (method === "POST") {
      commits++;
      if (revokeAtCommit) {
        revokeAtCommit = false;
        await sync([], []);
      }
    }
    const r = await fetch("http://127.0.0.1:8190/v1/" + resource, {
      method,
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (r.status === 404 && method === "GET") return null;
    if (!r.ok) {
      const e = Error("Emulator " + r.status);
      e.status = r.status;
      throw e;
    }
    return r.json();
  };
  await syncCoreCatalogue(
    coreRestStore({ project: "demo-core-catalogue", request }),
    planCoreCatalogue([quiz], []),
    { repairOnly: true }
  );
  assert.equal(
    commits,
    1,
    "CAS conflict rereads disabled grant and retry needs no further write"
  );
  assert.equal((await raw("taskAccess/" + quiz.id)).enabled, false);
  assert.equal((await raw(CORE_INDEX_PATH)).tasks[quiz.id].enabled, false);
});
