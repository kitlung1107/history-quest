/**
 * 設計提醒：首頁必須忠實呈現方案 A 的漫畫報紙分鏡、三格主題、雙任務卡與底部每日探索帶。
 */
import { useCallback, useMemo, useState } from "react";
import { Award, CalendarDays, ChevronRight, Clock3, Flame, Gamepad2, Newspaper, Sparkles, Trophy } from "lucide-react";
import HistorySidebar from "@/components/HistorySidebar";
import OnboardingGuard from "@/components/OnboardingGuard";
import TaskModal from "@/components/TaskModal";
import { useScoreSync, completedTaskCount } from "@/contexts/ScoreSyncContext";
import { ASSETS, HISTORY_TASKS, topicCards, type HistoryTask, type StudentProfile } from "@/lib/historyQuest";

export default function Home() {
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [activeGrade, setActiveGrade] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<HistoryTask | null>(null);
  const { progress, syncing } = useScoreSync();
  const ready = useCallback((profile: StudentProfile) => setStudent(profile), []);
  const visibleTasks = useMemo(() => activeGrade ? HISTORY_TASKS.filter((task) => task.grade === activeGrade) : HISTORY_TASKS, [activeGrade]);
  const completed = completedTaskCount(progress);
  const points = Object.values(progress).reduce((total, item) => total + Math.round(item.score * 1.28), 0);

  return <div className="min-h-screen bg-ink p-0 md:p-3">
    <OnboardingGuard onReady={ready} />
    {student && <div className="site-frame mx-auto min-h-[calc(100vh-1.5rem)] max-w-[1540px] md:grid md:grid-cols-[292px_1fr]">
      <HistorySidebar student={student} activeGrade={activeGrade} onGradeChange={setActiveGrade} />
      <main className="paper-texture min-w-0 pb-20 md:pb-0">
        <header className="hero-panel relative isolate min-h-[255px] overflow-hidden border-b-4 border-ink md:min-h-[285px]">
          <img src={ASSETS.hero} alt="香港歷史像素漫畫拼貼" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-paper/20" />
          <div className="hero-title-wrap mx-auto mt-10 w-[78%] max-w-4xl bg-paper/90 px-5 py-4 text-center shadow-[8px_8px_0_#172A3A] md:mt-7 md:px-10">
            <p className="text-xs font-black tracking-[0.35em] text-red md:text-sm">香港中學歷史科互動學習平台</p>
            <h1 className="display-title mt-1 text-4xl leading-none text-ink sm:text-6xl lg:text-7xl"><span>歷史</span><span className="text-red">互動探索館</span></h1>
            <p className="pixel-label mt-2 text-ink">✦ History Quest ✦</p>
          </div>
          <div className="absolute right-4 top-4 rounded-sm border-2 border-ink bg-white/95 px-3 py-2 text-sm font-black shadow-[3px_3px_0_#172A3A]">{syncing ? "正在自動存檔…" : "✓ 自動存檔已啟用"}</div>
        </header>

        <div className="p-4 md:p-5 lg:p-7">
          <section aria-label="歷史主題" className="topic-strip grid gap-3 sm:grid-cols-3">
            {topicCards.map((topic) => <button key={topic.grade} className={`topic-card topic-${topic.accent}`} onClick={() => setActiveGrade(topic.grade)}><span className="topic-pixel-icon">{topic.icon}</span><span><strong>{topic.title}</strong><small>{topic.caption}</small></span><ChevronRight className="ml-auto h-5 w-5" /></button>)}
          </section>

          <div className="section-rule my-5"><span>{activeGrade ? `中${["一", "二", "三", "四", "五", "六"][activeGrade - 1]}號外` : "今日精選"}</span></div>

          {visibleTasks.length > 0 ? <section className="grid gap-4 lg:grid-cols-2">
            {visibleTasks.map((task) => {
              const taskProgress = progress[task.id];
              return <article key={task.id} className={`mission-card mission-${task.accent}`}>
                <div className="mission-image"><img src={task.image} alt="" /><span className="comic-kicker"><Newspaper className="h-4 w-4" />{task.label}</span></div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="pixel-label text-red">{task.topic} · 中{["一", "二", "三", "四", "五", "六"][task.grade - 1]}</p>
                  <h2 className="display-title mt-2 text-2xl leading-tight text-ink lg:text-3xl">{task.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-ink/75">{task.description}</p>
                  <div className="mt-auto pt-5">
                    <div className="mb-4 flex items-end justify-between border-t-2 border-dotted border-ink/45 pt-3 text-xs font-bold text-ink"><span className="flex items-center gap-1"><Clock3 className="h-4 w-4" />{task.duration} 分鐘</span><span>難度 <b className="text-gold">{"★".repeat(task.difficulty)}{"☆".repeat(5-task.difficulty)}</b></span></div>
                    {taskProgress && <div className="mb-3"><div className="mb-1 flex justify-between text-xs font-black"><span>學習進度</span><span>{taskProgress.progress}%</span></div><div className="progress-track"><span style={{ width: `${taskProgress.progress}%` }} /></div></div>}
                    <button onClick={() => setSelectedTask(task)} className={`pixel-button w-full ${task.accent === "red" ? "pixel-button-red" : task.accent === "gold" ? "pixel-button-gold" : "pixel-button-teal"}`}><Gamepad2 className="h-5 w-5" />{taskProgress ? "再次探索" : "開始挑戰"}<ChevronRight className="ml-auto h-5 w-5" /></button>
                  </div>
                </div>
              </article>;
            })}
          </section> : <div className="error-panel"><div className="pixel-signal">···</div><h2>📡 歷史檔案修復中，訊號微弱，請稍後再試…</h2><p>這個年級的內容正在整理；你可以先選擇「全部」探索現有任務。</p></div>}

          <section className="daily-strip mt-5">
            <div className="daily-burst"><span>每日<br />探索</span></div>
            <div className="flex min-w-0 flex-1 items-center gap-3"><CalendarDays className="h-8 w-8 shrink-0 text-red" /><div><p className="pixel-label">每日一問</p><p className="line-clamp-2 text-sm font-bold text-ink">香港在 1984 年簽署的中英聯合聲明，確保香港哪方面的高度自治？</p></div></div>
            <div className="stat-cell"><Trophy className="h-8 w-8 text-gold" /><span><small>探索積分</small><strong>{points || 0}</strong></span></div>
            <div className="stat-cell"><Flame className="h-8 w-8 text-red" /><span><small>完成任務</small><strong>{completed}</strong></span></div>
            <div className="hidden items-center gap-2 bg-paper p-3 lg:flex"><div className="pixel-student"><Award /></div><p className="max-w-40 text-sm font-black">繼續探索，解鎖更多歷史成就！</p></div>
          </section>
        </div>
      </main>
      <nav className="mobile-bottom-nav md:hidden"><button onClick={() => setActiveGrade(null)}><Sparkles />探索</button><button onClick={() => visibleTasks[0] && setSelectedTask(visibleTasks[0])}><Gamepad2 />挑戰</button><a href="/admin"><Trophy />教師</a></nav>
    </div>}
    <TaskModal task={selectedTask} open={Boolean(selectedTask)} onOpenChange={(open) => !open && setSelectedTask(null)} />
  </div>;
}
