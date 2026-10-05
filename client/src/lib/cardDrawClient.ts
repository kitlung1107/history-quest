import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  type Firestore,
} from "firebase/firestore";
import { CLIENT_CARD_CATALOG_HASH } from "virtual:card-draw-catalog";
import { EXPLORER_CARDS } from "./cards";
import { mediaUrl } from "./siteSettings";
import {
  BrowserDrawError,
  drawBrowserCard,
  type BrowserDrawReceipt,
} from "./browserDraw";
import type { CloudProfile } from "@/contexts/StudentAccount";
import { checkDrawAvailability, DRAW_REMINDER_TEXT } from "./drawAvailability";
// A cancelled old panel must not clear an ID already adopted by a new panel.
const pendingOwners = new Map<string, symbol>();
/** Both the emulator and future approved account UI use this same adapter.
 * Identity is supplied by the authenticated account, never recovered from storage. */
export function createCardDrawClient(
  db: Firestore,
  uid: string,
  sid: string,
  email: string
) {
  const key = `history-quest.card-draw.pending.v1:${db.app.options.projectId}:${uid}:${sid}`;
  const pending = () => localStorage.getItem(key) || undefined;
  const finish = () => { localStorage.removeItem(key); pendingOwners.delete(key); };
  async function state() {
    const [profile, ledger] = await Promise.all([
      getDoc(doc(db, "profiles", sid)),
      getDocs(collection(db, "coinAccounts", sid, "entries")),
    ]);
    if (!profile.exists()) throw new Error("帳戶資料尚未準備好。");
    return {
      profile: profile.data() as CloudProfile,
      balance: ledger.docs.reduce((sum, row) => sum + row.data().amount, 0),
    };
  }
  async function decode(cardIds: string[]) {
    await Promise.all(
      cardIds.map(async (id) => {
        const card = EXPLORER_CARDS.find((c) => c.id === id);
        if (!card)
          throw new BrowserDrawError(
            "catalog-outdated",
            "卡庫已更新，請重新整理卡庫；不會再次扣幣。"
          );
        const image = new Image();
        image.src = mediaUrl(card.image);
        try {
          await image.decode();
        } catch {
          throw new BrowserDrawError(
            "card-art-unavailable",
            "卡圖未能載入，請重新整理；未開始新的扣款。"
          );
        }
      })
    );
  }
  async function draw(signal?: AbortSignal): Promise<BrowserDrawReceipt> {
    const requireActive = () => {
      if (signal?.aborted)
        throw new BrowserDrawError("draw-cancelled", "已離開抽卡畫面；未開始新的扣款。");
    };
    requireActive();
    const requestId = pending() ?? crypto.randomUUID();
    const owner = Symbol();
    pendingOwners.set(key, owner);
    localStorage.setItem(key, requestId);
    let committed = false;
    try {
      const saved = await getDocFromServer(
        doc(db, "cardDrawReceipts", sid, "requests", requestId)
      );
      if (saved.exists()) {
        committed = true;
        const receipt = saved.data() as BrowserDrawReceipt;
        await decode([receipt.cardId]);
        return receipt;
      }
      const [catalog, profile, qualification, status, ledger] = await Promise.all([
        getDocFromServer(doc(db, "cardCatalog", "current")),
        getDocFromServer(doc(db, "profiles", sid)),
        getDocFromServer(doc(db, "cardDrawEligibility", sid)),
        getDocFromServer(doc(db, "cardDraw", "status")),
        getDocsFromServer(collection(db, "coinAccounts", sid, "entries")),
      ]);
      requireActive();
      const availability = checkDrawAvailability({
        catalog: catalog.data(), profile: profile.data(),
        qualification: qualification.data(), status: status.data(),
        ledger: ledger.docs.map(row => ({ id: row.id, amount: row.data().amount, kind: row.data().kind })),
        expectedCatalogHash: CLIENT_CARD_CATALOG_HASH,
      });
      if (availability.reminder)
        throw new BrowserDrawError(
          availability.reminder === "complete" ? "pool-empty" : "insufficient-coins",
          DRAW_REMINDER_TEXT[availability.reminder]
        );
      await decode(availability.cardIds);
      requireActive();
      return await drawBrowserCard(
        db,
        sid,
        requestId,
        CLIENT_CARD_CATALOG_HASH
      );
    } catch (error: any) {
      if (
        !committed && pendingOwners.get(key) === owner &&
        [
          "pool-empty",
          "pool-unavailable",
          "draw-cancelled",
          "insufficient-coins",
          "failed-precondition",
          "invalid-argument",
          "wallet-incompatible",
          "ledger-incompatible",
          "catalog-outdated",
          "card-art-unavailable",
          "draw-disabled",
          "wallet-not-certified",
          "qualification-pending",
          "qualification-unavailable",
          "qualification-rejected",
        ].includes(error.code)
      )
        finish();
      // Unknown transport outcome or a committed but undisplayed receipt keeps
      // the same ID; a new purchase cannot be silently substituted for recovery.
      throw error;
    }
  }
  return { state, draw, pending, finish };
}
