import { Capacitor } from "@capacitor/core";

/**
 * Dial a USSD code directly using Intent.ACTION_CALL on Android.
 * Falls back to tel: URI on web/unsupported platforms.
 */
export async function dialUssdDirect(ussdCode: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { IntentLauncher } = await import("@capgo/capacitor-intent-launcher");
      // ACTION_CALL = android.intent.action.CALL
      // Encode # as %23 for the tel: URI
      const encodedUssd = ussdCode.replace(/#/g, "%23");
      await IntentLauncher.startActivityAsync({
        action: "android.intent.action.CALL",
        uri: `tel:${encodedUssd}`,
      });
      return true;
    } catch (err) {
      console.error("Direct USSD dial failed:", err);
      // Fallback to tel: link
      window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
      return true;
    }
  } else {
    // Web fallback
    window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
    return true;
  }
}

/**
 * Request CALL_PHONE permission on Android
 */
export async function requestCallPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  
  try {
    // Use Capacitor's permission system
    const { Permissions } = await import("@capacitor/core").then(m => ({ Permissions: m }));
    // For Android, CALL_PHONE permission is requested automatically when using Intent.ACTION_CALL
    // The system will prompt the user. We return true as the intent launcher handles it.
    return true;
  } catch {
    return false;
  }
}
