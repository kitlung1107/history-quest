/** Stable persisted keys: the original four keys must never be renamed. */
export const CHARACTERS = {
  studentBoy: { name: "男學生", image: "student-boy.webp" },
  studentGirl: { name: "女學生", image: "student-girl.webp" },
  explorer: { name: "探險家", image: "explorer.webp" },
  scholar: { name: "學者", image: "scholar.webp" },
  archaeologist: { name: "考古學家", image: "archaeologist.webp" },
  navigator: { name: "航海家", image: "navigator.webp" },
  detective: { name: "歷史偵探", image: "detective.webp" },
  conservator: { name: "文物修復師", image: "conservator.webp" },
  ancientScholar: { name: "古代書生", image: "ancient-scholar.webp" },
  cartographer: { name: "製圖師", image: "cartographer.webp" },
} as const;
export type CharacterKey = keyof typeof CHARACTERS;
export function characterKey(value: unknown): CharacterKey {
  return typeof value === "string" && Object.hasOwn(CHARACTERS, value)
    ? (value as CharacterKey)
    : "explorer";
}
export function characterImage(value: unknown) {
  return `${import.meta.env.BASE_URL}images/characters/${CHARACTERS[characterKey(value)].image}`;
}
