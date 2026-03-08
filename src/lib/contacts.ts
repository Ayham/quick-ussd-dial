/**
 * Named Contacts Management
 * إدارة جهات الاتصال بالاسم والرقم
 */

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
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts.slice(0, 200)));
}

export function saveContact(phone: string, name: string = '') {
  const contacts = getSavedContacts();
  const existing = contacts.findIndex(c => c.phone === phone);
  if (existing >= 0) {
    // Update name if provided
    if (name) contacts[existing].name = name;
    // Move to top
    const [contact] = contacts.splice(existing, 1);
    contacts.unshift(contact);
  } else {
    contacts.unshift({ phone, name });
  }
  saveSavedContacts(contacts);
}

export function updateContactName(phone: string, name: string) {
  const contacts = getSavedContacts();
  const idx = contacts.findIndex(c => c.phone === phone);
  if (idx >= 0) {
    contacts[idx].name = name;
    saveSavedContacts(contacts);
  } else {
    saveContact(phone, name);
  }
}

export function deleteContact(phone: string) {
  const contacts = getSavedContacts().filter(c => c.phone !== phone);
  saveSavedContacts(contacts);
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
 * Import contacts from phone using Capacitor Contacts plugin
 */
export async function importPhoneContacts(): Promise<SavedContact[]> {
  try {
    const { Contacts } = await import('@capacitor-community/contacts');
    const result = await Contacts.getContacts({
      projection: {
        name: true,
        phones: true,
      },
    });

    const imported: SavedContact[] = [];
    const existing = getSavedContacts();
    const existingPhones = new Set(existing.map(c => normalizePhone(c.phone)));

    for (const contact of result.contacts) {
      const name = contact.name?.display || '';
      const phones = contact.phones || [];
      for (const p of phones) {
        const phone = normalizePhone(p.number || '');
        if (phone && phone.length >= 10 && !existingPhones.has(phone)) {
          imported.push({ phone, name });
          existingPhones.add(phone);
        }
      }
    }

    // Add imported to saved
    if (imported.length > 0) {
      const all = [...existing, ...imported];
      saveSavedContacts(all);
    }

    return imported;
  } catch (error) {
    console.error('Failed to import contacts:', error);
    throw error;
  }
}

function normalizePhone(phone: string): string {
  // Remove spaces, dashes, country code
  let p = phone.replace(/[\s\-()]/g, '');
  if (p.startsWith('+963')) p = '0' + p.slice(4);
  if (p.startsWith('963')) p = '0' + p.slice(3);
  return p;
}
