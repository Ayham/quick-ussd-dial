/**
 * Named Contacts Management
 * إدارة جهات الاتصال بالاسم والرقم
 */
import { pushEvent } from "./supabase-sync";
import { getCurrentUser } from "./auth";

const CONTACTS_KEY = 'named-contacts-v1';

export interface SavedContact {
  phone: string;
  name: string;
}

export function getSavedContacts(): SavedContact[] {
  try {
    const stored = localStorage.getItem(CONTACTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  // Migrate from old format (string[])
  try {
    const old = localStorage.getItem('saved-contacts');
    if (old) {
      const phones: string[] = JSON.parse(old);
      const contacts = phones.map(phone => ({ phone, name: '' }));
      saveSavedContacts(contacts);
      return contacts;
    }
  } catch {}
  return [];
}

export function saveSavedContacts(contacts: SavedContact[]) {
  const deduped = new Map<string, SavedContact>();
  for (const contact of contacts) {
    const phone = normalizePhone(contact.phone);
    if (!phone || phone.length < 10) continue;
    const existing = deduped.get(phone);
    deduped.set(phone, {
      phone,
      name: contact.name?.trim() || existing?.name || "",
    });
  }
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(Array.from(deduped.values()).slice(0, 5000)));
}

export async function saveContact(phone: string, name: string = '') {
  phone = normalizePhone(phone);
  const contacts = getSavedContacts();
  const existing = contacts.findIndex(c => c.phone === phone);
  if (existing >= 0) {
    if (name) contacts[existing].name = name;
    const [contact] = contacts.splice(existing, 1);
    contacts.unshift(contact);
  } else {
    contacts.unshift({ phone, name });
  }
  saveSavedContacts(contacts);
  const user = await getCurrentUser();
  pushEvent("contact_upsert", { phone, name, user_id: user?.id ?? null });
}

export async function updateContactName(phone: string, name: string) {
  const contacts = getSavedContacts();
  const idx = contacts.findIndex(c => c.phone === phone);
  if (idx >= 0) {
    contacts[idx].name = name;
    saveSavedContacts(contacts);
    const user = await getCurrentUser();
    pushEvent("contact_upsert", { phone, name, user_id: user?.id ?? null });
  } else {
    await saveContact(phone, name);
  }
}

export async function deleteContact(phone: string) {
  const contacts = getSavedContacts().filter(c => c.phone !== phone);
  saveSavedContacts(contacts);
  const user = await getCurrentUser();
  pushEvent("contact_delete", { phone: normalizePhone(phone), user_id: user?.id ?? null });
}

export async function queueContactsForSync(contacts: SavedContact[]) {
  const user = await getCurrentUser();
  for (const contact of contacts) {
    pushEvent("contact_upsert", {
      phone: normalizePhone(contact.phone),
      name: contact.name?.trim() || "",
      user_id: user?.id ?? null,
    });
  }
}

export function searchContacts(query: string): SavedContact[] {
  const contacts = getSavedContacts();
  if (!query.trim()) return contacts;
  const q = query.trim().toLowerCase();
  return contacts.filter(c =>
    c.phone.includes(q) || c.name.toLowerCase().includes(q)
  );
}

/**
 * Load phonebook contacts (flattened as name + phone) to show inside an in-app picker.
 */
export async function getPhoneBookContacts(): Promise<SavedContact[]> {
  // Check if running on native platform
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) {
    throw new Error('WEB_ONLY');
  }

  const { Contacts } = await import('@capacitor-community/contacts');

  const currentPermissions = await Contacts.checkPermissions();
  const hasPermission = currentPermissions.contacts === 'granted' || currentPermissions.contacts === 'limited';

  if (!hasPermission) {
    const requestedPermissions = await Contacts.requestPermissions();
    const granted = requestedPermissions.contacts === 'granted' || requestedPermissions.contacts === 'limited';
    if (!granted) {
      throw new Error('CONTACTS_PERMISSION_DENIED');
    }
  }

  const result = await Contacts.getContacts({
    projection: {
      name: true,
      phones: true,
    },
  });

  const out: SavedContact[] = [];
  const seen = new Set<string>();

  for (const c of result.contacts || []) {
    const name = c.name?.display || '';
    for (const ph of c.phones || []) {
      const phone = normalizePhone(ph.number || '');
      if (!phone || phone.length < 10) continue;
      if (seen.has(phone)) continue;
      seen.add(phone);
      out.push({ phone, name });
    }
  }

  // Guardrails: avoid huge payloads in UI
  return out.slice(0, 5000);
}

/**
 * Open native contact picker and return selected contact
 */
export async function pickPhoneContact(): Promise<SavedContact | null> {
  // Check if running on native platform
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) {
    throw new Error('WEB_ONLY');
  }

  const { Contacts } = await import('@capacitor-community/contacts');

  const currentPermissions = await Contacts.checkPermissions();
  const hasPermission = currentPermissions.contacts === 'granted' || currentPermissions.contacts === 'limited';

  if (!hasPermission) {
    const requestedPermissions = await Contacts.requestPermissions();
    const granted = requestedPermissions.contacts === 'granted' || requestedPermissions.contacts === 'limited';
    if (!granted) {
      throw new Error('CONTACTS_PERMISSION_DENIED');
    }
  }

  const result = await Contacts.pickContact({
    projection: {
      name: true,
      phones: true,
    },
  });

  if (!result.contact) return null;

  const name = result.contact.name?.display || '';
  const phones = result.contact.phones || [];
  if (phones.length === 0) return null;

  const phone = normalizePhone(phones[0].number || '');
  if (!phone || phone.length < 10) return null;

  saveContact(phone, name);
  return { phone, name };
}

export function normalizePhone(phone: string): string {
  // Remove spaces, dashes, country code
  let p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('+963')) p = '0' + p.slice(4);
  if (p.startsWith('963')) p = '0' + p.slice(3);
  return p;
}
