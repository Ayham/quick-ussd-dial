const ADMIN_CREDENTIALS_KEY = 'app_admin_creds_v1';

// كلمة السر الافتراضية المدمجة — لا يمكن لأحد إنشاء حساب جديد بدون معرفتها
const DEFAULT_CREDENTIALS = {
  username: 'admin',
  password: 'Password@5@164',
};

export interface AdminCredentials {
  username: string;
  password: string;
}

export function getAdminCredentials(): AdminCredentials {
  try {
    const stored = localStorage.getItem(ADMIN_CREDENTIALS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.username && parsed.password) return parsed;
    }
  } catch {}
  return DEFAULT_CREDENTIALS;
}

export function saveAdminCredentials(creds: AdminCredentials) {
  localStorage.setItem(ADMIN_CREDENTIALS_KEY, JSON.stringify(creds));
}

export function verifyAdmin(username: string, password: string): boolean {
  const creds = getAdminCredentials();
  return username === creds.username && password === creds.password;
}

// Session — simple in-memory flag (resets on reload)
let adminAuthenticated = false;

export function isAdminAuthenticated(): boolean {
  return adminAuthenticated;
}

export function setAdminAuthenticated(val: boolean) {
  adminAuthenticated = val;
}
