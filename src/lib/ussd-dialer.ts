import { Capacitor } from "@capacitor/core";
import type { SimSlot } from "./ussd-profiles";

/**
 * Dial a USSD code directly using CallNumber plugin.
 * Passes simSlot for dual-SIM routing on Android.
 * Falls back to tel: URI on web/unsupported platforms.
 */
export async function dialUssdDirect(ussdCode: string, simSlot: SimSlot = 0): Promise<boolean> {
  const encodedUssd = ussdCode.replace(/#/g, "%23");

  if (Capacitor.isNativePlatform()) {
    // Primary: Android Intent with explicit SIM slot — bypasses "Select SIM" popup
    try {
      const { IntentLauncher, ActivityAction } = await import("@capgo/capacitor-intent-launcher");
      await IntentLauncher.startActivityAsync({
        action: ActivityAction.CALL,
        data: `tel:${encodedUssd}`,
        extra: {
          // Stock Android / AOSP
          "com.android.phone.extra.slot": simSlot,
          "simSlot": simSlot,
          "com.android.phone.extra.simSlot": simSlot,
          // Samsung
          "com.android.phone.extra.SLOT": simSlot,
          "extra_asus_dial_use_dualsim": simSlot,
          "com.android.phone.extra.phone": simSlot,
          // Xiaomi / MIUI
          "com.xiaomi.phone.extra.slot": simSlot,
          "miui.intent.extra.SIM_SLOT": simSlot,
          // Huawei
          "huawei.intent.extra.SUBSCRIPTION_INDEX": simSlot,
          // OnePlus / Oppo / Realme (ColorOS)
          "slot": simSlot,
          "phone_type_key": simSlot,
          // Generic Android Telecom
          "android.telecom.extra.PHONE_ACCOUNT_HANDLE": simSlot,
          "subscription": simSlot,
          "Subscription": simSlot,
        },
      });
      return true;
    } catch (intentErr) {
      console.error("Intent dial failed, trying CallNumber:", intentErr);
      // Fallback: CallNumber plugin (no SIM selection support)
      try {
        const { CallNumber } = await import("capacitor-call-number");
        await CallNumber.call({
          number: encodedUssd,
          bypassAppChooser: true,
        });
        return true;
      } catch (callErr) {
        console.error("CallNumber failed:", callErr);
        window.location.href = `tel:${encodedUssd}`;
        return true;
      }
    }
  } else {
    // Web fallback — log intended SIM
    console.log(`[Web] Dialing ${ussdCode} on SIM ${simSlot + 1}`);
    window.location.href = `tel:${encodedUssd}`;
    return true;
  }
}
