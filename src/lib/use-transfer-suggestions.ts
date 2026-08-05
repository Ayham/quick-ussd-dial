import { useState, useEffect } from 'react';
import { getHistory, recordPrice, type TransferRecord } from './transfer-history';
import { getContactByPhone, normalizePhone, searchContactsSync } from './android-contacts';
import { detectOperator } from './ussd-profiles';

export interface TransferSuggestion {
  phone: string;
  count: number;
  lastPrice: number;
  lastTimestamp: number;
  operator: string | null;
  contactName?: string;
}

export type SuggestionSource = 'history' | 'contacts' | 'both';

const SETTINGS_KEY = 'suggestion-settings';

export interface SuggestionSettings {
  enabled: boolean;
  maxSuggestions: number;
  source: SuggestionSource;
  showLastPrice: boolean;
  showCount: boolean;
  showLastTime: boolean;
}

export const DEFAULT_SUGGESTION_SETTINGS: SuggestionSettings = {
  enabled: true,
  maxSuggestions: 5,
  source: 'both',
  showLastPrice: true,
  showCount: true,
  showLastTime: true,
};

const VALID_SOURCES: SuggestionSource[] = ['history', 'contacts', 'both'];

export function getSuggestionSettings(): SuggestionSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const merged = { ...DEFAULT_SUGGESTION_SETTINGS, ...parsed };
      if (!VALID_SOURCES.includes(merged.source)) {
        merged.source = DEFAULT_SUGGESTION_SETTINGS.source;
      }
      return merged;
    }
  } catch {}
  return DEFAULT_SUGGESTION_SETTINGS;
}

export function saveSuggestionSettings(settings: SuggestionSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function buildSuggestions(records: TransferRecord[]): TransferSuggestion[] {
  const map = new Map<string, { count: number; lastPrice: number; lastTimestamp: number; operator: string | null }>();
  for (const r of records) {
    if (r.status !== 'success') continue;
    const existing = map.get(r.phone);
    if (existing) {
      existing.count++;
      if (r.timestamp > existing.lastTimestamp) {
        existing.lastTimestamp = r.timestamp;
        existing.lastPrice = recordPrice(r);
        existing.operator = r.operator || existing.operator;
      }
    } else {
      map.set(r.phone, {
        count: 1,
        lastPrice: recordPrice(r),
        lastTimestamp: r.timestamp,
        operator: r.operator || null,
      });
    }
  }
  return Array.from(map.entries())
    .map(([phone, data]) => ({ phone, ...data }))
    .sort((a, b) => b.count - a.count || b.lastTimestamp - a.lastTimestamp);
}

function buildContactSuggestions(
  contacts: { displayName: string; phones: string[] }[],
): TransferSuggestion[] {
  return contacts.map((c) => {
    const rawPhone = c.phones[0] || '';
    return {
      phone: normalizePhone(rawPhone),
      count: 0,
      lastPrice: 0,
      lastTimestamp: 0,
      operator: detectOperator(rawPhone),
      contactName: c.displayName || '',
    };
  });
}

export function useTransferSuggestions(query: string) {
  const [settings, setSettings] = useState<SuggestionSettings>(() => getSuggestionSettings());
  const [suggestions, setSuggestions] = useState<TransferSuggestion[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!settings.enabled || q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const historyBased =
        settings.source !== 'contacts'
          ? buildSuggestions(getHistory()).filter(s => s.phone.includes(q))
          : [];

      let contactBased: TransferSuggestion[] = [];
      if (settings.source !== 'history') {
        const { Capacitor } = await import('@capacitor/core');
        if (!cancelled && Capacitor.isNativePlatform()) {
          const contacts = await searchContactsSync(q, settings.maxSuggestions * 2);
          if (!cancelled) {
            contactBased = buildContactSuggestions(contacts);
          }
        }
      }
      if (cancelled) return;

      let merged: TransferSuggestion[];
      if (settings.source === 'both') {
        const seen = new Set(historyBased.map(s => s.phone));
        merged = [...historyBased, ...contactBased.filter(c => !seen.has(c.phone))];
      } else if (settings.source === 'contacts') {
        merged = contactBased;
      } else {
        merged = historyBased;
      }

      setSuggestions(merged.slice(0, settings.maxSuggestions));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, settings.enabled, settings.maxSuggestions, settings.source]);

  useEffect(() => {
    if (!settings.enabled || suggestions.length === 0) return;
    const phones = suggestions.filter(s => !s.contactName).map(s => s.phone);
    if (phones.length === 0) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const map: Record<string, string> = {};
      for (const phone of phones) {
        const contact = await getContactByPhone(phone);
        if (contact?.contactId && contact.displayName) {
          map[phone] = contact.displayName;
        }
      }
      if (cancelled) return;
      setSuggestions(prev => {
        if (prev.length === 0) return prev;
        let changed = false;
        const next = prev.map(s => {
          if (map[s.phone] && !s.contactName) {
            changed = true;
            return { ...s, contactName: map[s.phone] };
          }
          return s;
        });
        return changed ? next : prev;
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [suggestions, settings.enabled]);

  return { suggestions, settings, setSettings };
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'منذ لحظات';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'أمس';
  if (days < 7) return `منذ ${days} أيام`;
  return new Date(timestamp).toLocaleDateString('ar-SY', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}