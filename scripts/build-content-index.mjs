import fs from "node:fs";
const root = new URL("../client/src/content/", import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), "utf8"));
const entries = dir =>
  fs
    .readdirSync(new URL(dir, root))
    .filter(f => f.endsWith(".json"))
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
