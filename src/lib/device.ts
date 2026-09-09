/**
 * Which store button to put first on the /app landing page.
 *
 * The page never changes what it says or which links it carries, only which badge is the loud one:
 * a visitor on an iPhone should not have to read past a Google Play button, and a visitor on a
 * desktop cannot install either, so there both are equal.
 *
 * `maxTouchPoints` is not decoration. An iPad since iPadOS 13 reports a Macintosh user agent, so
 * without it every iPad reads as a desktop and the App Store badge loses its promotion on the one
 * device that can use it.
 */
export type Platform = 'ios' | 'android' | 'desktop';

/** Exported so /app's pre-paint inline script can be built from the same patterns these tests cover. */
export const UA_ANDROID = /\bandroid\b/i;
export const UA_IOS = /iphone|ipad|ipod/i;
export const UA_MAC = /macintosh|mac os x/i;

export function platformFor(ua: string, maxTouchPoints = 0): Platform {
  const s = ua || '';
  if (UA_ANDROID.test(s)) return 'android';
  if (UA_IOS.test(s)) return 'ios';
  if (UA_MAC.test(s) && maxTouchPoints > 1) return 'ios';
  return 'desktop';
}
