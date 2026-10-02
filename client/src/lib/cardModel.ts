export const STUDENT_ROLES = ["studentBoy", "studentGirl"] as const;
export type StudentRole = (typeof STUDENT_ROLES)[number];
export type CardCollection = { role?: StudentRole; ownedCardIds?: string[] };
export type ExplorerCard = {
  id: string;
  name: string;
  image: string;
  enabled: boolean;
  role: StudentRole;
  edition: "starter" | "nile" | "stone-age" | "wwi-s3" | "wwi-s4" | "hk-port" | "age-of-discovery";
  /** Shared CMS background reference; older cards have no assignment. */
  backgroundId?: string | null;
};
export function isStudentRole(value: unknown): value is StudentRole {
  return value === "studentBoy" || value === "studentGirl";
}
export function giftCards(role: StudentRole, className: string): string[] {
  const suffix = role === "studentBoy" ? "boy" : "girl";
  return [
    `starter-explorer-${suffix}`,
    ...(/^1[A-E]$/.test(className) ? [`nile-explorer-${suffix}`] : []),
  ];
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
  name: string;
  className?: string;
  studentNo?: string;
}) {
  return profile.name;
}
