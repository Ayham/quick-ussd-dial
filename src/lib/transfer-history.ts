export interface TransferRecord {
  phone: string;
  amount: string;
  operator: string;
  timestamp: number;
  status: "success" | "failed" | "pending";
}

const HISTORY_KEY = "transfer-history";
const CONTACTS_KEY = "saved-contacts";

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

export function updateLastRecordStatus(status: "success" | "failed") {
  const history = getHistory();
  if (history.length > 0 && history[0].status === "pending") {
    history[0].status = status;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }
}

export function getHistoryForPhone(phone: string): TransferRecord[] {
  return getHistory().filter((r) => r.phone === phone);
}

export function getSavedContacts(): string[] {
  try {
    const stored = localStorage.getItem(CONTACTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveContact(phone: string) {
  const contacts = getSavedContacts();
  if (!contacts.includes(phone)) {
    contacts.unshift(phone);
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts.slice(0, 50)));
  }
}

export function getMatchingContacts(input: string): string[] {
  if (!input.trim()) return getSavedContacts();
  return getSavedContacts().filter((c) => c.includes(input));
}
