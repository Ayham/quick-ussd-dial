import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const ar = {
  translation: {
    appName: "تحويل رصيد",
    nav: {
      transfer: "تحويل",
      transferDesc: "تحويل رصيد سريع",
      contacts: "جهات الاتصال",
      contactsDesc: "إدارة أسماء المتصلين",
      distributor: "الموزع",
      distributorDesc: "حساب الموزع",
      balance: "الرصيد",
      balanceDesc: "تتبع الرصيد",
      reports: "التقارير",
      reportsDesc: "إحصائيات التحويلات",
      settings: "الإعدادات",
      settingsDesc: "إعدادات التطبيق",
      updates: "التحديثات",
      updatesDesc: "التحقق من التحديثات",
      distributorManagement: "إدارة الموزعين",
      distributorManagementDesc: "إدارة العملاء والحسابات",
      profile: "الملف الشخصي",
      profileDesc: "الحساب واللغة",
    },
    common: {
      save: "حفظ", cancel: "إلغاء", delete: "حذف", edit: "تعديل",
      copy: "نسخ", share: "مشاركة", confirm: "تأكيد", close: "إغلاق",
      back: "رجوع", next: "التالي", login: "تسجيل الدخول", logout: "تسجيل الخروج",
      signup: "إنشاء حساب", continue: "متابعة", skip: "تخطي", success: "تم بنجاح",
      error: "حدث خطأ", loading: "جاري التحميل...", required: "مطلوب",
    },
    auth: {
      title: "تسجيل الدخول",
      subtitle: "إنشاء حساب اختياري لحفظ بياناتك في السحابة",
      email: "البريد الإلكتروني",
      password: "كلمة السر",
      displayName: "الاسم",
      signInGoogle: "متابعة بحساب Google",
      noAccount: "ليس لديك حساب؟",
      hasAccount: "لديك حساب؟",
      continueWithoutAccount: "المتابعة بدون حساب",
    },
    settings: {
      title: "الإعدادات",
      language: "اللغة",
      arabic: "العربية",
      english: "English",
    },
    admin: {
      dashboard: "لوحة التحكم",
      users: "المستخدمون",
      customers: "العملاء",
      transfers: "التحويلات",
      events: "الأحداث",
      sync: "المزامنة",
      distributors: "الموزعون",
      distributorCustomers: "عملاء الموزع",
      moveCustomer: "نقل العميل",
      assignCustomer: "تعيين العميل",
      customerAccount: "حساب العميل",
      transactions: "المعاملات",
      topupRequests: "طلبات الرصيد",
    },
  },
};

const en = {
  translation: {
    appName: "Quick USSD Dial",
    nav: {
      transfer: "Transfer",
      transferDesc: "Quick balance transfer",
      contacts: "Contacts",
      contactsDesc: "Manage customer names",
      distributor: "Distributor",
      distributorDesc: "Distributor account",
      balance: "Balance",
      balanceDesc: "Track balance",
      reports: "Reports",
      reportsDesc: "Transfer statistics",
      settings: "Settings",
      settingsDesc: "App settings",
      updates: "Updates",
      updatesDesc: "Check for updates",
      distributorManagement: "Distributor Management",
      distributorManagementDesc: "Manage customers & accounts",
      profile: "Profile",
      profileDesc: "Account & language",
    },
    common: {
      save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit",
      copy: "Copy", share: "Share", confirm: "Confirm", close: "Close",
      back: "Back", next: "Next", login: "Sign In", logout: "Sign Out",
      signup: "Sign Up", continue: "Continue", skip: "Skip", success: "Done",
      error: "Error", loading: "Loading...", required: "Required",
      yes: "Yes", no: "No", ok: "OK", search: "Search", reset: "Reset",
      export: "Export", import: "Import", download: "Download", upload: "Upload",
      status: "Status", active: "Active", inactive: "Inactive", pending: "Pending",
    },
    auth: {
      title: "Sign In",
      subtitle: "Optional account to back up your data to the cloud",
      email: "Email",
      password: "Password",
      displayName: "Name",
      signInGoogle: "Continue with Google",
      noAccount: "Don't have an account?",
      hasAccount: "Already have an account?",
      continueWithoutAccount: "Continue without an account",
    },
    settings: {
      title: "Settings",
      language: "Language",
      arabic: "العربية",
      english: "English",
      theme: "Theme",
      notifications: "Notifications",
      autoSync: "Auto Sync",
      about: "About",
    },
    admin: {
      dashboard: "Dashboard",
      customers: "Customers",
      transfers: "Transfers",
      events: "Events",
      sync: "Sync Status",
      users: "Users",
      monitoring: "Monitoring",
      analytics: "Analytics",
      viewLogs: "View Logs",
      exportData: "Export Data",
      totalTransfers: "Total Transfers",
      totalValue: "Total Value",
      lastSync: "Last Sync",
      syncStatus: "Sync Status",
      online: "Online",
      offline: "Offline",
      queueSize: "Queue Size",
      distributors: "Distributors",
      distributorCustomers: "Distributor Customers",
      moveCustomer: "Move Customer",
      assignCustomer: "Assign Customer",
      customerAccount: "Customer Account",
      transactions: "Transactions",
      topupRequests: "Topup Requests",
      pendingSync: "Pending Sync",
    },
  },
};

const STORAGE_KEY = "app_lang_v1";

// Ensure Arabic is set as default before i18n initialization
const savedLanguage = localStorage.getItem(STORAGE_KEY) as "ar" | "en" | null;
const browserLang = navigator.language.toLowerCase();
const detectedLang: "ar" | "en" = savedLanguage || (browserLang.startsWith("ar") ? "ar" : "ar"); // Default to Arabic

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ar, en },
    fallbackLng: "ar",
    lng: detectedLang, // Force initial language
    supportedLngs: ["ar", "en"],
    detection: { order: ["localStorage", "navigator"], lookupLocalStorage: STORAGE_KEY, caches: ["localStorage"] },
    interpolation: { escapeValue: false },
  });

export function setLanguage(lng: "ar" | "en") {
  i18n.changeLanguage(lng);
  localStorage.setItem(STORAGE_KEY, lng);
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
}

export function getLanguage(): "ar" | "en" {
  return (localStorage.getItem(STORAGE_KEY) as "ar" | "en") || "ar";
}

// Apply on load
const initial = getLanguage();
document.documentElement.lang = initial;
document.documentElement.dir = initial === "ar" ? "rtl" : "ltr";

export default i18n;
