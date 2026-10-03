// Default dry-run reads local CMS files only; --apply requires separate approval.
import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { publicTasks, publicTopics } from "../client/src/lib/contentModel.ts";
import {
  planCoreCatalogue,
  syncCoreCatalogue,
  CORE_INDEX_PATH,
} from "../client/src/lib/coreCatalogue.ts";
import { coreRestStore } from "./core-catalogue-rest.mjs";
import {
  releaseContext,
  validateReleaseCredentials,
  assertCurrentRelease,
} from "./card-catalog-release.mjs";
export function coreReleaseContext(env) {
  assert.equal(
    env.CORE_CATALOG_SYNC_ENABLED,
    "true",
    "Core metadata publication awaits explicit approval; Pages stopped"
  );
  return releaseContext(env);
}
const root = fileURLToPath(new URL("../", import.meta.url));
const json = async p => JSON.parse(await readFile(p, "utf8"));
async function jsonFolder(dir) {
  return Promise.all(
    (await readdir(dir))
      .filter(n => n.endsWith(".json"))
      .sort()
      .map(n => json(path.join(dir, n)))
  );
}
export async function localCoreSource(base = root) {
  const grades = (
    await json(path.join(base, "client/src/content/settings/grades.json"))
  ).grades;
  const topics = await jsonFolder(path.join(base, "client/src/content/topics"));
  const rawTasks = await jsonFolder(
    path.join(base, "client/src/content/tasks")
  );
  const tasks = publicTasks(rawTasks, publicTopics(topics, grades));
  const legacy = await json(
    path.join(base, "scripts/core-catalogue-legacy-ids.json")
  );
  assert.equal(legacy.schemaVersion, 1);
  assert.match(legacy.sourceCommit, /^[a-f0-9]{40}$/);
  assert.ok(Array.isArray(legacy.tasks));
  const known = new Map();
  for (const t of [
    ...legacy.tasks,
    ...rawTasks.map(t => ({
      id: t.task_id,
      grade: topics.find(topic => topic.id === t.topicId)?.grade,
    })),
  ]) {
    assert.match(t.id, /^[A-Za-z0-9_-]{1,150}$/);
    assert.ok(
      Number.isInteger(t.grade) && t.grade >= 1 && t.grade <= 6,
      "Known task grade missing or invalid"
    );
    known.set(t.id, { id: t.id, grade: t.grade });
  }
  return {
    plan: planCoreCatalogue(
      tasks,
      await jsonFolder(path.join(base, "client/src/lib/games"))
    ),
    knownTasks: [...known.values()].sort((a, b) => a.id.localeCompare(b.id)),
    legacySourceCommit: legacy.sourceCommit,
  };
}
export async function localCorePlan() {
  return (await localCoreSource()).plan;
}
export async function run(args = process.argv.slice(2), env = process.env) {
  let apply = false,
    ci = false,
    project,
    dry = false,
    repairTask;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apply") apply = true;
    else if (args[i] === "--dry-run") dry = true;
    else if (args[i] === "--ci") ci = true;
    else if (args[i] === "--project") project = args[++i];
    else if (args[i] === "--repair-task") repairTask = args[++i];
    else throw Error("Unknown argument: " + args[i]);
  }
  assert.ok(!(apply && dry));
  assert.ok(!ci || apply);
  assert.ok(
    !(apply && env.GITHUB_ACTIONS === "true" && !ci),
    "GitHub writes require guarded CI mode"
  );
  assert.ok(!ci || !repairTask, "CI must publish the full reviewed CMS plan");
  const source = await localCoreSource();
  let plan = source.plan;
  if (repairTask) {
    plan = plan.filter(p => p.id === repairTask);
    assert.equal(
      plan.length,
      1,
      "Repair task must match exactly one current public task"
    );
  }
  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          network: false,
          enumerationUsed: false,
          indexPath: CORE_INDEX_PATH,
          taskDocumentCount: plan.reduce((n, t) => n + t.documents.length, 0),
          explicitKnownTaskIds: repairTask
            ? []
            : source.knownTasks.map(t => t.id),
          explicitRevocationCandidates: repairTask
            ? []
            : source.knownTasks
                .filter(t => !plan.some(p => p.id === t.id))
                .map(t => t.id),
          tasks: plan.map(p => ({
            id: p.id,
            grade: p.grade,
            documents: p.documents.map(d => d.path),
          })),
          revocation: repairTask
            ? "None: single-task repair preserves existing grants and all other tasks."
            : "Exact IDs from release index, explicit main-history migration and current CMS; absent/hidden grants disabled. Unknown orphan IDs cannot be discovered.",
        },
        null,
        2
      )
    );
    return;
  }
  const emulator = env.FIRESTORE_EMULATOR_HOST;
  let request, release;
  if (emulator) {
    assert.ok(!ci);
    assert.match(emulator, /^127\.0\.0\.1:\d+$/);
    assert.equal(project, "demo-core-catalogue");
    request = async (method, resource, body) => {
      const r = await fetch(`http://${emulator}/v1/${resource}`, {
        method,
        headers: {
          Authorization: "Bearer owner",
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (r.status === 404 && method === "GET") return null;
      if (!r.ok) {
        const e = Error("Emulator request failed " + r.status);
        e.status = r.status;
        throw e;
      }
      return r.json();
    };
  } else {
    assert.equal(
      project,
      "history-discovery-center",
      "Explicit production project required"
    );
    if (ci) {
      release = coreReleaseContext(env);
      assert.ok(env.GOOGLE_APPLICATION_CREDENTIALS);
      validateReleaseCredentials(
        await json(env.GOOGLE_APPLICATION_CREDENTIALS),
        release
      );
      await assertCurrentRelease(release, env.GITHUB_TOKEN);
    }
    const require = createRequire(import.meta.url);
    const auth = require("firebase-tools/lib/auth");
    const { requireAuth } = require("firebase-tools/lib/requireAuth");
    const { Client } = require("firebase-tools/lib/apiv2");
    const options = { project, nonInteractive: true };
    if (!ci) {
      const account = auth.getGlobalDefaultAccount();
      if (account) auth.setActiveAccount(options, account);
    }
    await requireAuth(options);
    const api = new Client({
      auth: true,
      apiVersion: "v1",
      urlPrefix: "https://firestore.googleapis.com",
    });
    request = async (method, resource, body) => {
      try {
        return (
          method === "GET"
            ? await api.get(resource, { skipLog: { resBody: true } })
            : await api.post(resource, body, {
                skipLog: { body: true, resBody: true },
              })
        ).body;
      } catch (e) {
        if (e.status === 404 && method === "GET") return null;
        throw e;
      }
    };
  }
  const folder = path.join(root, "tmp/core-catalogue");
  await mkdir(folder, { recursive: true });
  let n = 0;
  const result = await syncCoreCatalogue(
    coreRestStore({
      project,
      request,
      beforeWrite: async () => {
        if (release) await assertCurrentRelease(release, env.GITHUB_TOKEN);
      },
      backup: changes =>
        writeFile(
          path.join(folder, `metadata-before-${Date.now()}-${n++}.json`),
          JSON.stringify({ project, changes }, null, 2),
          { flag: "wx" }
        ),
    }),
    plan,
    {
      repairOnly: Boolean(repairTask),
      knownTasks: repairTask ? [] : source.knownTasks,
    }
  );
  const receipt = {
    project,
    commit: release?.sha,
    legacySourceCommit: source.legacySourceCommit,
    ...result,
    rewardsTouched: false,
    studentDataTouched: false,
  };
  await writeFile(
    path.join(folder, "core-sync-receipt.json"),
    JSON.stringify(receipt, null, 2)
  );
  console.log(JSON.stringify(receipt, null, 2));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await run();
