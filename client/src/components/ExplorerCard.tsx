import { useLayoutEffect, useRef, useState } from "react";
import type { ExplorerCard as Card } from "@/lib/cardModel";
import { cardIdentity } from "@/lib/cardModel";
import { mediaUrl } from "@/lib/siteSettings";

function FittedLabel({ text, kind, onOverflow }: { text: string; kind: string; onOverflow: (value: boolean) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let size = kind === "nickname" ? 21 : 14;
      el.style.fontSize = `${size}px`;
      const minimum = kind === "nickname" ? 11 : 10;
      while (size > minimum && (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)) {
        el.style.fontSize = `${--size}px`;
      }
      onOverflow(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();
    return () => observer.disconnect();
  }, [text, kind, onOverflow]);
  return <span ref={ref} className={`explorer-card-${kind}`} title={text}>{text}</span>;
}

export default function ExplorerCard({ card, profile }: {
  card: Card | null;
  profile: { nickname?: string; className: string; studentNo: string; name: string };
}) {
  const [longNickname, setLongNickname] = useState(false);
  const [longIdentity, setLongIdentity] = useState(false);
  const [broken, setBroken] = useState(false);
  const nickname = profile.nickname?.trim() || "未設定暱稱";
  const identity = cardIdentity(profile);
  useLayoutEffect(() => setBroken(false), [card?.image]);
  if (!card || broken) return <section className="explorer-card-unavailable"><strong>{nickname}</strong><p>{identity}</p><small>{broken ? "卡圖暫時無法載入" : "暫時沒有可用卡片"}</small></section>;
  return <figure className="explorer-card-figure">
    <div className="explorer-card" aria-label={`${card.name}，${nickname}，${identity}`}>
      <img src={mediaUrl(card.image)} alt={card.name} onError={() => setBroken(true)} />
      <FittedLabel text={nickname} kind="nickname" onOverflow={setLongNickname} />
      <FittedLabel text={identity} kind="identity" onOverflow={setLongIdentity} />
    </div>
    {(longNickname || longIdentity) && <figcaption className="explorer-card-full-text">
      {longNickname && <p>{nickname}</p>}{longIdentity && <p>{identity}</p>}
    </figcaption>}
  </figure>;
}
