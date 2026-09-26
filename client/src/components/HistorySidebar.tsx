import { displayClass } from "@/lib/classOptions";
import {
  SITE_SETTINGS as defaults,
  GRADES,
  PUBLIC_TOPICS,
  mediaUrl,
} from "@/lib/siteSettings";
import {
  ChevronRight,
  Grid2X2,
  Menu,
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
import { CHARACTERS, characterImage, characterKey } from "@/lib/characters";
import { useState } from "react";

type SidebarProps = {
  previewSettings?: typeof defaults;
  previewProfile?: CloudProfile;
  onChangeCharacter?: () => void;
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
  previewProfile,
  onChangeCharacter,
}: SidebarProps) {
  const settings = previewSettings || defaults;
  const account = useOptionalStudentAccount();
  const profile = previewProfile || account?.profile;
  const avatar = characterKey(profile?.avatar);
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
          <p className="student-identity mt-1 text-sm">
            {displayClass(student.className)} · {student.name} ·{" "}
            {student.studentNo}
          </p>
        </div>
      </div>
      <div className="student-character">
        <div className="character-stage">
          <img
            src={characterImage(avatar)}
            alt={CHARACTERS[avatar].name}
            width="240"
            height="280"
          />
        </div>
        <p className="character-nickname">
          {profile?.nickname || "歷史小探員"}
        </p>
        {onChangeCharacter ? (
          <button className="change-character" onClick={onChangeCharacter}>
            更換角色
          </button>
        ) : !previewSettings ? (
          <Link href="/profile" className="change-character">
            更換角色
          </Link>
        ) : (
          <span className="character-preview-label">角色展示</span>
        )}
      </div>
      <Accordion type="multiple" defaultValue={[]} className="mt-4 space-y-2">
        {GRADES.map(({ grade, title }) => {
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
          <Link href="/profile" className="sidebar-utility">
            我的角色
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

export default function HistorySidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="history-sidebar hidden md:block">
        <SidebarBody {...props} />
      </aside>
      <div className="fixed left-4 top-4 z-50 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="mobile-menu" aria-label="開啟年級選單">
              <Menu />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="history-sidebar manga-sidebar w-[88vw] max-w-sm p-0"
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
                onFeatured={() => {
                  props.onFeatured();
                  setOpen(false);
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
