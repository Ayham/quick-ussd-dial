/**
 * Cloud Sync Module
 * يرسل بيانات الجهاز والعمليات إلى Google Sheets عبر Apps Script
 * يعمل بصمت في الخلفية — يخزن محلياً عند عدم وجود إنترنت ويزامن عند الاتصال
 */

import { getDeviceId } from './device-id';

const DEFAULT_SYNC_ENDPOINT = ''; // Set via Admin panel
const SYNC_QUEUE_KEY = 'cloud_sync_queue_v1';
const SYNC_ENDPOINT_KEY = 'cloud_sync_endpoint_v1';
const LAST_SYNC_KEY = 'cloud_last_sync_v1';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

export type SyncEventType =
  | 'device_register'
  | 'app_open'
  | 'trial_started'
  | 'trial_expired'
  | 'license_activated'
  | 'license_expired'
  | 'transfer'
  | 'settings_changed'
  | 'heartbeat'
  | 'distributor_topup'
  | 'distributor_payment';

export interface SyncEvent {
  id: string;
  deviceId: string;
  event: SyncEventType;
  timestamp: string; // ISO
  data: Record<string, unknown>;
}

// ============ Endpoint Management ============

export function getSyncEndpoint(): string {
  return localStorage.getItem(SYNC_ENDPOINT_KEY) || DEFAULT_SYNC_ENDPOINT;
}

export function saveSyncEndpoint(url: string) {
  localStorage.setItem(SYNC_ENDPOINT_KEY, url.trim());
}

export function isSyncEnabled(): boolean {
  const enabledFlag = localStorage.getItem('cloud_sync_enabled_v1');
  if (enabledFlag === 'false') return false;
  return getSyncEndpoint().length > 0;
}

// ============ Queue Management ============

function getQueue(): SyncEvent[] {
  try {
    const stored = localStorage.getItem(SYNC_QUEUE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveQueue(queue: SyncEvent[]) {
  // Keep max 500 events in queue
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue.slice(0, 500)));
}

export function getQueueSize(): number {
  return getQueue().length;
}

export function getLastSyncTime(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

// ============ Event Tracking ============

function createSyncEvent(event: SyncEventType, data: Record<string, unknown> = {}): SyncEvent {
  return {
    id: crypto.randomUUID(),
    deviceId: getDeviceId(),
    event,
    timestamp: new Date().toISOString(),
    data,
  };
}

export function trackEvent(event: SyncEventType, data: Record<string, unknown> = {}) {
  if (!isSyncEnabled()) return;

  const queue = getQueue();
  queue.push(createSyncEvent(event, data));
  saveQueue(queue);

  // Try to sync immediately if online
  if (navigator.onLine) {
    flushQueue().catch(() => {});
  }
}

// ============ Sync Engine ============

async function flushQueue(): Promise<{ sent: number; failed: number }> {
  const endpoint = getSyncEndpoint();
  if (!endpoint) return { sent: 0, failed: 0 };

  const queue = getQueue();
  if (queue.length === 0) return { sent: 0, failed: 0 };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({ events: queue }),
    });

    // no-cors always returns opaque response, assume success
    if (response.ok || response.type === 'opaque') {
      const sent = queue.length;
      saveQueue([]);
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      return { sent, failed: 0 };
    }

    return { sent: 0, failed: queue.length };
  } catch {
    return { sent: 0, failed: queue.length };
  }
}

export async function syncNow(): Promise<{ sent: number; failed: number }> {
  if (!isSyncEnabled()) return { sent: 0, failed: 0 };

  // Ensure manual sync always has at least one event to send
  if (getQueue().length === 0) {
    saveQueue([
      createSyncEvent('heartbeat', {
        appVersion: '1.0',
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        language: navigator.language,
        online: navigator.onLine,
        manualSync: true,
      }),
    ]);
  }

  return flushQueue();
}

// ============ Background Sync ============

let syncIntervalId: ReturnType<typeof setInterval> | null = null;

export function startBackgroundSync() {
  if (syncIntervalId) return;

  // Sync when coming online
  window.addEventListener('online', () => {
    flushQueue().catch(() => {});
  });

  // Periodic sync
  syncIntervalId = setInterval(() => {
    if (navigator.onLine && isSyncEnabled()) {
      flushQueue().catch(() => {});
    }
  }, SYNC_INTERVAL);

  // Initial heartbeat
  if (isSyncEnabled()) {
    trackEvent('heartbeat', {
      appVersion: '1.0',
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      language: navigator.language,
      online: navigator.onLine,
    });
  }
}

// ============ Device Registration ============

export function trackDeviceInfo() {
  trackEvent('device_register', {
    appVersion: '1.0',
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

export function trackAppOpen() {
  trackEvent('app_open', {
    timestamp: new Date().toISOString(),
  });
}

export function trackTransfer(phone: string, amount: string, operator: string, status: string) {
  trackEvent('transfer', { phone, amount, operator, status });
}

export function trackLicenseEvent(event: 'license_activated' | 'license_expired' | 'trial_started' | 'trial_expired', extra: Record<string, unknown> = {}) {
  trackEvent(event, extra);
}
