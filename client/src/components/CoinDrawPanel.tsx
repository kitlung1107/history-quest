import { useEffect, useRef, useState } from "react";

/** Presentation only. No balance, account, card ownership or ledger messages. */
export default function CoinDrawPanel({ demo = false }: { demo?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1000);
  const mode = import.meta.env.DEV && demo ? "demo" : "unavailable";
  const src = `${import.meta.env.BASE_URL}coin-draw/index.html?mode=${mode}`;

  useEffect(() => {
    const resize = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.kind !== "coin-draw-size") return;
      const next = event.data.height;
      if (typeof next === "number" && Number.isFinite(next) && next > 0 && next < 5000) setHeight(Math.ceil(next));
    };
    window.addEventListener("message", resize);
    return () => window.removeEventListener("message", resize);
  }, []);

  return <iframe ref={frame} src={src} className="coin-draw-frame" style={{ height }}
    title={mode === "demo" ? "探索抽卡機效果示範，不扣幣或派卡" : "探索抽卡機，功能尚未啟用"}
    sandbox="allow-scripts allow-same-origin" />;
}
