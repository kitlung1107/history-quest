import { canonicalCore } from "../client/src/lib/coreCatalogue.ts";
export const fields = object =>
  Object.fromEntries(Object.entries(object).map(([k, v]) => [k, encode(v)]));
function encode(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number" && Number.isFinite(v))
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (v && typeof v === "object") return { mapValue: { fields: fields(v) } };
  throw Error("Unsupported core metadata value");
}
function decode(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
  if ("mapValue" in v) return values(v.mapValue.fields || {});
  throw Error("Unexpected core metadata field");
}
const values = object =>
  Object.fromEntries(Object.entries(object).map(([k, v]) => [k, decode(v)]));
const allowed = path =>
  /^taskAccess\/[A-Za-z0-9_-]{1,150}$/.test(path) ||
  /^catalogue\/[A-Za-z0-9_-]{1,195}$/.test(path) ||
  /^gameCatalog\/[A-Za-z0-9_-]{1,150}\/versions\/[A-Za-z0-9_-]{1,150}(\/questions\/[A-Za-z0-9_-]{1,150})?$/.test(
    path
  );
const same = (a, b) =>
  JSON.stringify(canonicalCore(a)) === JSON.stringify(canonicalCore(b));

/** IAM REST adapter. Writes restricted to three core metadata collections only. */
export function coreRestStore({
  project,
  request,
  beforeWrite = async () => {},
  backup = async () => {},
}) {
  const base = `projects/${project}/databases/(default)/documents`;
  return {
    async read(path) {
      if (!allowed(path)) throw Error("Non-core metadata path rejected");
      const d = await request("GET", `${base}/${path}`);
      return d ? values(d.fields || {}) : undefined;
    },
    async atomic(paths, build) {
      if (paths.some(p => !allowed(p)))
        throw Error("Non-core metadata path rejected");
      for (let attempt = 0; attempt < 3; attempt++) {
        const existing = new Map();
        for (let i = 0; i < paths.length; i += 20)
          await Promise.all(
            paths
              .slice(i, i + 20)
              .map(async p =>
                existing.set(p, await request("GET", `${base}/${p}`))
              )
          );
        const changes = build(
          new Map(
            [...existing].map(([p, d]) => [
              p,
              d ? values(d.fields || {}) : undefined,
            ])
          )
        );
        if (!changes.length) return;
        if (
          changes.length > 500 ||
          changes.some(c => !allowed(c.path) || !existing.has(c.path))
        )
          throw Error("Unsafe core metadata write rejected");
        await beforeWrite();
        await backup(
          changes.map(c => ({
            path: c.path,
            before: existing.get(c.path),
            after: c.data,
          }))
        );
        try {
          await request("POST", `${base}:commit`, {
            writes: changes.map(c => ({
              update: { name: `${base}/${c.path}`, fields: fields(c.data) },
              currentDocument: existing.get(c.path)
                ? { updateTime: existing.get(c.path).updateTime }
                : { exists: false },
            })),
          });
        } catch (e) {
          if ([409, 412].includes(e.status) && attempt < 2) continue;
          throw e;
        }
        for (const c of changes) {
          const after = await request("GET", `${base}/${c.path}`);
          if (!after || !same(values(after.fields || {}), c.data))
            throw Error(`核心metadata讀回不符：${c.path}`);
        }
        return;
      }
    },
  };
}
