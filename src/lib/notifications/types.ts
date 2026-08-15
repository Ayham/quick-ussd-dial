import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  Bell,
  CheckCircle2,
  CircleAlert,
  Clock,
  Info,
  Megaphone,
  RefreshCcw,
  Send,
  ShieldAlert,
  Timer,
  XCircle,
} from "lucide-react";

export type NotificationType =
  | "custom"
  | "license_expiring"
  | "license_expired"
  | "license_activated"
  | "license_revoked"
  | "trial_started"
  | "trial_ended"
  | "account_suspended"
  | "account_restored"
  | "security_alert"
  | "announcement"
  | "system_update"
  | "transfer_success"
  | "transfer_failure";

export type NotificationPriority = "low" | "normal" | "high" | "critical";

export type NotificationStatus = "draft" | "scheduled" | "sent" | "archived" | "cancelled" | "failed";

export type NotificationActionType = "none" | "screen" | "url" | "custom";

export const NOTIFICATION_TYPES: NotificationType[] = [
  "custom",
  "license_expiring",
  "license_expired",
  "license_activated",
  "license_revoked",
  "trial_started",
  "trial_ended",
  "account_suspended",
  "account_restored",
  "security_alert",
  "announcement",
  "system_update",
  "transfer_success",
  "transfer_failure",
];

export const NOTIFICATION_PRIORITIES: NotificationPriority[] = ["low", "normal", "high", "critical"];

export const NOTIFICATION_STATUSES: NotificationStatus[] = [
  "draft",
  "scheduled",
  "sent",
  "archived",
  "cancelled",
  "failed",
];

export const NOTIFICATION_ACTION_TYPES: NotificationActionType[] = ["none", "screen", "url", "custom"];

export interface NotificationTypeMeta {
  icon: LucideIcon;
  /** tailwind text color classes for the icon */
  color: string;
  /** tailwind background classes for the icon container */
  bg: string;
  /** badge/count accent color classes */
  accent: string;
}

export const NOTIFICATION_TYPE_META: Record<NotificationType, NotificationTypeMeta> = {
  custom: { icon: Bell, color: "text-slate-600", bg: "bg-slate-100", accent: "bg-slate-500" },
  license_expiring: { icon: Timer, color: "text-amber-600", bg: "bg-amber-100", accent: "bg-amber-500" },
  license_expired: { icon: XCircle, color: "text-red-600", bg: "bg-red-100", accent: "bg-red-500" },
  license_activated: { icon: BadgeCheck, color: "text-emerald-600", bg: "bg-emerald-100", accent: "bg-emerald-500" },
  license_revoked: { icon: Ban, color: "text-red-600", bg: "bg-red-100", accent: "bg-red-500" },
  trial_started: { icon: Clock, color: "text-blue-600", bg: "bg-blue-100", accent: "bg-blue-500" },
  trial_ended: { icon: Timer, color: "text-orange-600", bg: "bg-orange-100", accent: "bg-orange-500" },
  account_suspended: { icon: Ban, color: "text-red-600", bg: "bg-red-100", accent: "bg-red-500" },
  account_restored: { icon: RefreshCcw, color: "text-emerald-600", bg: "bg-emerald-100", accent: "bg-emerald-500" },
  security_alert: { icon: ShieldAlert, color: "text-red-600", bg: "bg-red-100", accent: "bg-red-500" },
  announcement: { icon: Megaphone, color: "text-indigo-600", bg: "bg-indigo-100", accent: "bg-indigo-500" },
  system_update: { icon: RefreshCcw, color: "text-cyan-600", bg: "bg-cyan-100", accent: "bg-cyan-500" },
  transfer_success: { icon: Send, color: "text-emerald-600", bg: "bg-emerald-100", accent: "bg-emerald-500" },
  transfer_failure: { icon: CircleAlert, color: "text-red-600", bg: "bg-red-100", accent: "bg-red-500" },
};

