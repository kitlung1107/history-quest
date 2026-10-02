import catalogue from "@/content/settings/backgrounds.json";
import type { CardBackground } from "./cardBackground";

export const CARD_BACKGROUNDS: CardBackground[] =
  (catalogue as { backgrounds?: CardBackground[] | null }).backgrounds ?? [];
