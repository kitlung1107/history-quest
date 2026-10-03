import { db } from "./firebase";
import type { HistoryTask } from "./historyQuest";
import { games } from "./games/registry";
import { planCoreCatalogue, syncCoreCatalogue } from "./coreCatalogue";
import { firestoreCoreStore } from "./coreCatalogueFirestore";

export function syncBrowserCore(tasks: HistoryTask[]) {
  const plan = planCoreCatalogue(tasks, Object.values(games));
  return syncCoreCatalogue(firestoreCoreStore(db), plan, { repairOnly: true });
}
