export type ImagePosition = { x: number; y: number };

export function imagePosition(value?: ImagePosition | null) {
  const percent = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  return `${percent(value?.x)}% ${percent(value?.y)}%`;
}
