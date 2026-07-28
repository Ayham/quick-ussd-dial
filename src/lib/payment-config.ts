/**
 * Payment Methods Configuration
 * بيانات وسائل الدفع — تُعرض فقط للمستخدم ولا تتم أي معالجة دفع داخل التطبيق
 */

export interface PaymentMethod {
  id: string;
  name: string;
  nameEn: string;
  phone: string;
  icon: string; // emoji or icon name
  color: string; // tailwind color token
  instructions: string;
}
