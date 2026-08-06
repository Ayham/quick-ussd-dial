import type { UserNotification } from "./types";
import {
  acknowledgeNotification,
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
  toggleNotificationFavorite,
} from "./service";

const CACHE_PREFIX = "notifications_cache_v1";
const OPS_KEY = "notifications_pending_ops_v1";
const LAST_SYNC_KEY = "notifications_last_sync_v1";
const MAX_OPS = 200;

type PendingOp =
  | { type: "read"; notification_id: string; read_version: number; read_at: string }
  | { type: "read_all"; at: string }
  | { type: "favorite"; notification_id: string; favorite: boolean }
  | { type: "dismiss"; notification_id: string }
  | { type: "ack"; notification_id: string };

function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}_${userId}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getCachedNotifications(userId: string): UserNotification[] {
  return safeParse<UserNotification[]>(localStorage.getItem(cacheKey(userId)), []);
}

export function setCachedNotifications(userId: string, items: UserNotification[]): void {
  localStorage.setItem(cacheKey(userId), JSON.stringify(items.slice(0, 200)));
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

export function clearCachedNotifications(userId: string): void {
  localStorage.removeItem(cacheKey(userId));
}

export function getLastNotificationsSync(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

function getPendingOps(): PendingOp[] {
  return safeParse<PendingOp[]>(localStorage.getItem(OPS_KEY), []);
}

function savePendingOps(ops: PendingOp[]): void {
  localStorage.setItem(OPS_KEY, JSON.stringify(ops.slice(0, MAX_OPS)));
}

export function enqueueRead(notificationId: string, version: number): void {
  const ops = getPendingOps().filter((op) => !(op.type === "read" && op.notification_id === notificationId));
  ops.push({ type: "read", notification_id: notificationId, read_version: version, read_at: new Date().toISOString() });
  savePendingOps(ops);
}

export function enqueueReadAll(): void {
  const ops = getPendingOps().filter((op) => op.type !== "read");
  ops.push({ type: "read_all", at: new Date().toISOString() });
  savePendingOps(ops);
}

export function enqueueFavorite(notificationId: string, favorite: boolean): void {
  const ops = getPendingOps();
  ops.push({ type: "favorite", notification_id: notificationId, favorite });
  savePendingOps(ops);
}

export function enqueueDismiss(notificationId: string): void {
  const ops = getPendingOps();
  ops.push({ type: "dismiss", notification_id: notificationId });
  savePendingOps(ops);
}

export function enqueueAcknowledge(notificationId: string): void {
  const ops = getPendingOps();
  ops.push({ type: "ack", notification_id: notificationId });
  savePendingOps(ops);
}

export function hasPendingOps(): boolean {
  return getPendingOps().length > 0;
}

export function getPendingOpCount(): number {
  return getPendingOps().length;
}

function applyLocalOps(items: UserNotification[]): UserNotification[] {
  const ops = getPendingOps();
  if (ops.length === 0) return items;

  const latestRead = new Map<string, PendingOp & { type: "read" }>();
  let readAllAt: string | null = null;
  const favorites = new Map<string, boolean>();
  const dismissed = new Set<string>();
  const acked = new Set<string>();

  for (const op of ops) {
    if (op.type === "read") latestRead.set(op.notification_id, op);
    else if (op.type === "read_all") readAllAt = op.at;
    else if (op.type === "favorite") favorites.set(op.notification_id, op.favorite);
    else if (op.type === "dismiss") dismissed.add(op.notification_id);
    else if (op.type === "ack") acked.add(op.notification_id);
  }

  return items.map((item) => {
    let next = item;
    const readOp = latestRead.get(item.id);
    if (readOp) {
      next = { ...next, is_read: true, read_at: readOp.read_at };
    } else if (readAllAt) {
      next = { ...next, is_read: true, read_at: next.read_at ?? readAllAt };
    }
    if (favorites.has(item.id)) {
      next = { ...next, is_favorite: favorites.get(item.id)! };
    }
    if (dismissed.has(item.id)) {
      next = { ...next, is_dismissed: true };
    }
    if (acked.has(item.id)) {
      next = { ...next, is_read: true, read_at: next.read_at ?? new Date().toISOString(), acknowledged_at: new Date().toISOString() };
    }
    return next;
  });
}

export function applyCachedState(items: UserNotification[]): UserNotification[] {
  return applyLocalOps(items);
}

export async function flushPendingOps(): Promise<{ sent: number; failed: number }> {
  if (!navigator.onLine) return { sent: 0, failed: 0 };
  const ops = getPendingOps();
  if (ops.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const remaining: PendingOp[] = [];

  for (const op of ops) {
    try {
      switch (op.type) {
        case "read":
          await markNotificationRead(op.notification_id, op.read_version);
          break;
        case "read_all":
          await markAllNotificationsRead();
          break;
        case "favorite":
          await toggleNotificationFavorite(op.notification_id, op.favorite);
          break;
        case "dismiss":
          await dismissNotification(op.notification_id);
          break;
        case "ack":
          await acknowledgeNotification(op.notification_id);
          break;
      }
      sent += 1;
    } catch {
      failed += 1;
      remaining.push(op);
    }
  }

  savePendingOps(remaining);
  return { sent, failed };
}
