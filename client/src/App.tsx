import MySubmissions from "@/pages/MySubmissions";
import ContentPreview from "@/pages/ContentPreview";
import ContentLibrary from "@/pages/ContentLibrary";
/**
 * 設計提醒：所有路由共用方案 A「香港歷史漫畫報紙」語言；首頁與教師後台必須有清楚返回路徑。
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Admin from "@/pages/Admin";
import Home from "@/pages/Home";
import { Route, Router, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ScoreSyncProvider } from "./contexts/ScoreSyncContext";
import { useEffect } from "react";
import { SITE_SETTINGS, mediaUrl } from "./lib/siteSettings";
import { AccountGate, ProfileForm, useOptionalStudentAccount } from "./contexts/StudentAccount";

function SessionContent({ children }: { children: React.ReactNode }) {
  const account = useOptionalStudentAccount();
  return <ScoreSyncProvider key={account?.studentId || "preview"}>{children}</ScoreSyncProvider>;
}
function StudentArea({ children, teacherPage = false }: { children: React.ReactNode; teacherPage?: boolean }) {
  return <AccountGate teacherPage={teacherPage}><SessionContent>{children}</SessionContent></AccountGate>;
}

function Routes() {
  return (
    <Switch>
      <Route path="/">
        <StudentArea><Home /></StudentArea>
      </Route>
      <Route path="/admin"><StudentArea teacherPage><Admin /></StudentArea></Route>
      <Route path="/submissions"><StudentArea><MySubmissions /></StudentArea></Route>
      <Route path="/profile"><StudentArea><ProfileForm onDone={() => { window.location.href = import.meta.env.BASE_URL; }} /></StudentArea></Route>
      <Route path="/preview"><ScoreSyncProvider><ContentPreview /></ScoreSyncProvider></Route>
      <Route path="/library" component={ContentLibrary} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.title = SITE_SETTINGS.title;
    document
      .querySelector<HTMLLinkElement>('link[rel="icon"]')
      ?.setAttribute("href", mediaUrl(SITE_SETTINGS.logo));
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", SITE_SETTINGS.subtitle);
  }, []);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
            <Router base={base === "/" ? undefined : base}>
              <Routes />
            </Router>
            <Toaster position="top-right" richColors closeButton />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
