import { supabase } from "@/integrations/supabase/client";
import type {
  AdminNotification,
  AdminNotificationDetail,
  NotificationListResult,
  NotificationPreference,
  NotificationSearchUser,
  NotificationSegment,
  NotificationStats,
  NotificationType,
  UserNotification,
} from "./types";
import { mapNotification } from "./types";

interface RpcResult {
  ok?: boolean;
  reason?: string;
}

function isRpcOk(result: RpcResult | null | undefined): result is RpcResult & { ok: true } {
  return !!result && result.ok === true;
}

async function callRpc<T extends RpcResult>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args as object);
  if (error) throw error;
  const result = data as unknown as T;
  if (!isRpcOk(result)) {
    const reason = result?.reason || "unknown_error";
    throw new Error(reason);
  }
  return result;
}

// ---------------------------------------------------------------------------
// USER-FACING
// ---------------------------------------------------------------------------

export interface GetNotificationsParams {
  since?: string;
  page?: number;
  pageSize?: number;
  filter?: "unread" | "read" | "all" | null;
  type?: string;
  priority?: string;
  search?: string;
  order?: "newest" | "oldest";
  dateFrom?: string;
  dateTo?: string;
  includeDismissed?: boolean;
}

interface GetNotificationsRpc extends RpcResult {
  items?: Record<string, unknown>[];
  total?: number;
  unread_count?: number;
  page?: number;
  page_size?: number;
  has_more?: boolean;
}

export async function getNotifications(params: GetNotificationsParams = {}): Promise<NotificationListResult> {
  const result = await callRpc<GetNotificationsRpc>("user_get_notifications", {
    p_since: params.since ?? null,
    p_page: params.page ?? 1,
    p_page_size: params.pageSize ?? 30,
    p_filter: params.filter && params.filter !== "all" ? params.filter : null,
    p_type: params.type ?? null,
    p_priority: params.priority ?? null,
    p_search: params.search ?? null,
    p_order: params.order ?? "newest",
    p_date_from: params.dateFrom ?? null,
    p_date_to: params.dateTo ?? null,
    p_include_dismissed: params.includeDismissed ?? false,
  });
  return {
    notifications: (result.items || []).map((item) => mapNotification(item as unknown as Parameters<typeof mapNotification>[0])),
    total: result.total ?? 0,
    unread: result.unread_count ?? 0,
    page: result.page ?? 1,
    pageSize: result.page_size ?? params.pageSize ?? 30,
    hasMore: result.has_more ?? false,
  };
}

interface MarkReadRpc extends RpcResult {
  notification_id?: string;
}

