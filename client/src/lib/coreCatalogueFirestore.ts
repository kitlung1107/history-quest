import {
  doc,
  getDocFromServer,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import type { CoreStore } from "./coreCatalogue";
export function firestoreCoreStore(db: Firestore): CoreStore {
  return {
    async read(path) {
      const row = await getDocFromServer(doc(db, path));
      return row.exists() ? row.data() : undefined;
    },
    async atomic(paths, build) {
      await runTransaction(db, async tx => {
        const rows = await Promise.all(paths.map(p => tx.get(doc(db, p))));
        const changes = build(
          new Map(
            paths.map((p, i) => [
              p,
              rows[i].exists() ? rows[i].data() : undefined,
            ])
          )
        );
        for (const change of changes) tx.set(doc(db, change.path), change.data);
      });
    },
  };
}
