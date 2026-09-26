import { displayClass } from "@/lib/classOptions";
import {
  SITE_SETTINGS as defaults,
  GRADES,
  PUBLIC_TOPICS,
  mediaUrl,
} from "@/lib/siteSettings";
/**
 * 設計提醒：側欄是參考圖的深墨藍學生報到處，以像素角色、粗線 Accordion 與芥末黃「全部」狀態還原。
 */
import {
  ChevronRight,
  Grid2X2,
  Menu,
  School,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";
import { Link } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { type StudentProfile } from "@/lib/historyQuest";
import { googleLogout } from "@/lib/firebase";
import { AVATARS, useOptionalStudentAccount } from "@/contexts/StudentAccount";

type SidebarProps = {
  previewSettings?: typeof defaults;
  student: StudentProfile;
  activeGrade: number | null;
  activeTopic: string | null;
  showAll: boolean;
  onFeatured: () => void;
  onGradeChange: (grade: number | null) => void;
  onTopicChange: (grade: number, topic: string) => void;
};
function SidebarBody({
  student,
  activeGrade,
  activeTopic,
  onGradeChange,
  onTopicChange,
  showAll,
  onFeatured,
  previewSettings,
}: SidebarProps) {
  const settings = previewSettings || defaults;
  const account = useOptionalStudentAccount();
  return (
    <div className="flex h-full flex-col">
      <div className="sidebar-brand">
        <img
          src={mediaUrl(settings.logo)}
          className="h-16 w-16 object-contain"
          alt=""
        />
        <div>
          <p className="pixel-label">{settings.studentHeading}</p>
          {account?.profile && <p className="mt-2 text-lg">{AVATARS[account.profile.avatar]} {account.profile.nickname}</p>}
          <p className="mt-1 text-sm text-paper/70">
            {displayClass(student.className)} · {student.name} · {student.studentNo}
          </p>
        </div>
      </div>
      <div className="school-pixel" aria-hidden="true">
        <School className="h-11 w-11" />
        <span className="flag" />
      </div>
      <Accordion
        type="multiple"
        defaultValue={["grade-1", "grade-3"]}
        className="mt-4 space-y-2"
      >
        {GRADES.map(({ grade, title }) => {
          const topics = PUBLIC_TOPICS.filter(topic => topic.grade === grade);
          return (
            <AccordionItem
              key={grade}
              value={`grade-${grade}`}
              className={`grade-accordion ${activeGrade === grade ? "grade-active" : ""}`}
            >
              <AccordionTrigger onClick={() => onGradeChange(grade)}>
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
        className={`all-button ${activeGrade === null && !showAll ? "is-active" : ""}`}
        onClick={onFeatured}
      >
        {settings.featuredHeading}
      </button>
      <button
        className={`all-button ${activeGrade === null && showAll ? "is-active" : ""}`}
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
          <Link href="/profile" className="sidebar-utility">我的角色</Link>
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

export default function HistorySidebar(props: SidebarProps) {
  return (
    <>
      <aside className="history-sidebar hidden md:block">
        <SidebarBody {...props} />
      </aside>
      <div className="fixed left-4 top-4 z-50 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <button className="mobile-menu" aria-label="開啟年級選單">
              <Menu />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="history-sidebar w-[88vw] max-w-sm border-r-4 border-ink p-0"
          >
            <div className="h-full p-4">
              <SidebarBody {...props} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