export async function markNotificationRead(notificationId: string, version?: number): Promise<void> {
  await callRpc<MarkReadRpc>("user_mark_notification_read", {
    p_notification_id: notificationId,
    p_read_version: version ?? 1,
    p_read_at: new Date().toISOString(),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await callRpc<RpcResult>("user_mark_all_notifications_read");
}

export async function toggleNotificationFavorite(notificationId: string, favorite?: boolean): Promise<void> {
  await callRpc<RpcResult>("user_toggle_notification_favorite", {
    p_notification_id: notificationId,
    p_favorite: favorite,
  });
}

export async function dismissNotification(notificationId: string): Promise<void> {
  await callRpc<RpcResult>("user_dismiss_notification", {
    p_notification_id: notificationId,
  });
}

export async function acknowledgeNotification(notificationId: string): Promise<void> {
  await callRpc<RpcResult>("user_acknowledge_notification", {
    p_notification_id: notificationId,
  });
}

interface GetPreferencesRpc extends RpcResult {
  items?: { notification_type: string; enabled: boolean; sound_enabled: boolean; vibration_enabled: boolean }[];
}

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const result = await callRpc<GetPreferencesRpc>("user_get_notification_preferences");
  return (result.items || []).map((item) => ({
    notification_type: item.notification_type as NotificationType,
    enabled: item.enabled,
    sound_enabled: item.sound_enabled,
    vibration_enabled: item.vibration_enabled,
  }));
}

export async function setNotificationPreference(
  notificationType: NotificationType,
  patch: { enabled?: boolean; sound_enabled?: boolean; vibration_enabled?: boolean },
): Promise<void> {
  await callRpc<RpcResult>("user_set_notification_preferences", {
    p_notification_type: notificationType,
    p_enabled: patch.enabled,
    p_sound_enabled: patch.sound_enabled,
    p_vibration_enabled: patch.vibration_enabled,
  });
}

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------

export interface CreateNotificationInput {
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  type: NotificationType;
  priority: "low" | "normal" | "high" | "critical";
  action_type: "none" | "screen" | "url" | "custom";
  action_target?: string | null;
  expires_at?: string | null;
  scheduled_at?: string | null;
  send_config?: Record<string, unknown>;
  requires_acknowledgement?: boolean;
  is_pinned?: boolean;
  is_announcement?: boolean;
  image_url?: string | null;
  metadata?: Record<string, unknown>;
}

interface CreateNotificationRpc extends RpcResult {
  id?: string;
  status?: string;
  recipients?: number;
}

export async function adminCreateNotification(input: CreateNotificationInput): Promise<{ id: string; status: string; recipients: number }> {
  const result = await callRpc<CreateNotificationRpc>("admin_create_notification", {
    p_title_ar: input.title_ar,
    p_title_en: input.title_en,
    p_body_ar: input.body_ar,
    p_body_en: input.body_en,
    p_type: input.type,
    p_priority: input.priority,
    p_action_type: input.action_type,
    p_action_target: input.action_target ?? null,
    p_expires_at: input.expires_at ?? null,
    p_scheduled_at: input.scheduled_at ?? null,
    p_send_config: input.send_config ?? {},
    p_requires_acknowledgement: input.requires_acknowledgement ?? false,
    p_is_pinned: input.is_pinned ?? false,
    p_is_announcement: input.is_announcement ?? false,
    p_image_url: input.image_url ?? null,
    p_metadata: input.metadata ?? {},
  });
  return { id: result.id ?? "", status: result.status ?? "sent", recipients: result.recipients ?? 0 };
}

export interface UpdateNotificationInput {
  id: string;
  title_ar?: string;
  title_en?: string;
  body_ar?: string;
  body_en?: string;
  type?: NotificationType;
  priority?: "low" | "normal" | "high" | "critical";
  action_type?: "none" | "screen" | "url" | "custom";
  action_target?: string | null;
  expires_at?: string | null;
  clear_expires_at?: boolean;
  is_pinned?: boolean;
  is_announcement?: boolean;
  image_url?: string | null;
  metadata?: Record<string, unknown>;
}

export async function adminUpdateNotification(input: UpdateNotificationInput): Promise<{ version: number }> {
  const result = await callRpc<RpcResult & { version?: number }>("admin_update_notification", {
    p_id: input.id,
    p_title_ar: input.title_ar ?? null,
    p_title_en: input.title_en ?? null,
    p_body_ar: input.body_ar ?? null,
    p_body_en: input.body_en ?? null,
    p_type: input.type ?? null,
    p_priority: input.priority ?? null,
    p_action_type: input.action_type ?? null,
    p_action_target: input.action_target,
    p_expires_at: input.expires_at ?? null,
    p_is_pinned: input.is_pinned ?? null,
    p_is_announcement: input.is_announcement ?? null,
    p_image_url: input.image_url ?? null,
    p_metadata: input.metadata ?? null,
    p_clear_expires_at: input.clear_expires_at ?? false,
  });
  return { version: result.version ?? 0 };
}

export async function adminDeleteNotification(id: string): Promise<void> {
  await callRpc<RpcResult>("admin_delete_notification", { p_id: id });
}

export async function adminRestoreNotification(id: string): Promise<void> {
  await callRpc<RpcResult>("admin_restore_notification", { p_id: id });
}

export async function adminArchiveNotification(id: string): Promise<void> {
  await callRpc<RpcResult>("admin_archive_notification", { p_id: id });
}

export async function adminCancelNotification(id: string): Promise<void> {
  await callRpc<RpcResult>("admin_cancel_notification", { p_id: id });
}

export async function adminProcessScheduledNotifications(): Promise<{ processed: number }> {
  const result = await callRpc<RpcResult & { processed?: number }>("admin_process_scheduled_notifications");
  return { processed: result.processed ?? 0 };
}

export async function adminResendNotification(id: string, recipientIds?: string[]): Promise<{ recipients: number }> {
  const result = await callRpc<RpcResult & { recipients?: number }>("admin_resend_notification", {
    p_id: id,
    p_recipient_ids: recipientIds ?? null,
  });
  return { recipients: result.recipients ?? 0 };
}

export interface GetAdminNotificationsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  type?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  includeDeleted?: boolean;
}

