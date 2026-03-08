/**
 * Platform Detection
 * كشف إذا التطبيق يعمل كـ APK (Capacitor) أو في المتصفح
 */

export function isNativeApp(): boolean {
  const win = window as any;
  if (win.Capacitor?.isNativePlatform?.()) return true;
  if (win.Capacitor?.getPlatform?.() === 'android') return true;
  if (win.Capacitor?.getPlatform?.() === 'ios') return true;
  return false;
}

export function isDevPreview(): boolean {
  const { hostname, search } = window.location;
  return hostname.includes('-preview--') || search.includes('__lovable_token=') || hostname === 'localhost';
}

export function isWebBrowser(): boolean {
  if (isDevPreview()) return false; // Allow full app in dev preview
  return !isNativeApp();
}
