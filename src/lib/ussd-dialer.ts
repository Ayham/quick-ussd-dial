import { Capacitor } from "@capacitor/core";

/**
 * Dial a USSD code directly using CallNumber plugin.
 * Bypasses the dialer UI completely on Android.
 * Falls back to tel: URI on web/unsupported platforms.
 */
export async function dialUssdDirect(ussdCode: string): Promise<boolean> {
  // Encode '#' as '%23' for USSD codes
  const encodedUssd = ussdCode.replace(/#/g, "%23");

  if (Capacitor.isNativePlatform()) {
    try {
      const { CallNumber } = await import("capacitor-call-number");
      // bypassAppChooser: false = direct call without showing dialer
      await CallNumber.call({
        number: encodedUssd,
        bypassAppChooser: false,
      });
      return true;
    } catch (err) {
      console.error("Direct USSD dial failed:", err);
      // Fallback to tel: URI
      window.location.href = `tel:${encodedUssd}`;
      return true;
    }
  } else {
    // Web fallback
    window.location.href = `tel:${encodedUssd}`;
    return true;
  }
}
