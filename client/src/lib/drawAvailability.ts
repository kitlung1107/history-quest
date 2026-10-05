import { BrowserDrawError } from "./browserDraw";
import { isDrawCertified } from "./drawQualification";

export type DrawReminder = "complete" | "insufficient";
export const DRAW_REMINDER_TEXT: Record<DrawReminder, string> = {
  insufficient: "探索幣仲差少少！完成小測或遊戲，儲夠再嚟抽卡啦！",
  complete: "恭喜你！目前可以抽到嘅卡片，你已經集齊晒！等新卡登場，再嚟探索啦！",
};

type LedgerRow = { id: string; amount: number; kind: string };
type DrawCard = { enabled: boolean; drawEnabled?: boolean; role: string };
export type DrawAvailabilityInput = {
  profile: any;
  catalog: any;
  qualification: any;
  status: any;
  ledger: LedgerRow[];
  expectedCatalogHash: string;
};

/** Read-only presentation decision. Never infer a complete collection from a
 * missing, stale or unreadable catalogue. The existing transaction remains the
 * authority for every successful purchase. */
export function checkDrawAvailability(input: DrawAvailabilityInput): {
  reminder: DrawReminder | null;
  cardIds: string[];
} {
  const { profile, catalog, qualification, status, ledger } = input;
  if (status?.enabled !== true || status.protocolVersion !== 1)
    throw new BrowserDrawError("draw-disabled", "抽卡尚未啟用；未扣探索幣。");
  if (!isDrawCertified(qualification))
    throw new BrowserDrawError(
      qualification?.verified === false ? "qualification-rejected" : "qualification-pending",
      "帳戶抽卡資格尚未核實；未扣探索幣。"
    );
  if (
    catalog?.schemaVersion !== 1 || !catalog.cards ||
    typeof catalog.cards !== "object" || Array.isArray(catalog.cards)
  )
    throw new BrowserDrawError("failed-precondition", "卡池尚未準備好；未扣探索幣。");
  if (catalog.sourceSha256 !== input.expectedCatalogHash)
    throw new BrowserDrawError("catalog-outdated", "卡庫已更新，請重新整理後再抽；未扣探索幣。");
  if (
    profile?.configured !== true || !["studentBoy", "studentGirl"].includes(profile.role) ||
    !Array.isArray(profile.ownedCardIds) || !profile.ownedCardIds.every((id: unknown) => typeof id === "string")
  )
    throw new BrowserDrawError("failed-precondition", "請先完成角色設定；未扣探索幣。");
  const cards = Object.entries(catalog.cards) as [string, DrawCard][];
  if (cards.some(([, card]) => !card || typeof card.enabled !== "boolean" || typeof card.role !== "string"))
    throw new BrowserDrawError("failed-precondition", "卡池資料未能確認；未扣探索幣。");
  const eligible = cards.filter(([, card]) =>
    card.enabled === true && card.drawEnabled !== false && card.role === profile.role
  );
  if (!eligible.length)
    throw new BrowserDrawError("pool-unavailable", "目前未有符合角色的可抽卡片；未扣探索幣。");
  const cardIds = eligible.filter(([id]) => !profile.ownedCardIds.includes(id)).map(([id]) => id).sort();
  const price = catalog.drawPrice ?? 100;
  if (!Number.isSafeInteger(price) || price < 1 || price > 100000)
    throw new BrowserDrawError("failed-precondition", "抽卡價格無效；未扣探索幣。");
  const legacy = ledger.filter(row => row.amount < 0 && row.kind !== "cardDraw");
  const balance = ledger.reduce((sum, row) => sum + row.amount, 0);
  if (
    ledger.some(row => !Number.isSafeInteger(row.amount)) || !Number.isSafeInteger(balance) ||
    legacy.some(row => qualification.legacyDebits?.[row.id] !== row.amount) ||
    legacy.reduce((sum, row) => sum - row.amount, 0) !== (qualification.legacySpent ?? 0)
  )
    throw new BrowserDrawError("ledger-incompatible", "帳簿未能安全核算；未扣探索幣。");
  // A valid, fully owned role-specific pool takes precedence over a low balance.
  if (!cardIds.length) return { reminder: "complete", cardIds };
  return { reminder: balance < price ? "insufficient" : null, cardIds };
}

export function reminderForDrawError(error: unknown): DrawReminder | undefined {
  const code = (error as { code?: string } | null)?.code;
  return code === "pool-empty" ? "complete" : code === "insufficient-coins" ? "insufficient" : undefined;
}
