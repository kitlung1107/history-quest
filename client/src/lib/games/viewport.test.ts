import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canUseNativeGameFullscreen } from './viewport.ts';
const desktop = { userAgent: 'Mozilla/5.0 Chrome', platform: 'Win32', maxTouchPoints: 0 };
const mode = (display = 'browser') => ({ matchMedia: (query: string) => ({ matches: query === '(display-mode: ' + display + ')' }) }) as Pick<Window, 'matchMedia'>;
test('Apple phones, iPad desktop mode and every standalone path avoid native fullscreen', () => {
for (const userAgent of ['iPhone','iPad','iPod']) assert.equal(canUseNativeGameFullscreen({...desktop,userAgent},mode()),false);
assert.equal(canUseNativeGameFullscreen({...desktop,platform:'MacIntel',maxTouchPoints:5},mode()),false);
assert.equal(canUseNativeGameFullscreen({...desktop,standalone:true},mode()),false);
assert.equal(canUseNativeGameFullscreen(desktop,mode('standalone')),false);
assert.equal(canUseNativeGameFullscreen(desktop,mode('fullscreen')),false);
});
test('ordinary desktop browsers retain native fullscreen', () => {
assert.equal(canUseNativeGameFullscreen(desktop,mode()),true);
assert.equal(canUseNativeGameFullscreen({...desktop,platform:'MacIntel'},mode()),true);
});
