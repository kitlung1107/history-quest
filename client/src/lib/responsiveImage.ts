import manifest from '../content/settings/responsive-images.json';

type ImageAsset = { width: number; height: number; variants: { src: string; width: number }[] };
const assets: Record<string, ImageAsset> = manifest;

/** Match exact CMS sources only. New uploads / external URLs retain their original source. */
export function responsiveImage(source: string) {
  return assets[source] ?? null;
}

export const HERO_IMAGE_SIZES = '(min-width: 1600px) 1584px, (min-width: 768px) calc(100vw - 16px), calc(100vw - 12px)';
export function heroImageSizes(sidebarOpen: boolean) {
  return sidebarOpen
    ? '(min-width: 1600px) 1304px, (min-width: 1024px) calc(100vw - 296px), (min-width: 768px) calc(100vw - 276px), calc(100vw - 12px)'
    : HERO_IMAGE_SIZES;
}
export const SIDEBAR_IMAGE_SIZES = '(min-width: 1024px) 240px, (min-width: 768px) 220px, (min-width: 437px) 352px, calc(88vw - 32px)';
// Desktop object-cover crops a square thumbnail into a tall panel. Reserve extra
// source pixels for that crop and fine illustrated faces, rather than just its narrow width.
export const TASK_IMAGE_SIZES = '(min-width: 1200px) 384px, (min-width: 1024px) 46vw, (min-width: 768px) 90vw, calc(100vw - 52px)';
