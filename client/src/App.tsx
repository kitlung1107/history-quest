import AssessmentCMS from "@/pages/AssessmentCMS";
import GameRecords from "@/pages/GameRecords";
import ConnectedGame from "@/components/ConnectedGame";
import { games } from "@/lib/games/registry";
import { GameSyncProvider } from "@/contexts/GameSyncContext";
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
import { SITE_SETTINGS } from "./lib/siteSettings";
import {
  AccountGate,
  ProfileForm,
  useOptionalStudentAccount,
} from "./contexts/StudentAccount";
import "./home.css";
import "./cards.css";
import "./coin-draw.css";
import { lazy, Suspense } from "react";

const LocalHomeDemo = import.meta.env.DEV
  ? lazy(() => import("./pages/LocalHomeDemo"))
  : null;

const RolePreview = import.meta.env.DEV
  ? lazy(() => import("./pages/RolePreview"))
  : null;

const LocalCoinDrawDemo = import.meta.env.DEV
  ? lazy(() => import("./pages/LocalCoinDrawDemo"))
  : null;

function SessionContent({ children }: { children: React.ReactNode }) {
  const account = useOptionalStudentAccount();
  return (
    <ScoreSyncProvider key={account?.studentId || "preview"}>
      {account ? <GameSyncProvider key={`${account.user.uid}:${account.studentId}`}>{children}</GameSyncProvider> : children}
    </ScoreSyncProvider>
  );
}
function StudentArea({
  children,
  teacherPage = false,
}: {
  children: React.ReactNode;
  teacherPage?: boolean;
}) {
  return (
    <AccountGate teacherPage={teacherPage}>
      <SessionContent>{children}</SessionContent>
    </AccountGate>
  );
}

function GameLanding() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("gameRecords")) return <GameRecords />;
  const id = params.get("game");
  if (id) { const game = games[id]; return game ? <main className="paper-texture min-h-screen p-3"><a href={import.meta.env.BASE_URL}>返回探索館</a><ConnectedGame game={game} /></main> : <p>找不到此遊戲。<a href={import.meta.env.BASE_URL}>返回探索館</a></p>; }
  return <Home />;
}

function Routes() {
  return (
    <Switch>
      {LocalCoinDrawDemo && (
        <Route path="/__coin-draw-demo">
          <Suspense fallback={<p>載入抽卡畫面…</p>}>
            <ScoreSyncProvider><LocalCoinDrawDemo /></ScoreSyncProvider>
          </Suspense>
        </Route>
      )}
      {RolePreview && (
        <Route path="/__role-preview">
          <Suspense fallback={<p>載入預覽…</p>}>
            <ScoreSyncProvider>
              <RolePreview />
            </ScoreSyncProvider>
          </Suspense>
        </Route>
      )}
      {LocalHomeDemo && (
        <Route path="/__home-demo">
          <Suspense fallback={<p>載入本機預覽…</p>}>
            <ScoreSyncProvider>
              <LocalHomeDemo />
            </ScoreSyncProvider>
          </Suspense>
        </Route>
      )}
      <Route path="/">
        <StudentArea teacherPage={new URLSearchParams(window.location.search).get("gameRecords") === "teacher"}>
          <GameLanding />
        </StudentArea>
      </Route>
      <Route path="/assessment-cms"><StudentArea teacherPage><AssessmentCMS/></StudentArea></Route>
      <Route path="/admin">
        <StudentArea teacherPage>
          <Admin />
        </StudentArea>
      </Route>
      <Route path="/submissions">
        <StudentArea>
          <MySubmissions />
        </StudentArea>
      </Route>
      <Route path="/profile">
        <StudentArea>
          <ProfileForm
            onDone={() => {
              window.location.href = import.meta.env.BASE_URL;
            }}
          />
        </StudentArea>
      </Route>
      <Route path="/preview">
        <StudentArea teacherPage><ContentPreview /></StudentArea>
      </Route>
      <Route path="/library"><StudentArea teacherPage><ContentLibrary /></StudentArea></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.title = SITE_SETTINGS.title;
    // The approved multi-size site icons are declared in index.html.
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
