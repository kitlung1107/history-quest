import { useOptionalStudentAccount } from "@/contexts/StudentAccount";
import { canPlayGrade } from "@/lib/gradeAccess";
import GradeLock from "./GradeLock";
import ConnectedGame from "./ConnectedGame";
import { gameForTask } from "@/lib/games/registry";
import TaskQuiz from "./TaskQuiz";
import TaskTypeLabel from "./TaskTypeLabel";
import CoinRewardHint from "./CoinRewardHint";
import type { CoinRewardHint as RewardHint } from "@/lib/coinRewardHint";
import { getQuestions } from "@/lib/assessment";
import { mediaUrl } from "@/lib/siteSettings";
/**
 * 閱讀體驗是一張可展開的報紙漫畫內頁；測驗完成後一次提交全部答案。
 */
import { useEffect, useState } from "react";
import { imagePosition } from "@/lib/imagePosition";
import { CheckCircle2, Clock3, ExternalLink, Gamepad2 } from "lucide-react";
import { Streamdown } from "streamdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useScoreSync } from "@/contexts/ScoreSyncContext";
import type { HistoryTask } from "@/lib/historyQuest";

function toEmbedUrl(rawUrl?: string) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "youtu.be")
      return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`;
    if (url.hostname.endsWith("youtube.com")) {
      const videoId = url.searchParams.get("v");
      return videoId
        ? `https://www.youtube-nocookie.com/embed/${videoId}`
        : rawUrl;
    }
    const driveMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (url.hostname === "drive.google.com" && driveMatch)
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    return rawUrl;
  } catch {
    return null;
  }
}

export default function TaskModal({
  task,
  open,
  onOpenChange,
  preview = false,
  reward,
}: {
  reward?: RewardHint | null;
  preview?: boolean;
  task: HistoryTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const account = useOptionalStudentAccount();
  const [started, setStarted] = useState(false);
  const [gameExpanded, setGameExpanded] = useState(false);
  const { progress } = useScoreSync();

  useEffect(() => {
    if (!open) {
      setStarted(false);
      setGameExpanded(false);
    }
  }, [open]);

  if (!task) return null;
  if (!preview && !canPlayGrade(account, task.grade)) return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogTitle>級別未開放</DialogTitle><DialogDescription>請返回探索館切換年級。</DialogDescription><GradeLock identity={account} /></DialogContent></Dialog>;
  const completed = progress[task.id]?.progress === 100;
  const videoEmbed = toEmbedUrl(task.videoUrl);
  const connectedGame = gameForTask(task.id);
  const gameEmbed = toEmbedUrl(task.gameUrl);
  const hasQuiz = task.type !== "game" && getQuestions(task).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={"task-dialog max-h-[92dvh] w-[calc(100%-2rem)] sm:max-w-5xl overflow-y-auto p-0 " + (gameExpanded ? "task-dialog-expanded" : "")}
        showCloseButton={!gameExpanded}
        onPointerDownOutside={event => { if (started && connectedGame) event.preventDefault(); }}
        onInteractOutside={event => { if (started && connectedGame) event.preventDefault(); }}
        onEscapeKeyDown={event => { if (started && connectedGame) event.preventDefault(); }}
      >
        <div className={`task-masthead task-${task.accent}`}>
          <img
            src={mediaUrl(task.image)}
            style={{ objectPosition: imagePosition(task.imagePosition) }}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-multiply"
          />
          <div className="relative z-10 p-6 md:p-9">
            <span className="comic-kicker inline-flex items-center gap-2">
              <TaskTypeLabel type={task.type} />
            </span>
            <DialogHeader className="mt-4 text-left">
              <DialogTitle className="display-title max-w-2xl text-4xl text-ink md:text-5xl">
                {task.title}
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-2xl text-base font-bold text-ink/75">
                {task.description}
              </DialogDescription>
            </DialogHeader>
            <div className="task-reward-meta mt-5 flex flex-wrap items-start gap-3 text-sm font-black text-ink">
              <span className="meta-chip">
                <Clock3 className="h-4 w-4" />約 {task.duration} 分鐘
              </span>
              <span className="meta-chip">
                難度 {"★".repeat(task.difficulty)}
                {"☆".repeat(5 - task.difficulty)}
              </span>
              <CoinRewardHint reward={reward} chip />
              {completed && (
                <span className="meta-chip bg-teal text-white">
                  <CheckCircle2 className="h-4 w-4" />
                  {task.type === "game" ? "舊版測驗已完成" : "已完成"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="task-body paper-texture p-6 md:p-9">
          {!started ? (
            <div className="mx-auto max-w-2xl py-8 text-center">
              <div className="pixel-icon mx-auto">!</div>
              <h3 className="display-title mt-5 text-3xl text-ink">
                史料已準備好
              </h3>
              <p className="mx-auto mt-3 max-w-xl text-ink/70">
                {task.type === "game"
                  ? connectedGame ? "登入後開始遊戲；成功完成每局會保存作答摘要與錯題庫。" : "進入互動遊戲探索。遊戲內表現不會傳送至教師後台。"
                  : hasQuiz
                    ? "完成測驗後提交全部答案。短答題由老師批改。"
                    : "開啟文章，閱讀資料與觀看影片。"}
              </p>
              <button
                className={`pixel-button mt-7 ${task.accent === "red" ? "pixel-button-red" : task.accent === "gold" ? "pixel-button-gold" : "pixel-button-teal"}`}
                onClick={() => setStarted(true)}
              >
                <Gamepad2 className="h-5 w-5" />
                開始挑戰
              </button>
            </div>
          ) : (
            <div
              className={`task-game-container mx-auto ${gameEmbed ? "max-w-none" : "max-w-3xl"}`}
            >
              {task.article && (
                <article className="history-prose">
                  <Streamdown>{task.article}</Streamdown>
                </article>
              )}
              {videoEmbed && (
                <div className="embed-frame mt-7">
                  <iframe
                    src={videoEmbed}
                    title={`${task.title} 教學影片`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              )}
              {connectedGame && <ConnectedGame game={connectedGame} onExpandedChange={setGameExpanded} />}
              {gameEmbed && !connectedGame && (
                <section className="mt-7" aria-label="互動遊戲">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="comic-kicker">HTML5 互動關卡</p>
                    <a
                      className="pixel-button pixel-button-teal text-sm"
                      href={gameEmbed}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                      獨立開啟遊戲（新分頁）
                    </a>
                  </div>
                  <p className="mb-3 text-sm text-ink/75">
                    手機請轉為橫向；畫面太小或未能載入時，可獨立開啟遊戲。先點一下遊戲畫面，再使用方向鍵或
                    WASD；亦可使用遊戲內的觸控按鈕。重新載入會開始新一局。
                  </p>
                  <div className="embed-frame game-embed-frame">
                    <iframe
                      src={gameEmbed}
                      title={`${task.title} 互動遊戲`}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  </div>
                  <p className="mt-4 text-sm font-bold text-ink/75">
                    遊戲內成績不會傳送至教師後台。
                  </p>
                </section>
              )}
              {hasQuiz && (
                <TaskQuiz
                  key={task.id}
                  task={task}
                  preview={
                    preview ||
                    new URLSearchParams(location.search).has("preview")
                  }
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
