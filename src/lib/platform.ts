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
  const host = window.location.hostname;
  return host.includes('lovable.app') || host.includes('lovable.dev') || host === 'localhost';
}

export function isWebBrowser(): boolean {
  if (isDevPreview()) return false; // Allow full app in dev preview
  return !isNativeApp();
}
