const ADMIN_CREDENTIALS_KEY = 'app_admin_creds_v1';
const ADMIN_INITIALIZED_KEY = 'app_admin_init_v1';

export interface AdminCredentials {
  username: string;
  password: string;
}

export function isAdminInitialized(): boolean {
  return localStorage.getItem(ADMIN_INITIALIZED_KEY) === 'true';
}

export function getAdminCredentials(): AdminCredentials | null {
  try {
    const stored = localStorage.getItem(ADMIN_CREDENTIALS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

export function saveAdminCredentials(creds: AdminCredentials) {
  localStorage.setItem(ADMIN_CREDENTIALS_KEY, JSON.stringify(creds));
  localStorage.setItem(ADMIN_INITIALIZED_KEY, 'true');
}

export function verifyAdmin(username: string, password: string): boolean {
  const creds = getAdminCredentials();
  if (!creds) return false; // No credentials set yet
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
