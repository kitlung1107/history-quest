import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_CARD_CATALOG_HASH } from "virtual:card-draw-catalog";

const mocks = vi.hoisted(() => ({
  getDocFromServer: vi.fn(), getDocsFromServer: vi.fn(), drawBrowserCard: vi.fn(), decode: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDocFromServer: mocks.getDocFromServer, getDoc: mocks.getDocFromServer,
  getDocsFromServer: mocks.getDocsFromServer, getDocs: mocks.getDocsFromServer,
  onSnapshot: vi.fn(), runTransaction: vi.fn(), serverTimestamp: vi.fn(),
}));
vi.mock("./browserDraw", async importOriginal => ({
  ...await importOriginal<typeof import("./browserDraw")>(), drawBrowserCard: mocks.drawBrowserCard,
}));
vi.mock("./cards", () => ({ EXPLORER_CARDS: [{ id: "boy-card", image: "/boy.png" }] }));
vi.mock("./siteSettings", () => ({ mediaUrl: (value: string) => value }));

import { BrowserDrawError } from "./browserDraw";
import { createCardDrawClient } from "./cardDrawClient";
import { checkDrawAvailability, reminderForDrawError, type DrawAvailabilityInput } from "./drawAvailability";

let input: DrawAvailabilityInput;
let receipt: any;
let storage: Map<string, string>;
const db = { app: { options: { projectId: "demo-reminder-tests" } } } as any;
const ledgerSnapshot = () => ({ docs: input.ledger.map(row => ({ id: row.id, data: () => row })) });

beforeEach(() => {
  vi.clearAllMocks();
  input = {
    profile: { configured: true, role: "studentBoy", ownedCardIds: ["starter-boy"] },
    catalog: { schemaVersion: 1, sourceSha256: CLIENT_CARD_CATALOG_HASH, drawPrice: 100, cards: {
      "boy-card": { enabled: true, drawEnabled: true, role: "studentBoy" },
      "girl-card": { enabled: true, drawEnabled: true, role: "studentGirl" },
      "disabled-boy": { enabled: false, drawEnabled: true, role: "studentBoy" },
      "manual-boy": { enabled: true, drawEnabled: false, role: "studentBoy" },
    } },
    qualification: { verified: true, walletModel: "immutable-positive-rewards-v1", openingBalance: 0, legacySpent: 0 },
    status: { enabled: true, protocolVersion: 1 },
    ledger: [{ id: "reward", amount: 200, kind: "taskReward" }], expectedCatalogHash: CLIENT_CARD_CATALOG_HASH,
  };
  receipt = undefined;
  storage = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal("Image", class { src = ""; decode = mocks.decode; });
  mocks.decode.mockResolvedValue(undefined);
  mocks.getDocFromServer.mockImplementation(async ({ path }) => {
    const data = path.startsWith("cardDrawReceipts/") ? receipt : ({
      "cardCatalog/current": input.catalog, "profiles/student": input.profile,
      "cardDrawEligibility/student": input.qualification, "cardDraw/status": input.status,
    } as Record<string, unknown>)[path];
    return { exists: () => data !== undefined, data: () => data };
  });
  mocks.getDocsFromServer.mockImplementation(async () => ledgerSnapshot());
  mocks.drawBrowserCard.mockImplementation(async (_db, _sid, requestId) => ({ requestId, cardId: "boy-card", price: 100, balance: 100 }));
});

describe("read-only reminders before a new purchase", () => {
  it.each(["poor", "complete", "both"])("%s does not enter the transaction or decode card art", async scenario => {
    if (scenario !== "poor") input.profile.ownedCardIds.push("boy-card");
    if (scenario !== "complete") input.ledger[0].amount = 0;
    const code = scenario === "poor" ? "insufficient-coins" : "pool-empty";
    const client = createCardDrawClient(db, "student", "student", "student@example.test");
    await expect(client.draw()).rejects.toMatchObject({ code });
    expect(mocks.drawBrowserCard).not.toHaveBeenCalled();
    expect(mocks.decode).not.toHaveBeenCalled();
    expect(client.pending()).toBeUndefined();
    expect(input.ledger[0].amount).toBe(scenario === "complete" ? 200 : 0);
  });

  it("uses role-specific, enabled and drawable server cards, with completion before low balance", () => {
    input.profile.ownedCardIds.push("boy-card"); input.ledger[0].amount = 0;
    expect(checkDrawAvailability(input)).toEqual({ reminder: "complete", cardIds: [] });
  });

  it.each([
    ["missing catalogue", (x: DrawAvailabilityInput) => { x.catalog = undefined; }, "failed-precondition"],
    ["empty role pool", (x: DrawAvailabilityInput) => { delete x.catalog.cards["boy-card"]; }, "pool-unavailable"],
    ["stale catalogue", (x: DrawAvailabilityInput) => { x.catalog.sourceSha256 = "old"; }, "catalog-outdated"],
    ["unprepared profile", (x: DrawAvailabilityInput) => { x.profile = undefined; }, "failed-precondition"],
    ["unverified qualification", (x: DrawAvailabilityInput) => { x.qualification.verified = false; }, "qualification-rejected"],
    ["unreadable balance", (x: DrawAvailabilityInput) => { x.ledger[0].amount = NaN; }, "ledger-incompatible"],
    ["disabled draw", (x: DrawAvailabilityInput) => { x.status.enabled = false; }, "draw-disabled"],
  ] as const)("%s cannot become a completion reminder or purchase", async (_label, change, code) => {
    change(input);
    const client = createCardDrawClient(db, "student", "student", "student@example.test");
    await expect(client.draw()).rejects.toMatchObject({ code });
    expect(reminderForDrawError({ code })).toBeUndefined();
    expect(mocks.drawBrowserCard).not.toHaveBeenCalled();
  });

  it("permission errors remain errors and do not enter a purchase", async () => {
    mocks.getDocsFromServer.mockRejectedValueOnce(new BrowserDrawError("permission-denied", "denied"));
    await expect(createCardDrawClient(db, "student", "student", "").draw()).rejects.toMatchObject({ code: "permission-denied" });
    expect(reminderForDrawError({ code: "permission-denied" })).toBeUndefined();
    expect(mocks.drawBrowserCard).not.toHaveBeenCalled();
  });

  it("includes verified historical debits in the available balance without credit preparation", async () => {
    input.qualification.legacySpent = 150;
    input.qualification.legacyDebits = { legacy: -150 };
    input.ledger.push({ id: "legacy", amount: -150, kind: "oldDebit" });
    mocks.getDocsFromServer.mockResolvedValueOnce({ docs: input.ledger.map(row => ({
      id: row.id, data: () => ({ ...row, id: "payload-id-is-not-document-id" }),
    })) });
    await expect(createCardDrawClient(db, "student", "student", "").draw()).rejects.toMatchObject({ code: "insufficient-coins" });
    expect(mocks.drawBrowserCard).not.toHaveBeenCalled();
  });
});

