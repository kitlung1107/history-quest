import { MAX_AUDIT_ENTRIES } from "./drawLedgerAudit.ts";

export const ENROLLMENT_AUDIT_PAGE_SIZE = 1_000;

/** Collect every server page, including a one-row overflow probe at the cap.
 * The cursor must use the last document in a stable document-ID ordering.
 * A failed page rejects the whole audit; partial results never certify a SID. */
export async function collectEnrollmentAuditPages<T>(
  readPage: (size: number, after: T | undefined) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: T | undefined;
  for (;;) {
    const size = Math.min(ENROLLMENT_AUDIT_PAGE_SIZE, MAX_AUDIT_ENTRIES - rows.length + 1);
    const page = await readPage(size, after);
    if (rows.length + page.length > MAX_AUDIT_ENTRIES)
      throw Error("帳項超出安全核算上限；未儲存、未扣款。");
    rows.push(...page);
    if (page.length < size) return rows;
    after = page[page.length - 1];
  }
}
