import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthSession } from "@/lib/auth-session";
import {
  Archive, Bell, CalendarClock, Check, ChevronsUpDown, Copy, Eye, Loader2, Pencil,
  Plus, RefreshCw, Send, Trash2, Undo2, X, XCircle, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  AdminNotification, AdminNotificationDetail, NotificationActionType, NotificationPriority,
  NotificationSearchUser, NotificationSegment, NotificationStatus, NotificationType, NotificationStats,
} from "@/lib/notifications/types";
import { NOTIFICATION_ACTION_TYPES, NOTIFICATION_PRIORITIES, NOTIFICATION_STATUSES, NOTIFICATION_TYPES } from "@/lib/notifications/types";
import {
  adminArchiveNotification,
  adminCancelNotification,
  adminCreateNotification,
  adminDeleteNotification,
  adminGetNotificationDetail,
  adminGetNotificationSegments,
  adminGetNotifications,
  adminGetNotificationStats,
  adminResendNotification,
  adminRestoreNotification,
  adminSearchNotificationUsers,
  adminUpdateNotification,
} from "@/lib/notifications/service";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const STATUS_STYLES: Record<NotificationStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-amber-100 text-amber-700",
  sent: "bg-success/10 text-success",
  archived: "bg-slate-200 text-slate-600",
  cancelled: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------------

