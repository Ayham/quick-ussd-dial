// License history archive — stored in localStorage
const LICENSE_HISTORY_KEY = 'admin_license_history_v1';
const KEY_GENERATION_LOG_KEY = 'admin_key_gen_log_v1';

export interface LicenseRecord {
  id: string;
  deviceId: string;
  expiryDate: string;
  createdAt: string; // ISO timestamp
  licenseKey: string;
  customerNote?: string;
}

export interface KeyGenerationRecord {
  id: string;
  createdAt: string;
  publicKeyFingerprint: string; // first 12 chars of n
}

// License history
export function getLicenseHistory(): LicenseRecord[] {
  try {
    const stored = localStorage.getItem(LICENSE_HISTORY_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function addLicenseRecord(record: Omit<LicenseRecord, 'id'>): LicenseRecord {
  const history = getLicenseHistory();
  const newRecord: LicenseRecord = {
    ...record,
    id: crypto.randomUUID(),
  };
  history.unshift(newRecord); // newest first
  localStorage.setItem(LICENSE_HISTORY_KEY, JSON.stringify(history));
  return newRecord;
}

export function deleteLicenseRecord(id: string) {
  const history = getLicenseHistory().filter(r => r.id !== id);
  localStorage.setItem(LICENSE_HISTORY_KEY, JSON.stringify(history));
}

export function updateLicenseNote(id: string, note: string) {
  const history = getLicenseHistory().map(r =>
    r.id === id ? { ...r, customerNote: note } : r
  );
  localStorage.setItem(LICENSE_HISTORY_KEY, JSON.stringify(history));
}

// Key generation log
export function getKeyGenerationLog(): KeyGenerationRecord[] {
  try {
    const stored = localStorage.getItem(KEY_GENERATION_LOG_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function addKeyGenerationRecord(publicKeyN: string) {
  const log = getKeyGenerationLog();
  log.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    publicKeyFingerprint: publicKeyN.substring(0, 16) + '...',
  });
  localStorage.setItem(KEY_GENERATION_LOG_KEY, JSON.stringify(log));
}

// Stats
export function getLicenseStats() {
  const history = getLicenseHistory();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7); // "YYYY-MM"

  const total = history.length;
  const active = history.filter(r => r.expiryDate >= today).length;
  const expired = history.filter(r => r.expiryDate < today).length;
  const thisMonthCount = history.filter(r => r.createdAt.startsWith(thisMonth)).length;
  const todayCount = history.filter(r => r.createdAt.startsWith(today)).length;

  // Unique devices
  const uniqueDevices = new Set(history.map(r => r.deviceId)).size;

  return { total, active, expired, thisMonthCount, todayCount, uniqueDevices };
}
