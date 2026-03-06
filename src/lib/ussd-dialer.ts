import { Capacitor } from "@capacitor/core";

/**
 * Dial a USSD code directly using Intent.ACTION_CALL on Android.
 * Falls back to tel: URI on web/unsupported platforms.
 */
export async function dialUssdDirect(ussdCode: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { IntentLauncher } = await import("@capgo/capacitor-intent-launcher");
      const encodedUssd = ussdCode.replace(/#/g, "%23");
      await IntentLauncher.startActivityAsync({
        action: "android.intent.action.CALL",
        data: `tel:${encodedUssd}`,
      });
      return true;
    } catch (err) {
      console.error("Direct USSD dial failed:", err);
      window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
      return true;
    }
  } else {
    window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
    return true;
  }
}
