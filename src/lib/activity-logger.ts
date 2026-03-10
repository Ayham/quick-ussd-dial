/**
 * Activity Logger
 * تسجيل أنشطة المستخدم محلياً ومزامنتها لاحقاً
 */

import { trackEvent, type SyncEventType } from './cloud-sync';

export type ActivityType =
  | 'app_launch'
  | 'page_view'
  | 'license_page_access'
  | 'activation_page_access'
  | 'transfer_initiated'
  | 'settings_changed'
  | 'payment_info_viewed'
  | 'qr_shared';

/**
 * Log a user activity event
 * Stored locally first, synced to Google Sheets when online
 */
export function logActivity(activity: ActivityType, data: Record<string, unknown> = {}) {
  // Map activity types to cloud sync event types
  const eventMap: Record<ActivityType, SyncEventType> = {
    app_launch: 'app_open',
    page_view: 'heartbeat',
    license_page_access: 'heartbeat',
    activation_page_access: 'heartbeat',
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
