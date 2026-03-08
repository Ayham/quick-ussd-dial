/**
 * Marketing & App Config
 * إدارة الباقات والتحديثات والروابط
 */

const PACKAGES_KEY = 'app-packages-v1';
const APP_CONFIG_KEY = 'app-config-v1';
const RELEASES_KEY = 'app-releases-v1';

export interface AppPackage {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration: string; // 'monthly' | 'yearly' | 'lifetime' | 'trial'
  durationLabel: string;
  features: string[];
  popular?: boolean;
  enabled: boolean;
}

export interface AppRelease {
  id: string;
  version: string;
  downloadUrl: string;
  changelog: string;
  releaseDate: string;
  isLatest: boolean;
}

export interface AppConfig {
  appVersion: string;
  downloadUrl: string;
  whatsappContact: string;
  changelog: string;
  heroTitle: string;
  heroSubtitle: string;
}

const DEFAULT_PACKAGES: AppPackage[] = [
  {
    id: 'trial',
    name: 'تجربة مجانية',
    price: 0,
    currency: 'ل.س',
    duration: 'trial',
    durationLabel: '30 يوم',
    features: ['تحويل رصيد سريع', 'كشف المشغل تلقائياً', 'سجل التحويلات'],
    enabled: true,
  },
  {
    id: 'monthly',
    name: 'شهري',
    price: 25000,
    currency: 'ل.س',
    duration: 'monthly',
    durationLabel: 'شهر واحد',
    features: ['جميع الميزات', 'دعم فني واتساب', 'تحديثات مستمرة', 'إدارة الموزع'],
    enabled: true,
  },
  {
    id: 'yearly',
    name: 'سنوي',
    price: 200000,
    currency: 'ل.س',
    duration: 'yearly',
    durationLabel: 'سنة كاملة',
    features: ['جميع الميزات', 'دعم فني أولوية', 'تحديثات مستمرة', 'إدارة الموزع', 'نسخ احتياطي'],
    popular: true,
    enabled: true,
  },
  {
    id: 'lifetime',
    name: 'دائم',
    price: 500000,
    currency: 'ل.س',
    duration: 'lifetime',
    durationLabel: 'مدى الحياة',
    features: ['جميع الميزات للأبد', 'دعم فني VIP', 'تحديثات مدى الحياة', 'إدارة الموزع', 'نسخ احتياطي', 'أولوية الميزات الجديدة'],
    enabled: true,
  },
];

const DEFAULT_CONFIG: AppConfig = {
  appVersion: '1.0.0',
  downloadUrl: '',
  whatsappContact: '',
  changelog: 'الإصدار الأول من التطبيق',
  heroTitle: 'تحويل الرصيد بلمسة واحدة',
  heroSubtitle: 'أسرع وأسهل طريقة لتحويل رصيد سيريتل و MTN في سوريا',
};

export function getPackages(): AppPackage[] {
  try {
    const stored = localStorage.getItem(PACKAGES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...DEFAULT_PACKAGES];
}

export function savePackages(packages: AppPackage[]) {
  localStorage.setItem(PACKAGES_KEY, JSON.stringify(packages));
}

export function getAppConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(APP_CONFIG_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveAppConfig(config: AppConfig) {
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(config));
}

// ======= Releases =======

export function getReleases(): AppRelease[] {
  try {
    const stored = localStorage.getItem(RELEASES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function saveReleases(releases: AppRelease[]) {
  localStorage.setItem(RELEASES_KEY, JSON.stringify(releases));
}

export function addRelease(release: Omit<AppRelease, 'id'>): AppRelease[] {
  const releases = getReleases();
  // Mark all as not latest
  if (release.isLatest) {
    releases.forEach(r => r.isLatest = false);
  }
  const newRelease: AppRelease = { ...release, id: crypto.randomUUID() };
  releases.unshift(newRelease);
  saveReleases(releases);
  return releases;
}

export function deleteRelease(id: string): AppRelease[] {
  const releases = getReleases().filter(r => r.id !== id);
  saveReleases(releases);
  return releases;
}

export function getLatestRelease(): AppRelease | undefined {
  return getReleases().find(r => r.isLatest) || getReleases()[0];
}
