import { test } from "node:test";
import assert from "node:assert/strict";
import { collectEnrollmentAuditPages, ENROLLMENT_AUDIT_PAGE_SIZE } from "./enrollmentAuditPages.ts";
import { MAX_AUDIT_ENTRIES, auditDrawLedger } from "./drawLedgerAudit.ts";

for (const count of [0, 1, 999, 1_000, 1_001, 1_999, 2_000, 9_999, 10_000]) {
  test(`server pages retain all ${count} documents exactly once`, async () => {
    const source = Array.from({ length: count }, (_, i) => ({ id: `entry-${String(i).padStart(5, "0")}` }));
    const requests: number[] = [];
    const rows = await collectEnrollmentAuditPages(async (size, after: typeof source[number] | undefined) => {
      assert(size > 0 && size <= ENROLLMENT_AUDIT_PAGE_SIZE && size <= 10_000);
      requests.push(size);
      const offset = after ? source.indexOf(after) + 1 : 0;
      return source.slice(offset, offset + size);
    });
    assert.deepEqual(rows, source);
    if (count === MAX_AUDIT_ENTRIES) assert.equal(requests.at(-1), 1);
    if (count > ENROLLMENT_AUDIT_PAGE_SIZE) assert(requests.length > 1);
  });
}

for (const count of [10_001, 11_000]) {
  test(`rejects ${count} documents rather than certifying a truncated ledger`, async () => {
    const requests: number[] = [];
    await assert.rejects(collectEnrollmentAuditPages(async (size, after: number | undefined) => {
      requests.push(size);
      const offset = after === undefined ? 0 : after + 1;
      return Array.from({ length: Math.min(size, count - offset) }, (_, i) => offset + i);
    }), /超出安全核算上限/);
    assert.equal(requests.at(-1), 1);
    assert(requests.every(size => size <= ENROLLMENT_AUDIT_PAGE_SIZE));
  });
}

test("a later server-page failure rejects the whole audit", async () => {
  let calls = 0;
  await assert.rejects(collectEnrollmentAuditPages(async () => {
    if (++calls === 2) throw Error("server page unavailable");
    return Array.from({ length: ENROLLMENT_AUDIT_PAGE_SIZE }, (_, i) => i);
  }), /server page unavailable/);
  assert.equal(calls, 2);
});

test("historical debit after the first page is reserved in full", async () => {
  const source = Array.from({ length: ENROLLMENT_AUDIT_PAGE_SIZE + 1 }, (_, i) => ({
    id: `entry-${String(i).padStart(5, "0")}`,
    data: i === ENROLLMENT_AUDIT_PAGE_SIZE ? { kind: "legacyDebit", amount: -75 } : { kind: "taskReward", amount: 1 },
  }));
  const rows = await collectEnrollmentAuditPages(async (size, after: typeof source[number] | undefined) => {
    const offset = after ? source.indexOf(after) + 1 : 0;
    return source.slice(offset, offset + size);
  });
  const audit = auditDrawLedger(rows, undefined, [], new Map());
  assert.equal(audit.entryCount, 1_001);
  assert.equal(audit.legacySpent, 75);
  assert.equal(audit.verifiedAtLedgerBalance, 925);
  assert.deepEqual(audit.legacyDebits, { "entry-01000": -75 });
});
