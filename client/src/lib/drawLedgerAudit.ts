export const MAX_AUDIT_ENTRIES = 10_000;
type DocumentData = Record<string, any>;
export type AuditRow = { id: string; data: DocumentData };
type Row = AuditRow;
export class QualificationError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
const fail = (code: string): never => {
  throw new QualificationError(code);
};
const safe = (v: unknown): v is number => Number.isSafeInteger(v);
const idOK = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(v);
function sum(values: number[]) {
  const value = values.reduce((a, b) => a + b, 0);
  return safe(value) ? value : fail("unsafe-ledger-total");
}
/** Pure audit of authoritative documents. No supplied browser balance, card
 * inventory, reward rewriting or root-wallet creation is part of qualification.
 * Every old negative is reserved; only recognised immutable rewards can fund it. */
export function auditDrawLedger(
  rows: Row[],
  wallet: DocumentData | undefined,
  claims: Row[],
  receipts: Map<string, DocumentData>
) {
  if (rows.length > MAX_AUDIT_ENTRIES) fail("ledger-audit-limit");
  const entries = new Map(rows.map((row) => [row.id, row.data]));
  const positives = rows.filter((row) => row.data.amount > 0),
    legacy = rows.filter(
      (row) => row.data.amount < 0 && row.data.kind !== "cardDraw"
    );
  for (const { id, data } of rows) {
    if (!idOK(id) || !safe(data.amount)) fail("invalid-ledger-entry");
    if (data.amount >= 0 && !["taskReward", "gameReward"].includes(data.kind))
      fail("unsupported-credit-source");
  }
  const draws = rows.filter(
    (row) => row.data.amount < 0 && row.data.kind === "cardDraw"
  );
  const revisions = new Map<number, string>();
  for (const row of draws) {
    const debit = row.data,
      receipt = receipts.get(debit.requestId);
    if (
      !idOK(debit.requestId) ||
      row.id !== "draw_" + debit.requestId ||
      !receipt ||
      receipt.requestId !== debit.requestId ||
      receipt.cardId !== debit.cardId ||
      !safe(receipt.price) ||
      receipt.price !== -debit.amount ||
      receipt.price < 1 ||
      !safe(receipt.revision) ||
      receipt.revision < 1 ||
      revisions.has(receipt.revision)
    )
      fail("unproven-draw-debit");
    revisions.set(receipt!.revision, debit.requestId);
  }
  if (receipts.size !== draws.length) fail("orphan-draw-receipt");
  if (!wallet && (claims.length || draws.length)) fail("missing-proof-wallet");
  if (wallet) {
    if (
      wallet.schemaVersion !== 1 ||
      Object.keys(wallet).some(
        (k) =>
          ![
            "schemaVersion",
            "balance",
            "credited",
            "spent",
            "creditRevision",
            "drawRevision",
            "lastCreditId",
            "lastRequestId",
          ].includes(k)
      ) ||
      !["balance", "credited", "spent", "creditRevision", "drawRevision"].every(
        (k) => safe(wallet[k]) && wallet[k] >= 0
      ) ||
      wallet.balance !== wallet.credited - wallet.spent
    )
      fail("incompatible-proof-wallet");
    const creditRevisions = new Map<number, string>();
    for (const row of claims) {
      const p = row.data,
        source = entries.get(row.id);
      if (
        !source ||
        source.amount <= 0 ||
        !["taskReward", "gameReward"].includes(source.kind) ||
        p.creditId !== row.id ||
        p.amount !== source.amount ||
        !safe(p.revision) ||
        p.revision < 1 ||
        creditRevisions.has(p.revision)
      )
        fail("invalid-credit-proof");
      creditRevisions.set(p.revision, row.id);
    }
    if (
      wallet.credited !== sum(claims.map((r) => r.data.amount)) ||
      wallet.creditRevision !== claims.length ||
      wallet.lastCreditId !== (creditRevisions.get(claims.length) ?? "")
    )
      fail("inconsistent-credit-wallet");
    if (
      wallet.spent !== sum(draws.map((r) => -r.data.amount)) ||
      wallet.drawRevision !== draws.length ||
      wallet.lastRequestId !== (revisions.get(draws.length) ?? "")
    )
      fail("inconsistent-draw-wallet");
    for (let i = 1; i <= claims.length; i++)
      if (!creditRevisions.has(i)) fail("invalid-credit-sequence");
    for (let i = 1; i <= draws.length; i++)
      if (!revisions.has(i)) fail("invalid-draw-sequence");
  }
  const legacySpent = sum(legacy.map((r) => -r.data.amount));
  const legacyDebits = Object.fromEntries(
    legacy
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((r) => [r.id, r.data.amount])
  );
  const version = rows
    .map(({ id, data }) => ({ id, kind: data.kind ?? "", amount: data.amount }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (new TextEncoder().encode(JSON.stringify(legacyDebits)).byteLength > 250_000)
    fail("legacy-reserve-limit");
  return {
    legacySpent,
    legacyDebits,
    ledgerVersion: JSON.stringify(version),
    entryCount: rows.length,
    verifiedAtLedgerBalance:
      sum(positives.map((r) => r.data.amount)) -
      legacySpent -
      sum(draws.map((r) => -r.data.amount)),
  };
}
