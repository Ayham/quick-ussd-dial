export type AmountDisplayStyle = "grid" | "horizontal";

const STORAGE_KEY = "amount-display-style";

export const DEFAULT_AMOUNT_DISPLAY_STYLE: AmountDisplayStyle = "grid";

export function getAmountDisplayStyle(): AmountDisplayStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "grid" || stored === "horizontal") return stored;
  } catch {}
  return DEFAULT_AMOUNT_DISPLAY_STYLE;
}

export function saveAmountDisplayStyle(style: AmountDisplayStyle) {
  localStorage.setItem(STORAGE_KEY, style);
}
