import { useState, useEffect } from 'react';
import { getHistory, recordPrice, type TransferRecord } from './transfer-history';

export interface TransferSuggestion {
  phone: string;
  count: number;
  lastPrice: number;
  lastTimestamp: number;
  operator: string | null;
}

const SETTINGS_KEY = 'suggestion-settings';

export interface SuggestionSettings {
  enabled: boolean;
  maxSuggestions: number;
  showLastPrice: boolean;
  showCount: boolean;
  showLastTime: boolean;
}

export const DEFAULT_SUGGESTION_SETTINGS: SuggestionSettings = {
  enabled: true,
  maxSuggestions: 5,
  showLastPrice: true,
  showCount: true,
  showLastTime: true,
};

export function getSuggestionSettings(): SuggestionSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SUGGESTION_SETTINGS, ...JSON.parse(stored) };
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

export function useTransferSuggestions(query: string) {
  const [settings, setSettings] = useState<SuggestionSettings>(() => getSuggestionSettings());
  const [suggestions, setSuggestions] = useState<TransferSuggestion[]>([]);

  useEffect(() => {
    if (!settings.enabled) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(() => {
      const all = buildSuggestions(getHistory());
      if (query.trim().length >= 2) {
        setSuggestions(
          all.filter(s => s.phone.includes(query.trim())).slice(0, settings.maxSuggestions)
        );
      } else {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, settings.enabled, settings.maxSuggestions]);

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