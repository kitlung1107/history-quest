import { localAssessments } from "@/lib/localAssessment";
import {
  SITE_SETTINGS as defaults,
  PUBLIC_TOPICS,
  gradeTitle,
  mediaUrl,
} from "@/lib/siteSettings";
import GradeLock from "@/components/GradeLock";
import HomeHeroImage from "@/components/HomeHeroImage";
import { EXPLORER_CARDS } from "@/lib/cards";
import { CARD_BACKGROUNDS } from "@/lib/cardBackgrounds";
import { resolveCardBackground } from "@/lib/cardBackground";
import { cardDisplayCollection } from "@/lib/fullCardAccess";
import { canPlayGrade, canSeeGrade, studentGrade, hasAllGradeAccess } from "@/lib/gradeAccess";
import { filterTasks } from "@/lib/contentModel";
import { imagePosition } from "@/lib/imagePosition";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  Gamepad2,
  Newspaper,
  Sparkles,
  Trophy,
} from "lucide-react";
import HistorySidebar from "@/components/HistorySidebar";
import CoinDrawPanel from "@/components/CoinDrawPanel";
import {
  useOptionalStudentAccount,
  type CloudProfile,
} from "@/contexts/StudentAccount";
import TaskModal from "@/components/TaskModal";
import TaskTypeLabel from "@/components/TaskTypeLabel";
import CoinRewardHint from "@/components/CoinRewardHint";
import { useTaskCoinRewards } from "@/hooks/useTaskCoinRewards";
import type { CoinRule } from "@/lib/coinModel";
import { useScoreSync } from "@/contexts/ScoreSyncContext";
import {
  HISTORY_TASKS,
  type HistoryTask,
  type StudentProfile,
} from "@/lib/historyQuest";

