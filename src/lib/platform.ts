/**
 * Platform Detection
 * كشف إذا التطبيق يعمل كـ APK (Capacitor) أو في المتصفح
 */

export function isNativeApp(): boolean {
  // Capacitor sets this on native platforms
  const win = window as any;
  if (win.Capacitor?.isNativePlatform?.()) return true;
  if (win.Capacitor?.getPlatform?.() === 'android') return true;
  if (win.Capacitor?.getPlatform?.() === 'ios') return true;
  return false;
}

export function isWebBrowser(): boolean {
  return !isNativeApp();
}