describe("existing purchase, recovery and leaving the page", () => {
  it("reads fresh server data then uses the unchanged transaction exactly once", async () => {
    const client = createCardDrawClient(db, "student", "student", "");
    await expect(client.draw()).resolves.toMatchObject({ cardId: "boy-card", price: 100 });
    expect(mocks.getDocsFromServer).toHaveBeenCalledOnce();
    expect(mocks.decode).toHaveBeenCalledOnce();
    expect(mocks.drawBrowserCard).toHaveBeenCalledOnce();
    expect(mocks.drawBrowserCard).toHaveBeenCalledWith(db, "student", client.pending(), CLIENT_CARD_CATALOG_HASH);
  });

  it("typed backend insufficient rejection is a reminder with no new receipt or collection", async () => {
    const before = structuredClone(input);
    mocks.drawBrowserCard.mockRejectedValueOnce(new BrowserDrawError("insufficient-coins", "balance changed"));
    const client = createCardDrawClient(db, "student", "student", "");
    let caught: unknown;
    try { await client.draw(); } catch (error) { caught = error; }
    expect(reminderForDrawError(caught)).toBe("insufficient");
    expect(input).toEqual(before); expect(receipt).toBeUndefined(); expect(client.pending()).toBeUndefined();
  });

  it("recovers a committed pending receipt before checking low balance or an owned pool", async () => {
    const client = createCardDrawClient(db, "student", "student", "");
    mocks.drawBrowserCard.mockRejectedValueOnce(new Error("lost response"));
    await expect(client.draw()).rejects.toThrow("lost response");
    const requestId = client.pending();
    receipt = { requestId, cardId: "boy-card", price: 100, balance: 0 };
    input.profile.ownedCardIds.push("boy-card"); input.ledger[0].amount = 0;
    await expect(client.draw()).resolves.toEqual(receipt);
    expect(mocks.drawBrowserCard).toHaveBeenCalledOnce();
    expect(client.pending()).toBe(requestId);
  });

  it("aborting while server data loads prevents a late purchase and clears its uncommitted request", async () => {
    const controller = new AbortController();
    mocks.getDocsFromServer.mockImplementationOnce(async () => { controller.abort(); return ledgerSnapshot(); });
    const client = createCardDrawClient(db, "student", "student", "");
    await expect(client.draw(controller.signal)).rejects.toMatchObject({ code: "draw-cancelled" });
    expect(mocks.drawBrowserCard).not.toHaveBeenCalled(); expect(client.pending()).toBeUndefined();
  });

  it("aborting while images decode prevents a late purchase", async () => {
    const controller = new AbortController();
    mocks.decode.mockImplementationOnce(async () => { controller.abort(); });
    const client = createCardDrawClient(db, "student", "student", "");
    await expect(client.draw(controller.signal)).rejects.toMatchObject({ code: "draw-cancelled" });
    expect(mocks.drawBrowserCard).not.toHaveBeenCalled();
  });

  it("a cancelled old panel cannot erase a pending ID adopted by a new panel", async () => {
    const controller = new AbortController();
    let release!: () => void, entered!: () => void;
    const reading = new Promise<void>(resolve => { entered = resolve; });
    mocks.getDocsFromServer.mockImplementationOnce(async () => {
      entered(); await new Promise<void>(resolve => { release = resolve; }); return ledgerSnapshot();
    });
    const oldClient = createCardDrawClient(db, "student", "student", "");
    const oldDraw = oldClient.draw(controller.signal);
    await reading;
    const requestId = oldClient.pending(); controller.abort();
    const newClient = createCardDrawClient(db, "student", "student", "");
    mocks.drawBrowserCard.mockRejectedValueOnce(new Error("lost response"));
    await expect(newClient.draw()).rejects.toThrow("lost response");
    release(); await expect(oldDraw).rejects.toMatchObject({ code: "draw-cancelled" });
    expect(newClient.pending()).toBe(requestId); expect(mocks.drawBrowserCard).toHaveBeenCalledOnce();
  });
});