export default function Home({
  previewSettings,
  previewTasks,
  previewProfile,
  previewFullCardAccess = false,
  previewCoinRules,
  onChangeCharacter,
  coinDrawDemo = false,
  initialCoinDrawOpen = false,
  initialSidebarOpen = false,
}: {
  previewSettings?: typeof defaults;
  previewTasks?: HistoryTask[];
  previewProfile?: CloudProfile;
  previewFullCardAccess?: boolean;
  previewCoinRules?: Record<string, CoinRule>;
  onChangeCharacter?: () => void;
  coinDrawDemo?: boolean;
  initialCoinDrawOpen?: boolean;
  initialSidebarOpen?: boolean;
} = {}) {
  const settings = previewSettings || defaults;
  const account = useOptionalStudentAccount();
  const background = resolveCardBackground(
    EXPLORER_CARDS,
    CARD_BACKGROUNDS,
    cardDisplayCollection(EXPLORER_CARDS, previewSettings ? previewProfile : account?.profile,
      previewSettings ? previewFullCardAccess : account?.fullCardAccess)
  );
  const heroImage = background?.image || settings.hero;
  const student: StudentProfile | null = previewSettings
    ? previewProfile || { className: "預覽", name: "學生畫面", studentNo: "" }
    : account?.profile || (account?.teacher ? { className: "", name: "教師／管理員", studentNo: "" } : null);
  const identity = previewSettings ? { ...account, profile: student } : account;
  const allowed = (task: HistoryTask) => canPlayGrade(identity, task.grade);
  const [activeGrade, setActiveGrade] = useState<number | null>(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(initialSidebarOpen);
  const [coinDrawOpen, setCoinDrawOpen] = useState(initialCoinDrawOpen);
  useEffect(() => {
    document.title = settings.title;
  }, [settings.title]);
  const changeGrade = (grade: number | null) => {
    setCoinDrawOpen(false);
    setActiveGrade(grade);
    setActiveTopic(null);
  };
  const [selectedTask, setSelectedTask] = useState<HistoryTask | null>(()=>localAssessments ? HISTORY_TASKS.find(t=>t.id===new URLSearchParams(location.search).get("assessmentTask"))??null : null);
  useEffect(() => {
    if (activeGrade !== null && !canSeeGrade(identity, activeGrade)) {
      setActiveGrade(null);
      setActiveTopic(null);
    }
    if (selectedTask && !canPlayGrade(identity, selectedTask.grade)) setSelectedTask(null);
  }, [student?.className, account?.teacher, account?.testingAccount, activeGrade, selectedTask]);
  const { progress, syncing, syncError, retry } = useScoreSync();
  const visibleTasks = useMemo(
    () =>
      filterTasks(
        (previewTasks || HISTORY_TASKS).filter(task => canSeeGrade(identity, task.grade) && (activeGrade !== null || allowed(task))),
        activeGrade,
        activeTopic
      ),
    [activeGrade, activeTopic, previewTasks, student, account?.teacher, account?.testingAccount]
  );
  const locked = activeGrade !== null ? !canPlayGrade(identity, activeGrade) : !hasAllGradeAccess(identity) && studentGrade(student?.className) === null;
  const rewards = useTaskCoinRewards(visibleTasks, Boolean(previewSettings), previewCoinRules);
  const openTask = (task: HistoryTask) => { if (allowed(task)) setSelectedTask(task); };
  const sectionTitle = activeTopic
    ? PUBLIC_TOPICS.find(topic => topic.id === activeTopic)?.title
    : activeGrade !== null
      ? gradeTitle(activeGrade)
      : settings.allHeading;

  return (
    <div className="manga-home min-h-screen">
      {student && (
        <div
          className="site-frame mx-auto min-h-screen max-w-[1600px]"
          data-sidebar-open={desktopSidebarOpen}
        >
          <HistorySidebar
            desktopOpen={desktopSidebarOpen}
            onDesktopOpenChange={setDesktopSidebarOpen}
            previewSettings={previewSettings}
            previewProfile={previewProfile}
            previewFullCardAccess={previewFullCardAccess}
            onChangeCharacter={onChangeCharacter}
            onCoinDraw={() => setCoinDrawOpen(true)}
            coinDrawDemo={import.meta.env.DEV && coinDrawDemo}
            student={student}
            activeGrade={activeGrade}
            onGradeChange={changeGrade}
            activeTopic={activeTopic}
            onTopicChange={(grade, topic) => {
              setCoinDrawOpen(false);
              setActiveGrade(grade);
              setActiveTopic(topic);
            }}
          />
          <main className={`home-main min-w-0 pb-20 md:pb-6 ${coinDrawOpen ? "coin-draw-main" : ""}`}>
            {coinDrawOpen ? <CoinDrawPanel demo={coinDrawDemo} /> : <>
            <div className="home-status" role="status">
              {previewSettings ? (
                "預覽模式 · 不儲存成績"
              ) : syncing ? (
                "正在自動存檔…"
              ) : syncError ? (
                <>
                  <span>尚未完成同步</span>
                  <button onClick={() => void retry()}>重試同步</button>
                </>
              ) : null}
            </div>
            <header className="hero-panel relative isolate overflow-hidden">
              <HomeHeroImage
                key={heroImage}
                image={heroImage}
                alt={background?.name || settings.heroAlt}
                fallback={settings.hero}
                fallbackAlt={settings.heroAlt}
                position={settings.heroPosition}
              />
              <div className="hero-title-wrap">
                <h1 className="display-title">{settings.title}</h1>
                <p className="hero-subtitle hero-english-subtitle" lang="en">History Discovery Center</p>
              </div>
            </header>

            <div className="grade-content">
            <div className="p-4 md:p-5 lg:p-7" inert={locked} aria-hidden={locked || undefined}>
              <div className="section-rule my-5">
                <BookOpen aria-hidden="true" />
                <h2>{sectionTitle}</h2>
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
                            <TaskTypeLabel type={task.type} />
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
                            <div className="mission-meta mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-t-2 border-dotted border-ink/45 pt-3 text-xs font-bold text-ink">
                              <span className="flex shrink-0 items-center gap-1">
                                <Clock3 className="h-4 w-4" />
                                {task.duration} 分鐘
                              </span>
                              <div className={`mission-reward-difficulty${rewards[task.id] ? " has-reward" : ""}`}>
                                  <CoinRewardHint reward={rewards[task.id]} />
                                  <span className="mission-difficulty shrink-0">
                                    難度{" "}
                                    <b className="text-gold">
                                      {"★".repeat(task.difficulty)}
                                      {"☆".repeat(5 - task.difficulty)}
                                    </b>
                                  </span>
                              </div>
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
                              disabled={!allowed(task)}
                              onClick={() => openTask(task)}
                              className="pixel-button pixel-button-gold w-full"
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

              {settings.showDaily && (
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
                </section>
              )}
            </div>
            {locked && <GradeLock identity={identity} />}
            </div>
            </>}
          </main>
          <nav className="mobile-bottom-nav md:hidden">
            <button onClick={() => changeGrade(null)}>
              <Sparkles />
              探索
            </button>
            <button
              onClick={() =>
                visibleTasks[0] && openTask(visibleTasks[0])
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
        reward={selectedTask ? rewards[selectedTask.id] : null}
        preview={Boolean(previewSettings)}
        task={selectedTask}
        open={Boolean(selectedTask)}
        onOpenChange={open => !open && setSelectedTask(null)}
      />
    </div>
  );
}
