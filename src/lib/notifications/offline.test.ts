import { describe, expect, it, beforeEach } from "vitest";
import {
  getCachedNotifications,
  setCachedNotifications,
  clearCachedNotifications,
  enqueueRead,
  enqueueReadAll,
  enqueueFavorite,
  enqueueDismiss,
  enqueueAcknowledge,
  hasPendingOps,
  getPendingOpCount,
  applyCachedState,
} from "./offline";
import type { UserNotification } from "./types";

const FAKE_USER_ID = "user-123";
const CACHE_KEY = `notifications_cache_v1_${FAKE_USER_ID}`;

function makeNotification(overrides: Partial<UserNotification> = {}): UserNotification {
  return {
    id: "notif-1",
    notification_type: "transfer_success",
    priority: "normal",
    title_ar: "تحويل ناجح",
    title_en: "Transfer successful",
    body_ar: "تم الإرسال",
    body_en: "Sent",
    image_url: null,
    is_pinned: false,
    requires_acknowledgement: false,
    is_announcement: false,
    action: { type: "none", target: null, url: null, custom: null },
    created_at: "2026-08-06T12:00:00Z",
    sent_at: "2026-08-06T12:00:01Z",
    expires_at: null,
    metadata: null,
    version: 1,
    recipient_id: "recip-1",
    is_read: false,
    read_at: null,
    is_favorite: false,
    is_dismissed: false,
    acknowledged_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  clearCachedNotifications(FAKE_USER_ID);
});

describe("cache", () => {
  it("set and get round-trips correctly", () => {
    const items = [makeNotification()];
    setCachedNotifications(FAKE_USER_ID, items);
    expect(getCachedNotifications(FAKE_USER_ID)).toEqual(items);
  });

  it("returns empty array when nothing cached", () => {
    expect(getCachedNotifications(FAKE_USER_ID)).toEqual([]);
  });

  it("clear removes cached items", () => {
    setCachedNotifications(FAKE_USER_ID, [makeNotification()]);
    clearCachedNotifications(FAKE_USER_ID);
    expect(getCachedNotifications(FAKE_USER_ID)).toEqual([]);
  });
});

describe("pending ops", () => {
  it("starts empty", () => {
    expect(hasPendingOps()).toBe(false);
    expect(getPendingOpCount()).toBe(0);
  });

  it("enqueueRead adds a read op", () => {
    enqueueRead("notif-1", 1);
    expect(hasPendingOps()).toBe(true);
    expect(getPendingOpCount()).toBe(1);
  });

  it("enqueueReadAll adds a read_all op", () => {
    enqueueReadAll();
    expect(getPendingOpCount()).toBe(1);
  });

  it("enqueueFavorite adds a favorite op", () => {
    enqueueFavorite("notif-1", true);
    expect(getPendingOpCount()).toBe(1);
  });

  it("enqueueDismiss adds a dismiss op", () => {
    enqueueDismiss("notif-1");
    expect(getPendingOpCount()).toBe(1);
  });

  it("enqueueAcknowledge adds an ack op", () => {
    enqueueAcknowledge("notif-1");
    expect(getPendingOpCount()).toBe(1);
  });

  it("duplicate read ops for same notification are deduplicated", () => {
    enqueueRead("notif-1", 1);
    enqueueRead("notif-1", 2);
    expect(getPendingOpCount()).toBe(1);
  });
});

describe("applyCachedState", () => {
  it("applies pending read ops to items", () => {
    enqueueRead("notif-1", 1);
    const items = [makeNotification({ id: "notif-1", is_read: false })];
    const result = applyCachedState(items);
    expect(result[0].is_read).toBe(true);
  });

  it("applies pending favorite ops", () => {
    enqueueFavorite("notif-1", true);
    const items = [makeNotification({ id: "notif-1", is_favorite: false })];
    const result = applyCachedState(items);
    expect(result[0].is_favorite).toBe(true);
  });

  it("applies pending dismiss ops", () => {
    enqueueDismiss("notif-1");
    const items = [makeNotification({ id: "notif-1", is_dismissed: false })];
    const result = applyCachedState(items);
    expect(result[0].is_dismissed).toBe(true);
  });

  it("applies pending ack ops", () => {
    enqueueAcknowledge("notif-1");
    const items = [makeNotification({ id: "notif-1", is_read: false, acknowledged_at: null })];
    const result = applyCachedState(items);
    expect(result[0].is_read).toBe(true);
    expect(result[0].acknowledged_at).toBeTruthy();
  });

  it("returns items unchanged when no pending ops", () => {
    const items = [makeNotification()];
    expect(applyCachedState(items)).toEqual(items);
  });
});