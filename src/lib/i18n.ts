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
      activation: "التفعيل",
      activationDesc: "الاشتراك والدفع",
      settings: "الإعدادات",
      settingsDesc: "إعدادات التطبيق",
      updates: "التحديثات",
      updatesDesc: "التحقق من التحديثات",
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
    activation: {
      title: "تفعيل التطبيق",
      trialExpired: "انتهت الفترة التجريبية",
      licenseExpired: "انتهت صلاحية الترخيص",
      enterKey: "مفتاح الترخيص",
      keyPlaceholder: "AB12-CD34-EF56",
      activate: "تفعيل",
      verifying: "جاري التحقق...",
      deviceId: "معرف الجهاز",
      requestActivation: "طلب التفعيل",
      copyLink: "تم إرسال طلب التفعيل. سيتم تفعيل التطبيق تلقائياً بعد موافقة الإدارة.",
      linkCopied: "تم نسخ رابط التفعيل",
      success: "تم تفعيل التطبيق بنجاح!",
      invalid: "مفتاح الترخيص غير صالح",
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
      customers: "العملاء",
      devices: "الأجهزة",
      licenses: "التراخيص",
      activations: "طلبات التفعيل",
      transfers: "التحويلات",
      events: "الأحداث",
      sync: "المزامنة",
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
      activation: "Activation",
      activationDesc: "Subscription & payment",
      settings: "Settings",
      settingsDesc: "App settings",
      updates: "Updates",
      updatesDesc: "Check for updates",
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
    activation: {
      title: "Activate App",
      trialExpired: "Trial Period Expired",
      licenseExpired: "License Expired",
      enterKey: "License Key",
      keyPlaceholder: "AB12-CD34-EF56",
      activate: "Activate",
      verifying: "Verifying...",
      deviceId: "Device ID",
      requestActivation: "Request Activation",
      copyLink: "Activation request sent. The app will activate automatically after admin approval.",
      linkCopied: "Activation link copied",
      success: "App activated successfully!",
      invalid: "Invalid license key",
      daysLeft: "Days left: {{days}}",
      permanent: "Permanent",
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
      devices: "Devices",
      licenses: "Licenses",
      activations: "Activations",
      transfers: "Transfers",
      events: "Events",
      sync: "Sync Status",
      users: "Users",
      monitoring: "Monitoring",
      analytics: "Analytics",
      generateLicense: "Generate License",
      manageTrials: "Manage Trials",
      viewLogs: "View Logs",
      exportData: "Export Data",
      totalDevices: "Total Devices",
      activeDevices: "Active Devices",
      blockedDevices: "Blocked Devices",
      totalTransfers: "Total Transfers",
      totalValue: "Total Value",
      lastSync: "Last Sync",
      syncStatus: "Sync Status",
      online: "Online",
      offline: "Offline",
      queueSize: "Queue Size",
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
