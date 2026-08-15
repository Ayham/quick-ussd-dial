import { APP_VERSION } from "@/config/version";
import i18n from "@/lib/i18n";
import {
  getPresets, savePresets,
  getUssdTemplates, saveUssdTemplates,
  getPrefixes, savePrefixes,
  getSimAssignment, saveSimAssignment,
  getBalanceTemplates, saveBalanceTemplates,
  resetAllSettings,
  type UssdTemplates, type OperatorPrefixes,
  type SimAssignment, type BalanceCheckTemplates, type AmountPreset,
} from "@/lib/ussd-profiles";
import { getBusinessName, saveBusinessName } from "@/lib/onboarding";
import { getHistory } from "@/lib/transfer-history";
import { getLowBalanceThresholds, saveLowBalanceThresholds, clearAllBalanceData } from "@/lib/balance-tracking";

const BALANCE_STORAGE_KEY = "saved_balances_v1";
const BALANCE_TRACKING_KEY = "balance_tracking_v2";
const LOW_BALANCE_THRESHOLD_KEY = "low_balance_thresholds_v1";
const WARNING_SHOWN_KEY = "low_balance_warning_shown_v1";

interface SavedBalance {
  amount: number;
  timestamp: number;
}

type BalanceStore = Record<string, SavedBalance | null>;

