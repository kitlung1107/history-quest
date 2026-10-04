import {
  collection,
  doc,
  getDocs,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

export type BrowserWallet = {
  schemaVersion: 1;
  balance: number;
  credited: number;
  spent: number;
  creditRevision: number;
  drawRevision: number;
  lastCreditId: string;
  lastRequestId: string;
};
export type BrowserDrawReceipt = {
  requestId: string;
  cardId: string;
  price: number;
  balance: number;
  revision: number;
  role: string;
  catalogHash: string;
  clientCatalogHash: string;
};
export class BrowserDrawError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export const emptyBrowserWallet = (): BrowserWallet => ({
  schemaVersion: 1,
  balance: 0,
  credited: 0,
  spent: 0,
  creditRevision: 0,
  drawRevision: 0,
  lastCreditId: "",
  lastRequestId: "",
});
async function withFreshProof<T>(operation: () => Promise<T>): Promise<T> {
  // Some emulator/optimistic conflicts reach Rules as permission-denied instead
  // of aborted. Re-read boundedly; Rules still evaluate every retried write.
  for (let attempt = 0; ; attempt++)
    try {
      return await operation();
    } catch (error: any) {
      if (
        attempt >= 5 ||
        !["permission-denied", "aborted"].includes(error.code)
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
    }
}
function requireWallet(value: any): BrowserWallet {
  if (
    value?.schemaVersion !== 1 ||
    ![
      value.balance,
      value.credited,
      value.spent,
      value.creditRevision,
      value.drawRevision,
    ].every(Number.isSafeInteger) ||
    value.balance < 0 ||
    value.spent < 0 ||
    value.balance !== value.credited - value.spent
  )
    throw new BrowserDrawError(
      "wallet-incompatible",
      "錢包證據版本不兼容；未有扣幣，請聯絡老師。"
    );
  return value;
}
/** Normal-browser uniform choice. Users can alter this function or their payload;
 * accepted teaching-software tradeoff. Security Rules still enforce eligibility.
 */
export function browserRandomIndex(
  size: number,
  sample = () => crypto.getRandomValues(new Uint32Array(1))[0]
): number {
  if (!Number.isSafeInteger(size) || size < 1 || size > 0xffffffff)
    throw new Error("Invalid pool size");
  const limit = 0x100000000 - (0x100000000 % size);
  let value: number;
  do {
    value = sample();
  } while (value >= limit);
  return value % size;
}
/** Claim one existing immutable positive entry, never edit/mint the entry itself.
 * Rules bind its unique proof and exact wallet delta to the source reward.
 */
export async function claimLedgerCredit(
  db: Firestore,
  sid: string,
  creditId: string
) {
  const walletRef = doc(db, "coinAccounts", sid),
    proofRef = doc(db, "coinAccounts", sid, "creditClaims", creditId);
  return withFreshProof(() =>
    runTransaction(db, async (tx) => {
      const [walletSnap, proof, source] = await Promise.all([
        tx.get(walletRef),
        tx.get(proofRef),
        tx.get(doc(db, "coinAccounts", sid, "entries", creditId)),
      ]);
      const wallet = walletSnap.exists()
        ? requireWallet(walletSnap.data())
        : emptyBrowserWallet();
      if (proof.exists()) return wallet;
      const reward = source.data();
      if (
        !reward ||
        !["taskReward", "gameReward"].includes(reward.kind) ||
        !Number.isSafeInteger(reward.amount) ||
        reward.amount <= 0
      )
        throw new BrowserDrawError(
          "credit-invalid",
          "沒有有效的正數入帳憑證。"
        );
      const next: BrowserWallet = {
        ...wallet,
        balance: wallet.balance + reward.amount,
        credited: wallet.credited + reward.amount,
        creditRevision: wallet.creditRevision + 1,
        lastCreditId: creditId,
      };
      requireWallet(next);
      tx.set(walletRef, next);
      tx.set(proofRef, {
        creditId,
        amount: reward.amount,
        revision: next.creditRevision,
        createdAt: serverTimestamp(),
      });
      return next;
    })
  );
}
export async function prepareBrowserCredits(db: Firestore, sid: string) {
  // Own ledger only; no roster/inventory scan or historical reward rewriting.
  const [ledger, claims] = await Promise.all([
    getDocs(collection(db, "coinAccounts", sid, "entries")),
    getDocs(collection(db, "coinAccounts", sid, "creditClaims")),
  ]);
  const approval = (await getDoc(doc(db, "cardDrawEligibility", sid))).data();
  const legacy = ledger.docs.filter(
    (row) => row.data().amount < 0 && row.data().kind !== "cardDraw"
  );
  if (
    ledger.docs.some((row) => !Number.isSafeInteger(row.data().amount)) ||
    legacy.some(
      (row) =>
        approval?.verified !== true ||
        approval.legacyDebits?.[row.id] !== row.data().amount
    ) ||
    legacy.reduce((n, row) => n - row.data().amount, 0) !==
      (approval?.legacySpent ?? 0)
  )
    throw new BrowserDrawError(
      "ledger-incompatible",
      "帳簿含未支援扣款；未有扣幣，請聯絡老師。"
    );
  if (
    ledger.docs.some(
      (row) => row.data().amount < 0 && row.data().kind === "cardDraw"
    )
  ) {
    const existing = await getDoc(doc(db, "coinAccounts", sid));
    if (!existing.exists())
      throw new BrowserDrawError(
        "ledger-incompatible",
        "舊扣款沒有本協議錢包；抽卡暫停，請聯絡老師。"
      );
    requireWallet(existing.data());
  }
  const claimed = new Set(claims.docs.map((row) => row.id));
  for (const row of ledger.docs)
    if (row.data().amount > 0 && !claimed.has(row.id))
      await claimLedgerCredit(db, sid, row.id);
}
/** Four-write transaction. Optional selector makes the accepted choice risk
 * testable; every selected ID is independently rechecked by Security Rules.
 */
export async function drawBrowserCard(
  db: Firestore,
  sid: string,
  requestId: string,
  clientCatalogHash: string,
  select = (pool: string[]) => pool[browserRandomIndex(pool.length)]
): Promise<BrowserDrawReceipt> {
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(requestId))
    throw new BrowserDrawError("invalid-argument", "請求識別碼無效。");
  const receiptRef = doc(db, "cardDrawReceipts", sid, "requests", requestId);
  // Check an immutable receipt before preparing any new credit evidence.
  const replay = await runTransaction(db, async (tx) => {
    const [saved, catalog] = await Promise.all([
      tx.get(receiptRef),
      tx.get(doc(db, "cardCatalog", "current")),
    ]);
    if (!saved.exists() && catalog.data()?.sourceSha256 !== clientCatalogHash)
      throw new BrowserDrawError(
        "catalog-outdated",
        "卡庫已更新，請重新整理後再抽；未扣探索幣。"
      );
    if (!saved.exists()) {
      const [status, approval] = await Promise.all([
        tx.get(doc(db, "cardDraw", "status")),
        tx.get(doc(db, "cardDrawEligibility", sid)),
      ]);
      if (
        status.data()?.enabled !== true ||
        status.data()?.protocolVersion !== 1
      )
        throw new BrowserDrawError(
          "draw-disabled",
          "抽卡尚未啟用；未扣探索幣。"
        );
      const certified = approval.data();
      if (
        certified?.verified !== true ||
        certified.walletModel !== "immutable-positive-rewards-v1" ||
        certified.openingBalance !== 0
      )
        throw new BrowserDrawError(
          "wallet-not-certified",
          "帳戶資金尚未核實，抽卡暫停；未扣探索幣。"
        );
    }
    return saved.exists() ? (saved.data() as BrowserDrawReceipt) : null;
  });
  if (replay) return replay;
  await prepareBrowserCredits(db, sid);
  return withFreshProof(() =>
    runTransaction(db, async (tx) => {
      const walletRef = doc(db, "coinAccounts", sid),
        profileRef = doc(db, "profiles", sid);
      const [saved, walletSnap, profileSnap, catalogSnap, approvalSnap] =
        await Promise.all([
          tx.get(receiptRef),
          tx.get(walletRef),
          tx.get(profileRef),
          tx.get(doc(db, "cardCatalog", "current")),
          tx.get(doc(db, "cardDrawEligibility", sid)),
        ]);
      if (saved.exists()) return saved.data() as BrowserDrawReceipt;
      const profile = profileSnap.data(),
        catalog = catalogSnap.data();
      if (
        !profile?.configured ||
        !["studentBoy", "studentGirl"].includes(profile.role) ||
        !Array.isArray(profile.ownedCardIds)
      )
        throw new BrowserDrawError("failed-precondition", "請先完成角色設定。");
      if (catalog?.schemaVersion !== 1 || !catalog.cards)
        throw new BrowserDrawError("failed-precondition", "卡池尚未準備好。");
      if (catalog.sourceSha256 !== clientCatalogHash)
        throw new BrowserDrawError(
          "catalog-outdated",
          "卡庫已更新，請重新整理後再抽；未扣探索幣。"
        );
      const pool = Object.entries(catalog.cards)
        .filter(
          ([id, card]: [string, any]) =>
            card.enabled === true &&
            card.drawEnabled !== false &&
            card.role === profile.role &&
            !profile.ownedCardIds.includes(id)
        )
        .map(([id]) => id)
        .sort();
      if (!pool.length)
        throw new BrowserDrawError(
          "pool-empty",
          "已集齊目前可抽取的卡片，請等待卡庫更新；不會扣幣。"
        );
      const wallet = walletSnap.exists()
          ? requireWallet(walletSnap.data())
          : emptyBrowserWallet(),
        price = catalog.drawPrice ?? 100;
      if (!Number.isSafeInteger(price) || price < 1 || price > 100000)
        throw new BrowserDrawError("failed-precondition", "抽卡價格無效。");
      const reserve = approvalSnap.data()?.legacySpent ?? 0;
      if (!Number.isSafeInteger(reserve) || reserve < 0)
        throw new BrowserDrawError(
          "wallet-incompatible",
          "歷史扣款證據不兼容；未扣幣。"
        );
      if (wallet.balance - reserve < price)
        throw new BrowserDrawError(
          "insufficient-coins",
          "探索幣不足，未有扣幣。"
        );
      const cardId = select(pool);
      const receipt: BrowserDrawReceipt = {
        requestId,
        cardId,
        price,
        balance: wallet.balance - reserve - price,
        revision: wallet.drawRevision + 1,
        role: profile.role,
        catalogHash: catalog.sourceSha256,
        clientCatalogHash,
      };
      tx.update(profileRef, {
        ownedCardIds: [...profile.ownedCardIds, cardId],
      });
      tx.set(doc(db, "coinAccounts", sid, "entries", `draw_${requestId}`), {
        kind: "cardDraw",
        requestId,
        cardId,
        amount: -price,
        createdAt: serverTimestamp(),
      });
      tx.set(receiptRef, { ...receipt, createdAt: serverTimestamp() });
      tx.update(walletRef, {
        balance: wallet.balance - price,
        spent: wallet.spent + price,
        drawRevision: receipt.revision,
        lastRequestId: requestId,
      });
      return receipt;
    })
  );
}