interface AdminNotificationsRpc extends RpcResult {
  items?: Record<string, unknown>[];
  total?: number;
  page?: number;
  page_size?: number;
  has_more?: boolean;
}

export async function adminGetNotifications(params: GetAdminNotificationsParams = {}): Promise<{
  items: AdminNotification[];
  total: number;
  page: number;
  hasMore: boolean;
}> {
  const result = await callRpc<AdminNotificationsRpc>("admin_get_notifications", {
    p_page: params.page ?? 1,
    p_page_size: params.pageSize ?? 20,
    p_status: params.status ?? null,
    p_type: params.type ?? null,
    p_search: params.search ?? null,
    p_date_from: params.dateFrom ?? null,
    p_date_to: params.dateTo ?? null,
    p_include_deleted: params.includeDeleted ?? false,
  });
  const items: AdminNotification[] = (result.items || []).map((item) => {
    const raw = item as Record<string, unknown>;
    return {
      id: String(raw.id),
      notification_type: raw.notification_type as AdminNotification["notification_type"],
      priority: raw.priority as AdminNotification["priority"],
      status: raw.status as AdminNotification["status"],
      title_ar: String(raw.title_ar ?? ""),
      title_en: String(raw.title_en ?? ""),
      created_at: String(raw.created_at ?? ""),
      scheduled_at: raw.scheduled_at ? String(raw.scheduled_at) : null,
      sent_at: raw.sent_at ? String(raw.sent_at) : null,
      is_announcement: !!raw.is_announcement,
      is_pinned: !!raw.is_pinned,
      requires_acknowledgement: !!raw.requires_acknowledgement,
      created_by: raw.created_by ? String(raw.created_by) : null,
      recipient_count: Number(raw.recipients_count ?? 0),
      delivered_count: Number(raw.delivered_count ?? 0),
      read_count: Number(raw.read_count ?? 0),
      ack_count: Number(raw.ack_count ?? 0),
      failed_count: Number(raw.failed_count ?? 0),
      version: Number(raw.version ?? 1),
    };
  });
  return {
    items,
    total: result.total ?? 0,
    page: result.page ?? 1,
    hasMore: result.has_more ?? false,
  };
}

interface AdminDetailRpc extends RpcResult {
  notification?: Record<string, unknown>;
  recipients?: Record<string, unknown>[];
  recipients_count?: number;
  versions?: Record<string, unknown>[];
}

export async function adminGetNotificationDetail(id: string): Promise<AdminNotificationDetail> {
  const result = await callRpc<AdminDetailRpc>("admin_get_notification_detail", { p_id: id });
  const n = (result.notification || {}) as Record<string, unknown>;
  return {
    id: String(n.id),
    notification_type: n.notification_type as AdminNotificationDetail["notification_type"],
    priority: n.priority as AdminNotificationDetail["priority"],
    status: n.status as AdminNotificationDetail["status"],
    title_ar: String(n.title_ar ?? ""),
    title_en: String(n.title_en ?? ""),
    body_ar: String(n.body_ar ?? ""),
    body_en: String(n.body_en ?? ""),
    action_type: (n.action_type as AdminNotificationDetail["action_type"]) ?? "none",
    action_target: n.action_target ? String(n.action_target) : null,
    image_url: n.image_url ? String(n.image_url) : null,
    expires_at: n.expires_at ? String(n.expires_at) : null,
    send_config: (n.send_config as Record<string, unknown>) ?? null,
    metadata: (n.metadata as Record<string, unknown>) ?? null,
    is_deleted: !!n.is_deleted,
    is_announcement: !!n.is_announcement,
    is_pinned: !!n.is_pinned,
    requires_acknowledgement: !!n.requires_acknowledgement,
    created_at: String(n.created_at ?? ""),
    scheduled_at: n.scheduled_at ? String(n.scheduled_at) : null,
    sent_at: n.sent_at ? String(n.sent_at) : null,
    created_by: n.created_by ? String(n.created_by) : null,
    created_by_name: (n.creator_name as string) ?? null,
    recipient_count: Number(result.recipients_count ?? 0),
    delivered_count: Number(n.delivered_count ?? 0),
    read_count: Number(n.read_count ?? 0),
    ack_count: Number(n.ack_count ?? 0),
    failed_count: Number(n.failed_count ?? 0),
    version: Number(n.version ?? 1),
    versions: (result.versions || []).map((v) => ({
      version: Number(v.version),
      title_ar: String(v.title_ar ?? ""),
      title_en: String(v.title_en ?? ""),
      edited_at: String(v.edited_at ?? ""),
      edited_by: v.edited_by ? String(v.edited_by) : null,
    })),
  };
}

