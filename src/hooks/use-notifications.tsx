import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuthSession } from "@/lib/auth-session";
import type { UserNotification } from "@/lib/notifications/types";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  toggleNotificationFavorite,
  dismissNotification as apiDismiss,
  acknowledgeNotification as apiAcknowledge,
} from "@/lib/notifications/service";
import {
  applyCachedState,
  clearCachedNotifications,
  enqueueAcknowledge,
  enqueueDismiss,
  enqueueFavorite,
  enqueueRead,
  enqueueReadAll,
  flushPendingOps,
  getCachedNotifications,
  setCachedNotifications,
} from "@/lib/notifications/offline";

interface NotificationsContextValue {
  notifications: UserNotification[];
  unreadCount: number;
  total: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  toggleFavorite: (notificationId: string, favorite?: boolean) => Promise<void>;
  dismiss: (notificationId: string) => Promise<void>;
  acknowledge: (notificationId: string) => Promise<void>;
  markAllReadLocal: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const PAGE_SIZE = 30;

function computeUnread(items: UserNotification[]): number {
  return items.filter((n) => !n.is_read).length;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthSession();
  const userId = user?.id ?? null;

  const [items, setItems] = useState<UserNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(1);
  const userIdRef = useRef<string | null>(null);

  const hydrateFromCache = useCallback((uid: string) => {
    const cached = applyCachedState(getCachedNotifications(uid));
    setItems(cached);
    setTotal(cached.length);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    setError(null);
    try {
      const result = await getNotifications({ page: 1, pageSize: PAGE_SIZE });
      const merged = applyCachedState(result.notifications);
      setItems(merged);
      setTotal(result.total);
      setHasMore(result.hasMore);
      pageRef.current = 1;
      setCachedNotifications(userId, merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "notifications_error");
      hydrateFromCache(userId);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [userId, hydrateFromCache]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || refreshing) return;
    const nextPage = pageRef.current + 1;
    setRefreshing(true);
    try {
      const result = await getNotifications({ page: nextPage, pageSize: PAGE_SIZE });
      const more = applyCachedState(result.notifications);
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        const merged = [...prev, ...more.filter((n) => !seen.has(n.id))];
        setCachedNotifications(userId, merged);
        return merged;
      });
      setTotal(result.total);
      setHasMore(result.hasMore);
      pageRef.current = nextPage;
    } catch {
      // keep current list; pagination can be retried
    } finally {
      setRefreshing(false);
    }
  }, [userId, hasMore, refreshing]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setTotal(0);
      setHasMore(false);
      setLoading(false);
      return;
    }

    userIdRef.current = userId;
    // Hydrate instantly from the local offline cache. No network on mount.
    hydrateFromCache(userId);
    setLoading(false);

    // Background pending-op flush only — never auto-fetches notifications.
    const onOnline = () => {
      flushPendingOps().catch(() => {});
    };
    window.addEventListener("online", onOnline);
    const intervalId = window.setInterval(() => {
      if (navigator.onLine) {
        flushPendingOps().catch(() => {});
      }
    }, 60 * 1000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(intervalId);
    };
  }, [userId, hydrateFromCache]);

  const markRead = useCallback(
    async (notificationId: string) => {
      const target = items.find((n) => n.id === notificationId);
      if (!target || target.is_read) return;
      enqueueRead(notificationId, target.version);
      setItems((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: true, read_at: n.read_at ?? new Date().toISOString() } : n,
        ),
      );
      if (navigator.onLine) {
        try {
          await markNotificationRead(notificationId, target.version);
        } catch {
          // stays in the pending queue
        }
      }
    },
    [items],
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) =>
      prev.map((n) => (n.is_read ? n : { ...n, is_read: true, read_at: n.read_at ?? new Date().toISOString() })),
    );
    if (!navigator.onLine) {
      enqueueReadAll();
      return;
    }
    try {
      await markAllNotificationsRead();
    } catch {
      enqueueReadAll();
    }
  }, []);

  const markAllReadLocal = useCallback(() => {
    setItems((prev) =>
      prev.map((n) => (n.is_read ? n : { ...n, is_read: true, read_at: n.read_at ?? new Date().toISOString() })),
    );
  }, []);

  const toggleFavorite = useCallback(
    async (notificationId: string, favorite?: boolean) => {
      const target = items.find((n) => n.id === notificationId);
      const next = favorite ?? !(target?.is_favorite ?? false);
      enqueueFavorite(notificationId, next);
      setItems((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_favorite: next } : n)));
      if (navigator.onLine) {
        try {
          await toggleNotificationFavorite(notificationId, next);
        } catch {
          // stays in the pending queue
        }
      }
    },
    [items],
  );

  const dismiss = useCallback(async (notificationId: string) => {
    enqueueDismiss(notificationId);
    setItems((prev) => prev.filter((n) => n.id !== notificationId));
    if (navigator.onLine) {
      try {
        await apiDismiss(notificationId);
      } catch {
        // stays in the pending queue
      }
    }
  }, []);

  const acknowledge = useCallback(async (notificationId: string) => {
    enqueueAcknowledge(notificationId);
    setItems((prev) =>
      prev.map((n) =>
        n.id === notificationId
          ? { ...n, is_read: true, acknowledged_at: new Date().toISOString() }
          : n,
      ),
    );
    if (navigator.onLine) {
      try {
        await apiAcknowledge(notificationId);
      } catch {
        // stays in the pending queue
      }
    }
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications: items,
      unreadCount: computeUnread(items),
      total,
      loading,
      refreshing,
      error,
      hasMore,
      refresh,
      loadMore,
      markRead,
      markAllRead,
      toggleFavorite,
      dismiss,
      acknowledge,
      markAllReadLocal,
    }),
    [items, total, loading, refreshing, error, hasMore, refresh, loadMore, markRead, markAllRead, toggleFavorite, dismiss, acknowledge, markAllReadLocal],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}
