import fs from "node:fs";
import { z } from "zod";
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
      heroAlt: text,
      studentHeading: text,
      featuredHeading: text,
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
      z.object({
        task_id: id,
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
            explanation: text,
          })
          .refine(q => q.answer < q.options.length, "答案序號超出選項範圍"),
      })
    )
    .parse(entries("tasks"));
  unique(
    tasks.map(t => t.task_id),
    "任務識別碼"
  );
  for (const task of tasks)
    if (!topics.some(topic => topic.id === task.topicId))
      throw new Error(`任務「${task.title}」的課題不存在，請重新選擇課題。`);
  return {
    grades: grades.length,
    topics: topics.length,
    tasks: tasks.length,
    cards: site.topicCards?.length ?? 0,
  };
}

console.log("Content validation passed:", validateContent());
