import { resolveCard, type CardCollection, type ExplorerCard } from "./cardModel.ts";

export type CardBackground = {
  id: string;
  name: string;
  image: string;
};

/** Derive from the saved, permitted card; never maintain a second selection. */
export function resolveCardBackground(
  cards: readonly ExplorerCard[],
  backgrounds: readonly CardBackground[] | null | undefined,
  profile?: (CardCollection & { cardId?: string }) | null
): CardBackground | null {
  const card = resolveCard(cards, profile?.cardId, profile);
  const backgroundId = typeof card?.backgroundId === "string" ? card.backgroundId.trim() : "";
  if (!backgroundId) return null;
  const background = backgrounds?.find(item => item.id === backgroundId);
  const image = background?.image?.trim();
  const uploads = "/history-quest/uploads/";
  if (!image || !(
    (image.startsWith(uploads) && image.slice(uploads.length).trim()) ||
    (image.startsWith("https://") && image.slice("https://".length).trim())
  )) {
    return null;
  }
  return background ? { ...background, image } : null;
}
