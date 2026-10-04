import { taskAssessmentVersion, getQuestions } from "./assessment.ts";
import { validAnswer, type Game } from "./games/model.ts";
import type { HistoryTask } from "./historyQuest";

export type CoreChange = { path: string; data: Record<string, unknown> };
export type CoreStore = {
  read(path: string): Promise<Record<string, any> | undefined>;
  atomic(
    paths: string[],
    build: (existing: Map<string, any>) => CoreChange[]
  ): Promise<void>;
};
export type CorePlan = {
  id: string;
  grade: number;
  documents: CoreChange[];
  game?: Game;
}[];
export const CORE_INDEX_PATH = "catalogue/core-sync-index-v1";
export type KnownCoreTask = { id: string; grade: number };
type CoreIndexEntry = { grade: number; enabled: boolean; versions: string[] };
type CoreIndex = { schemaVersion: 1; tasks: Record<string, CoreIndexEntry> };
const idOK = (id: string) => /^[A-Za-z0-9_-]{1,150}$/.test(id);
export const canonicalCore = (value: any): any =>
  Array.isArray(value)
    ? value.map(canonicalCore)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(k => [k, canonicalCore(value[k])])
        )
      : value;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonicalCore(a)) === JSON.stringify(canonicalCore(b));
const gradeOK = (grade: number) =>
  Number.isInteger(grade) && grade >= 1 && grade <= 6;
const versionOK = (p: string) =>
  /^catalogue\/[A-Za-z0-9_-]{1,195}$/.test(p) ||
  /^gameCatalog\/[A-Za-z0-9_-]{1,150}\/versions\/[A-Za-z0-9_-]{1,150}$/.test(p);
function indexOf(value: any): CoreIndex {
  if (value === undefined) return { schemaVersion: 1, tasks: {} };
  if (
    value.schemaVersion !== 1 ||
    !value.tasks ||
    Array.isArray(value.tasks) ||
    typeof value.tasks !== "object"
  )
    throw Error("教材同步索引無效，未寫入。");
  for (const [id, entry] of Object.entries(value.tasks) as [
    string,
    CoreIndexEntry,
  ][])
    if (
      !idOK(id) ||
      !entry ||
      !gradeOK(entry.grade) ||
      typeof entry.enabled !== "boolean" ||
      !Array.isArray(entry.versions) ||
      entry.versions.some(p => typeof p !== "string" || !versionOK(p)) ||
      new Set(entry.versions).size !== entry.versions.length
    )
      throw Error("教材同步索引項目無效，未寫入。");
  // Leave room below Firestore's document limit; fail instead of losing tombstones.
  if (
    Object.keys(value.tasks).length > 2000 ||
    new TextEncoder().encode(JSON.stringify(value)).length > 500_000
  )
    throw Error("教材同步索引需分片，未截斷歷史或撤權紀錄。");
  return structuredClone(value);
}
function updatedIndex(index: CoreIndex, id: string, entry: CoreIndexEntry) {
  const next = indexOf({ ...index, tasks: { ...index.tasks, [id]: entry } });
  return same(index, next) ? [] : [{ path: CORE_INDEX_PATH, data: next }];
}
const entryFor = (index: CoreIndex, id: string) =>
  Object.hasOwn(index.tasks, id) ? index.tasks[id] : undefined;

/** Visible CMS tasks are authoritative; stale grants are disabled, never deleted. */
export function planCoreCatalogue(
  tasks: HistoryTask[],
  games: Game[]
): CorePlan {
  if (new Set(tasks.map(t => t.id)).size !== tasks.length)
    throw Error("教材ID重複，未同步。");
  if (new Set(games.map(g => g.gameId)).size !== games.length)
    throw Error("遊戲ID重複，未同步。");
  return tasks.map(task => {
    if (
      !idOK(task.id) ||
      !Number.isInteger(task.grade) ||
      task.grade < 1 ||
      task.grade > 6
    )
      throw Error("教材ID或年級無效，未同步。");
    const documents: CoreChange[] = [];
    const questions = getQuestions(task);
    if (
      questions.length > 30 ||
      new Set(questions.map(q => q.id)).size !== questions.length ||
      questions.some(
        q =>
          !idOK(q.id) ||
          !["choice", "short"].includes(q.type) ||
          typeof q.prompt !== "string" ||
          !Number.isInteger(q.points) ||
          q.points < 1 ||
          q.points > 100 ||
          (q.type === "choice" &&
            (!q.options ||
              q.options.length < 2 ||
              !Number.isInteger(q.answer) ||
              q.answer! < 0 ||
              q.answer! >= q.options.length))
      )
    )
      throw Error(`教材 ${task.id} 題目無效，未同步。`);
    if (questions.length)
      documents.push({
        path: `catalogue/${task.id}--${taskAssessmentVersion(task)}`,
        data: JSON.parse(
          JSON.stringify({
            questions,
            title: task.title,
            source: task.type === "game" ? "questionnaire" : "assessment",
            ...(task.assessmentVersion&&task.type!=='game'?{protocol:'rules-assessment/1',assessmentVersion:task.assessmentVersion}:{}),
          })
        ),
      });
    const matching = games.filter(g => g.taskId === task.id);
    if (matching.length > 1)
      throw Error(`教材 ${task.id} 對應多個遊戲，未同步。`);
    const game = matching[0];
    if (game) {
      if (task.type !== "game" || !idOK(game.gameId) || !idOK(game.version))
        throw Error("遊戲與教材對應無效，未同步。");
      const entries = Object.entries(game.questions);
      if (
        !entries.length ||
        entries.length > 400 ||
        entries.some(([id, q]) => !idOK(id) || !validAnswer(q, q.answer))
      )
        throw Error("遊戲題庫無效或超過400題，未同步。");
      const base = `gameCatalog/${game.gameId}/versions/${game.version}`;
      for (const [id, q] of entries)
        documents.push({ path: `${base}/questions/${id}`, data: q });
      documents.push({
        path: base,
        data: {
          enabled: true,
          title: game.title,
          taskId: task.id,
          questionCount: entries.length,
        },
      });
    }
    documents.push({
      path: `taskAccess/${task.id}`,
      data: { grade: task.grade, enabled: true },
    });
    return { id: task.id, grade: task.grade, documents, game };
  });
}

