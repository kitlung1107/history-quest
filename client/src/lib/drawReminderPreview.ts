import type { CloudProfile } from "@/contexts/StudentAccount";
import { EXPLORER_CARDS } from "./cards";
import { CLIENT_CARD_CATALOG_HASH, CLIENT_CARD_DRAW_PRICE } from "virtual:card-draw-catalog";
import { BrowserDrawError, type BrowserDrawReceipt } from "./browserDraw";
import { checkDrawAvailability, DRAW_REMINDER_TEXT } from "./drawAvailability";

export function isDrawReminderPreview() {
  return import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(location.hostname) &&
    location.pathname.endsWith("/__draw-reminders-preview");
}

export const REMINDER_PREVIEW_PROFILE: CloudProfile = {
  className: "3A", name: "陳小明（預覽）", studentNo: "12", nickname: "歷史小探險",
  avatar: "studentBoy", role: "studentBoy", configured: true,
  ownedCardIds: ["starter-explorer-boy"], cardId: "starter-explorer-boy",
};

/** Entirely in-memory fixture. No Firebase instance, student account, ledger
 * write or storage persistence is created by this development-only preview. */
export function createDrawReminderPreview() {
  if (!isDrawReminderPreview()) throw new Error("提醒預覽只可在本機開啟。");
  const scenario = new URLSearchParams(location.search).get("scenario") ?? "poor";
  const profile = structuredClone(REMINDER_PREVIEW_PROFILE);
  const cards = Object.fromEntries(EXPLORER_CARDS.map(card => [card.id, {
    enabled: card.enabled, drawEnabled: card.drawEnabled, role: card.role,
  }]));
  const eligible = EXPLORER_CARDS.filter(card => card.enabled && card.drawEnabled !== false && card.role === profile.role);
  if (["empty", "both"].includes(scenario)) profile.ownedCardIds = eligible.map(card => card.id);
  let balance = ["poor", "both"].includes(scenario) ? 0 : 2000;
  let attempts = 0, purchases = 0, pending: string | undefined;
  const state = async () => ({ profile: structuredClone(profile), balance });
  const inspect = () => ({ scenario, balance, attempts, purchases, ownedCardIds: [...profile.ownedCardIds!], pending });
  async function draw(signal?: AbortSignal): Promise<BrowserDrawReceipt> {
    attempts++;
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new BrowserDrawError("draw-cancelled", "已離開預覽。")); };
      const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, scenario === "loading" ? 2000 : 150);
      if (signal?.aborted) cancel();
      else signal?.addEventListener("abort", cancel, { once: true });
    });
    if (scenario === "permission") throw new BrowserDrawError("permission-denied", "未能讀取卡池；未扣探索幣。");
    const availability = checkDrawAvailability({
      profile, catalog: scenario === "loading" ? undefined : {
        schemaVersion: 1, sourceSha256: CLIENT_CARD_CATALOG_HASH, drawPrice: CLIENT_CARD_DRAW_PRICE, cards,
      },
      status: { enabled: true, protocolVersion: 1 },
      qualification: { verified: true, walletModel: "immutable-positive-rewards-v1", openingBalance: 0, legacySpent: 0 },
      ledger: [{ id: "preview-only", amount: balance, kind: "taskReward" }],
      expectedCatalogHash: CLIENT_CARD_CATALOG_HASH,
    });
    if (availability.reminder)
      throw new BrowserDrawError(availability.reminder === "complete" ? "pool-empty" : "insufficient-coins", DRAW_REMINDER_TEXT[availability.reminder]);
    if (scenario === "backend-poor") throw new BrowserDrawError("insufficient-coins", "探索幣不足，未有扣幣。");
    const cardId = availability.cardIds[0];
    // Demonstrate the existing animation with a synthetic receipt only.
    balance -= CLIENT_CARD_DRAW_PRICE;
    profile.ownedCardIds!.push(cardId);
    purchases++;
    pending = crypto.randomUUID();
    return { requestId: pending, cardId, price: CLIENT_CARD_DRAW_PRICE, balance,
      revision: purchases, role: profile.role!, catalogHash: CLIENT_CARD_CATALOG_HASH, clientCatalogHash: CLIENT_CARD_CATALOG_HASH };
  }
  return { state, draw, pending: () => pending, finish: () => { pending = undefined; }, inspect };
}
