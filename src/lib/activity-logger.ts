import { trackEvent } from './cloud-sync';

export type ActivityType =
  | 'app_launch'
  | 'page_view'
  | 'transfer_initiated'
  | 'settings_changed'
  | 'payment_info_viewed'
  | 'qr_shared';

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
