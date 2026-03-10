/**
 * License Expiry Warning System
 * نظام تنبيه انتهاء الترخيص — يعمل أوفلاين بالكامل
 */

import { getAppStatus, type AppLicenseStatus } from './license';

const WARNING_DAYS = 3;
const LAST_NOTIFICATION_KEY = '_sys_expiry_notif_v1';

export interface ExpiryWarning {
  show: boolean;
  daysLeft: number;
  type: 'trial' | 'licensed';
  message: string;
}

/**
 * Check if license/trial is expiring soon (within 3 days)
 */
export function checkExpiryWarning(status: AppLicenseStatus): ExpiryWarning {
  if (status.status === 'trial' && status.daysLeft <= WARNING_DAYS) {
    return {
      show: true,
      daysLeft: status.daysLeft,
      type: 'trial',
      message: `تنتهي الفترة التجريبية خلال ${status.daysLeft} ${status.daysLeft === 1 ? 'يوم' : 'أيام'}. جدد اشتراكك الآن!`,
    };
  }

  if (status.status === 'licensed' && !status.permanent && status.daysLeft <= WARNING_DAYS) {
    return {
      show: true,
      daysLeft: status.daysLeft,
      type: 'licensed',
      message: `ينتهي الترخيص خلال ${status.daysLeft} ${status.daysLeft === 1 ? 'يوم' : 'أيام'}. جدد اشتراكك لتجنب انقطاع الخدمة.`,
    };
  }

  return { show: false, daysLeft: Infinity, type: 'trial', message: '' };
}

/**
 * Check if we should show a notification today (one per day)
 */
export function shouldShowDailyNotification(): boolean {
  const today = new Date().toISOString().split('T')[0];
  const lastShown = localStorage.getItem(LAST_NOTIFICATION_KEY);
  if (lastShown === today) return false;
  return true;
}

/**
 * Mark notification as shown for today
 */
export function markNotificationShown() {
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem(LAST_NOTIFICATION_KEY, today);
}
