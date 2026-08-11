/**
 * ============================================================
 *  🔢 رقم نسخة التطبيق — غيّر الرقم في package.json عند كل تحديث جديد
 * ============================================================
 * The version is injected at build time from package.json by Vite
 * (see vite.config.ts -> __APP_VERSION__), so the two can never drift.
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "1.2.2";
