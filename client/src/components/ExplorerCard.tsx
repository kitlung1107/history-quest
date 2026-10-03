import { useLayoutEffect, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Close as PopoverClose } from "@radix-ui/react-popover";
import type { ExplorerCard as Card } from "@/lib/cardModel";
import { cardIdentity } from "@/lib/cardModel";
import { mediaUrl } from "@/lib/siteSettings";

function FittedLabel({
  text,
  kind,
}: {
  text: string;
  kind: "nickname" | "identity";
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const maximum = kind === "nickname" ? 21 : 14;
  const minimum = kind === "nickname" ? 11 : 10;
  const label = kind === "nickname" ? "暱稱" : "身份資料";
  const [fit, setFit] = useState({ size: maximum, lines: 1, truncated: false });

  useLayoutEffect(() => {
    const el = ref.current;
    const probe = measureRef.current;
    if (!el || !probe) return;
    let disposed = false;
    let frame = 0;
    const measure = () => {
      if (disposed) return;
      const { width, height } = el.getBoundingClientRect();
      // Hidden cards have no usable geometry. ResizeObserver retries when shown
      // and when the image establishes the card's natural aspect ratio.
      if (width <= 0 || height <= 0) return;
      let result = {
        size: minimum,
        lines: Math.max(
          1,
          Math.min(2, Math.floor((height + 0.5) / (minimum * 1.0)))
        ),
        truncated: true,
      };
      for (let size = maximum; size >= minimum; size--) {
        probe.style.fontSize = `${size}px`;
        probe.style.whiteSpace = "nowrap";
        const lineHeight = size * 1.0;
        if (probe.scrollWidth <= width + 0.5 && lineHeight <= height + 0.5) {
          result = { size, lines: 1, truncated: false };
          break;
        }
        probe.style.whiteSpace = "normal";
        if (
          probe.getBoundingClientRect().height <=
            Math.min(height, lineHeight * 2) + 0.5 &&
          probe.scrollWidth <= width + 0.5
        ) {
          result = { size, lines: 2, truncated: false };
          break;
        }
      }
      setFit(previous =>
        previous.size === result.size &&
        previous.lines === result.lines &&
        previous.truncated === result.truncated
          ? previous
          : result
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    document.fonts.addEventListener("loadingdone", schedule);
    void document.fonts.ready.then(() => {
      if (!disposed) schedule();
    });
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", schedule);
    };
  }, [text, maximum, minimum]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          className={`explorer-card-label explorer-card-${kind}`}
          style={{ fontSize: fit.size }}
          data-truncated={fit.truncated}
          aria-label={`${label}：${text}。點一下查看完整內容`}
          title="點一下查看完整內容"
        >
          <span
            className="explorer-card-label-text"
            style={{ WebkitLineClamp: fit.lines }}
          >
            {text}
          </span>
          <span
            ref={measureRef}
            className="explorer-card-label-measure"
            aria-hidden="true"
          >
            {text}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="explorer-card-text-popover"
        aria-label={`完整${label}`}
        onEscapeKeyDown={event => event.stopPropagation()}
      >
        <p className="font-bold">{label}</p>
        <p className="explorer-card-text-value">{text}</p>
        <PopoverClose className="explorer-card-text-close">關閉</PopoverClose>
      </PopoverContent>
    </Popover>
  );
}

export default function ExplorerCard({
  card,
  profile,
}: {
  card: Card | null;
  profile: {
    nickname?: string;
    className: string;
    studentNo: string;
    name: string;
  };
}) {
  const [broken, setBroken] = useState(false);
  const nickname = profile.nickname?.trim() || "未設定暱稱";
  const identity = cardIdentity(profile);
  useLayoutEffect(() => setBroken(false), [card?.image]);
  if (!card || broken)
    return (
      <section className="explorer-card-unavailable">
        <strong>{nickname}</strong>
        <p>{identity}</p>
        <small>{broken ? "卡圖暫時無法載入" : "暫時沒有可用卡片"}</small>
      </section>
    );
  return (
    <figure className="explorer-card-figure" data-card-image={card.image}>
      <div className={`explorer-card explorer-card-${card.edition}`} aria-label={card.name}>
        <img
          src={mediaUrl(card.image)}
          alt={card.name}
          onError={() => setBroken(true)}
        />
        <FittedLabel text={nickname} kind="nickname" />
        <FittedLabel text={identity} kind="identity" />
      </div>
    </figure>
  );
}
