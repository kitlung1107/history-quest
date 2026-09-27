export type ExplorerCard = { id: string; name: string; image: string; enabled: boolean };
export function availableCards(cards: readonly ExplorerCard[]) {
  return cards.filter(card => card.enabled);
}
/** Selection is independent of legacy avatar and never inferred from identity. */
export function resolveCard(cards: readonly ExplorerCard[], cardId?: string): ExplorerCard | null {
  const available = availableCards(cards);
  return available.find(card => card.id === cardId) || available[0] || null;
}
export function cardIdentity(profile: { className: string; studentNo: string; name: string }) {
  return `${profile.className}(${profile.studentNo})${profile.name}`;
}