/** Each task's version, questions and grant commit atomically. No rewards or student data. */
export async function syncCoreCatalogue(
  store: CoreStore,
  plan: CorePlan,
  {
    repairOnly = false,
    knownTasks = [],
  }: { repairOnly?: boolean; knownTasks?: KnownCoreTask[] } = {}
) {
  const initial = indexOf(await store.read(CORE_INDEX_PATH));
  const ids = new Set(plan.map(t => t.id));
  const known = new Map<string, number>();
  for (const t of knownTasks) {
    if (!idOK(t.id) || !gradeOK(t.grade))
      throw Error("遷移教材ID或年級無效，未同步。");
    known.set(t.id, t.grade);
  }
  for (const [id, entry] of Object.entries(initial.tasks))
    known.set(id, entry.grade);
  const disabled: string[] = [];
  // Exact IDs only. Revocations and durable tombstones precede new activation.
  for (const [id, knownGrade] of Array.from(known))
    if (!repairOnly && !ids.has(id)) {
      const path = `taskAccess/${id}`;
      await store.atomic([CORE_INDEX_PATH, path], existing => {
        const index = indexOf(existing.get(CORE_INDEX_PATH));
        const old = existing.get(path);
        if (old && (!gradeOK(old.grade) || typeof old.enabled !== "boolean"))
          throw Error(`舊教材授權 ${id} 無效，請管理員核對。`);
        const tracked = entryFor(index, id);
        const grade = old?.grade ?? tracked?.grade ?? knownGrade;
        const grant = { grade, enabled: false };
        return [
          ...(!same(old, grant) ? [{ path, data: grant }] : []),
          ...updatedIndex(index, id, {
            grade,
            enabled: false,
            versions: tracked?.versions ?? [],
          }),
        ];
      });
      disabled.push(id);
    }
  if (!repairOnly && !known.size && !plan.length)
    await store.atomic([CORE_INDEX_PATH], existing =>
      existing.get(CORE_INDEX_PATH) === undefined
        ? [{ path: CORE_INDEX_PATH, data: initial }]
        : (indexOf(existing.get(CORE_INDEX_PATH)), [])
    );
  const synced: string[] = [];
  for (const task of plan) {
    try {
      await store.atomic(
        [CORE_INDEX_PATH, ...task.documents.map(d => d.path)],
        existing => {
          const savedIndex = existing.get(CORE_INDEX_PATH);
          const index = indexOf(savedIndex);
          const tracked = entryFor(index, task.id);
          if (repairOnly && savedIndex !== undefined && !tracked)
            throw Error(
              "教材尚未列入已發布索引；請先發布當前CMS，未重新授權。"
            );
          if (task.game) {
            const p = `gameCatalog/${task.game.gameId}/versions/${task.game.version}`,
              old = existing.get(p);
            if (
              old &&
              (old.enabled !== true ||
                old.taskId !== task.id ||
                old.questionCount !== Object.keys(task.game.questions).length)
            )
              throw Error(
                "遊戲版本已停用或manifest不符；須明確更新版本，未重新啟用。"
              );
          }
          const changes = task.documents.flatMap(d => {
            const old = existing.get(d.path);
            // Cached teacher pages may repair missing metadata, but must not undo
            // a newer release's grade or revocation. CI publishes these settings.
            if (repairOnly && d.path.startsWith("taskAccess/")) {
              if (old) return [];
              const data = tracked
                ? { grade: tracked.grade, enabled: tracked.enabled }
                : d.data;
              return [{ path: d.path, data }];
            }
            if (d.path.startsWith("catalogue/") && old) {
              if (!same(old.questions, d.data.questions))
                throw Error("同版本題庫內容不符，未覆蓋歷史版本。");
              return [];
            }
            if (d.path.startsWith("gameCatalog/") && old) {
              if (d.path.includes("/questions/") && !same(old, d.data))
                throw Error("同版本遊戲題目不符，未覆蓋歷史版本。");
              return [];
            }
            return !same(old, d.data) ? [d] : [];
          });
          // Browser repair never edits release state. Current CMS publication owns it.
          if (!repairOnly)
            changes.push(
              ...updatedIndex(index, task.id, {
                grade: task.grade,
                enabled: true,
                versions: Array.from(
                  new Set([
                    ...(tracked?.versions ?? []),
                    ...task.documents
                      .map(d => d.path)
                      .filter(
                        p =>
                          p.startsWith("catalogue/") ||
                          (p.startsWith("gameCatalog/") &&
                            !p.includes("/questions/"))
                      ),
                  ])
                ).sort(),
              })
            );
          return changes;
        }
      );
      synced.push(task.id);
    } catch (e) {
      throw Error(
        `教材 ${task.id} 核心同步失敗（已確認完成 ${synced.length} 項；此項未確認完成，可安全重試）：${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
  return {
    synced,
    disabled,
    mode: repairOnly ? "repair" : "publish",
    indexPath: CORE_INDEX_PATH,
    enumerationUsed: false,
    gameVersions: plan
      .filter(p => p.game)
      .map(p => `${p.game!.gameId}--${p.game!.version}`),
  };
}
