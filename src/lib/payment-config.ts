/**
 * Payment Methods Configuration
 * بيانات وسائل الدفع — تُعرض فقط للمستخدم ولا تتم أي معالجة دفع داخل التطبيق
 */

const PAYMENT_CONFIG_KEY = '_sys_payment_cfg_v1';

export interface PaymentMethod {
  id: string;
  name: string;
  nameEn: string;
  phone: string;
  icon: string; // emoji or icon name
  color: string; // tailwind color token
  instructions: string;
}

const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'syriatel_cash',
    name: 'سيريتيل كاش',
    nameEn: 'Syriatel Cash',
    phone: '0991214570',
    icon: '📱',
    color: 'operator-syriatel',
    instructions: 'أرسل المبلغ عبر سيريتيل كاش إلى الرقم أعلاه، ثم انتظر تأكيد المسؤول لتفعيل الترخيص تلقائياً.',
  },
  {
    id: 'mtn_cash',
    name: 'MTN Cash',
    nameEn: 'MTN Cash',
    phone: '0951234567',
    icon: '💳',
    color: 'operator-mtn',
    instructions: 'أرسل المبلغ عبر MTN Cash إلى الرقم أعلاه، ثم انتظر تأكيد المسؤول لتفعيل الترخيص تلقائياً.',
  },
  {
    id: 'sham_cash',
    name: 'شام كاش',
    nameEn: 'Sham Cash',
    phone: '0961234567',
    icon: '🏦',
    color: 'primary',
    instructions: 'أرسل المبلغ عبر شام كاش إلى الرقم أعلاه، ثم انتظر تأكيد المسؤول لتفعيل الترخيص تلقائياً.',
  },
];

export function getPaymentMethods(): PaymentMethod[] {
  try {
    const stored = localStorage.getItem(PAYMENT_CONFIG_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...DEFAULT_PAYMENT_METHODS];
}

export function savePaymentMethods(methods: PaymentMethod[]) {
  localStorage.setItem(PAYMENT_CONFIG_KEY, JSON.stringify(methods));
}