function getSavedBalances(): BalanceStore | null {
  try {
    const stored = localStorage.getItem(BALANCE_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as BalanceStore;
  } catch {}
  return null;
}

export const BACKUP_VERSION = "1.0";

export interface BackupData {
  backup_version: string;
  created_at: string;
  app_version: string;
  presets: Record<string, AmountPreset[]>;
  ussdTemplates: UssdTemplates;
  balanceTemplates: BalanceCheckTemplates;
  prefixes: OperatorPrefixes;
  simAssignment: SimAssignment;
  businessName: string;
  transferHistory: Array<{
    phone: string;
    amount: string;
    price?: string;
    operator: string;
    timestamp: number;
    status: "success" | "failed" | "pending";
    transferType?: "phone" | "secret";
  }>;
  balanceStore: BalanceStore | null;
  balanceTracking: unknown | null;
  lowBalanceThresholds: unknown | null;
}

export interface BackupPreview {
  backupVersion: string;
  createdAt: string;
  appVersion: string;
  presetsCount: number;
  transferCount: number;
  balanceEntries: number;
}

export interface CleanupResult {
  removed: number;
  remaining: number;
  cleanedKeys: string[];
}

function buildBackupData(): BackupData {
  return {
    backup_version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    app_version: APP_VERSION,
    presets: getPresets(),
    ussdTemplates: getUssdTemplates(),
    balanceTemplates: getBalanceTemplates(),
    prefixes: getPrefixes(),
    simAssignment: getSimAssignment(),
    businessName: getBusinessName(),
    transferHistory: getHistory(),
    balanceStore: getSavedBalances(),
    balanceTracking: localStorage.getItem(BALANCE_TRACKING_KEY),
    lowBalanceThresholds: localStorage.getItem(LOW_BALANCE_THRESHOLD_KEY),
  };
}

export async function createBackup(password?: string): Promise<string> {
  const backup = buildBackupData();
  const json = JSON.stringify(backup, null, 2);

  if (password) {
    return await encryptBackup(json, password);
  }

  return json;
}

async function getEncryptionKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("raseed-backup-v1"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptBackup(data: string, password: string): Promise<string> {
  const key = await getEncryptionKey(password);
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(data);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  const payload = btoa(String.fromCharCode(...combined));
  return JSON.stringify({
    _encrypted: true,
    _backup_version: BACKUP_VERSION,
    _created_at: new Date().toISOString(),
    _app_version: APP_VERSION,
    payload,
  });
}

async function decryptBackup(encryptedData: string, password: string): Promise<string | null> {
  try {
    const wrapper = JSON.parse(encryptedData);
    if (!wrapper._encrypted) return null;

    const key = await getEncryptionKey(password);
    const combined = Uint8Array.from(atob(wrapper.payload), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch {
    return null;
  }
}

export function validateBackup(data: unknown): { valid: boolean; errors: string[]; preview: BackupPreview | null } {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push(i18n.t("errors.invalidBackupFile"));
    return { valid: false, errors, preview: null };
  }

  const obj = data as Record<string, unknown>;

  if (obj._encrypted) {
    const preview: BackupPreview = {
      backupVersion: String(obj._backup_version || "unknown"),
      createdAt: String(obj._created_at || ""),
      appVersion: String(obj._app_version || ""),
      presetsCount: 0,
      transferCount: 0,
      balanceEntries: 0,
    };
    return { valid: true, errors: [], preview };
  }

  if (!obj.backup_version || typeof obj.backup_version !== "string") {
    errors.push(i18n.t("errors.backupMissingVersion"));
  }

  const supportedVersions = ["1.0"];
  if (obj.backup_version && !supportedVersions.includes(obj.backup_version as string)) {
    errors.push(i18n.t("errors.backupUnsupportedVersion", { version: obj.backup_version }));
  }

  const hasPresets = !!obj.presets && typeof obj.presets === "object";
  const hasHistory = !!obj.transferHistory && Array.isArray(obj.transferHistory);
  const hasBalance = !!obj.balanceStore && typeof obj.balanceStore === "object";

  const preview: BackupPreview = {
    backupVersion: String(obj.backup_version || "unknown"),
    createdAt: String(obj.created_at || ""),
    appVersion: String(obj.app_version || ""),
    presetsCount: hasPresets ? Object.values(obj.presets as Record<string, unknown>).reduce<number>(
      (sum, v) => sum + ((v as unknown[])?.length ?? 0), 0
    ) : 0,
    transferCount: hasHistory ? (obj.transferHistory as unknown[]).length : 0,
    balanceEntries: hasBalance
      ? Object.values(obj.balanceStore as Record<string, unknown>).filter(
          (v) => v && typeof v === "object" && "amount" in (v as object)
        ).length
      : 0,
  };

  if (!hasPresets && !hasHistory && !hasBalance) {
    errors.push(i18n.t("errors.backupNoRestorableData"));
  }

  return { valid: errors.length === 0, errors, preview };
}

export function getBackupPreview(data: unknown): BackupPreview | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;

  if (obj._encrypted) {
    return {
      backupVersion: String(obj._backup_version || "unknown"),
      createdAt: String(obj._created_at || ""),
      appVersion: String(obj._app_version || ""),
      presetsCount: 0,
      transferCount: 0,
      balanceEntries: 0,
    };
  }

  const hasPresets = !!obj.presets && typeof obj.presets === "object";
  const hasHistory = !!obj.transferHistory && Array.isArray(obj.transferHistory);
  const hasBalance = !!obj.balanceStore && typeof obj.balanceStore === "object";

  return {
    backupVersion: String(obj.backup_version || "unknown"),
    createdAt: String(obj.created_at || ""),
    appVersion: String(obj.app_version || ""),
    presetsCount: hasPresets ? Object.values(obj.presets as Record<string, unknown>).reduce<number>(
      (sum, v) => sum + ((v as unknown[])?.length ?? 0), 0
    ) : 0,
    transferCount: hasHistory ? (obj.transferHistory as unknown[]).length : 0,
    balanceEntries: hasBalance
      ? Object.values(obj.balanceStore as Record<string, unknown>).filter(
          (v) => v && typeof v === "object" && "amount" in (v as object)
        ).length
      : 0,
  };
}

export async function restoreBackup(data: unknown, password?: string): Promise<{ success: boolean; error?: string; restored?: string[] }> {
  let json: string;

  if (typeof data === "string") {
    json = data;
  } else if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    if (obj._encrypted && password) {
      json = await decryptBackup(JSON.stringify(obj), password);
      if (!json) return { success: false, error: i18n.t("errors.wrongPassword") };
    } else if (obj._encrypted && !password) {
      return { success: false, error: i18n.t("errors.encryptedDataPasswordRequired") };
    } else {
      return { success: false, error: i18n.t("errors.invalidData") };
    }
  } else {
    return { success: false, error: i18n.t("errors.invalidFile") };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { success: false, error: i18n.t("errors.failedReadFile") };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { success: false, error: i18n.t("errors.invalidDataStructure") };
  }

  const obj = parsed as Record<string, unknown>;
  const restored: string[] = [];

  if (obj.presets) {
    try {
      const presets = obj.presets as Record<string, AmountPreset[]>;
      if (presets.mtn && presets.syriatel) {
        savePresets(presets);
        restored.push("presets");
      }
    } catch { /* skip */ }
  }

  if (obj.businessName !== undefined && obj.businessName !== null) {
    try {
      saveBusinessName(String(obj.businessName));
      restored.push("businessName");
    } catch { /* skip */ }
  }

  if (obj.ussdTemplates) {
    try {
      saveUssdTemplates(obj.ussdTemplates as UssdTemplates);
      restored.push("ussdTemplates");
    } catch { /* skip */ }
  }

  if (obj.balanceTemplates) {
    try {
      saveBalanceTemplates(obj.balanceTemplates as BalanceCheckTemplates);
      restored.push("balanceTemplates");
    } catch { /* skip */ }
  }

  if (obj.prefixes) {
    try {
      savePrefixes(obj.prefixes as OperatorPrefixes);
      restored.push("prefixes");
    } catch { /* skip */ }
  }

  if (obj.simAssignment) {
    try {
      saveSimAssignment(obj.simAssignment as SimAssignment);
      restored.push("simAssignment");
    } catch { /* skip */ }
  }

  if (obj.transferHistory && Array.isArray(obj.transferHistory)) {
    try {
      localStorage.setItem("transfer-history", JSON.stringify(obj.transferHistory));
      restored.push("transferHistory");
    } catch { /* skip */ }
  }

  if (obj.balanceStore && typeof obj.balanceStore === "object") {
    try {
      localStorage.setItem(BALANCE_STORAGE_KEY, JSON.stringify(obj.balanceStore));
      restored.push("balanceStore");
    } catch { /* skip */ }
  }

  if (obj.balanceTracking) {
    try {
      localStorage.setItem(BALANCE_TRACKING_KEY, obj.balanceTracking as string);
      restored.push("balanceTracking");
    } catch { /* skip */ }
  }

  if (obj.lowBalanceThresholds) {
    try {
      localStorage.setItem(LOW_BALANCE_THRESHOLD_KEY, obj.lowBalanceThresholds as string);
      saveLowBalanceThresholds(JSON.parse(obj.lowBalanceThresholds as string));
      restored.push("lowBalanceThresholds");
    } catch { /* skip */ }
  }

  return { success: true, restored };
}

export function cleanOldHistory(olderThanMs: number): CleanupResult {
  const history = getHistory();
  const cutoff = Date.now() - olderThanMs;
  const filtered = history.filter((r) => r.timestamp > cutoff);
  const removed = history.length - filtered.length;

  if (removed > 0) {
    localStorage.setItem("transfer-history", JSON.stringify(filtered));
  }

  return { removed, remaining: filtered.length, cleanedKeys: removed > 0 ? ["transfer-history"] : [] };
}

export function deleteAllHistory(): CleanupResult {
  const count = getHistory().length;
  localStorage.removeItem("transfer-history");
  return { removed: count, remaining: 0, cleanedKeys: ["transfer-history"] };
}

export function deleteAllData(): void {
  localStorage.removeItem("transfer-history");
  localStorage.removeItem("saved_balances_v1");
  clearAllBalanceData();
  resetAllSettings();
  localStorage.removeItem("business-name");
  localStorage.removeItem("business-name-skipped");
}

export function getStorageStats(): { totalBytes: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let total = 0;

  const keys = [
    "ussd-presets", "ussd-credentials", "ussd-templates",
    "operator-prefixes", "sim-assignment", "balance-templates",
    "transfer-history", "saved_balances_v1",
    "balance_tracking_v2", "low_balance_thresholds_v1",
    "low_balance_warning_shown_v1",
    "app_lang_v1", "last-secret-operator",
    "business-name", "business-name-skipped",
  ];

  for (const key of keys) {
    const val = localStorage.getItem(key);
    const bytes = val ? new Blob([val]).size : 0;
    breakdown[key] = bytes;
    total += bytes;
  }

  return { totalBytes: total, breakdown };
}

export function getFormattedSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}