import { pushEvent } from "./supabase-sync";
import i18n from "@/lib/i18n";

export function trackEvent(event: string, data: Record<string, unknown> = {}) {
  pushEvent(event, data);
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
