/**
 * 設計提醒：側欄是參考圖的深墨藍學生報到處，以像素角色、粗線 Accordion 與芥末黃「全部」狀態還原。
 */
import { ChevronRight, Grid2X2, Menu, School, ShieldCheck, UserRoundCog } from "lucide-react";
import { Link } from "wouter";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ASSETS, GRADE_TOPICS, type StudentProfile } from "@/lib/historyQuest";

function SidebarBody({ student, activeGrade, onGradeChange }: { student: StudentProfile; activeGrade: number | null; onGradeChange: (grade: number | null) => void }) {
  return <div className="flex h-full flex-col">
    <div className="sidebar-brand">
      <img src={ASSETS.logo} className="h-16 w-16 object-contain" alt="" />
      <div><p className="pixel-label">學生報到處</p><p className="mt-1 text-sm text-paper/70">{student.className} · {student.name} · {student.studentNo}</p></div>
    </div>
    <div className="school-pixel" aria-hidden="true"><School className="h-11 w-11" /><span className="flag" /></div>
    <Accordion type="multiple" defaultValue={["grade-1", "grade-3"]} className="mt-4 space-y-2">
      {Object.entries(GRADE_TOPICS).map(([gradeText, topics]) => {
        const grade = Number(gradeText);
        return <AccordionItem key={grade} value={`grade-${grade}`} className={`grade-accordion ${activeGrade === grade ? "grade-active" : ""}`}>
          <AccordionTrigger onClick={() => onGradeChange(grade)}><span className="pixel-avatar">{grade}</span><span>中{["一", "二", "三", "四", "五", "六"][grade - 1]}</span></AccordionTrigger>
          <AccordionContent><div className="grid gap-1 pb-2">{topics.map((topic) => <button key={topic} onClick={() => onGradeChange(grade)} className="topic-link"><ChevronRight className="h-3 w-3" />{topic}</button>)}</div></AccordionContent>
        </AccordionItem>;
      })}
    </Accordion>
    <button className={`all-button ${activeGrade === null ? "is-active" : ""}`} onClick={() => onGradeChange(null)}><Grid2X2 className="h-5 w-5" />全部</button>
    <div className="mt-auto grid gap-2 pt-5">
      <Link href="/admin" className="sidebar-utility"><ShieldCheck className="h-4 w-4" />教師後台</Link>
      <button className="sidebar-utility" onClick={() => { localStorage.removeItem("historyQuest.student.v1"); window.location.reload(); }}><UserRoundCog className="h-4 w-4" />更改報到資料</button>
    </div>
  </div>;
}

export default function HistorySidebar(props: { student: StudentProfile; activeGrade: number | null; onGradeChange: (grade: number | null) => void }) {
  return <>
    <aside className="history-sidebar hidden md:block"><SidebarBody {...props} /></aside>
    <div className="fixed left-4 top-4 z-50 md:hidden">
      <Sheet><SheetTrigger asChild><button className="mobile-menu" aria-label="開啟年級選單"><Menu /></button></SheetTrigger><SheetContent side="left" className="history-sidebar w-[88vw] max-w-sm border-r-4 border-ink p-0"><div className="h-full p-4"><SidebarBody {...props} /></div></SheetContent></Sheet>
    </div>
  </>;
}
