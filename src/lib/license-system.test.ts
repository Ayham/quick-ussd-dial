import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: vi.fn() },
  },
}));

import { adminUpdateLicense } from "./license-system";

describe("admin license RPC routing", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("routes reassignment through the audited transfer RPC", async () => {
    await expect(adminUpdateLicense(
      "license-1",
      { device_id: "target-device" },
      "license_reassigned",
    )).resolves.toEqual({ success: true });

    expect(rpc).toHaveBeenCalledWith("admin_transfer_license", {
      _license_id: "license-1",
      _new_device_id: "target-device",
      _reason: "license_reassigned",
    });
  });

  it("routes suspension through the status RPC", async () => {
    await adminUpdateLicense("license-1", { status: "suspended" }, "license_suspended");
    expect(rpc).toHaveBeenCalledWith("admin_set_license_status", {
      _license_id: "license-1",
      _status: "suspended",
      _reason: "license_suspended",
    });
  });
});