interface SearchUsersRpc extends RpcResult {
  users?: Record<string, unknown>[];
  total?: number;
  page?: number;
  has_more?: boolean;
}

export async function adminSearchNotificationUsers(params: { search?: string; page?: number; pageSize?: number } = {}): Promise<{
  users: NotificationSearchUser[];
  total: number;
  hasMore: boolean;
}> {
  const result = await callRpc<SearchUsersRpc>("admin_search_notification_users", {
    p_search: params.search ?? null,
    p_page: params.page ?? 1,
    p_page_size: params.pageSize ?? 50,
  });
  const users: NotificationSearchUser[] = (result.users || []).map((raw) => ({
    user_id: String(raw.user_id),
    display_name: raw.display_name ? String(raw.display_name) : null,
    email: raw.email ? String(raw.email) : null,
    phone: raw.phone ? String(raw.phone) : null,
    shop_name: raw.shop_name ? String(raw.shop_name) : null,
    license_status: raw.license_status ? String(raw.license_status) : null,
    account_status: raw.account_status ? String(raw.account_status) : null,
    has_profile: true,
  }));
  return { users, total: result.total ?? 0, hasMore: result.has_more ?? false };
}

interface SegmentsRpc extends RpcResult {
  all?: number;
  active_license?: number;
  trial?: number;
  expired?: number;
  no_license?: number;
  roles?: { role?: string; count?: number }[];
}

export async function adminGetNotificationSegments(): Promise<NotificationSegment[]> {
  const result = await callRpc<SegmentsRpc>("admin_get_notification_segments");
  const segments: NotificationSegment[] = [
    { key: "all", label: "all", count: result.all ?? 0 },
    { key: "active_license", label: "active_license", count: result.active_license ?? 0 },
    { key: "trial", label: "trial", count: result.trial ?? 0 },
    { key: "expired", label: "expired", count: result.expired ?? 0 },
    { key: "no_license", label: "no_license", count: result.no_license ?? 0 },
  ];
  for (const role of result.roles || []) {
    if (role.role) segments.push({ key: `role:${role.role}`, label: `role:${role.role}`, count: role.count ?? 0 });
  }
  return segments;
}

interface StatsRpc extends RpcResult {
  total?: number;
  sent_today?: number;
  sent_week?: number;
  sent_month?: number;
  scheduled?: number;
  pinned?: number;
  drafts?: number;
  unread?: number;
  read?: number;
  read_pct?: number;
  avg_read_minutes?: number;
  acknowledged?: number;
  by_type?: { key?: string; count?: number }[];
  by_priority?: { key?: string; count?: number }[];
  top_users?: { user_id?: string; label?: string; read_count?: number }[];
}

export async function adminGetNotificationStats(): Promise<NotificationStats> {
  const result = await callRpc<StatsRpc>("admin_get_notification_stats");
  const toRecord = (rows: { key?: string; count?: number }[] | undefined): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const row of rows || []) {
      if (row.key) out[row.key] = Number(row.count ?? 0);
    }
    return out;
  };
  return {
    total_sent: result.total ?? 0,
    total_scheduled: result.scheduled ?? 0,
    total_drafts: result.drafts ?? 0,
    total_unread: result.unread ?? 0,
    total_read: result.read ?? 0,
    by_type: toRecord(result.by_type),
    by_priority: toRecord(result.by_priority),
    recent_trend: [],
  };
}

// ---------------------------------------------------------------------------
// LOCAL read-state helpers (read_version reconciliation)
// ---------------------------------------------------------------------------

export function toDeliveredVersion(notification: Pick<UserNotification, "version">): number {
  return notification.version;
}
