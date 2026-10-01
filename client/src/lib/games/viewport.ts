// iPad desktop-mode Safari reports MacIntel; touch distinguishes it from Macs.
export function canUseNativeGameFullscreen(
  device: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> & { standalone?: boolean },
  browser: Pick<Window, 'matchMedia'>,
) {
  const appleMobile = /iPad|iPhone|iPod/.test(device.userAgent) || (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
  const standalone = device.standalone === true || browser.matchMedia('(display-mode: standalone)').matches || browser.matchMedia('(display-mode: fullscreen)').matches;
  return !appleMobile && !standalone;
}
