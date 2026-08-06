/**
 * Dynamic Accent Color Theme System
 * -----------------------------------------------------
 * Material Design 3 inspired accent color engine.
 *
 * A selected accent preset is expanded into a full token
 * palette (primary, containers, hover / pressed / disabled
 * states, gradients, surface tints...) and applied globally
 * as CSS custom properties, so every component that consumes
 * `var(--primary)` (or any derived token) updates instantly.
 *
 * Persistence is plain localStorage, so the choice survives
 * app restarts, reboots, offline use and login/logout.
 */

export type AccentColorId =
  | "green"
  | "blue"
  | "indigo"
  | "purple"
  | "orange"
  | "red"
  | "cyan"
  | "teal"
  | "amber"
  | "pink"
  | "violet"
  | "rose";

export interface AccentPreset {
  id: AccentColorId;
  /** i18n key used to localize the color name */
  nameKey: string;
  /** Primary hue (0-360) of the light theme */
  hue: number;
  /** Primary saturation % of the light theme */
  saturation: number;
  /** Primary lightness % of the light theme */
  lightness: number;
}

export const DEFAULT_ACCENT_ID: AccentColorId = "green";

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "green", nameKey: "settings.colors.green", hue: 152, saturation: 60, lightness: 32 },
  { id: "blue", nameKey: "settings.colors.blue", hue: 217, saturation: 91, lightness: 45 },
  { id: "indigo", nameKey: "settings.colors.indigo", hue: 243, saturation: 75, lightness: 50 },
  { id: "purple", nameKey: "settings.colors.purple", hue: 270, saturation: 70, lightness: 52 },
  { id: "violet", nameKey: "settings.colors.violet", hue: 262, saturation: 86, lightness: 52 },
  { id: "pink", nameKey: "settings.colors.pink", hue: 330, saturation: 78, lightness: 50 },
  { id: "rose", nameKey: "settings.colors.rose", hue: 346, saturation: 84, lightness: 50 },
  { id: "red", nameKey: "settings.colors.red", hue: 0, saturation: 72, lightness: 50 },
  { id: "orange", nameKey: "settings.colors.orange", hue: 26, saturation: 90, lightness: 50 },
  { id: "amber", nameKey: "settings.colors.amber", hue: 38, saturation: 92, lightness: 47 },
  { id: "teal", nameKey: "settings.colors.teal", hue: 174, saturation: 72, lightness: 38 },
  { id: "cyan", nameKey: "settings.colors.cyan", hue: 189, saturation: 94, lightness: 40 },
];

const ACCENT_STORAGE_KEY = "accent-color-id";

function isAccentId(value: unknown): value is AccentColorId {
  return typeof value === "string" && ACCENT_PRESETS.some((p) => p.id === value);
}

