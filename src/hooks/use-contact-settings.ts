import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_CONTACT_SETTINGS,
  getCachedContactSettings,
  refreshContactSettings,
  saveContactSettingsCache,
  type ContactSettings,
} from "@/lib/contact-settings";

export interface ContactSettingsState {
  /** Last known settings (cache first, updated in the background when online). */
  settings: ContactSettings;
  /** Server timestamp of the last successful refresh ('' when never fetched). */
  updatedAt: string;
  /** True once a live (server) refresh completed at least once this session. */
  fresh: boolean;
  /** Force an immediate background refresh (no-op when offline). */
  refresh: () => Promise<void>;
}

/**
 * Cache-first contact settings for the About page.
 *
 *  - Renders immediately from localStorage (offline safe — never blocks).
 *  - Refreshes in the background when online; updates the UI on arrival.
 *  - Network failures are silent and never replace the cached copy.
 *  - Independent from the license / USSD / transfer / sync systems.
 */
export function useContactSettings(): ContactSettingsState {
  const [settings, setSettings] = useState<ContactSettings>(() => getCachedContactSettings());
  const [fresh, setFresh] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const next = await refreshContactSettings();
    if (!mountedRef.current) return;
    setSettings(next);
    saveContactSettingsCache(next);
    setFresh(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Show cache immediately, then silently refresh in the background.
    setSettings(getCachedContactSettings());
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return {
    settings,
    updatedAt: settings.updatedAt,
    fresh,
    refresh,
  };
}

/** Convenience for tests / non-hook code. */
export { EMPTY_CONTACT_SETTINGS };
