import fs from "node:fs";
const root = new URL("../client/src/content/", import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), "utf8"));
const entries = dir =>
  fs
    .readdirSync(new URL(dir, root))
    .filter(f => f.endsWith(".json")&&(process.env.VITE_ASSESSMENT_EMULATORS==='1'||!f.startsWith('local-assessment-')))
    .map(file => ({ file, data: read(`${dir}/${file}`) }));
const grades = read("settings/grades.json").grades;
const topics = entries("topics").map(({ data }) => ({
  ...data,
  gradeVisible: grades.some(g => g.grade === data.grade && g.visible),
}));
const tasks = entries("tasks");
const images = {};
function use(src, label) {
  if (typeof src === "string" && src) (images[src] ||= []).push(label);
}
const site = read("settings/site.json");
use(site.hero, "首頁大圖");
use(site.logo, "網站標誌");
const backgrounds = read("settings/backgrounds.json").backgrounds ?? [];
for (const background of backgrounds)
  use(background.image, `首頁背景庫：${background.name}`);
for (const card of read("settings/cards.json").cards ?? []) {
  use(card.image, `收藏卡：${card.name}`);
  const backgroundId =
    typeof card.backgroundId === "string" ? card.backgroundId.trim() : "";
  const background = backgrounds.find(item => item.id === backgroundId);
  if (background) use(background.image, `收藏卡背景：${card.name}`);
}
for (const { data } of tasks) {
  use(data.image, `任務封面：${data.title}`);
  for (const match of (data.article || "").matchAll(
    /!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g
  ))
    use(match[1], `文章插圖：${data.title}`);
}
for (const { data } of entries("assets"))
  use(data.image, `素材目錄：${data.title}`);
fs.writeFileSync(
  new URL("../client/public/cms/content-index.json", import.meta.url),
  JSON.stringify({ topics, images }, null, 2) + "\n"
);
