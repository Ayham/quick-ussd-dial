import { saveContact, searchContacts, type SavedContact } from './contacts';

export interface TransferRecord {
  phone: string;
  amount: string;
  operator: string;
  timestamp: number;
  status: "success" | "failed" | "pending";
}

const HISTORY_KEY = "transfer-history";

export function getHistory(): TransferRecord[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function addToHistory(record: TransferRecord) {
  const history = getHistory();
  history.unshift(record);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  saveContact(record.phone);
}

export function getMatchingContacts(input: string): SavedContact[] {
  return searchContacts(input);
}
