import { APP_VERSION } from "@/config/version";
import { pushEvent } from "./supabase-sync";

export type SyncEventType =
  | "device_register"
  | "app_open"
  | "trial_started"
  | "trial_expired"
  | "license_activated"
  | "license_expired"
  | "license_blocked"
  | "license_suspended"
  | "transfer"
  | "settings_changed"
  | "heartbeat"
  | "user_action"
  | "distributor_topup"
  | "distributor_payment";

export function trackEvent(event: SyncEventType, data: Record<string, unknown> = {}) {
  pushEvent(event, data);
}

export function startBackgroundSync() {
  pushEvent("heartbeat", {
    appVersion: APP_VERSION,
    language: navigator.language,
    online: navigator.onLine,
  });
}

export function trackDeviceInfo() {
  pushEvent("device_register", {
    appVersion: APP_VERSION,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

export function trackAppOpen() {
  pushEvent("app_open", { timestamp: new Date().toISOString() });
}

export function trackTransfer(phone: string, amount: string, operator: string, status: string, extra: Record<string, unknown> = {}) {
  pushEvent("transfer", {
    phone,
    amount,
    operator,
    status,
    package_price: extra.package_price ?? null,
    package_name: extra.package_name ?? null,
    ...extra,
  });
}
