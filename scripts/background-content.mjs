import { z } from "zod";

const backgroundId = z.string().regex(/^[A-Za-z0-9_-]{3,80}$/);

// The tested Sveltia UI clears this single relation to an empty string.
// Accept null/missing values too, across CMS versions and older/manual content.
export const cardBackgroundIdSchema = z
  .string()
  .trim()
  .pipe(z.union([backgroundId, z.literal("")]))
  .nullish();

const backgroundLibrarySchema = z.object({
  backgrounds: z
    .array(
      z.object({
        id: backgroundId,
        name: z.string().trim().min(1).max(80),
        image: z
          .string()
          .trim()
          .refine(
            value =>
              (value.startsWith("/history-quest/uploads/") &&
                value.slice("/history-quest/uploads/".length).trim().length >
                  0) ||
              (value.startsWith("https://") &&
                value.slice("https://".length).trim().length > 0),
            "背景圖片必須使用 HTTPS 或上載圖片路徑"
          ),
      })
    )
    .nullish(),
});

export function validateBackgroundLibrary(data) {
  const backgrounds = backgroundLibrarySchema.parse(data).backgrounds ?? [];
  const ids = backgrounds.map(background => background.id);
  if (new Set(ids).size !== ids.length)
    throw new Error("首頁背景識別碼不可重複");
  return backgrounds;
}

// Missing references are intentionally warnings: deleting a library item must
// remain safe, and the student homepage uses the existing default image.
export function backgroundReferenceWarnings(cards, backgrounds) {
  const ids = new Set(backgrounds.map(background => background.id));
  return cards.flatMap(card =>
    card.backgroundId && !ids.has(card.backgroundId)
      ? [
          `收藏卡「${card.name}」（${card.id}）的背景「${card.backgroundId}」不存在，首頁會使用預設背景。`,
        ]
      : []
  );
}
