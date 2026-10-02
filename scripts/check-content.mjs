import fs from "node:fs";
import { z } from "zod";
import {
  backgroundReferenceWarnings,
  cardBackgroundIdSchema,
  validateBackgroundLibrary,
} from "./background-content.mjs";
import "./build-content-index.mjs";
const content = new URL("../client/src/content/", import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, content), "utf8"));
const entries = folder =>
  fs
    .readdirSync(new URL(folder, content))
    .filter(name => name.endsWith(".json"))
    .map(name => read(`${folder}/${name}`));
const text = z.string().trim().min(1);
const id = z.string().regex(/^[A-Za-z0-9_-]{3,80}$/);
const grade = z.number().int().min(1).max(6);
const order = z.number().int().min(0);
const imagePosition = z
  .object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
  .nullish();
const media = z
  .string()
  .refine(
    value =>
      value.startsWith("/history-quest/uploads/") || /^https:\/\//.test(value),
    "圖片必須使用 HTTPS 或上載圖片路徑"
  );
const unique = (values, label) => {
  if (new Set(values).size !== values.length)
    throw new Error(`${label}不可重複`);
};

export function validateContent() {
  const explorerCards = z
    .array(
      z.object({
        id,
        name: text.max(80),
        image: media,
        enabled: z.boolean(),
        role: z.enum(["studentBoy", "studentGirl"]),
        edition: z.enum(["starter", "nile", "stone-age", "kabuki"]),
        backgroundId: cardBackgroundIdSchema,
      })
    )
    .parse(read("settings/cards.json").cards ?? []);
  unique(
    explorerCards.map(card => card.id),
    "收藏卡識別碼"
  );
  const backgrounds = validateBackgroundLibrary(
    read("settings/backgrounds.json")
  );
  for (const warning of backgroundReferenceWarnings(explorerCards, backgrounds))
    console.warn(`Content warning: ${warning}`);
  const grades = z
    .array(z.object({ grade, title: text, visible: z.boolean() }))
    .length(6)
    .parse(read("settings/grades.json").grades);
  unique(
    grades.map(g => g.grade),
    "年級"
  );
  const topics = z
    .array(z.object({ id, title: text, grade, order, visible: z.boolean() }))
    .parse(entries("topics"));
  unique(
    topics.map(t => t.id),
    "課題識別碼"
  );
  const site = z
    .object({
      title: text,
      subtitle: text,
      englishTitle: text,
      logo: media,
      hero: media,
      heroPosition: imagePosition,
      heroAlt: text,
      studentHeading: text,
      allHeading: text,
      emptyMessage: text,
      showTopicCards: z.boolean(),
      showDaily: z.boolean(),
      showStats: z.boolean(),
      dailyLabel: text,
      dailyText: text,
      encouragement: text,
      topicCards: z
        .array(
          z.object({
            grade,
            title: text,
            caption: text,
            icon: text,
            accent: z.enum(["teal", "red", "gold"]),
            visible: z.boolean(),
          })
        )
        .max(6)
        .nullish(),
    })
    .parse(read("settings/site.json"));
  const tasks = z
    .array(
      z
        .object({
          task_id: id,
          type: z.enum(["article", "game", "quiz"]),
          article: z.string().optional(),
          gameUrl: z.string().optional(),
          imagePosition,
          topicId: id,
          title: text,
          order,
          visible: z.boolean(),
          featured: z.boolean(),
          question: z
            .object({
              prompt: text,
              options: z.array(text).min(2).max(6),
              answer: z.number().int().min(0),
              explanation: z.string().optional(),
            })
            .refine(q => q.answer < q.options.length, "答案序號超出選項範圍")
            .optional(),
          questions: z
            .array(
              z
                .object({
                  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
                  type: z.enum(["choice", "short"]),
                  prompt: text.max(2000),
                  points: z.number().int().min(1).max(100),
                  explanation: z.string().max(4000).optional(),
                  options: z.array(text.max(1000)).optional(),
                  answer: z.number().int().optional(),
                })
                .refine(
                  q =>
                    q.type === "short" ||
                    (q.options?.length >= 2 &&
                      q.options?.length <= 6 &&
                      q.answer >= 0 &&
                      q.answer < q.options.length),
                  "選擇題須有 2 至 6 個選項及有效答案序號"
                )
            )
            .max(30)
            .optional(),
        })
        .refine(
          t =>
            t.type !== "quiz" ||
            Boolean(t.questions ? t.questions.length : t.question),
          "小測驗須至少一題"
        )
        .refine(
          t => t.type !== "article" || Boolean(t.article?.trim()),
          "文章正文必填"
        )
        .refine(
          t => t.type !== "game" || /^https:\/\//.test(t.gameUrl || ""),
          "遊戲連結必須使用 HTTPS"
        )
    )
    .parse(entries("tasks"));
  unique(
    tasks.map(t => t.task_id),
    "任務識別碼"
  );
  for (const task of tasks) {
    if (task.questions)
      unique(
        task.questions.map(q => q.id),
        "同一任務的題目識別碼"
      );
    if (!topics.some(topic => topic.id === task.topicId))
      throw new Error(`任務「${task.title}」的課題不存在，請重新選擇課題。`);
  }
  const assets = z
    .array(
      z.object({ id, title: text, category: text, image: media, alt: text })
    )
    .parse(entries("assets"));
  unique(
    assets.map(a => a.id),
    "素材識別碼"
  );
  return {
    grades: grades.length,
    explorerCards: explorerCards.length,
    backgrounds: backgrounds.length,
    topics: topics.length,
    tasks: tasks.length,
    cards: site.topicCards?.length ?? 0,
  };
}

console.log("Content validation passed:", validateContent());
