import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface NotificationRealtimeEvent {
  table: "notifications" | "notification_recipients";
  eventType: "INSERT" | "UPDATE" | "DELETE";
  payload: Record<string, unknown>;
}

type ChangeListener = (event: NotificationRealtimeEvent) => void;

interface SubscriptionState {
  userId: string | null;
  channel: RealtimeChannel | null;
  listeners: Set<ChangeListener>;
}

const state: SubscriptionState = {
  userId: null,
  channel: null,
  listeners: new Set(),
};

function notify(listeners: Set<ChangeListener>, event: NotificationRealtimeEvent) {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // listener errors must not break the channel
    }
  });
}

function buildChannel(userId: string): RealtimeChannel {
  const channel = supabase
    .channel(`notification_stream_${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_recipients" },
      (payload) => {
        notify(state.listeners, {
          table: "notification_recipients",
          eventType: payload.eventType,
          payload: (payload.new as Record<string, unknown>) ?? {},
        });
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications" },
      (payload) => {
        notify(state.listeners, {
          table: "notifications",
          eventType: payload.eventType,
          payload: (payload.new as Record<string, unknown>) ?? {},
        });
      },
    )
    .subscribe();

  return channel;
}

/**
 * Subscribe to the current user's notification stream. RLS scopes the rows
 * that reach this client: only recipient rows owned by the user (and the
 * notifications delivered to them) are broadcast.
 *
 * Pass `null` to stop receiving events (e.g. on sign-out).
 */
export function setNotificationStreamUser(userId: string | null): void {
  if (state.userId === userId) return;
  state.userId = userId;

  if (state.channel) {
    supabase.removeChannel(state.channel).catch(() => {});
    state.channel = null;
  }

  if (userId) {
    state.channel = buildChannel(userId);
  }
}

export function onNotificationChange(listener: ChangeListener): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function unsubscribeNotificationStream(): void {
  setNotificationStreamUser(null);
  state.listeners.clear();
}
