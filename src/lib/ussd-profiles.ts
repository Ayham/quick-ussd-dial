export type Operator = "mtn" | "syriatel";
export type ThemeId = "theme1" | "theme2";

export interface AmountPreset {
  amount: number;
  price: number;
}

export interface OperatorCredentials {
  mtnSecret: string;
  syriatelSerial: string;
  syriatelDistributor: string;
}

export interface UssdThemes {
  mtn: Record<ThemeId, string>;
  syriatel: Record<ThemeId, string>;
}

export interface SelectedThemes {
  mtn: ThemeId;
  syriatel: ThemeId;
}

export const DEFAULT_MTN_PRESETS: AmountPreset[] = [
  { amount: 100, price: 12000 },
  { amount: 200, price: 25000 },
  { amount: 50, price: 6000 },
  { amount: 300, price: 36000 },
  { amount: 150, price: 18000 },
  { amount: 70, price: 9000 },
  { amount: 40, price: 5000 },
  { amount: 500, price: 60000 },
  { amount: 350, price: 44000 },
  { amount: 400, price: 50000 },
  { amount: 30, price: 4000 },
  { amount: 20, price: 2500 },
  { amount: 750, price: 90000 },
];

export const DEFAULT_SYRIATEL_PRESETS: AmountPreset[] = [
  { amount: 8173, price: 10000 },
  { amount: 4038, price: 5000 },
  { amount: 10096, price: 12000 },
  { amount: 16057, price: 20000 },
  { amount: 6250, price: 8000 },
  { amount: 3076, price: 4000 },
  { amount: 2019, price: 2500 },
  { amount: 2307, price: 3000 },
  { amount: 4807, price: 6000 },
  { amount: 5288, price: 7000 },
  { amount: 7211, price: 9000 },
  { amount: 10576, price: 13000 },
  { amount: 11538, price: 14000 },
  { amount: 13076, price: 16000 },
  { amount: 14423, price: 18000 },
  { amount: 18365, price: 23000 },
  { amount: 19230, price: 24000 },
  { amount: 21153, price: 26000 },
  { amount: 24038, price: 29000 },
  { amount: 28846, price: 36000 },
  { amount: 31730, price: 40000 },
  { amount: 37019, price: 46000 },
  { amount: 43269, price: 54000 },
  { amount: 48076, price: 60000 },
  { amount: 57692, price: 70000 },
  { amount: 72115, price: 90000 },
];

export const DEFAULT_USSD_THEMES: UssdThemes = {
  mtn: {
    theme1: "*150*{secret}*{phone}*{amount}#",
    theme2: "*150*{secret}*{amount}*{phone}#",
  },
  syriatel: {
    theme1: "*150*1*{serial}*1*{amount}*{phone}*{phone}#",
    theme2: "*150*1*{serial}*{amount}*{phone}#",
  },
};

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
  credentials: OperatorCredentials,
  themeId?: ThemeId
): string {
  const themes = getUssdThemes();
  const selectedThemes = getSelectedThemes();
  const activeTheme = themeId || selectedThemes[operator];
  const template = themes[operator][activeTheme];
  
  return template
    .replace(/\{phone\}/g, phone)
    .replace(/\{amount\}/g, amount)
    .replace(/\{secret\}/g, credentials.mtnSecret)
    .replace(/\{serial\}/g, credentials.syriatelSerial);
}

export function dialUssd(ussdCode: string) {
  const encoded = encodeURIComponent(ussdCode);
  window.location.href = `tel:${encoded}`;
}

const STORAGE_KEY = "ussd-presets";
const CREDENTIALS_KEY = "ussd-credentials";
const THEMES_KEY = "ussd-themes";
const SELECTED_THEMES_KEY = "ussd-selected-themes";

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

export function getUssdThemes(): UssdThemes {
  try {
    const stored = localStorage.getItem(THEMES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_USSD_THEMES;
}

export function saveUssdThemes(themes: UssdThemes) {
  localStorage.setItem(THEMES_KEY, JSON.stringify(themes));
}

export function getSelectedThemes(): SelectedThemes {
  try {
    const stored = localStorage.getItem(SELECTED_THEMES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { mtn: "theme1", syriatel: "theme1" };
}

export function saveSelectedThemes(selected: SelectedThemes) {
  localStorage.setItem(SELECTED_THEMES_KEY, JSON.stringify(selected));
}