export function getAccentId(): AccentColorId {
  try {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (stored && isAccentId(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCENT_ID;
}

export function saveAccentId(id: AccentColorId): void {
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearAccentId(): void {
  try {
    localStorage.removeItem(ACCENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getAccentPreset(id: AccentColorId): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
}

/** Solid hsl color string used for swatches / previews. */
export function getAccentSwatchColor(preset: AccentPreset): string {
  return `hsl(${preset.hue}, ${preset.saturation}%, ${preset.lightness}%)`;
}

/* ------------------------------------------------------------------ */
/* Color math — used to guarantee WCAG AA contrast on the foreground.  */
/* ------------------------------------------------------------------ */

function clamp(value: number, min = 6, max = 94): number {
  return Math.min(max, Math.max(min, value));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) { r = c; g = x; }
  else if (hh < 120) { r = x; g = c; }
  else if (hh < 180) { g = c; b = x; }
  else if (hh < 240) { g = x; b = c; }
  else if (hh < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function relativeLuminance(h: number, s: number, l: number): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = hslToRgb(h, s, l).map((v) => v / 255);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(l1: number, l2: number): number {
  const a = Math.max(l1, l2);
  const b = Math.min(l1, l2);
  return (a + 0.05) / (b + 0.05);
}

/**
 * Picks the readable foreground for a given background.
 * White when it clears WCAG AA (4.5:1), near-black otherwise.
 */
function onColorFor(h: number, s: number, l: number): string {
  const lum = relativeLuminance(h, s, l);
  return contrastRatio(lum, 1) >= 4.5 ? "0 0% 100%" : "0 0% 12%";
}

const triplet = (h: number, s: number, l: number) => `${h} ${Math.round(s)}% ${Math.round(l)}%`;

/* ------------------------------------------------------------------ */
/* Token palettes                                                      */
/* ------------------------------------------------------------------ */

export interface AccentTokens {
  hue: number;
  saturation: number;
  lightness: number;
  primary: string;
  primaryHover: string;
  primaryPressed: string;
  primaryDisabled: string;
  primaryForeground: string;
  primaryContainer: string;
  primaryContainerForeground: string;
  primaryEnd: string;
  primaryEndHover: string;
  deep1: string;
  deep2: string;
  deep3: string;
  secondary: string;
  secondaryForeground: string;
  secondaryContainer: string;
  secondaryContainerForeground: string;
  ring: string;
  surfaceTint: string;
  gradientPrimary: string;
  gradientHeader: string;
}

function buildLightTokens(preset: AccentPreset): AccentTokens {
  const { hue: h, saturation: s, lightness: l } = preset;
  const primary = triplet(h, s, l);
  const primaryEnd = triplet(h, s * 0.95, l - 4);
  return {
    hue: h,
    saturation: s,
    lightness: l,
    primary,
    primaryHover: triplet(h, s, l + 4),
    primaryPressed: triplet(h, s, l - 4),
    primaryDisabled: triplet(h, s * 0.55, l + 16),
    primaryForeground: onColorFor(h, s, l),
    primaryContainer: triplet(h, s * 0.55, 93),
    primaryContainerForeground: triplet(h, s * 0.6, 24),
    primaryEnd,
    primaryEndHover: triplet(h, s * 0.9, l - 2),
    deep1: triplet(h, s * 0.5, 13),
    deep2: triplet(h, s * 0.45, 17),
    deep3: triplet(h, s * 0.35, 23),
    secondary: triplet(h, s * 0.3, 95),
    secondaryForeground: triplet(h, s * 0.6, 27),
    secondaryContainer: triplet(h, s * 0.25, 91),
    secondaryContainerForeground: triplet(h, s * 0.5, 21),
    ring: primary,
    surfaceTint: triplet(h, s * 0.6, 96),
    gradientPrimary: `linear-gradient(135deg, hsl(${primary}), hsl(${primaryEnd}))`,
    gradientHeader: `linear-gradient(135deg, hsl(${primary}), hsl(${primaryEnd}))`,
  };
}

function buildDarkTokens(preset: AccentPreset): AccentTokens {
  const { hue: h, saturation: s, lightness: l } = preset;
  const primary = triplet(h, s * 0.95, l + 7);
  const primaryEnd = triplet(h, s * 0.9, l + 2);
  return {
    hue: h,
    saturation: s * 0.95,
    lightness: l + 7,
    primary,
    primaryHover: triplet(h, s * 0.95, l + 11),
    primaryPressed: triplet(h, s * 0.95, l + 4),
    primaryDisabled: triplet(h, s * 0.35, l + 20),
    primaryForeground: onColorFor(h, s * 0.95, l + 7),
    primaryContainer: triplet(h, s * 0.55, 23),
    primaryContainerForeground: triplet(h, s * 0.8, 90),
    primaryEnd,
    primaryEndHover: triplet(h, s * 0.9, l + 5),
    deep1: triplet(h, s * 0.45, 10),
    deep2: triplet(h, s * 0.4, 14),
    deep3: triplet(h, s * 0.3, 20),
    secondary: triplet(h, s * 0.3, 18),
    secondaryForeground: triplet(h, s * 0.5, 85),
    secondaryContainer: triplet(h, s * 0.35, 21),
    secondaryContainerForeground: triplet(h, s * 0.6, 87),
    ring: primary,
    surfaceTint: triplet(h, s * 0.55, 26),
    gradientPrimary: `linear-gradient(135deg, hsl(${primary}), hsl(${primaryEnd}))`,
    gradientHeader: `linear-gradient(135deg, hsl(${primary}), hsl(${primaryEnd}))`,
  };
}

function tokensToCss(tokens: AccentTokens): string {
  return `
    --primary: ${tokens.primary};
    --primary-hover: ${tokens.primaryHover};
    --primary-pressed: ${tokens.primaryPressed};
    --primary-disabled: ${tokens.primaryDisabled};
    --primary-foreground: ${tokens.primaryForeground};
    --primary-container: ${tokens.primaryContainer};
    --primary-container-foreground: ${tokens.primaryContainerForeground};
    --primary-end: ${tokens.primaryEnd};
    --primary-end-hover: ${tokens.primaryEndHover};
    --primary-deep-1: ${tokens.deep1};
    --primary-deep-2: ${tokens.deep2};
    --primary-deep-3: ${tokens.deep3};
    --primary-h: ${tokens.hue};
    --primary-s: ${tokens.saturation}%;
    --primary-l: ${tokens.lightness}%;
    --secondary: ${tokens.secondary};
    --secondary-foreground: ${tokens.secondaryForeground};
    --secondary-container: ${tokens.secondaryContainer};
    --secondary-container-foreground: ${tokens.secondaryContainerForeground};
    --ring: ${tokens.ring};
    --surface-tint: ${tokens.surfaceTint};
    --sidebar-primary: ${tokens.primary};
    --sidebar-primary-foreground: ${tokens.primaryForeground};
    --sidebar-ring: ${tokens.ring};
    --gradient-primary: ${tokens.gradientPrimary};
    --gradient-header: ${tokens.gradientHeader};
  `;
}

/** Full CSS override block for a given accent preset (light + dark). */
export function buildAccentCss(preset: AccentPreset): string {
  return `:root{${tokensToCss(buildLightTokens(preset))}}.dark{${tokensToCss(buildDarkTokens(preset))}}`;
}

/** The single accent CSS variable used by swatches / inline components. */
export const ACCENT_VAR_CSS = "--primary";