export const NOTIFICATION_PRIORITY_META: Record<NotificationPriority, { color: string; dot: string }> = {
  low: { color: "text-slate-500", dot: "bg-slate-400" },
  normal: { color: "text-blue-600", dot: "bg-blue-500" },
  high: { color: "text-amber-600", dot: "bg-amber-500" },
  critical: { color: "text-red-600", dot: "bg-red-500" },
};

export interface NotificationAction {
  type: NotificationActionType;
  /** when action_type === "screen": internal route path */
  target: string | null;
  /** when action_type === "url": external URL */
  url: string | null;
  /** arbitrary payload for "custom" actions */
  custom: Record<string, unknown> | null;
}

export interface UserNotification {
  id: string;
  notification_type: NotificationType;
  priority: NotificationPriority;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  image_url: string | null;
  is_pinned: boolean;
  requires_acknowledgement: boolean;
  is_announcement: boolean;
  action: NotificationAction;
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
  version: number;
  // recipient state
  recipient_id: string;
  is_read: boolean;
  read_at: string | null;
  is_favorite: boolean;
  is_dismissed: boolean;
  acknowledged_at: string | null;
}

export type NotificationFilter = "all" | "unread" | "announcements" | "license" | "account" | "transfers";

export interface NotificationListResult {
  notifications: UserNotification[];
  total: number;
  unread: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface NotificationPreference {
  notification_type: NotificationType;
  enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
}

export interface NotificationUnreadCount {
  total: number;
  critical: number;
  last_updated: string;
}

export interface NotificationSegment {
  key: string;
  label: string;
  count: number;
}

export interface NotificationStats {
  total_sent: number;
  total_scheduled: number;
  total_drafts: number;
  total_unread: number;
  total_read: number;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
  recent_trend: { date: string; sent: number; read: number }[];
}

export interface NotificationSearchUser {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  shop_name: string | null;
  license_status: string | null;
  account_status: string | null;
  has_profile: boolean;
}

export interface AdminNotification {
  id: string;
  notification_type: NotificationType;
  priority: NotificationPriority;
  status: NotificationStatus;
  title_ar: string;
  title_en: string;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
  is_announcement: boolean;
  is_pinned: boolean;
  requires_acknowledgement: boolean;
  created_by: string | null;
  recipient_count: number;
  delivered_count: number;
  read_count: number;
  ack_count: number;
  failed_count: number;
  version: number;
  is_deleted: boolean;
}

export interface AdminNotificationDetail extends AdminNotification {
  body_ar: string;
  body_en: string;
  action_type: NotificationActionType;
  action_target: string | null;
  image_url: string | null;
  expires_at: string | null;
  send_config: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  is_deleted: boolean;
  created_by_name: string | null;
  versions: {
    version: number;
    title_ar: string;
    title_en: string;
    edited_at: string;
    edited_by: string | null;
  }[];
}

export function resolveAction(input: {
  action_type?: string | null;
  action_target?: string | null;
  metadata?: unknown;
}): NotificationAction {
  const type = (input.action_type || "none") as NotificationActionType;
  const target = input.action_target || null;
  let url: string | null = null;
  let custom: Record<string, unknown> | null = null;
  if (type === "url" && target) url = target;
  if (type === "custom" && input.metadata && typeof input.metadata === "object") {
    custom = input.metadata as Record<string, unknown>;
  }
  return { type, target: type === "url" ? null : target, url, custom };
}

export interface UserNotificationDto extends Omit<UserNotification, "action" | "metadata"> {
  action_type?: string | null;
  action_target?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function mapNotification(dto: UserNotificationDto): UserNotification {
  return {
    ...dto,
    metadata: dto.metadata ?? null,
    action: resolveAction({
      action_type: dto.action_type ?? "none",
      action_target: dto.action_target,
      metadata: dto.metadata,
    }),
  };
}
