import type { NotificationType } from "./types";

/**
 * Push notification provider interface.
 *
 * This is a forward-looking stub: in-app notifications already work end-to-end
 * (Supabase realtime + offline queue). The push bridge lets the app surface a
 * native notification when the app is backgrounded/killed.
 *
 * Integration checklist when wiring a real provider (e.g. Capacitor + FCM):
 *   1. Install the native plugin and register the token on login.
 *   2. Persist the token in `public.device_tokens` (device_id, token, platform).
 *   3. Implement `register`/`handleNotificationReceived` below.
 *   4. Add a `public.admin_push_notification(p_id UUID)` RPC that resolves the
 *      recipient tokens and fans them out to FCM via the service account.
 */

export interface PushPayload {
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  type: NotificationType;
  data?: Record<string, unknown>;
}

export interface PushProvider {
  isSupported(): boolean;
  /** Request permission and register the device token for the signed-in user. */
  register(userId: string): Promise<void>;
  /** Called by the native layer when a notification arrives while foregrounded. */
  onNotification(callback: (payload: PushPayload) => void): () => void;
  /** Open the deep-link target associated with a tapped notification. */
  openNotification(data: Record<string, unknown>): Promise<void>;
}

export const pushProvider: PushProvider = {
  isSupported() {
    return false;
  },
  async register() {
    // no-op stub
  },
  onNotification() {
    return () => {};
  },
  async openNotification() {
    // no-op stub
  },
};
