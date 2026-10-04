export const STUDENT_ROLES = ["studentBoy", "studentGirl"] as const;
export type StudentRole = (typeof STUDENT_ROLES)[number];
export type CardCollection = { role?: StudentRole; ownedCardIds?: string[] };
export type ExplorerCard = {
  id: string;
  name: string;
  image: string;
  enabled: boolean;
  drawEnabled?: boolean;
  role: StudentRole;
  edition: "starter" | "nile" | "stone-age" | "wwi-s3" | "wwi-s4" | "hk-port" | "age-of-discovery" | "kabuki" | "renaissance";
  /** Shared CMS background reference; older cards have no assignment. */
  backgroundId?: string | null;
};
export function isStudentRole(value: unknown): value is StudentRole {
  return value === "studentBoy" || value === "studentGirl";
}
export function giftCards(role: StudentRole, _className: string): string[] {
  return [role === "studentBoy" ? "starter-explorer-boy" : "starter-explorer-girl"];
}
/** Preserve every existing holding; initialization never replaces inventory. */
export function initialOwnedCards(collection: CardCollection, role: StudentRole, className: string): string[] {
  return collection.role ? [...(collection.ownedCardIds ?? [])]
    : Array.from(new Set([...(collection.ownedCardIds ?? []), ...giftCards(role, className)]));
}
export function availableCards(
  cards: readonly ExplorerCard[],
  collection?: CardCollection | null
) {
  return cards.filter(
    card =>
      card.enabled &&
      isStudentRole(collection?.role) &&
      card.role === collection.role &&
      collection.ownedCardIds?.includes(card.id)
  );
}
/** Fail closed: never substitute a different or unowned card. */
export function resolveCard(
  cards: readonly ExplorerCard[],
  cardId?: string,
  collection?: CardCollection | null
): ExplorerCard | null {
  return (
    availableCards(cards, collection).find(card => card.id === cardId) || null
  );
}
export function cardIdentity(profile: {
  name?: string | null;
  className?: string | null;
  studentNo?: string | null;
}) {
  const name = typeof profile.name === "string" ? profile.name.trim() : "";
  const className = typeof profile.className === "string" ? profile.className.trim() : "";
  const studentNo = typeof profile.studentNo === "string" ? profile.studentNo.trim() : "";
  const classAndNumber = studentNo ? `${className}(${studentNo})` : className;
  const identityName = name || "未設定姓名";
  return classAndNumber ? `${classAndNumber} ${identityName}` : identityName;
}
