/**
 * Seed demo transfer history for testing UI with large datasets
 * Usage: call seedDemoData() from browser console or a dev button
 */

import type { TransferRecord } from "./transfer-history";

const MTN_PHONES = [
  "0944123456", "0936789012", "0933456789", "0944567890", "0936111222",
  "0933444555", "0944666777", "0936888999", "0933222333", "0944555666",
  "0936333444", "0933777888", "0944999000", "0936123789", "0933456123",
];

const SYR_PHONES = [
  "0991234567", "0992345678", "0993456789", "0991112233", "0992223344",
  "0993334455", "0991445566", "0992556677", "0993667788", "0991778899",
  "0992889900", "0993990011", "0991234000", "0992345111", "0993456222",
];

const MTN_AMOUNTS = [500, 1000, 1500, 2000, 2500, 3000, 5000, 10000];
const SYR_AMOUNTS = [500, 1000, 1500, 2000, 3000, 5000, 7500, 10000];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function seedDemoData(count = 500) {
  const now = Date.now();
  const threeMonthsMs = 90 * 24 * 60 * 60 * 1000;
  const records: TransferRecord[] = [];
  const contacts = new Set<string>();

  for (let i = 0; i < count; i++) {
    const isMtn = Math.random() > 0.45; // slight MTN bias
    const phone = isMtn ? randomFrom(MTN_PHONES) : randomFrom(SYR_PHONES);
    const amount = isMtn ? randomFrom(MTN_AMOUNTS) : randomFrom(SYR_AMOUNTS);
    const timestamp = now - Math.floor(Math.random() * threeMonthsMs);
    const status: TransferRecord["status"] = Math.random() > 0.05 ? "success" : "failed";

    contacts.add(phone);
    records.push({
      phone,
      amount: String(amount),
      operator: isMtn ? "mtn" : "syriatel",
      timestamp,
      status,
    });
  }

  // Sort by timestamp descending (newest first)
  records.sort((a, b) => b.timestamp - a.timestamp);

  localStorage.setItem("transfer-history", JSON.stringify(records));
  localStorage.setItem("saved-contacts", JSON.stringify(Array.from(contacts)));

  return { records: records.length, contacts: contacts.size };
}

export function clearDemoData() {
  localStorage.removeItem("transfer-history");
  localStorage.removeItem("saved-contacts");
}
