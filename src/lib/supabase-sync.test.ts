import { beforeEach, describe, expect, it, vi } from "vitest";
import { flush, pushEvent, getQueueSize, getLastSyncTime, isInBackoff } from "./supabase-sync";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const invokeMock = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;
const QUEUE_KEY = "supabase_sync_queue_v1";
const LAST_KEY = "supabase_sync_last_v1";

function makeEvent(overrides: Partial<{ id: string; event: string }> = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    event: overrides.event || "transfer",
    timestamp: "2026-08-09T00:00:00Z",
    data: {},
  };
}

function seedQueue(events: unknown[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(events));
}

function readQueue(): any[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
}

async function resetBackoff() {
  invokeMock.mockReset();
  invokeMock.mockResolvedValueOnce({ data: { ok: true, failed_event_ids: [] }, error: null });
  seedQueue([makeEvent()]);
  await flush();
  invokeMock.mockClear();
  localStorage.clear();
}

describe("supabase sync", () => {
  beforeEach(async () => {
    await resetBackoff();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("flushes a batch with health metadata and pending_count", async () => {
    seedQueue([makeEvent(), makeEvent(), makeEvent()]);
    invokeMock.mockResolvedValueOnce({ data: { ok: true, failed_event_ids: [] }, error: null });

    const res = await flush();

    expect(res.sent).toBe(3);
    expect(res.errors).toBe(0);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [name, opts] = invokeMock.mock.calls[0];
    expect(name).toBe("device-sync");
    expect(opts.body.client_id).toBeTruthy();
    expect(opts.body.app_version).toBe("1.0.0");
    expect(opts.body.events).toHaveLength(3);
    expect(opts.body.pending_count).toBe(0);
    expect(getLastSyncTime()).toBeTruthy();
    expect(readQueue()).toHaveLength(0);
  });

  it("reports the number of remaining events as pending_count", async () => {
    const events = Array.from({ length: 120 }, () => makeEvent());
    seedQueue(events);
    invokeMock.mockResolvedValueOnce({ data: { ok: true, failed_event_ids: [] }, error: null });

    await flush();

    const opts = invokeMock.mock.calls[0][1];
    expect(opts.body.events).toHaveLength(100);
    expect(opts.body.pending_count).toBe(20);
  });

  it("keeps failed events in the queue for retry", async () => {
    const e1 = makeEvent();
    const e2 = makeEvent();
    const e3 = makeEvent();
    seedQueue([e1, e2, e3]);
    invokeMock.mockResolvedValueOnce({ data: { ok: true, failed_event_ids: [e2.id] }, error: null });

    const res = await flush();

    expect(res.sent).toBe(2);
    expect(res.errors).toBe(1);
    expect(readQueue().map((q: any) => q.id)).toEqual([e2.id]);
  });

  it("does not send twice while a flush is in progress unless forced", async () => {
    seedQueue([makeEvent()]);
    let release!: (v: unknown) => void;
    invokeMock.mockImplementationOnce(() => new Promise((res) => { release = res; }));

    const first = flush();
    const second = await flush();

    expect(second.sent).toBe(0);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    invokeMock.mockResolvedValueOnce({ data: { ok: true, failed_event_ids: [] }, error: null });
    const forced = await flush({ force: true });
    expect(forced.sent).toBe(1);
    expect(invokeMock).toHaveBeenCalledTimes(2);

    release({ data: { ok: true, failed_event_ids: [] }, error: null });
    await first;
  });

  it("never drops transfers when the queue exceeds the cap", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    for (let i = 0; i < 520; i++) pushEvent("app_open", { i });
    pushEvent("transfer", { amount: 10 });

    expect(getQueueSize()).toBeLessThanOrEqual(500);
    const transfers = readQueue().filter((e: any) => e.event === "transfer");
    expect(transfers).toHaveLength(1);
    expect(transfers[0].data.amount).toBe(10);
  });

  it("enters backoff after a server error and skips immediate retries", async () => {
    seedQueue([makeEvent()]);
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    const res = await flush();

    expect(res.errors).toBe(1);
    expect(isInBackoff()).toBe(true);

    invokeMock.mockClear();
    pushEvent("transfer", { amount: 5 });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("recovers and clears backoff after a successful flush", async () => {
    seedQueue([makeEvent()]);
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await flush();
    expect(isInBackoff()).toBe(true);

    localStorage.clear();
    seedQueue([makeEvent()]);
    invokeMock.mockResolvedValueOnce({ data: { ok: true, failed_event_ids: [] }, error: null });
    await flush();

    expect(isInBackoff()).toBe(false);
    expect(getLastSyncTime()).toBeTruthy();
    expect(localStorage.getItem(LAST_KEY)).toBeTruthy();
  });
});
