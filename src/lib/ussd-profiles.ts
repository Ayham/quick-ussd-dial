export type Operator = "mtn" | "syriatel";

export interface AmountPreset {
  amount: number;
  price: number;
}

export interface OperatorCredentials {
  mtnSecret: string;       // الرمز السري لشريحة MTN
  syriatelSerial: string;  // الرقم السيري لشريحة سيريتيل
  syriatelDistributor: string; // كود الموزع سيريتيل
}

export const DEFAULT_MTN_PRESETS: AmountPreset[] = [
  { amount: 5000, price: 5500 },
  { amount: 10000, price: 11000 },
  { amount: 15000, price: 16500 },
  { amount: 20000, price: 22000 },
  { amount: 25000, price: 27500 },
  { amount: 50000, price: 55000 },
];

export const DEFAULT_SYRIATEL_PRESETS: AmountPreset[] = [
  { amount: 5000, price: 5500 },
  { amount: 10000, price: 11000 },
  { amount: 15000, price: 16500 },
  { amount: 20000, price: 22000 },
  { amount: 25000, price: 27500 },
  { amount: 50000, price: 55000 },
];

// MTN: *150*{secret}*{phone}*{amount}#
// Syriatel: *150*1*{serial}*1*{amount}*{phone}*{phone}#
const USSD_TEMPLATES: Record<Operator, string> = {
  mtn: "*150*{secret}*{phone}*{amount}#",
  syriatel: "*150*1*{serial}*1*{amount}*{phone}*{phone}#",
};

// MTN: 093, 094, 095, 096
// Syriatel: 091, 092, 098, 099
const MTN_PREFIXES = ["093", "094", "095", "096"];
const SYRIATEL_PREFIXES = ["091", "092", "098", "099"];

export function detectOperator(phone: string): Operator | null {
  const cleaned = phone.replace(/\s/g, "");
  const prefix = cleaned.substring(0, 3);
  if (MTN_PREFIXES.includes(prefix)) return "mtn";
  if (SYRIATEL_PREFIXES.includes(prefix)) return "syriatel";
  return null;
}

export function buildUssdCode(
  operator: Operator,
  phone: string,
  amount: string,
  credentials: OperatorCredentials
): string {
  return USSD_TEMPLATES[operator]
    .replace(/\{phone\}/g, phone)
    .replace(/\{amount\}/g, amount)
    .replace(/\{secret\}/g, credentials.mtnSecret)
    .replace(/\{serial\}/g, credentials.syriatelSerial);
}

export function dialUssd(ussdCode: string) {
  const encoded = encodeURIComponent(ussdCode);
  window.location.href = `tel:${encoded}`;
}

// Preset persistence
const STORAGE_KEY = "ussd-presets";
const CREDENTIALS_KEY = "ussd-credentials";

export function getPresets(): Record<Operator, AmountPreset[]> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { mtn: DEFAULT_MTN_PRESETS, syriatel: DEFAULT_SYRIATEL_PRESETS };
}

export function savePresets(presets: Record<Operator, AmountPreset[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function getCredentials(): OperatorCredentials {
  try {
    const stored = localStorage.getItem(CREDENTIALS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { mtnSecret: "", syriatelSerial: "", syriatelDistributor: "" };
}

export function saveCredentials(credentials: OperatorCredentials) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
}
