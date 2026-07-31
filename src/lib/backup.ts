import { APP_VERSION } from "@/config/version";
import {
  getPresets, savePresets,
  getCredentials, saveCredentials,
  getUssdTemplates, saveUssdTemplates,
  getPrefixes, savePrefixes,
  getSimAssignment, saveSimAssignment,
  getBalanceTemplates, saveBalanceTemplates,
  resetAllSettings,
  type OperatorCredentials, type UssdTemplates, type OperatorPrefixes,
  type SimAssignment, type BalanceCheckTemplates, type AmountPreset,
} from "@/lib/ussd-profiles";
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
  credentials: OperatorCredentials;
  ussdTemplates: UssdTemplates;
  balanceTemplates: BalanceCheckTemplates;
  prefixes: OperatorPrefixes;
  simAssignment: SimAssignment;
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
    credentials: getCredentials(),
    ussdTemplates: getUssdTemplates(),
    balanceTemplates: getBalanceTemplates(),
    prefixes: getPrefixes(),
    simAssignment: getSimAssignment(),
    transferHistory: getHistory(),
    balanceStore: getSavedBalances(),
    balanceTracking: localStorage.getItem(BALANCE_TRACKING_KEY),
    lowBalanceThresholds: localStorage.getItem(LOW_BALANCE_THRESHOLD_KEY),
  };
}

export function createBackup(password?: string): string {
  const backup = buildBackupData();
  const json = JSON.stringify(backup, null, 2);

  if (password) {
    return encryptBackup(json, password);
  }

  return json;
}

function encryptBackup(data: string, password: string): string {
  let key = 0;
  for (let i = 0; i < password.length; i++) {
    key += password.charCodeAt(i);
  }
  const shift = (key % 94) + 1;
  let encrypted = "";
  const printableStart = 32;
  const printableRange = 94;
  for (let i = 0; i < data.length; i++) {
    encrypted += String.fromCharCode(((data.charCodeAt(i) - printableStart + shift) % printableRange) + printableStart);
  }
  return JSON.stringify({
    _encrypted: true,
    _backup_version: BACKUP_VERSION,
    _created_at: new Date().toISOString(),
    _app_version: APP_VERSION,
    payload: encrypted,
  });
}

function decryptBackup(encryptedData: string, password: string): string | null {
  try {
    const wrapper = JSON.parse(encryptedData);
    if (!wrapper._encrypted) return null;

    let key = 0;
    for (let i = 0; i < password.length; i++) {
      key += password.charCodeAt(i);
    }
    const shift = (key % 94) + 1;
    const printableStart = 32;
    const printableRange = 94;
    let decrypted = "";
    for (let i = 0; i < wrapper.payload.length; i++) {
      decrypted += String.fromCharCode(((wrapper.payload.charCodeAt(i) - printableStart - shift + printableRange) % printableRange) + printableStart);
    }
    return decrypted;
  } catch {
    return null;
  }
}

export function validateBackup(data: unknown): { valid: boolean; errors: string[]; preview: BackupPreview | null } {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push("الملف غير صالح");
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
    errors.push("missing backup_version");
  }

  const supportedVersions = ["1.0"];
  if (obj.backup_version && !supportedVersions.includes(obj.backup_version as string)) {
    errors.push(`إصدار النسخة الاحتياطية غير مدعوم: ${obj.backup_version}`);
  }

  const hasPresets = !!obj.presets && typeof obj.presets === "object";
  const hasHistory = !!obj.transferHistory && Array.isArray(obj.transferHistory);
  const hasBalance = !!obj.balanceStore && typeof obj.balanceStore === "object";

  const preview: BackupPreview = {
    backupVersion: String(obj.backup_version || "unknown"),
    createdAt: String(obj.created_at || ""),
    appVersion: String(obj.app_version || ""),
    presetsCount: hasPresets ? Object.values(obj.presets as Record<string, unknown>).reduce(
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
    errors.push("الملف لا يحتوي على بيانات قابلة للاستعادة");
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
    presetsCount: hasPresets ? Object.values(obj.presets as Record<string, unknown>).reduce(
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

export function restoreBackup(data: unknown, password?: string): { success: boolean; error?: string; restored: string[] } {
  let json: string;

  if (typeof data === "string") {
    json = data;
  } else if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    if (obj._encrypted && password) {
      json = decryptBackup(JSON.stringify(obj), password);
      if (!json) return { success: false, error: "كلمة المرور غير صحيحة" };
    } else if (obj._encrypted && !password) {
      return { success: false, error: "البيانات مشفرة — يرجى إدخال كلمة المرور" };
    } else {
      return { success: false, error: "بيانات غير صالحة" };
    }
  } else {
    return { success: false, error: "ملف غير صالح" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { success: false, error: "فشل قراءة الملف" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { success: false, error: "هيكل البيانات غير صالح" };
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

  if (obj.credentials) {
    try {
      saveCredentials(obj.credentials as OperatorCredentials);
      restored.push("credentials");
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
      localStorage.setItem(BALANCE_TRACKING_KEY, obj.balanceTracking);
      restored.push("balanceTracking");
    } catch { /* skip */ }
  }

  if (obj.lowBalanceThresholds) {
    try {
      localStorage.setItem(LOW_BALANCE_THRESHOLD_KEY, obj.lowBalanceThresholds);
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