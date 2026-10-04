import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
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
import { requirePreparedDrawQualification } from "./drawQualification";
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
  const finish = () => localStorage.removeItem(key);
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
  async function draw(): Promise<BrowserDrawReceipt> {
    const requestId = pending() ?? crypto.randomUUID();
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
      const catalog = (
        await getDocFromServer(doc(db, "cardCatalog", "current"))
      ).data();
      if (catalog?.sourceSha256 !== CLIENT_CARD_CATALOG_HASH)
        throw new BrowserDrawError(
          "catalog-outdated",
          "卡庫已更新，請重新整理後再抽；未扣探索幣。"
        );
      const current = await state();
      await decode(
        EXPLORER_CARDS.filter(
          (card) =>
            card.enabled &&
            card.drawEnabled !== false &&
            card.role === current.profile.role &&
            !current.profile.ownedCardIds?.includes(card.id)
        ).map((card) => card.id)
      );
      await requirePreparedDrawQualification(db, sid);
      return await drawBrowserCard(
        db,
        sid,
        requestId,
        CLIENT_CARD_CATALOG_HASH
      );
    } catch (error: any) {
      if (
        !committed &&
        [
          "pool-empty",
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
