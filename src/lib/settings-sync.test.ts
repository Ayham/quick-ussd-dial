import { describe, expect, it, vi } from "vitest";
import { trackProfileUpdate, trackUssdCredentials } from "./settings-sync";

const pushEventMock = vi.fn();
vi.mock("@/lib/supabase-sync", () => ({
  pushEvent: (...args: unknown[]) => pushEventMock(...args),
}));

describe("settings-sync", () => {
  it("trackProfileUpdate pushes profile_update event with provided fields", () => {
    trackProfileUpdate({ phone: "+963912345678", shop_name: "My Shop" });
    expect(pushEventMock).toHaveBeenCalledTimes(1);
    expect(pushEventMock).toHaveBeenCalledWith("profile_update", { phone: "+963912345678", shop_name: "My Shop" });
  });

  it("trackProfileUpdate pushes event even with partial data", () => {
    pushEventMock.mockClear();
    trackProfileUpdate({ phone: "+963999999999" });
    expect(pushEventMock).toHaveBeenCalledWith("profile_update", { phone: "+963999999999" });
  });

  it("trackUssdCredentials pushes ussd_credentials event", () => {
    pushEventMock.mockClear();
    trackUssdCredentials({ mtnSecret: "mtn-123", syriatelSerial: "syr-456", syriatelDistributor: "dist-789" });
    expect(pushEventMock).toHaveBeenCalledTimes(1);
    expect(pushEventMock).toHaveBeenCalledWith("ussd_credentials", {
      mtnSecret: "mtn-123",
      syriatelSerial: "syr-456",
      syriatelDistributor: "dist-789",
    });
  });

  it("trackUssdCredentials forwards empty strings without throwing", () => {
    pushEventMock.mockClear();
    trackUssdCredentials({ mtnSecret: "", syriatelSerial: "", syriatelDistributor: "" });
    expect(pushEventMock).toHaveBeenCalledTimes(1);
    expect(pushEventMock).toHaveBeenCalledWith("ussd_credentials", {
      mtnSecret: "",
      syriatelSerial: "",
      syriatelDistributor: "",
    });
  });
});
