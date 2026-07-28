/**
 * License Expiry Warning System
 * نظام تنبيه انتهاء الترخيص
 */

export interface ExpiryWarning {
  show: boolean;
  daysLeft: number;
  type: 'trial' | 'licensed';
  message: string;
}
