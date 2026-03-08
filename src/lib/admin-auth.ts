const ADMIN_CREDENTIALS_KEY = 'app_admin_creds_v1';
const LOGIN_ATTEMPTS_KEY = 'app_login_attempts_v1';
const LOCKOUT_UNTIL_KEY = 'app_lockout_until_v1';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

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

// ============ Lockout System ============

function getFailedAttempts(): number {
  return Number(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || '0');
}

function setFailedAttempts(count: number) {
  localStorage.setItem(LOGIN_ATTEMPTS_KEY, String(count));
}

function setLockoutUntil(time: number) {
  localStorage.setItem(LOCKOUT_UNTIL_KEY, String(time));
}

function getLockoutUntil(): number {
  return Number(localStorage.getItem(LOCKOUT_UNTIL_KEY) || '0');
}

export function getLockoutInfo(): { locked: boolean; remainingSeconds: number; attempts: number } {
  const until = getLockoutUntil();
  const now = Date.now();
  if (until > now) {
    return { locked: true, remainingSeconds: Math.ceil((until - now) / 1000), attempts: getFailedAttempts() };
  }
  // Reset if lockout expired
  if (until > 0) {
    setFailedAttempts(0);
    setLockoutUntil(0);
  }
  return { locked: false, remainingSeconds: 0, attempts: getFailedAttempts() };
}

export function verifyAdmin(username: string, password: string): 'success' | 'invalid' | 'locked' {
  const lockout = getLockoutInfo();
  if (lockout.locked) return 'locked';

  const creds = getAdminCredentials();
  if (username === creds.username && password === creds.password) {
    // Reset on success
    setFailedAttempts(0);
    setLockoutUntil(0);
    return 'success';
  }

  // Failed attempt
  const attempts = getFailedAttempts() + 1;
  setFailedAttempts(attempts);

  if (attempts >= MAX_ATTEMPTS) {
    setLockoutUntil(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  }

  return 'invalid';
}

export function getRemainingAttempts(): number {
  return Math.max(0, MAX_ATTEMPTS - getFailedAttempts());
}

// Session — simple in-memory flag (resets on reload)
let adminAuthenticated = false;

export function isAdminAuthenticated(): boolean {
  return adminAuthenticated;
}

export function setAdminAuthenticated(val: boolean) {
  adminAuthenticated = val;
}
