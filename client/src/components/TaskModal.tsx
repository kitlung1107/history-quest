/**
 * 設計提醒：閱讀體驗是一張可展開的報紙漫畫內頁；答題後即自動存檔，沒有提交成績按鈕。
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Gamepad2, Sparkles, XCircle } from "lucide-react";
import { Streamdown } from "streamdown";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useScoreSync } from "@/contexts/ScoreSyncContext";
import type { HistoryTask } from "@/lib/historyQuest";

function toEmbedUrl(rawUrl?: string) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "youtu.be") return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`;
    if (url.hostname.endsWith("youtube.com")) {
      const videoId = url.searchParams.get("v");
      return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : rawUrl;
    }
    const driveMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (url.hostname === "drive.google.com" && driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    return rawUrl;
  } catch {
    return null;
  }
}

export default function TaskModal({ task, open, onOpenChange }: { task: HistoryTask | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [started, setStarted] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const { completeTask, progress } = useScoreSync();

  useEffect(() => {
    if (!open) {
      setStarted(false);
      setAnswer(null);
      setSaved(false);
    }
  }, [open]);

  if (!task) return null;
  const completed = progress[task.id]?.progress === 100;
  const videoEmbed = toEmbedUrl(task.videoUrl);
  const gameEmbed = toEmbedUrl(task.gameUrl);

  async function chooseAnswer(index: number) {
    if (answer !== null) return;
    setAnswer(index);
    const score = index === task!.question.answer ? 100 : 60;
    await completeTask(task!, score);
    setSaved(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="task-dialog max-h-[92vh] max-w-5xl overflow-y-auto p-0">
        <div className={`task-masthead task-${task.accent}`}>
          <img src={task.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-multiply" />
          <div className="relative z-10 p-6 md:p-9">
            <span className="comic-kicker inline-flex items-center gap-2"><Gamepad2 className="h-4 w-4" />{task.label}</span>
            <DialogHeader className="mt-4 text-left">
              <DialogTitle className="display-title max-w-2xl text-4xl text-ink md:text-5xl">{task.title}</DialogTitle>
              <DialogDescription className="mt-2 max-w-2xl text-base font-bold text-ink/75">{task.description}</DialogDescription>
            </DialogHeader>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-black text-ink"><span className="meta-chip"><Clock3 className="h-4 w-4" />約 {task.duration} 分鐘</span><span className="meta-chip">難度 {"★".repeat(task.difficulty)}{"☆".repeat(5 - task.difficulty)}</span>{completed && <span className="meta-chip bg-teal text-white"><CheckCircle2 className="h-4 w-4" />已完成</span>}</div>
          </div>
        </div>
        <div className="paper-texture p-6 md:p-9">
          {!started ? (
            <div className="mx-auto max-w-2xl py-8 text-center">
              <div className="pixel-icon mx-auto">!</div>
              <h3 className="display-title mt-5 text-3xl text-ink">史料已準備好</h3>
              <p className="mx-auto mt-3 max-w-xl text-ink/70">閱讀資料後完成一題快問。選擇答案的一刻，系統會自動記錄進度，不需要另外提交。</p>
              <button className={`pixel-button mt-7 ${task.accent === "red" ? "pixel-button-red" : task.accent === "gold" ? "pixel-button-gold" : "pixel-button-teal"}`} onClick={() => setStarted(true)}><Gamepad2 className="h-5 w-5" />開始挑戰</button>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl">
              <article className="history-prose"><Streamdown>{task.article}</Streamdown></article>
              {videoEmbed && <div className="embed-frame mt-7"><iframe src={videoEmbed} title={`${task.title} 教學影片`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" /></div>}
              {gameEmbed && <div className="mt-7"><p className="comic-kicker mb-3">HTML5 互動關卡</p><div className="embed-frame"><iframe src={gameEmbed} title={`${task.title} 互動遊戲`} sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups" allowFullScreen loading="lazy" /></div></div>}
              <section className="quiz-panel mt-9" aria-labelledby="quick-question">
                <p className="comic-kicker inline-flex items-center gap-2"><Sparkles className="h-4 w-4" />讀畢快問</p>
                <h3 id="quick-question" className="display-title mt-4 text-2xl text-ink">{task.question.prompt}</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {task.question.options.map((option, index) => {
                    const isCorrect = answer !== null && index === task.question.answer;
                    const isWrong = answer === index && index !== task.question.answer;
                    return <button key={option} disabled={answer !== null} onClick={() => void chooseAnswer(index)} className={`answer-tile ${isCorrect ? "answer-correct" : ""} ${isWrong ? "answer-wrong" : ""}`}><span>{String.fromCharCode(65 + index)}</span>{option}{isCorrect && <CheckCircle2 className="ml-auto h-5 w-5" />}{isWrong && <XCircle className="ml-auto h-5 w-5" />}</button>;
                  })}
                </div>
                {answer !== null && <div className={`result-strip mt-5 ${answer === task.question.answer ? "bg-teal/15" : "bg-gold/20"}`}><strong>{answer === task.question.answer ? "答對了！" : "差一點！"}</strong> {task.question.explanation}{saved && <span className="mt-2 block font-black text-teal">✓ 成績已進入自動儲存程序</span>}</div>}
              </section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
