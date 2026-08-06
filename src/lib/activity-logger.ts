import { trackEvent } from './cloud-sync';
import i18n from "@/lib/i18n";

export type ActivityType =
  | 'app_launch'
  | 'page_view'
  | 'transfer_initiated'
  | 'settings_changed'
  | 'payment_info_viewed'
  | 'qr_shared'; // i18n for these types is handled at the UI level

export function logActivity(activity: ActivityType, data: Record<string, unknown> = {}) {
  const eventMap: Record<ActivityType, string> = {
    app_launch: 'app_open',
    page_view: 'heartbeat',
    transfer_initiated: 'transfer',
    settings_changed: 'settings_changed',
    payment_info_viewed: 'heartbeat',
    qr_shared: 'heartbeat',
  };

  trackEvent(eventMap[activity] || 'heartbeat', {
    activityType: activity,
    ...data,
    timestamp: new Date().toISOString(),
  });
}
