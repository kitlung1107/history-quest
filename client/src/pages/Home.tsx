import {
  SITE_SETTINGS as defaults,
  GRADES,
  PUBLIC_TOPICS,
  gradeTitle,
  mediaUrl,
} from "@/lib/siteSettings";
import { filterTasks } from "@/lib/contentModel";
import { imagePosition } from "@/lib/imagePosition";
/**
 * 設計提醒：首頁必須忠實呈現方案 A 的漫畫報紙分鏡、三格主題、雙任務卡與底部每日探索帶。
 */
import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CalendarDays,
  ChevronRight,
  Clock3,
  Flame,
  Gamepad2,
  Newspaper,
  Sparkles,
  Trophy,
} from "lucide-react";
import HistorySidebar from "@/components/HistorySidebar";
import { useOptionalStudentAccount } from "@/contexts/StudentAccount";
import TaskModal from "@/components/TaskModal";
import { useScoreSync, completedTaskCount } from "@/contexts/ScoreSyncContext";
import {
  HISTORY_TASKS,
  type HistoryTask,
  type StudentProfile,
} from "@/lib/historyQuest";

export default function Home({
  previewSettings,
  previewTasks,
}: { previewSettings?: typeof defaults; previewTasks?: HistoryTask[] } = {}) {
  const settings = previewSettings || defaults;
  const topicCards = (settings.topicCards || []).filter(
    card => card.visible && GRADES.some(grade => grade.grade === card.grade)
  );
  const account = useOptionalStudentAccount();
  const student: StudentProfile | null =
    previewSettings
      ? { className: "預覽", name: "學生畫面", studentNo: "" }
      : account?.profile || null;
  const [activeGrade, setActiveGrade] = useState<number | null>(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    document.title = settings.title;
  }, [settings.title]);
  const changeGrade = (grade: number | null) => {
    setActiveGrade(grade);
    setActiveTopic(null);
    setShowAll(grade === null);
  };
  const [selectedTask, setSelectedTask] = useState<HistoryTask | null>(null);
  const { progress, syncing } = useScoreSync();
  const visibleTasks = useMemo(
    () =>
      filterTasks(
        previewTasks || HISTORY_TASKS,
        activeGrade,
        activeTopic,
        showAll
      ),
    [activeGrade, activeTopic, showAll, previewTasks]
  );
  const sectionTitle = activeTopic
    ? PUBLIC_TOPICS.find(topic => topic.id === activeTopic)?.title
    : activeGrade !== null
      ? gradeTitle(activeGrade)
      : showAll
        ? settings.allHeading
        : settings.featuredHeading;
  const completed = completedTaskCount(progress);
  const points = Object.values(progress).reduce(
    (total, item) => total + Math.round(item.score * 1.28),
    0
  );

  return (
    <div className="min-h-screen bg-ink p-0 md:p-3">
      {student && (
        <div className="site-frame mx-auto min-h-[calc(100vh-1.5rem)] max-w-[1540px] md:grid md:grid-cols-[292px_1fr]">
          <HistorySidebar
            previewSettings={previewSettings}
            student={student}
            activeGrade={activeGrade}
            onGradeChange={changeGrade}
            showAll={showAll}
            onFeatured={() => {
              setActiveGrade(null);
              setActiveTopic(null);
              setShowAll(false);
            }}
            activeTopic={activeTopic}
            onTopicChange={(grade, topic) => {
              setActiveGrade(grade);
              setActiveTopic(topic);
            }}
          />
          <main className="paper-texture min-w-0 pb-20 md:pb-0">
            <header className="hero-panel relative isolate min-h-[255px] overflow-hidden border-b-4 border-ink md:min-h-[285px]">
              <img
                src={mediaUrl(settings.hero)}
                alt={settings.heroAlt}
                style={{ objectPosition: imagePosition(settings.heroPosition) }}
                className="absolute inset-0 -z-10 h-full w-full object-cover"
              />
              <div className="absolute inset-0 -z-10 bg-paper/20" />
              <div className="hero-title-wrap mx-auto mt-10 w-[78%] max-w-4xl bg-paper/90 px-5 py-4 text-center shadow-[8px_8px_0_#172A3A] md:mt-7 md:px-10">
                <p className="text-xs font-black tracking-[0.35em] text-red md:text-sm">
                  {settings.subtitle}
                </p>
                <h1 className="display-title mt-1 text-4xl leading-none text-ink sm:text-6xl lg:text-7xl">
                  {settings.title}
                </h1>
                <p className="pixel-label mt-2 text-ink">
                  ✦ {settings.englishTitle} ✦
                </p>
              </div>
              <div className="absolute right-4 top-4 rounded-sm border-2 border-ink bg-white/95 px-3 py-2 text-sm font-black shadow-[3px_3px_0_#172A3A]">
                {previewSettings
                  ? "預覽模式 · 不儲存成績"
                  : syncing
                    ? "正在自動存檔…"
                    : "✓ 自動存檔已啟用"}
              </div>
            </header>

            <div className="p-4 md:p-5 lg:p-7">
              {settings.showTopicCards && topicCards.length > 0 && (
                <section
                  aria-label="歷史主題"
                  className="topic-strip grid gap-3 sm:grid-cols-3"
                >
                  {topicCards.map((topic, index) => (
                    <button
                      key={`${topic.grade}-${index}`}
                      className={`topic-card topic-${topic.accent}`}
                      onClick={() => changeGrade(topic.grade)}
                    >
                      <span className="topic-pixel-icon">{topic.icon}</span>
                      <span>
                        <strong>{topic.title}</strong>
                        <small>{topic.caption}</small>
                      </span>
                      <ChevronRight className="ml-auto h-5 w-5" />
                    </button>
                  ))}
                </section>
              )}

              <div className="section-rule my-5">
                <span>{sectionTitle}</span>
              </div>

              {visibleTasks.length > 0 ? (
                <section className="grid gap-4 lg:grid-cols-2">
                  {visibleTasks.map(task => {
                    const taskProgress = progress[task.id];
                    return (
                      <article
                        key={task.id}
                        className={`mission-card mission-${task.accent}`}
                      >
                        <div className="mission-image">
                          <img
                            src={mediaUrl(task.image)}
                            alt=""
                            style={{
                              objectPosition: imagePosition(task.imagePosition),
                            }}
                          />
                          <span className="comic-kicker">
                            <Newspaper className="h-4 w-4" />
                            {task.label}
                          </span>
                        </div>
                        <div className="flex flex-1 flex-col p-5">
                          <p className="pixel-label text-red">
                            {task.topic} · {gradeTitle(task.grade)}
                          </p>
                          <h2 className="display-title mt-2 text-2xl leading-tight text-ink lg:text-3xl">
                            {task.title}
                          </h2>
                          <p className="mt-3 text-sm leading-6 text-ink/75">
                            {task.description}
                          </p>
                          <div className="mt-auto pt-5">
                            <div className="mb-4 flex items-end justify-between border-t-2 border-dotted border-ink/45 pt-3 text-xs font-bold text-ink">
                              <span className="flex items-center gap-1">
                                <Clock3 className="h-4 w-4" />
                                {task.duration} 分鐘
                              </span>
                              <span>
                                難度{" "}
                                <b className="text-gold">
                                  {"★".repeat(task.difficulty)}
                                  {"☆".repeat(5 - task.difficulty)}
                                </b>
                              </span>
                            </div>
                            {taskProgress && (
                              <div className="mb-3">
                                <div className="mb-1 flex justify-between text-xs font-black">
                                  <span>
                                    {task.gameUrl ? "網站快問進度" : "學習進度"}
                                  </span>
                                  <span>{taskProgress.progress}%</span>
                                </div>
                                <div className="progress-track">
                                  <span
                                    style={{
                                      width: `${taskProgress.progress}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                            <button
                              onClick={() => setSelectedTask(task)}
                              className={`pixel-button w-full ${task.accent === "red" ? "pixel-button-red" : task.accent === "gold" ? "pixel-button-gold" : "pixel-button-teal"}`}
                            >
                              <Gamepad2 className="h-5 w-5" />
                              {taskProgress ? "再次探索" : "開始挑戰"}
                              <ChevronRight className="ml-auto h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ) : (
                <div className="error-panel">
                  <div className="pixel-signal">···</div>
                  <h2>暫時沒有任務</h2>
                  <p>{settings.emptyMessage}</p>
                  <button
                    className="pixel-button pixel-button-paper mt-4"
                    onClick={() => changeGrade(null)}
                  >
                    查看全部任務
                  </button>
                </div>
              )}

              {(settings.showDaily || settings.showStats) && (
                <section className="daily-strip mt-5">
                  {settings.showDaily && (
                    <>
                      <div className="daily-burst">
                        <span>
                          每日
                          <br />
                          探索
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <CalendarDays className="h-8 w-8 shrink-0 text-red" />
                        <div>
                          <p className="pixel-label">{settings.dailyLabel}</p>
                          <p className="line-clamp-2 text-sm font-bold text-ink">
                            {settings.dailyText}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                  {settings.showStats && (
                    <>
                      <div className="stat-cell">
                        <Trophy className="h-8 w-8 text-gold" />
                        <span>
                          <small>探索積分</small>
                          <strong>{points || 0}</strong>
                        </span>
                      </div>
                      <div className="stat-cell">
                        <Flame className="h-8 w-8 text-red" />
                        <span>
                          <small>完成任務</small>
                          <strong>{completed}</strong>
                        </span>
                      </div>
                    </>
                  )}
                  <div className="hidden items-center gap-2 bg-paper p-3 lg:flex">
                    <div className="pixel-student">
                      <Award />
                    </div>
                    <p className="max-w-40 text-sm font-black">
                      {settings.encouragement}
                    </p>
                  </div>
                </section>
              )}
            </div>
          </main>
          <nav className="mobile-bottom-nav md:hidden">
            <button onClick={() => changeGrade(null)}>
              <Sparkles />
              探索
            </button>
            <button
              onClick={() =>
                visibleTasks[0] && setSelectedTask(visibleTasks[0])
              }
            >
              <Gamepad2 />
              挑戰
            </button>
            {!previewSettings && (
              <a href={`${import.meta.env.BASE_URL}admin`}>
                <Trophy />
                教師
              </a>
            )}
          </nav>
        </div>
      )}
      <TaskModal
        preview={Boolean(previewSettings)}
        task={selectedTask}
        open={Boolean(selectedTask)}
        onOpenChange={open => !open && setSelectedTask(null)}
      />
    </div>
  );
}
