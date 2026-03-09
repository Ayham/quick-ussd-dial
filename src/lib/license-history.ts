// Obfuscated storage keys
const _SYS_HIST_KEY = '_sys_v1_rec_dat';
const _SYS_KGEN_KEY = '_sys_v1_kgl_dat';

export interface LicenseRecord {
  id: string;
  deviceId: string;
  expiryDate: string;
  createdAt: string;
  licenseKey: string;
  customerNote?: string;
}

export interface KeyGenerationRecord {
  id: string;
  createdAt: string;
  publicKeyFingerprint: string;
}

export function getLicenseHistory(): LicenseRecord[] {
  try {
    const stored = localStorage.getItem(_SYS_HIST_KEY);
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
  history.unshift(newRecord);
  localStorage.setItem(_SYS_HIST_KEY, JSON.stringify(history));
  return newRecord;
}

export function deleteLicenseRecord(id: string) {
  const history = getLicenseHistory().filter(r => r.id !== id);
  localStorage.setItem(_SYS_HIST_KEY, JSON.stringify(history));
}

export function updateLicenseNote(id: string, note: string) {
  const history = getLicenseHistory().map(r =>
    r.id === id ? { ...r, customerNote: note } : r
  );
  localStorage.setItem(_SYS_HIST_KEY, JSON.stringify(history));
}

export function getKeyGenerationLog(): KeyGenerationRecord[] {
  try {
    const stored = localStorage.getItem(_SYS_KGEN_KEY);
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
  localStorage.setItem(_SYS_KGEN_KEY, JSON.stringify(log));
}

export function getLicenseStats() {
  const history = getLicenseHistory();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);

  const total = history.length;
  const active = history.filter(r => r.expiryDate >= today).length;
  const expired = history.filter(r => r.expiryDate < today).length;
  const thisMonthCount = history.filter(r => r.createdAt.startsWith(thisMonth)).length;
  const todayCount = history.filter(r => r.createdAt.startsWith(today)).length;
  const uniqueDevices = new Set(history.map(r => r.deviceId)).size;

  return { total, active, expired, thisMonthCount, todayCount, uniqueDevices };
}
