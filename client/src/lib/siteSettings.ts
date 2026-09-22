import site from "../content/settings/site.json";
import grades from "../content/settings/grades.json";
import { publicTopics, type Topic } from "./contentModel";

export type { Topic } from "./contentModel";
export const SITE_SETTINGS = { ...site, topicCards: site.topicCards ?? [] };
export const GRADES = grades.grades.filter(grade => grade.visible);
export const gradeTitle = (grade: number) =>
  grades.grades.find(item => item.grade === grade)?.title || `中${grade}`;
const modules = import.meta.glob("../content/topics/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Topic>;
export const PUBLIC_TOPICS = publicTopics(Object.values(modules), GRADES);

// Uploaded media uses the Pages prefix in CMS; local preview uses the local base.
export function mediaUrl(url: string) {
  return url.startsWith("/history-quest/")
    ? `${import.meta.env.BASE_URL}${url.slice("/history-quest/".length)}`
    : url;
}
