/**
 * 設計提醒：報到頁像歷史探險隊的入隊登記卡，不做普通置中白色登入框。
 */
import { useEffect, useState } from "react";
import { BookOpen, Check, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ASSETS, CLASS_OPTIONS, loadStudent, saveStudent, type StudentProfile } from "@/lib/historyQuest";

export default function OnboardingGuard({ onReady }: { onReady: (profile: StudentProfile) => void }) {
  const [open, setOpen] = useState(false);
  const [className, setClassName] = useState("");
  const [name, setName] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "student") {
      onReady({ className: "3A", name: "預覽學生", studentNo: "PREVIEW" });
      return;
    }
    const current = loadStudent();
    if (current) onReady(current);
    else setOpen(true);
  }, [onReady]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanNo = studentNo.trim().toUpperCase();
    if (!className || cleanName.length < 2 || !/^[A-Z0-9-]{1,12}$/i.test(cleanNo)) {
      setError("請完整填寫班別、姓名及學號；學號只可使用英文字母、數字或連字號。");
      return;
    }
    const profile = { className, name: cleanName, studentNo: cleanNo };
    saveStudent(profile);
    onReady(profile);
    setOpen(false);
  }

  return (
    <Dialog open={open}>
      <DialogContent className="onboarding-panel max-w-3xl overflow-hidden p-0" showCloseButton={false}>
        <div className="grid md:grid-cols-[0.8fr_1.2fr]">
          <div className="onboarding-poster relative overflow-hidden p-7 text-paper">
            <div className="halftone absolute inset-0 opacity-30" />
            <img src={ASSETS.logo} alt="歷史互動探索館標誌" className="relative h-20 w-20 object-contain" />
            <p className="comic-kicker relative mt-8">探險隊召集令</p>
            <h2 className="display-title relative mt-3 text-4xl leading-tight">先報到，<br />再穿越歷史。</h2>
            <div className="speech-box relative mt-8 text-ink">資料只儲存在這部裝置，完成任務時才會連同成績交給老師。</div>
          </div>
          <form onSubmit={submit} className="paper-texture p-7 md:p-9">
            <DialogHeader className="text-left">
              <DialogTitle className="display-title text-3xl text-ink">學生報到處</DialogTitle>
              <DialogDescription className="text-base text-ink/70">一次登記，之後轉頁或重新開啟網站都會自動認出你。</DialogDescription>
            </DialogHeader>
            <div className="mt-7 grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="student-class" className="font-black">班別</Label>
                <Select value={className} onValueChange={setClassName}>
                  <SelectTrigger id="student-class" className="comic-input h-12"><SelectValue placeholder="選擇班別" /></SelectTrigger>
                  <SelectContent>{CLASS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="student-name" className="font-black">姓名</Label>
                <div className="relative"><UserRound className="absolute left-3 top-3.5 h-5 w-5 text-ink/55" /><Input id="student-name" value={name} onChange={(event) => setName(event.target.value)} className="comic-input h-12 pl-11" placeholder="例如：陳小明" autoComplete="name" /></div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="student-no" className="font-black">學號</Label>
                <div className="relative"><BookOpen className="absolute left-3 top-3.5 h-5 w-5 text-ink/55" /><Input id="student-no" value={studentNo} onChange={(event) => setStudentNo(event.target.value)} className="comic-input h-12 pl-11" placeholder="例如：17 或 S017" autoComplete="off" /></div>
              </div>
            </div>
            {error && <p role="alert" className="mt-4 border-2 border-ink bg-red/15 p-3 text-sm font-bold text-ink">{error}</p>}
            <button type="submit" className="pixel-button pixel-button-gold mt-7 w-full"><Check className="h-5 w-5" />完成報到，進入探索館</button>
            <p className="mt-4 text-center text-xs text-ink/55">請使用學校指定格式，避免老師收到重複紀錄。</p>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
