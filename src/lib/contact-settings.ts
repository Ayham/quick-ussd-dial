/**
 * Contact Settings — معلومات التواصل المركزية (WhatsApp / Email / Facebook).
 *
 * Layer responsible for:
 *   - Reading the last known settings from localStorage (offline-first).
 *   - Fetching the latest settings from Supabase (remote configuration).
 *   - Refreshing the local cache only after a SUCCESSFUL fetch.
 *   - Returning the last available data and its timestamp.
 *
 * The About page never owns sync logic — it consumes this module through
 * the `useContactSettings` hook (cache-first + background refresh).
 *
 * Offline rules (do not break the offline-first core):
 *   - Offline  -> return cache immediately, never hit the network repeatedly.
 *   - Online   -> check the server, update cache only when the fetch succeeds.
 *   - Failure  -> silent cache fallback (never show a server error to the user).
 *   - This module NEVER touches license / trial / auth / USSD / transfers.
 */

import { supabase } from "@/integrations/supabase/client";

/** Local cache key (single source of truth for the offline copy). */
export const CONTACT_SETTINGS_CACHE_KEY = "app_contact_settings";

export interface ContactSettings {
  whatsapp: {
    enabled: boolean;
    number: string;
    url: string;
  };
  email: {
    enabled: boolean;
    address: string;
  };
  facebook: {
    enabled: boolean;
    url: string;
  };
  updatedAt: string;
}

export const EMPTY_CONTACT_SETTINGS: ContactSettings = {
  whatsapp: { enabled: false, number: "", url: "" },
  email: { enabled: false, address: "" },
  facebook: { enabled: false, url: "" },
  updatedAt: "",
};

// ---------------------------------------------------------------------------
// Normalization helpers (Type Safety)
// ---------------------------------------------------------------------------

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

/** Normalize the flat RPC payload (whatsapp_enabled, email_address, ...) into the typed object. */
export function normalizeContactSettings(data: unknown): ContactSettings {
  if (data === null || typeof data !== "object") {
    return { ...EMPTY_CONTACT_SETTINGS };
  }
  const obj = data as Record<string, unknown>;
  return {
    whatsapp: {
      enabled: asBoolean(obj.whatsapp_enabled),
      number: asString(obj.whatsapp_number),
      url: asString(obj.whatsapp_url),
    },
    email: {
      enabled: asBoolean(obj.email_enabled),
      address: asString(obj.email_address),
    },
    facebook: {
      enabled: asBoolean(obj.facebook_enabled),
      url: asString(obj.facebook_url),
    },
    updatedAt: asString(obj.updated_at),
  };
}

/** Flatten the typed object back into the RPC argument payload. */
export function toRpcPayload(settings: ContactSettings): Record<string, unknown> {
  return {
    p_whatsapp_enabled: settings.whatsapp.enabled,
    p_whatsapp_number: settings.whatsapp.number,
    p_whatsapp_url: settings.whatsapp.url,
    p_email_enabled: settings.email.enabled,
    p_email_address: settings.email.address,
    p_facebook_enabled: settings.facebook.enabled,
    p_facebook_url: settings.facebook.url,
  };
}

// ---------------------------------------------------------------------------
// Local cache
// ---------------------------------------------------------------------------

function isContactSettingsCache(value: unknown): value is ContactSettings {
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  const wa = obj.whatsapp as Record<string, unknown> | undefined;
  const em = obj.email as Record<string, unknown> | undefined;
  const fb = obj.facebook as Record<string, unknown> | undefined;
  return (
    !!wa && typeof wa.enabled === "boolean" &&
    !!em && typeof em.enabled === "boolean" &&
    !!fb && typeof fb.enabled === "boolean"
  );
}

/** Read the last cached settings. Returns EMPTY when nothing valid is stored. */
export function getCachedContactSettings(): ContactSettings {
  try {
    const raw = localStorage.getItem(CONTACT_SETTINGS_CACHE_KEY);
    if (!raw) return { ...EMPTY_CONTACT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!isContactSettingsCache(parsed)) return { ...EMPTY_CONTACT_SETTINGS };
    return parsed;
  } catch {
    return { ...EMPTY_CONTACT_SETTINGS };
  }
}

/** True when a valid local copy exists (used to decide "no contact info" vs "fresh empty"). */
export function hasContactSettingsCache(): boolean {
  try {
    const raw = localStorage.getItem(CONTACT_SETTINGS_CACHE_KEY);
    if (!raw) return false;
    return isContactSettingsCache(JSON.parse(raw));
  } catch {
    return false;
  }
}

/** Persist a copy of the settings locally. Only called after a successful fetch. */
export function saveContactSettingsCache(settings: ContactSettings): void {
  try {
    localStorage.setItem(CONTACT_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {}
}

/** Last time the settings were refreshed ('' when never cached). */
export function getContactSettingsUpdatedAt(): string {
  return getCachedContactSettings().updatedAt;
}

// ---------------------------------------------------------------------------
// Link builders (direct contact, no manual copying)
// ---------------------------------------------------------------------------

/** https://wa.me/<number> — opens the WhatsApp app when installed, else WhatsApp Web. */
export function buildWhatsAppUrl(settings: ContactSettings): string {
  if (settings.whatsapp.url.trim()) return settings.whatsapp.url.trim();
  const number = settings.whatsapp.number.replace(/[^\d]/g, "");
  return number ? `https://wa.me/${number}` : "";
}

/** mailto:<address> — opens the default mail app. */
export function buildEmailUrl(settings: ContactSettings): string {
  return settings.email.address.trim() ? `mailto:${settings.email.address.trim()}` : "";
}

/** Stored Facebook page URL — opens the app or the browser as Android allows. */
export function buildFacebookUrl(settings: ContactSettings): string {
  return settings.facebook.url.trim();
}

// ---------------------------------------------------------------------------
// Network layer
// ---------------------------------------------------------------------------

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

/** Fetch the latest settings from Supabase and refresh the local cache on success. */
export async function fetchContactSettingsLive(): Promise<ContactSettings> {
  const { data, error } = await supabase.rpc("get_contact_settings");
  if (error) throw error;
  const settings = normalizeContactSettings(data);
  saveContactSettingsCache(settings);
  return settings;
}

/**
 * Cache-first, refresh-in-background entry point used by the UI and the cloud
 * scheduler. Returns immediately with the last known copy, then (only when
 * online) fetches the server copy and updates the cache. A failed request
 * never replaces the cache and never surfaces an error to the caller.
 */
export async function refreshContactSettings(): Promise<ContactSettings> {
  const cached = getCachedContactSettings();
  if (!isOnline()) return cached;
  try {
    return await fetchContactSettingsLive();
  } catch {
    // Silent fallback — keep the last known copy.
    return getCachedContactSettings();
  }
}

// ---------------------------------------------------------------------------
// Admin write (only reachable from the admin panel)
// ---------------------------------------------------------------------------

export interface AdminUpdateResult {
  ok: boolean;
  updatedAt: string;
}

/** Persist settings via the admin RPC, then refresh the local cache. */
export async function adminUpdateContactSettings(settings: ContactSettings): Promise<AdminUpdateResult> {
  const { data, error } = await supabase.rpc("admin_update_contact_settings", toRpcPayload(settings) as object);
  if (error) throw error;
  const result = data as { ok?: boolean; updated_at?: string } | null;
  const updatedAt = typeof result?.updated_at === "string" ? result.updated_at : new Date().toISOString();
  const next: ContactSettings = { ...settings, updatedAt };
  saveContactSettingsCache(next);
  return { ok: result?.ok === true, updatedAt };
}
