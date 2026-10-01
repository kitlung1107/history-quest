import { canSeeGrade } from "@/lib/gradeAccess";
import {
  SITE_SETTINGS as defaults,
  GRADES,
  PUBLIC_TOPICS,
} from "@/lib/siteSettings";
import {
  ChevronRight,
  Grid2X2,
  Menu,
  ShieldCheck,
  UserRoundCog,
  X,
} from "lucide-react";
import { Link } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { type StudentProfile } from "@/lib/historyQuest";
import { googleLogout } from "@/lib/firebase";
import {
  useOptionalStudentAccount,
  type CloudProfile,
} from "@/contexts/StudentAccount";
import ExplorerCard from "@/components/ExplorerCard";
import CoinBalance from "@/components/CoinBalance";
import { EXPLORER_CARDS } from "@/lib/cards";
import { resolveCard } from "@/lib/cardModel";
import { useEffect, useId, useRef, useState } from "react";

type SidebarProps = {
  previewSettings?: typeof defaults;
  previewProfile?: CloudProfile;
  onChangeCharacter?: () => void;
  student: StudentProfile;
  activeGrade: number | null;
  activeTopic: string | null;
  onGradeChange: (grade: number | null) => void;
  onTopicChange: (grade: number, topic: string) => void;
};
function SidebarBody({
  student,
  activeGrade,
  activeTopic,
  onGradeChange,
  onTopicChange,
  previewSettings,
  previewProfile,
  onChangeCharacter,
}: SidebarProps) {
  const account = useOptionalStudentAccount();
  const profile = previewProfile || account?.profile;
  const card = resolveCard(EXPLORER_CARDS, profile?.cardId, profile);
  return (
    <div className="flex h-full flex-col">
      <div className="collection-card-area">
        <ExplorerCard
          card={card}
          profile={{ ...student, nickname: profile?.nickname }}
        />
        <CoinBalance />
        {onChangeCharacter ? (
          <button className="change-character" onClick={onChangeCharacter}>
            更換卡片及暱稱
          </button>
        ) : !previewSettings ? (
          <Link href="/profile" className="change-character">
            更換卡片及暱稱
          </Link>
        ) : (
          <span className="character-preview-label">角色展示</span>
        )}
      </div>
      <Accordion type="single" collapsible className="mt-4 space-y-2">
        {GRADES.filter(({ grade }) => canSeeGrade(previewSettings ? { profile: student, teacher: Boolean(account?.teacher) } : account, grade)).map(({ grade, title }) => {
          const topics = PUBLIC_TOPICS.filter(topic => topic.grade === grade);
          return (
            <AccordionItem
              key={grade}
              value={`grade-${grade}`}
              className={`grade-accordion ${activeGrade === grade ? "grade-active" : ""}`}
            >
              <AccordionTrigger
                onClick={() => onGradeChange(grade)}
                aria-label={`${title}課題`}
              >
                <span className="pixel-avatar">{grade}</span>
                <span>{title}</span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-1 pb-2">
                  {topics.map(topic => (
                    <button
                      key={topic.id}
                      onClick={() => onTopicChange(grade, topic.id)}
                      aria-pressed={activeTopic === topic.id}
                      className={`topic-link ${activeTopic === topic.id ? "bg-paper/15 font-black" : ""}`}
                    >
                      <ChevronRight className="h-3 w-3" />
                      {topic.title}
                    </button>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      <button
        className={`all-button ${activeGrade === null ? "is-active" : ""}`}
        onClick={() => onGradeChange(null)}
      >
        <Grid2X2 className="h-5 w-5" />
        全部
      </button>
      {!previewSettings && (
        <div className="mt-auto grid gap-2 pt-5">
          <Link href="/submissions" className="sidebar-utility">
            我的提交與評語
          </Link>
          <Link href="/admin" className="sidebar-utility">
            <ShieldCheck className="h-4 w-4" />
            教師後台
          </Link>
          <button
            className="sidebar-utility"
            onClick={() => {
              void googleLogout();
            }}
          >
            <UserRoundCog className="h-4 w-4" />
            登出 Google 帳戶
          </button>
        </div>
      )}
    </div>
  );
}

export default function HistorySidebar({
  desktopOpen,
  onDesktopOpenChange,
  ...props
}: SidebarProps & {
  desktopOpen: boolean;
  onDesktopOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const desktopId = useId();
  const desktopTrigger = useRef<HTMLButtonElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const desktopPanel = useRef<HTMLElement>(null);

  useEffect(() => {
    const wideScreen = window.matchMedia("(min-width: 48rem)");
    const handleResize = () => {
      // A mobile modal must release its overlay and scroll lock on wider screens.
      if (wideScreen.matches) setOpen(false);
      else if (desktopPanel.current?.contains(document.activeElement)) {
        mobileTrigger.current?.focus();
      }
    };
    wideScreen.addEventListener("change", handleResize);
    return () => wideScreen.removeEventListener("change", handleResize);
  }, []);

  const closeDesktop = () => {
    onDesktopOpenChange(false);
    requestAnimationFrame(() => desktopTrigger.current?.focus());
  };

  return (
    <>
      <div className="desktop-sidebar-shell" inert={!desktopOpen}>
        <aside
          id={desktopId}
          ref={desktopPanel}
          className="history-sidebar desktop-sidebar"
          aria-label="學生與年級選單"
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeDesktop();
            }
          }}
        >
          <button
            type="button"
            className="desktop-sidebar-close"
            aria-label="關閉年級選單"
            onClick={closeDesktop}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
          <div className="desktop-sidebar-scroll">
            <SidebarBody {...props} />
          </div>
        </aside>
      </div>
      <div
        className={`fixed left-4 top-4 z-40 hidden ${desktopOpen ? "" : "md:block"}`}
      >
        <button
          ref={desktopTrigger}
          type="button"
          className="mobile-menu"
          aria-label="開啟年級選單"
          aria-expanded={desktopOpen}
          aria-controls={desktopId}
          onClick={() => onDesktopOpenChange(true)}
        >
          <Menu aria-hidden="true" />
        </button>
      </div>
      <div className="fixed left-4 top-4 z-50 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              ref={mobileTrigger}
              type="button"
              className="mobile-menu"
              aria-label="開啟年級選單"
            >
              <Menu aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="history-sidebar manga-sidebar w-[88vw] max-w-sm p-0"
            onCloseAutoFocus={event => {
              if (window.matchMedia("(min-width: 48rem)").matches) {
                event.preventDefault();
                const target = desktopOpen
                  ? desktopPanel.current?.querySelector<HTMLButtonElement>(
                      "button"
                    )
                  : desktopTrigger.current;
                target?.focus();
              }
            }}
          >
            <SheetTitle className="sr-only">學生與年級選單</SheetTitle>
            <SheetDescription className="sr-only">
              選擇角色、年級與課題
            </SheetDescription>
            <div className="h-full overflow-y-auto p-4">
              <SidebarBody
                {...props}
                onTopicChange={(grade, topic) => {
                  props.onTopicChange(grade, topic);
                  setOpen(false);
                }}
                onGradeChange={grade => {
                  props.onGradeChange(grade);
                  if (grade === null) setOpen(false);
                }}
                onChangeCharacter={
                  props.onChangeCharacter
                    ? () => {
                        setOpen(false);
                        props.onChangeCharacter?.();
                      }
                    : undefined
                }
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
