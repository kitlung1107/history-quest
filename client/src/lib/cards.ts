import catalogue from "@/content/settings/cards.json";
import type { ExplorerCard } from "./cardModel";
export const EXPLORER_CARDS: ExplorerCard[] = (catalogue as { cards?: ExplorerCard[] | null }).cards ?? [];
