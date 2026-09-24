import { useState } from "react";
import { Link } from "wouter";
import { mediaUrl } from "@/lib/siteSettings";
import index from "../../public/cms/content-index.json";
type Entry = {
  task_id: string;
  title: string;
  topicId: string;
  visible: boolean;
  featured: boolean;
  order: number;
  image: string;
  description: string;
};
const tasks = Object.entries(
  import.meta.glob("../content/tasks/*.json", {
    eager: true,
    import: "default",
  }) as Record<string, Entry>
).map(([path, task]) => ({
  ...task,
  slug: path
    .split("/")
    .pop()!
    .replace(/\.json$/, ""),
}));
const cms = `${import.meta.env.BASE_URL}cms/index.html`;
export default function ContentLibrary() {
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("order");
  const [images, setImages] = useState(false);
  const visible = tasks
    .filter(t => {
      const parent = index.topics.find(p => p.id === t.topicId);
      const publicTask = t.visible && parent?.visible && parent?.gradeVisible;
      return (
        (!grade || String(parent?.grade) === grade) &&
        (!topic || t.topicId === topic) &&
        (!status ||
          (status === "public"
            ? publicTask
            : status === "featured"
              ? t.featured
              : !publicTask)) &&
        `${t.title} ${t.task_id} ${t.description} ${parent?.title}`
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "zh-Hant")
        : a.order - b.order || a.title.localeCompare(b.title, "zh-Hant")
    );
  const pictureEntries = Object.entries(index.images).filter(([src, labels]) =>
    `${src} ${labels.join(" ")}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <main className="admin-page min-h-screen p-4 md:p-7">
      <header className="admin-masthead mx-auto max-w-7xl">
        <p className="comic-kicker">教材編輯室</p>
        <h1 className="display-title my-3 text-3xl">教材搜尋與圖片目錄</h1>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin" className="pixel-button pixel-button-paper">
            返回教師後台
          </Link>
          <a href={cms} className="pixel-button pixel-button-teal">
            開啟教材編輯器
          </a>
        </div>
        <p className="mt-3 text-sm">
          顯示上次網站建置的教材；CMS
          尚未發佈的改動需等建置完成。編輯及調整次序請在 CMS 儲存。
        </p>
      </header>
      <section className="admin-panel mx-auto mt-5 max-w-7xl p-5">
        <div className="mb-4 flex gap-3">
          <button
            className={`pixel-button ${!images ? "pixel-button-teal" : "pixel-button-paper"}`}
            onClick={() => setImages(false)}
          >
            教材
          </button>
          <button
            className={`pixel-button ${images ? "pixel-button-teal" : "pixel-button-paper"}`}
            onClick={() => setImages(true)}
          >
            圖片與使用位置
          </button>
        </div>
        <label className="block">
          搜尋標題、識別碼或關鍵字
          <input
            className="comic-input mt-1 w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        {!images && (
          <div className="my-4 grid gap-3 sm:grid-cols-4">
            <label>
              年級
              <select
                className="comic-input block w-full"
                value={grade}
                onChange={e => {
                  setGrade(e.target.value);
                  setTopic("");
                }}
              >
                <option value="">全部年級</option>
                {[1, 2, 3, 4, 5, 6].map(g => (
                  <option key={g} value={g}>
                    中{g}
                  </option>
                ))}
              </select>
            </label>
            <label>
              課題
              <select
                className="comic-input block w-full"
                value={topic}
                onChange={e => setTopic(e.target.value)}
              >
                <option value="">全部課題</option>
                {index.topics
                  .filter(t => !grade || String(t.grade) === grade)
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              顯示狀態
              <select
                className="comic-input block w-full"
                value={status}
                onChange={e => setStatus(e.target.value)}
              >
                <option value="">全部</option>
                <option value="public">學生可見</option>
                <option value="hidden">未公開／被隱藏</option>
                <option value="featured">首頁精選設定</option>
              </select>
            </label>
            <label>
              排序
              <select
                className="comic-input block w-full"
                value={sort}
                onChange={e => setSort(e.target.value)}
              >
                <option value="order">顯示次序</option>
                <option value="title">標題</option>
              </select>
            </label>
          </div>
        )}
        <p className="my-3" role="status">
          共 {images ? pictureEntries.length : visible.length} 項
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {images
            ? pictureEntries.map(([src, labels]) => (
                <article key={src} className="border-2 border-ink p-4">
                  <img
                    src={mediaUrl(src)}
                    alt="素材縮圖"
                    className="mb-3 h-36 w-full object-contain"
                    loading="lazy"
                  />
                  <ul>
                    {labels.map((label, i) => (
                      <li key={i}>{label}</li>
                    ))}
                  </ul>
                  <a
                    className="mt-3 inline-block underline"
                    href={mediaUrl(src)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    開啟原圖
                  </a>
                </article>
              ))
            : visible.map(t => {
                const parent = index.topics.find(p => p.id === t.topicId);
                return (
                  <article key={t.task_id} className="border-2 border-ink p-4">
                    <p className="text-sm">
                      中{parent?.grade || "？"} ·{" "}
                      {parent?.title || "課題不存在"} · 次序 {t.order}
                    </p>
                    <h2 className="my-2 text-xl font-black">{t.title}</h2>
                    <p className="break-all text-xs">{t.task_id}</p>
                    <p className="my-3">{t.description}</p>
                    <p>
                      {t.visible && parent?.visible && parent?.gradeVisible
                        ? "學生可見"
                        : "未公開／被隱藏"}
                      {t.featured ? " · 首頁精選" : ""}
                    </p>
                    <a
                      className="pixel-button pixel-button-paper mt-3"
                      href={`${cms}#/collections/tasks/entries/${encodeURIComponent(t.slug)}`}
                    >
                      編輯教材
                    </a>
                  </article>
                );
              })}
        </div>
        {!(images ? pictureEntries.length : visible.length) && (
          <p className="p-6 text-center">沒有符合條件的內容，請調整篩選。</p>
        )}
      </section>
    </main>
  );
}
