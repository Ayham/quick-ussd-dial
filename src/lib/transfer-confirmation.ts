const STORAGE_KEY = "show-transfer-confirmation";

export const DEFAULT_SHOW_TRANSFER_CONFIRMATION = true;

export function getShowTransferConfirmation(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {}
  return DEFAULT_SHOW_TRANSFER_CONFIRMATION;
}

export function saveShowTransferConfirmation(value: boolean) {
  localStorage.setItem(STORAGE_KEY, String(value));
}
