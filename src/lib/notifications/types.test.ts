import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_ACTION_TYPES,
  NOTIFICATION_TYPE_META,
  NOTIFICATION_PRIORITY_META,
  resolveAction,
  mapNotification,
  type NotificationType,
  type NotificationPriority,
  type NotificationStatus,
  type NotificationActionType,
} from "./types";

describe("notification enums", () => {
  it("has 14 notification types", () => {
    expect(NOTIFICATION_TYPES).toHaveLength(14);
  });

  it("includes all semantic types", () => {
    expect(NOTIFICATION_TYPES).toContain("custom");
    expect(NOTIFICATION_TYPES).toContain("license_expiring");
    expect(NOTIFICATION_TYPES).toContain("license_expired");
    expect(NOTIFICATION_TYPES).toContain("license_activated");
    expect(NOTIFICATION_TYPES).toContain("license_revoked");
    expect(NOTIFICATION_TYPES).toContain("trial_started");
    expect(NOTIFICATION_TYPES).toContain("trial_ended");
    expect(NOTIFICATION_TYPES).toContain("account_suspended");
    expect(NOTIFICATION_TYPES).toContain("account_restored");
    expect(NOTIFICATION_TYPES).toContain("security_alert");
    expect(NOTIFICATION_TYPES).toContain("announcement");
    expect(NOTIFICATION_TYPES).toContain("system_update");
    expect(NOTIFICATION_TYPES).toContain("transfer_success");
    expect(NOTIFICATION_TYPES).toContain("transfer_failure");
  });

  it("has 4 priorities", () => {
    expect(NOTIFICATION_PRIORITIES).toEqual(["low", "normal", "high", "critical"]);
  });

  it("has 6 statuses", () => {
    expect(NOTIFICATION_STATUSES).toEqual([
      "draft", "scheduled", "sent", "archived", "cancelled", "failed",
    ]);
  });

  it("has 4 action types", () => {
    expect(NOTIFICATION_ACTION_TYPES).toEqual(["none", "screen", "url", "custom"]);
  });
});

describe("NOTIFICATION_TYPE_META", () => {
  it("has an entry for every notification type", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPE_META[type]).toBeDefined();
    }
  });

  it("each entry has icon, color, bg, accent", () => {
    for (const type of NOTIFICATION_TYPES) {
      const meta = NOTIFICATION_TYPE_META[type];
      expect(meta.icon).toBeTruthy();
      expect(typeof meta.color).toBe("string");
      expect(typeof meta.bg).toBe("string");
      expect(typeof meta.accent).toBe("string");
    }
  });
});

describe("NOTIFICATION_PRIORITY_META", () => {
  it("has an entry for every priority", () => {
    for (const priority of NOTIFICATION_PRIORITIES) {
      expect(NOTIFICATION_PRIORITY_META[priority]).toBeDefined();
    }
  });
});

describe("resolveAction", () => {
  it("returns none action for empty input", () => {
    const action = resolveAction({});
    expect(action).toEqual({ type: "none", target: null, url: null, custom: null });
  });

  it("returns screen action with target", () => {
    const action = resolveAction({ action_type: "screen", action_target: "/profile" });
    expect(action).toEqual({ type: "screen", target: "/profile", url: null, custom: null });
  });

  it("returns url action with url", () => {
    const action = resolveAction({ action_type: "url", action_target: "https://example.com" });
    expect(action).toEqual({ type: "url", target: null, url: "https://example.com", custom: null });
  });

  it("returns custom action with metadata", () => {
    const action = resolveAction({
      action_type: "custom",
      metadata: { deepLink: "notifications/settings" },
    });
    expect(action).toEqual({
      type: "custom",
      target: null,
      url: null,
      custom: { deepLink: "notifications/settings" },
    });
  });

  it("defaults to none when action_type is missing", () => {
    const action = resolveAction({ action_target: "/profile" });
    expect(action.type).toBe("none");
  });
});

describe("mapNotification", () => {
  it("maps a DTO to a UserNotification with resolved action", () => {
    const dto = {
      id: "notif-1",
      notification_type: "transfer_success" as NotificationType,
      priority: "normal" as NotificationPriority,
      title_ar: "تحويل ناجح",
      title_en: "Transfer successful",
      body_ar: "تم إرسال التحويل",
      body_en: "Transfer sent",
      image_url: null,
      is_pinned: false,
      requires_acknowledgement: false,
      is_announcement: false,
      action_type: "none" as NotificationActionType,
      action_target: null,
      metadata: null,
      version: 1,
      recipient_id: "recip-1",
      is_read: false,
      read_at: null,
      is_favorite: false,
      is_dismissed: false,
      acknowledged_at: null,
      created_at: "2026-08-06T12:00:00Z",
      sent_at: "2026-08-06T12:00:01Z",
      expires_at: null,
    };
    const result = mapNotification(dto);
    expect(result.id).toBe("notif-1");
    expect(result.action.type).toBe("none");
    expect(result.is_read).toBe(false);
  });
});
