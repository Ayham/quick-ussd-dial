import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Activation from "./Activation";

const createActivationRequest = vi.fn();
const getLocalActivationRequest = vi.fn();
const checkActivationStatus = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({ id: "user-1" })),
  getProfile: vi.fn(() => Promise.resolve({
    display_name: "Customer",
    phone: "0991234567",
    email: "customer@example.com",
  })),
}));

vi.mock("@/lib/device-id", () => ({
  getDeviceId: vi.fn(() => "device-1"),
}));

vi.mock("@/lib/activation-request", () => ({
  createActivationRequest: (...args: unknown[]) => createActivationRequest(...args),
  getLocalActivationRequest: () => getLocalActivationRequest(),
  checkActivationStatus: (...args: unknown[]) => checkActivationStatus(...args),
}));

vi.mock("@/lib/license-key", () => ({
  activateLicenseKey: vi.fn(),
  isShortFormat: vi.fn(() => true),
}));

vi.mock("@/lib/license", async () => {
  const actual = await vi.importActual<typeof import("@/lib/license")>("@/lib/license");
  return {
    ...actual,
    saveLicense: vi.fn(),
  };
});

describe("Activation expired request flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLocalActivationRequest.mockReturnValue(null);
    checkActivationStatus.mockResolvedValue("pending");
  });

  it("sends an activation request without showing manual link sharing", async () => {
    createActivationRequest.mockResolvedValue({
      requestToken: "REQ123",
      deviceId: "device-1",
      createdAt: new Date().toISOString(),
      status: "pending",
      ussdNumbers: [],
    });

    render(
      <MemoryRouter>
        <Activation status={{ status: "trial_expired" }} onActivated={() => {}} />
      </MemoryRouter>,
    );

    await screen.findByDisplayValue("Customer");
    fireEvent.click(screen.getByRole("button", { name: "Request Activation" }));

    expect(await screen.findByText("Activation request sent")).toBeInTheDocument();
    expect(screen.getByText("The app will activate automatically after admin approval.")).toBeInTheDocument();
    expect(screen.queryByText("Activation Link")).not.toBeInTheDocument();
    expect(screen.queryByText("Copy Link")).not.toBeInTheDocument();
    expect(screen.queryByText("activation.enterKey")).not.toBeInTheDocument();

    expect(createActivationRequest).toHaveBeenCalledWith("Customer", "0991234567");
  });

  it("shows rejected status for rejected local requests", async () => {
    getLocalActivationRequest.mockReturnValue({
      requestToken: "REQ123",
      deviceId: "device-1",
      createdAt: new Date().toISOString(),
      status: "rejected",
      ussdNumbers: [],
    });
    checkActivationStatus.mockResolvedValue("rejected");

    render(
      <MemoryRouter>
        <Activation status={{ status: "trial_expired" }} onActivated={() => {}} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Activation request rejected")).toBeInTheDocument();
  });

  it("refreshes the app when approval is detected", async () => {
    getLocalActivationRequest.mockReturnValue({
      requestToken: "REQ123",
      deviceId: "device-1",
      createdAt: new Date().toISOString(),
      status: "pending",
      ussdNumbers: [],
    });
    checkActivationStatus.mockResolvedValue("approved");
    const onActivated = vi.fn();

    render(
      <MemoryRouter>
        <Activation status={{ status: "trial_expired" }} onActivated={onActivated} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(onActivated).toHaveBeenCalled());
  });
});
