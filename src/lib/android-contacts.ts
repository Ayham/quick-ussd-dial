export interface AndroidContact {
  contactId: string;
  displayName: string;
  phones: string[];
}

export interface AndroidContactResult {
  contactId: string | null;
  displayName: string;
  phone: string;
}

export interface CreateContactResult {
  contactId: string | null;
  created: boolean;
  updated: boolean;
}

export interface SearchResult {
  contacts: AndroidContact[];
}

export interface PickContactResult {
  displayName: string;
  phone: string;
}

type ContactsPlugin = {
  checkPermissions(): Promise<{ contacts: string }>;
  requestPermissions(): Promise<{ contacts: string }>;
  pickContact(): Promise<PickContactResult>;
  getContactByPhone(options: { phone: string }): Promise<AndroidContactResult>;
  searchContacts(options: { query: string; limit?: number }): Promise<SearchResult>;
  createContact(options: { phone: string; name?: string }): Promise<CreateContactResult>;
  updateContactName(options: { phone: string; name: string }): Promise<{ contactId: string; updated: boolean }>;
  deleteContact(options: { phone: string }): Promise<{ deleted: boolean }>;
  getAllContacts(options: { limit?: number; offset?: number }): Promise<SearchResult>;
};

let plugin: ContactsPlugin | null = null;

async function getPlugin(): Promise<ContactsPlugin> {
  if (plugin) return plugin;
  const { Capacitor, WebPlugin } = await import('@capacitor/core');

  class AndroidContactsWeb extends WebPlugin implements ContactsPlugin {
    async checkPermissions() {
      return { contacts: 'granted' };
    }
    async requestPermissions() {
      return { contacts: 'granted' };
    }
    async pickContact() {
      return { displayName: '', phone: '' };
    }
    async getContactByPhone(_options: { phone: string }) {
      return { contactId: null, displayName: '', phone: '' };
    }
    async searchContacts(_options: { query: string; limit?: number }) {
      return { contacts: [] };
    }
    async createContact(_options: { phone: string; name?: string }) {
      return { contactId: null, created: false, updated: false };
    }
    async updateContactName(_options: { phone: string; name: string }) {
      return { contactId: '', updated: false };
    }
    async deleteContact(_options: { phone: string }) {
      return { deleted: false };
    }
    async getAllContacts(_options: { limit?: number; offset?: number }) {
      return { contacts: [] };
    }
  }

  if (!Capacitor.isNativePlatform()) {
    plugin = new AndroidContactsWeb();
    return plugin;
  }

  try {
    plugin = Capacitor.Plugins.AndroidContacts as unknown as ContactsPlugin;
  } catch {
    plugin = new AndroidContactsWeb();
  }
  return plugin;
}

export async function checkContactsPermissions(): Promise<'granted' | 'denied' | 'limited'> {
  try {
    const p = await getPlugin();
    const result = await p.checkPermissions();
    return (result.contacts as 'granted' | 'denied' | 'limited') || 'denied';
  } catch (err) {
    console.warn('[AndroidContacts] checkPermissions error:', err);
    return 'denied';
  }
}

export async function requestContactsPermissions(): Promise<'granted' | 'denied' | 'limited'> {
  try {
    const p = await getPlugin();
    const result = await p.requestPermissions();
    return (result.contacts as 'granted' | 'denied' | 'limited') || 'denied';
  } catch (err) {
    console.warn('[AndroidContacts] requestPermissions error:', err);
    return 'denied';
  }
}

export async function ensureContactsPermissions(): Promise<boolean> {
  const status = await checkContactsPermissions();
  if (status === 'granted' || status === 'limited') return true;
  const requested = await requestContactsPermissions();
  return requested === 'granted' || requested === 'limited';
}

export async function pickContactFromDevice(): Promise<PickContactResult | null> {
  try {
    const p = await getPlugin();
    const hasPermission = await ensureContactsPermissions();
    if (!hasPermission) {
      console.warn('[AndroidContacts] Cannot pick contact: permissions denied');
      return null;
    }
    const result = await p.pickContact();
    if (result && result.phone) {
      return { displayName: result.displayName, phone: normalizePhone(result.phone) };
    }
    return null;
  } catch (err) {
    console.warn('[AndroidContacts] pickContact error:', err);
    return null;
  }
}

