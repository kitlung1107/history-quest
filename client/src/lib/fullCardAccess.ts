import { availableCards, resolveCard, type CardCollection, type ExplorerCard } from "./cardModel.ts";

/** UI hint from Firebase ID-token claims; Firestore independently enforces access. */
export function hasFullCardAccess(claims: Record<string, unknown>): boolean {
  const firebase = claims.firebase as { sign_in_provider?: string } | undefined;
  return claims.email_verified === true && firebase?.sign_in_provider === "google.com"
    && (claims.email === "tangkl@ctshkpcc.edu.hk" || claims.email === "kitlung1107@gmail.com");
}

/** Mirror the server's active profile binding; an email alone cannot open a session. */
export function hasFullCardSessionAccess(
  claims: Record<string, unknown>, uid: string, studentId: string,
  access: { enabled?: unknown; studentId?: unknown } | null,
): boolean {
  return hasFullCardAccess(claims) && (access !== null
    ? access.enabled === true && access.studentId === studentId
    : claims.email === "kitlung1107@gmail.com" && studentId === uid);
}

export function availableAccountCards(cards: readonly ExplorerCard[], collection: CardCollection | null | undefined, fullAccess = false) {
  return fullAccess ? cards.filter(card => card.enabled) : availableCards(cards, collection);
}

export function resolveAccountCard(cards: readonly ExplorerCard[], cardId: string | undefined, collection: CardCollection | null | undefined, fullAccess = false) {
  return fullAccess ? availableAccountCards(cards, collection, true).find(card => card.id === cardId) ?? null
    : resolveCard(cards, cardId, collection);
}

/** Presentation only: never persist this derived collection or overwrite the chosen role. */
export function cardDisplayCollection<T extends CardCollection & { cardId?: string }>(cards: readonly ExplorerCard[], profile: T | null | undefined, fullAccess = false): T | null | undefined {
  if (!profile || !fullAccess) return profile;
  const card = resolveAccountCard(cards, profile.cardId, profile, true);
  return { ...profile, role: card?.role ?? profile.role, ownedCardIds: card ? [card.id] : [] };
}
