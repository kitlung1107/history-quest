import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ExplorerCard from "./ExplorerCard";
import CardPicker from "./CardPicker";
import LocalDrawEarnTask from "./LocalDrawEarnTask";
import { EXPLORER_CARDS } from "@/lib/cards";
import {
  localDraw,
  localDrawState,
  finishLocalDraw,
  pendingLocalDraw,
  resetLocalDraw,
  type LocalReceipt,
} from "@/lib/localDrawClient";
import type { CloudProfile } from "@/contexts/StudentAccount";
import { useOptionalStudentAccount } from "@/contexts/StudentAccount";
import { db, OWNER_EMAIL } from "@/lib/firebase";
import { doc, getDocFromServer } from "firebase/firestore";
import { commitEnrollmentChunk } from "@/lib/enrollment";
import { isDrawCertified } from "@/lib/drawQualification";
import { createCardDrawClient } from "@/lib/cardDrawClient";
import cardStyles from "@/cards.css?inline";
import { CLIENT_CARD_DRAW_PRICE } from "virtual:card-draw-catalog";

/** Browser selection policy with authoritative atomic Rules validation.
 * UI is released only alongside the compatible catalogue and server flag. */
export default function CoinDrawPanel({ demo = false }: { demo?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null),
    busy = useRef(false);
  const [height, setHeight] = useState(1000),
    [host, setHost] = useState<HTMLElement | null>(null);
  const [profile, setProfile] = useState<
    (CloudProfile & { demoFullAccess?: boolean }) | null
  >(null);
  const [receipt, setReceipt] = useState<LocalReceipt | null>(null),
    [balance, setBalance] = useState<number>();
  const [error, setError] = useState(""),
    [recover, setRecover] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const local =
    import.meta.env.DEV &&
    demo &&
    ["localhost", "127.0.0.1"].includes(location.hostname);
  const account = useOptionalStudentAccount();
  const teacherSelf =
    account?.teacher &&
    account.user.email === OWNER_EMAIL &&
    account.studentId === account.user.uid;
  const [teacherPrepared, setTeacherPrepared] = useState(false);
  const [preparingTeacher, setPreparingTeacher] = useState(false);
  const accountClient = useMemo(
    () =>
      account?.studentId
        ? createCardDrawClient(
            db,
            account.user.uid,
            account.studentId,
            account.user.email ?? ""
          )
        : undefined,
    [account?.studentId, account?.user.uid, account?.user.email]
  );
  const active =
    local ||
    (import.meta.env.VITE_CARD_DRAW_ENABLED === "1" && !!accountClient);
  const mode = active ? "integrated" : "unavailable";
  const send = (message: unknown) =>
    frame.current?.contentWindow?.postMessage(message, location.origin);
  const refresh = async () => {
    const state = local ? await localDrawState() : await accountClient!.state();
    setProfile(state.profile);
    setBalance(state.balance);
    if (!local && teacherSelf)
      setTeacherPrepared(
        isDrawCertified(
          (
            await getDocFromServer(
              doc(db, "cardDrawEligibility", account!.studentId)
            )
          ).data()
        )
      );
    setRecover(!!(local ? pendingLocalDraw() : accountClient!.pending()));
    return state;
  };
  const prepareTeacher = async () => {
    if (!teacherSelf || preparingTeacher || busy.current) return;
    setPreparingTeacher(true);
    setError("");
    try {
      const revision =
        (await getDocFromServer(doc(db, "metadata", "enrollment"))).data()
          ?.revision || 0;
      await commitEnrollmentChunk(
        db,
        [
          {
            id: account!.user.uid,
            email: OWNER_EMAIL,
            enabled: true,
            requireExisting: true,
          },
        ],
        revision
      );
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "未能準備本人抽卡資料；未扣款。"
      );
    } finally {
      setPreparingTeacher(false);
    }
  };
  const draw = async () => {
    if (!active || busy.current) return;
    busy.current = true;
    setError("");
    setNeedsRefresh(false);
    try {
      const result = local ? await localDraw() : await accountClient!.draw();
      setReceipt(result);
      await refresh();
      if (!local) await account?.refresh();
      setRecover(false);
      send({
        kind: "coin-draw-committed",
        cardId: result.cardId,
        requestId: result.requestId,
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "連線中斷，請用相同請求重試。";
      setError(message);
      setNeedsRefresh(
        ["catalog-outdated", "card-art-unavailable"].includes(
          (e as { code?: string }).code ?? ""
        )
      );
      setRecover(!!(local ? pendingLocalDraw() : accountClient!.pending()));
      send({ kind: "coin-draw-error", message });
    } finally {
      busy.current = false;
    }
  };
  useEffect(() => {
    let disposed = false;
    if (active)
      void refresh().catch(e => {
        if (!disposed) setError(e.message);
      });
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (event.data?.kind === "coin-draw-size") {
        const next = event.data.height;
        if (
          typeof next === "number" &&
          Number.isFinite(next) &&
          next > 0 &&
          next < 5000
        )
          setHeight(Math.ceil(next));
      }
      if (active && event.data?.kind === "coin-draw-request") void draw();
      if (active && event.data?.kind === "coin-draw-return") {
        if (local) finishLocalDraw();
        else accountClient!.finish();
        setReceipt(null);
        setRecover(false);
        void refresh();
      }
    };
    window.addEventListener("message", receive);
    return () => {
      disposed = true;
      window.removeEventListener("message", receive);
    };
  }, [active, local, accountClient]);
  const setupFrame = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    setHost(doc.getElementById("result-card-host"));
    const style = doc.createElement("style");
    style.textContent =
      cardStyles +
      "#result-card-host{position:absolute;left:11.37%;top:.3125%;width:44.149%;opacity:0;pointer-events:none;z-index:2}#result-card-host[data-revealed=true]{opacity:1;pointer-events:auto}.explorer-card>img{border-radius:0}";
    doc.head.append(style);
    send({ kind: "coin-draw-config", price: CLIENT_CARD_DRAW_PRICE });
  };
  return (
    <>
      {local && (
        <section className="local-draw-status">
          <strong>本機隔離免費示範</strong>
          <span>
            示範探索幣：{balance ?? "載入中"}；不使用正式帳戶或真餘額。
          </span>
          <button
            onClick={() => {
              resetLocalDraw();
              location.reload();
            }}
          >
            重新開始示範
          </button>
          {recover && (
            <button onClick={() => void draw()} disabled={busy.current}>
              恢復／重試上次抽卡
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          {needsRefresh && (
            <button onClick={() => location.reload()}>重新整理卡庫</button>
          )}
        </section>
      )}
      {local &&
        new URLSearchParams(location.search).get("scenario") === "earn" && (
          <LocalDrawEarnTask onEarn={refresh} />
        )}
      {active && !local && (
        <section className="local-draw-status">
          <span>探索幣：{balance ?? "載入中"}</span>
          {recover && (
            <button onClick={() => void draw()}>恢復／重試上次抽卡</button>
          )}
          {error && <p role="alert">{error}</p>}
          {needsRefresh && (
            <button onClick={() => location.reload()}>重新整理卡庫</button>
          )}
        </section>
      )}
      {!local && teacherSelf && !teacherPrepared && (
        <div className="my-4 border-2 p-3">
          <p>老師帳戶首次抽卡前，先準備本人的抽卡資料；不會派幣或派卡。</p>
          <button
            className="pixel-button pixel-button-paper mt-2"
            disabled={preparingTeacher}
            onClick={() => void prepareTeacher()}
          >
            {preparingTeacher ? "正在準備…" : "準備我的抽卡資料"}
          </button>
        </div>
      )}
      <iframe
        ref={frame}
        onLoad={setupFrame}
        src={`${import.meta.env.BASE_URL}coin-draw/index.html?mode=${mode}`}
        className="coin-draw-frame"
        style={{ height }}
        title={active ? "探索抽卡機" : "探索抽卡機，功能尚未啟用"}
        sandbox="allow-scripts allow-same-origin"
      />
      {host &&
        receipt &&
        profile &&
        createPortal(
          <ExplorerCard
            card={EXPLORER_CARDS.find(c => c.id === receipt.cardId) ?? null}
            profile={profile}
          />,
          host
        )}
      {local && profile && (
        <section className="local-draw-library">
          <CardPicker
            collection={profile}
            value={profile.cardId}
            fullCardAccess={
              local
                ? profile.demoFullAccess === true
                : account?.fullCardAccess === true
            }
            onChange={() => {}}
          />
          <p>示範卡庫；抽卡不會自動更換原展示卡。</p>
        </section>
      )}
    </>
  );
}