export async function getContactByPhone(phone: string): Promise<AndroidContactResult | null> {
  try {
    const p = await getPlugin();
    const result = await p.getContactByPhone({ phone: normalizePhone(phone) });
    if (result && result.contactId) {
      return result;
    }
    return null;
  } catch (err) {
    console.warn('[AndroidContacts] getContactByPhone error:', err);
    return null;
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingQuery = '';

export function searchContacts(
  query: string,
  callback: (results: AndroidContact[]) => void,
  limit = 50,
): void {
  if (searchTimeout) clearTimeout(searchTimeout);
  pendingQuery = query;

  searchTimeout = setTimeout(async () => {
    if (pendingQuery !== query) return;
    try {
      const p = await getPlugin();
      const hasPermission = await ensureContactsPermissions();
      if (!hasPermission) {
        callback([]);
        return;
      }
      const result = await p.searchContacts({ query, limit });
      callback(result.contacts || []);
    } catch (err) {
      console.warn('[AndroidContacts] searchContacts error:', err);
      callback([]);
    }
  }, 300);
}

export async function searchContactsSync(query: string, limit = 50): Promise<AndroidContact[]> {
  try {
    const p = await getPlugin();
    const hasPermission = await ensureContactsPermissions();
    if (!hasPermission) return [];
    const result = await p.searchContacts({ query, limit });
    return result.contacts || [];
  } catch (err) {
    console.warn('[AndroidContacts] searchContactsSync error:', err);
    return [];
  }
}

export async function createAndroidContact(phone: string, name?: string): Promise<CreateContactResult | null> {
  try {
    const hasPermission = await ensureContactsPermissions();
    if (!hasPermission) {
      console.warn('[AndroidContacts] Cannot create contact: permissions denied');
      return null;
    }
    const p = await getPlugin();
    const result = await p.createContact({
      phone: normalizePhone(phone),
      name: name || '',
    });
    console.log('[AndroidContacts] createContact result:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.warn('[AndroidContacts] createContact error:', err);
    return null;
  }
}

export async function updateAndroidContactName(phone: string, name: string): Promise<boolean> {
  try {
    const hasPermission = await ensureContactsPermissions();
    if (!hasPermission) return false;
    const p = await getPlugin();
    const result = await p.updateContactName({
      phone: normalizePhone(phone),
      name,
    });
    return result.updated;
  } catch (err) {
    console.warn('[AndroidContacts] updateContactName error:', err);
    return false;
  }
}

export async function deleteAndroidContact(phone: string): Promise<boolean> {
  try {
    const hasPermission = await ensureContactsPermissions();
    if (!hasPermission) return false;
    const p = await getPlugin();
    const result = await p.deleteContact({ phone: normalizePhone(phone) });
    return result.deleted;
  } catch (err) {
    console.warn('[AndroidContacts] deleteContact error:', err);
    return false;
  }
}

export async function getAllAndroidContacts(limit = 200, offset = 0): Promise<AndroidContact[]> {
  try {
    const hasPermission = await ensureContactsPermissions();
    if (!hasPermission) return [];
    const p = await getPlugin();
    const result = await p.getAllContacts({ limit, offset });
    return result.contacts || [];
  } catch (err) {
    console.warn('[AndroidContacts] getAllContacts error:', err);
    return [];
  }
}

export async function saveContactAfterTransfer(phone: string, name?: string): Promise<void> {
  try {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || normalizedPhone.length < 10) return;

    const existing = await getContactByPhone(normalizedPhone);
    if (!existing || !existing.contactId) {
      await createAndroidContact(normalizedPhone, name || normalizedPhone);
      console.log('[AndroidContacts] Created contact after transfer:', normalizedPhone);
    }
  } catch (err) {
    console.warn('[AndroidContacts] saveContactAfterTransfer error:', err);
  }
}

export function normalizePhone(phone: string): string {
  let p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('+963')) p = '0' + p.slice(4);
  if (p.startsWith('963')) p = '0' + p.slice(3);
  return p;
}
