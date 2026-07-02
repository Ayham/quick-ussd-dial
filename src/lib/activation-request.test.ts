import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const pushEvent = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

vi.mock("./device-id", () => ({
  getDeviceId: () => "device-offline-1",
}));

vi.mock("./supabase-sync", () => ({
  flush: vi.fn(),
  pushEvent: (...args: unknown[]) => pushEvent(...args),
}));

import { createActivationRequest } from "./activation-request";

describe("offline activation queue", () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    pushEvent.mockReset();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  });

  it("queues one idempotent activation request while offline", async () => {
    const request = await createActivationRequest("Customer", "0991234567");

    expect(invoke).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      deviceId: "device-offline-1",
      contactName: "Customer",
      contactPhone: "0991234567",
      status: "pending",
    });
    expect(pushEvent).toHaveBeenCalledWith("activation_request", expect.objectContaining({
      request_token: request?.requestToken,
      contact_name: "Customer",
      contact_phone: "0991234567",
    }));
  });
});