function StatsCards({ stats }: { stats: NotificationStats | null }) {
  const { t } = useTranslation();
  const cards = useMemo(
    () => [
      { label: t("adminNotifications.stats.total"), value: stats?.total_sent ?? 0, icon: Bell },
      { label: t("adminNotifications.stats.scheduled"), value: stats?.total_scheduled ?? 0, icon: CalendarClock },
      { label: t("adminNotifications.stats.drafts"), value: stats?.total_drafts ?? 0, icon: Pencil },
      { label: t("adminNotifications.stats.unread"), value: stats?.total_unread ?? 0, icon: Eye },
    ],
    [stats, t],
  );
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="rounded-2xl border border-border/60 bg-white p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-none">{card.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{card.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface NotificationForm {
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  type: NotificationType;
  priority: NotificationPriority;
  action_type: NotificationActionType;
  action_target: string;
  audience: string;
  role: string;
  user_id: string;
  scheduled_at: string;
  expires_at: string;
  is_pinned: boolean;
  is_announcement: boolean;
  requires_acknowledgement: boolean;
  image_url: string;
}

const EMPTY_FORM: NotificationForm = {
  title_ar: "",
  title_en: "",
  body_ar: "",
  body_en: "",
  type: "custom",
  priority: "normal",
  action_type: "none",
  action_target: "",
  audience: "all",
  role: "user",
  user_id: "",
  scheduled_at: "",
  expires_at: "",
  is_pinned: false,
  is_announcement: false,
  requires_acknowledgement: false,
  image_url: "",
};

interface AudienceOption {
  key: string;
  label: string;
}

function buildSendConfig(form: NotificationForm): Record<string, unknown> {
  const config: Record<string, unknown> = { audience: form.audience };
  // user_id is a real UUID selected from admin_search_notification_users,
  // never a client-typed value. The backend still re-validates it.
  if (form.audience === "single") config.user_id = form.user_id;
  if (form.audience === "role") config.role = form.role;
  return config;
}

// ---------------------------------------------------------------------------

function NotificationFormDialog({
  open,
  onOpenChange,
  initial,
  defaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** edit mode: updates the existing notification */
  initial: AdminNotificationDetail | null;
  /** create mode: prefill values (used for duplicate) */
  defaults: Partial<NotificationForm> | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<NotificationForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [segments, setSegments] = useState<NotificationSegment[]>([]);
  const [selectedUser, setSelectedUser] = useState<NotificationSearchUser | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userOptions, setUserOptions] = useState<NotificationSearchUser[]>([]);
  const [userOptionsLoading, setUserOptionsLoading] = useState(false);
  const prefillIdRef = useRef<string | null>(null);

  const loadUserOptions = useCallback(async (query: string) => {
    setUserOptionsLoading(true);
    try {
      const res = await adminSearchNotificationUsers({ search: query || null, pageSize: 50 });
      setUserOptions(res.users);
      if (prefillIdRef.current) {
        const match = res.users.find((u) => u.user_id === prefillIdRef.current);
        if (match) {
          prefillIdRef.current = null;
          setSelectedUser(match);
          setForm((prev) => ({ ...prev, user_id: match.user_id }));
        }
      }
    } catch {
      setUserOptions([]);
    } finally {
      setUserOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedUser(null);
    setUserOptions([]);
    if (initial) {
      const sendConfig = (initial.send_config || {}) as Record<string, unknown>;
      prefillIdRef.current = sendConfig.user_id ? String(sendConfig.user_id) : null;
      setForm({
        title_ar: initial.title_ar,
        title_en: initial.title_en,
        body_ar: initial.body_ar,
        body_en: initial.body_en,
        type: initial.notification_type,
        priority: initial.priority,
        action_type: initial.action_type,
        action_target: initial.action_target ?? "",
        audience: String(sendConfig.audience ?? "all"),
        role: String(sendConfig.role ?? "user"),
        user_id: sendConfig.user_id ? String(sendConfig.user_id) : "",
        scheduled_at: initial.status === "scheduled" ? toLocalDateTimeInput(initial.scheduled_at) : "",
        expires_at: toLocalDateTimeInput(initial.expires_at),
        is_pinned: initial.is_pinned,
        is_announcement: initial.is_announcement,
        requires_acknowledgement: initial.requires_acknowledgement,
        image_url: initial.image_url ?? "",
      });
    } else {
      prefillIdRef.current = defaults?.user_id ? defaults.user_id : null;
      setForm({ ...EMPTY_FORM, ...defaults });
    }
    setUserSearch("");
    loadUserOptions("");
    adminGetNotificationSegments()
      .then(setSegments)
      .catch(() => setSegments([]));
  }, [open, initial, defaults, loadUserOptions]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      loadUserOptions(userSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [open, userSearch, loadUserOptions]);

  const set = <K extends keyof NotificationForm>(key: K, value: NotificationForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectUser = (user: NotificationSearchUser) => {
    setSelectedUser(user);
    set("user_id", user.user_id);
    setUserSearch("");
  };

  const clearSelectedUser = () => {
    setSelectedUser(null);
    set("user_id", "");
    setUserSearch("");
  };

  const audienceOptions: AudienceOption[] = useMemo(() => {
    const base: AudienceOption[] = [
      { key: "all", label: t("adminNotifications.audience.all") },
      { key: "single", label: t("adminNotifications.audience.single") },
      { key: "list", label: t("adminNotifications.audience.list") },
      { key: "active_license", label: t("adminNotifications.audience.activeLicense") },
      { key: "trial", label: t("adminNotifications.audience.trial") },
      { key: "expired", label: t("adminNotifications.audience.expired") },
      { key: "no_license", label: t("adminNotifications.audience.noLicense") },
      { key: "role", label: t("adminNotifications.audience.role") },
    ];
    return base;
  }, [t]);

  const save = async () => {
    if (!initial && form.audience === "single" && !selectedUser) {
      toast.error(t("adminUsers.emailNotFound"));
      return;
    }
    setSaving(true);
    const scheduled_at = fromLocalDateTimeInput(form.scheduled_at);
    const base = {
      title_ar: form.title_ar,
      title_en: form.title_en,
      body_ar: form.body_ar,
      body_en: form.body_en,
      type: form.type,
      priority: form.priority,
      action_type: form.action_type,
      action_target: form.action_target || null,
      expires_at: fromLocalDateTimeInput(form.expires_at),
      is_pinned: form.is_pinned,
      is_announcement: form.is_announcement,
      image_url: form.image_url || null,
    };
    try {
      if (initial) {
        await adminUpdateNotification({ id: initial.id, ...base });
        toast.success(t("adminNotifications.updated"));
      } else {
        const created = await adminCreateNotification({
          ...base,
          scheduled_at,
          send_config: buildSendConfig(form),
          requires_acknowledgement: form.requires_acknowledgement,
        });
        toast.success(created.status === "draft" ? t("adminNotifications.createdDraft") : t("adminNotifications.created"));
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminNotifications.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? t("adminNotifications.edit") : t("adminNotifications.create")}</DialogTitle>
          <DialogDescription>{t("adminNotifications.formDesc")}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="content" className="mt-2">
          <TabsList>
            <TabsTrigger value="content">{t("adminNotifications.tabContent")}</TabsTrigger>
            <TabsTrigger value="audience">{t("adminNotifications.tabAudience")}</TabsTrigger>
            <TabsTrigger value="options">{t("adminNotifications.tabOptions")}</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t("adminNotifications.titleAr")}</label>
                <Input value={form.title_ar} onChange={(e) => set("title_ar", e.target.value)} dir="rtl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t("adminNotifications.titleEn")}</label>
                <Input value={form.title_en} onChange={(e) => set("title_en", e.target.value)} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">{t("adminNotifications.bodyAr")}</label>
              <Textarea value={form.body_ar} onChange={(e) => set("body_ar", e.target.value)} rows={3} dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">{t("adminNotifications.bodyEn")}</label>
              <Textarea value={form.body_en} onChange={(e) => set("body_en", e.target.value)} rows={3} dir="ltr" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t("adminNotifications.type")}</label>
                <Select value={form.type} onValueChange={(v) => set("type", v as NotificationType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{t(`notifications.type.${type}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t("adminNotifications.priority")}</label>
                <Select value={form.priority} onValueChange={(v) => set("priority", v as NotificationPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>{t(`notifications.priority.${priority}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t("adminNotifications.actionType")}</label>
                <Select value={form.action_type} onValueChange={(v) => set("action_type", v as NotificationActionType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_ACTION_TYPES.map((action) => (
                      <SelectItem key={action} value={action}>{t(`adminNotifications.action.${action}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t("adminNotifications.actionTarget")}</label>
                <Input value={form.action_target} onChange={(e) => set("action_target", e.target.value)} dir="ltr" placeholder={form.action_type === "url" ? "https://" : "/profile"} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">{t("adminNotifications.imageUrl")}</label>
              <Input value={form.image_url} onChange={(e) => set("image_url", e.target.value)} dir="ltr" placeholder="https://..." />
            </div>
          </TabsContent>

          <TabsContent value="audience" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">{t("adminNotifications.audienceLabel")}</label>
              <Select value={form.audience} onValueChange={(v) => set("audience", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {audienceOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label} {segments.find((s) => s.key === option.key)?.count !== undefined ? `(${segments.find((s) => s.key === option.key)?.count})` : ""}
                    </SelectItem>
                  ))}
                  {segments.filter((s) => s.key.startsWith("role:")).map((s) => (
                    <SelectItem key={s.key} value={s.key}>{t("adminNotifications.audience.role")} ({s.label.split(":")[1]})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.audience === "single" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold">{t("adminNotifications.recipientLabel")}</label>
                {selectedUser ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {selectedUser.display_name || selectedUser.shop_name || selectedUser.email || selectedUser.phone}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate" dir="ltr">
                        {[selectedUser.email, selectedUser.phone].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={clearSelectedUser} aria-label={t("adminNotifications.clearUser")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal" dir="ltr">
                        <span className="truncate text-muted-foreground">{t("adminNotifications.selectUserPlaceholder")}</span>
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder={t("adminNotifications.searchUsersPlaceholder")}
                          value={userSearch}
                          onValueChange={setUserSearch}
                        />
                        <CommandList>
                          {userOptionsLoading && userOptions.length === 0 ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : userOptions.length === 0 ? (
                            <CommandEmpty>{t("adminNotifications.noUsersFound")}</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {userOptions.map((user) => (
                                <CommandItem
                                  key={user.user_id}
                                  value={`${user.display_name || ""} ${user.email || ""} ${user.phone || ""} ${user.shop_name || ""}`}
                                  onSelect={() => selectUser(user)}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm">
                                      {user.display_name || user.shop_name || user.email || user.phone || user.user_id}
                                    </p>
                                    <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
                                      {[user.email, user.phone].filter(Boolean).join(" • ")}
                                    </p>
                                  </div>
                                  {selectedUser?.user_id === user.user_id && (
                                    <Check className="ml-2 h-4 w-4 shrink-0" />
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
                <p className="text-[10px] text-muted-foreground">{t("adminNotifications.singleUserNote")}</p>
              </div>
            )}
            {form.audience === "list" && (
              <p className="text-xs text-muted-foreground border border-dashed rounded-xl p-3">{t("adminNotifications.listNote")}</p>
            )}
            {form.audience === "role" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t("adminNotifications.role")}</label>
                <Select value={form.role} onValueChange={(v) => set("role", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("adminNotifications.roleAdmin")}</SelectItem>
                    <SelectItem value="user">{t("adminNotifications.roleUser")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </TabsContent>

          <TabsContent value="options" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t("adminNotifications.scheduledAt")}</label>
                <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => set("scheduled_at", e.target.value)} />
                <p className="text-[10px] text-muted-foreground">{t("adminNotifications.scheduleNote")}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t("adminNotifications.expiresAt")}</label>
                <Input type="datetime-local" value={form.expires_at} onChange={(e) => set("expires_at", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2.5 rounded-xl border border-border/60 p-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{t("adminNotifications.isPinned")}</span>
                <Switch checked={form.is_pinned} onCheckedChange={(checked) => set("is_pinned", checked)} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{t("adminNotifications.isAnnouncement")}</span>
                <Switch checked={form.is_announcement} onCheckedChange={(checked) => set("is_announcement", checked)} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{t("adminNotifications.requiresAck")}</span>
                <Switch checked={form.requires_acknowledgement} onCheckedChange={(checked) => set("requires_acknowledgement", checked)} />
              </label>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saving || (!form.title_ar && !form.title_en) || (form.audience === "single" && !initial && !selectedUser)}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {initial ? t("common.save") : t("adminNotifications.createAndSend")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function DetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AdminNotificationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGetNotificationDetail(id)
      .then(setDetail)
      .catch(() => toast.error(t("adminNotifications.loadFailed")))
      .finally(() => setLoading(false));
  }, [id, t]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("adminNotifications.detail")}</DialogTitle>
        </DialogHeader>
        {loading || !detail ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">{detail.title_ar}</p>
              <p className="text-sm font-semibold text-muted-foreground">{detail.title_en}</p>
              <p className="text-xs text-muted-foreground whitespace-pre-line">{detail.body_ar}</p>
              <p className="text-xs text-muted-foreground whitespace-pre-line">{detail.body_en}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{t(`notifications.type.${detail.notification_type}`)}</Badge>
              <Badge variant="outline">{t(`notifications.priority.${detail.priority}`)}</Badge>
              <Badge className={STATUS_STYLES[detail.status]}>{t(`adminNotifications.status.${detail.status}`)}</Badge>
              <Badge variant="outline">{t("adminNotifications.recipientCount")}: {detail.recipient_count}</Badge>
              <Badge variant="outline">{t("adminNotifications.readCount")}: {detail.read_count}</Badge>
              <Badge variant="outline">{t("adminNotifications.ackCount")}: {detail.ack_count}</Badge>
            </div>
            <div>
              <p className="text-xs font-bold mb-2 text-muted-foreground">{t("adminNotifications.versions")}</p>
              {detail.versions.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("adminNotifications.noVersions")}</p>
              ) : (
                <div className="space-y-2">
                  {detail.versions.map((v) => (
                    <div key={v.version} className="rounded-xl border border-border/60 p-3">
                      <p className="text-xs font-semibold">v{v.version} — {v.title_ar}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{v.title_en}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function NotificationManagement() {
  const { t } = useTranslation();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyDetail, setBusyDetail] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminNotificationDetail | null>(null);
  const [formDefaults, setFormDefaults] = useState<Partial<NotificationForm> | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("list");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, statsResult] = await Promise.all([
        adminGetNotifications({
          page,
          pageSize: 20,
          status: statusFilter === "all" ? null : statusFilter,
          search: search || null,
        }),
        adminGetNotificationStats(),
      ]);
      setItems(list.items);
      setTotal(list.total);
      setHasMore(list.hasMore);
      setStats(statsResult);
    } catch {
      toast.error(t("adminNotifications.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const delay = window.setTimeout(() => {
      if (page !== 1) setPage(1);
      else load();
    }, 400);
    return () => window.clearTimeout(delay);
  }, [search, statusFilter, page, load]);

  const runAction = async (action: Promise<unknown>, successKey: string) => {
    try {
      await action;
      toast.success(t(successKey));
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adminNotifications.actionFailed"));
    }
  };

  const duplicate = async (item: AdminNotification) => {
    setBusyDetail(item.id);
    try {
      const detail = await adminGetNotificationDetail(item.id);
      const sendConfig = (detail.send_config || {}) as Record<string, unknown>;
      setFormDefaults({
        title_ar: detail.title_ar,
        title_en: detail.title_en,
        body_ar: detail.body_ar,
        body_en: detail.body_en,
        type: detail.notification_type,
        priority: detail.priority,
        action_type: detail.action_type,
        action_target: detail.action_target ?? "",
        audience: String(sendConfig.audience ?? "all"),
        role: String(sendConfig.role ?? "user"),
        user_id: sendConfig.user_id ? String(sendConfig.user_id) : "",
        is_pinned: detail.is_pinned,
        is_announcement: detail.is_announcement,
        requires_acknowledgement: detail.requires_acknowledgement,
        image_url: detail.image_url ?? "",
      });
      setEditing(null);
      setFormOpen(true);
    } catch {
      toast.error(t("adminNotifications.loadFailed"));
    } finally {
      setBusyDetail(null);
    }
  };

  const openEdit = async (item: AdminNotification) => {
    setBusyDetail(item.id);
    try {
      const detail = await adminGetNotificationDetail(item.id);
      setFormDefaults(null);
      setEditing(detail);
      setFormOpen(true);
    } catch {
      toast.error(t("adminNotifications.loadFailed"));
    } finally {
      setBusyDetail(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormDefaults(null);
    setFormOpen(true);
  };

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="list">{t("adminNotifications.tabList")}</TabsTrigger>
          <TabsTrigger value="stats">{t("adminNotifications.tabStats")}</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {["all", ...NOTIFICATION_STATUSES].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold border transition-colors",
                    statusFilter === status
                      ? "bg-primary text-white border-primary"
                      : "bg-white border-border/60 text-muted-foreground hover:bg-muted",
                  )}
                >
                  {status === "all" ? t("common.all") : t(`adminNotifications.status.${status}`)}
                </button>
              ))}
            </div>
            <div className="ms-auto flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.search")}
                className="h-9 w-44 rounded-xl"
              />
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 rounded-xl"
                onClick={load}
                disabled={loading}
                aria-label={t("common.refresh")}
              >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </Button>
              <Button className="h-9 rounded-xl" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1.5" />
                {t("adminNotifications.create")}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
              {t("notifications.emptyTitle")}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/60 bg-white p-3.5 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={STATUS_STYLES[item.status]}>{t(`adminNotifications.status.${item.status}`)}</Badge>
                      <Badge variant="outline">{t(`notifications.type.${item.notification_type}`)}</Badge>
                      {item.is_pinned && <Badge variant="secondary">📌</Badge>}
                    </div>
                    <p className="text-sm font-semibold mt-1.5 line-clamp-1">{item.title_ar}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.title_en}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{item.recipient_count}</span>
                    <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{item.read_count}</span>
                    {item.ack_count > 0 && <span>✓{item.ack_count}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDetailId(item.id)} aria-label={t("adminNotifications.view")}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busyDetail === item.id} onClick={() => duplicate(item)} aria-label={t("adminNotifications.duplicate")}>
                      {busyDetail === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    {item.status !== "archived" && item.status !== "cancelled" && (
                      <Button
                        size="sm" variant="ghost" className="h-8 w-8 p-0"
                        disabled={busyDetail === item.id}
                        onClick={() => openEdit(item)}
                        aria-label={t("adminNotifications.edit")}
                      >
                        {busyDetail === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                      </Button>
                    )}
                    {item.status === "scheduled" && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" disabled={busy === item.id} onClick={() => { setBusy(item.id); runAction(adminCancelNotification(item.id), "adminNotifications.cancelled").finally(() => setBusy(null)); }} aria-label={t("adminNotifications.cancel")}>
                        {busy === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      </Button>
                    )}
                    {item.status === "sent" && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busy === item.id} onClick={() => { setBusy(item.id); runAction(adminResendNotification(item.id), "adminNotifications.resent").finally(() => setBusy(null)); }} aria-label={t("adminNotifications.resend")}>
                        {busy === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </Button>
                    )}
                    {item.status === "sent" && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busy === item.id} onClick={() => { setBusy(item.id); runAction(adminArchiveNotification(item.id), "adminNotifications.archived").finally(() => setBusy(null)); }} aria-label={t("adminNotifications.archive")}>
                        <Archive className="w-4 h-4" />
                      </Button>
                    )}
                    {!item.is_deleted ? (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" disabled={busy === item.id} onClick={() => { setBusy(item.id); runAction(adminDeleteNotification(item.id), "adminNotifications.deleted").finally(() => setBusy(null)); }} aria-label={t("adminNotifications.delete")}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-success" disabled={busy === item.id} onClick={() => { setBusy(item.id); runAction(adminRestoreNotification(item.id), "adminNotifications.restored").finally(() => setBusy(null)); }} aria-label={t("adminNotifications.restore")}>
                        <Undo2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" className="h-8 rounded-lg" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t("common.previous")}
                </Button>
                <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-8 rounded-lg" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
                  {t("common.next")}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="stats" className="space-y-4 pt-4">
          <StatsCards stats={stats} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border/60 bg-white p-4">
              <p className="text-sm font-bold mb-3">{t("adminNotifications.stats.byType")}</p>
              {stats && Object.entries(stats.by_type).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(stats.by_type).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t(`notifications.type.${type}`)}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("notifications.emptyTitle")}</p>
              )}
            </div>
            <div className="rounded-2xl border border-border/60 bg-white p-4">
              <p className="text-sm font-bold mb-3">{t("adminNotifications.stats.byPriority")}</p>
              {stats && Object.entries(stats.by_priority).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(stats.by_priority).map(([priority, count]) => (
                    <div key={priority} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t(`notifications.priority.${priority}`)}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("notifications.emptyTitle")}</p>
              )}
            </div>
          </div>
          {stats && (
            <div className="rounded-2xl border border-border/60 bg-white p-4 text-xs text-muted-foreground space-y-1.5">
              <p>{t("adminNotifications.stats.readPct")}: <span className="font-semibold text-foreground">{stats.total_read} / {stats.total_read + stats.total_unread} ({stats.by_type ? "" : ""}{Math.round((stats.total_read / Math.max(1, stats.total_read + stats.total_unread)) * 100)}%)</span></p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NotificationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        defaults={formDefaults}
        onSaved={load}
      />
      {detailId && <DetailDialog id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
