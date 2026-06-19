import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Activation from "./Activation";

const createActivationRequest = vi.fn();
const getLocalActivationRequest = vi.fn();
const checkActivationStatus = vi.fn();
const getAppStatus = vi.fn();
const navigate = vi.fn();
const toastSuccess = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

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
    getAppStatus: (...args: unknown[]) => getAppStatus(...args),
    saveLicense: vi.fn(),
  };
});

vi.mock("@/lib/supabase-sync", () => ({
  flush: vi.fn(() => Promise.resolve({ sent: 0, errors: 0 })),
}));

describe("Activation expired request flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getLocalActivationRequest.mockReturnValue(null);
    checkActivationStatus.mockResolvedValue("pending");
    getAppStatus.mockResolvedValue({ status: "trial_expired" });
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

  it("approved activation triggers one success toast and redirects home for an expiring license", async () => {
    getLocalActivationRequest.mockReturnValue({
      requestToken: "REQ123",
      deviceId: "device-1",
      createdAt: new Date().toISOString(),
      status: "pending",
      ussdNumbers: [],
    });
    checkActivationStatus.mockResolvedValue("approved");
    getAppStatus.mockResolvedValue({ status: "licensed", expiryDate: "2026-12-31", daysLeft: 195 });
    const onActivated = vi.fn();

    render(
      <MemoryRouter>
        <Activation status={{ status: "trial_expired" }} onActivated={onActivated} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(onActivated).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
    expect(localStorage.getItem("handled_activation_request_id")).toBe("REQ123");
  });

  it("approved activation redirects for a permanent license", async () => {
    getLocalActivationRequest.mockReturnValue({
      requestToken: "REQPERM",
      deviceId: "device-1",
      createdAt: new Date().toISOString(),
      status: "pending",
      ussdNumbers: [],
    });
    checkActivationStatus.mockResolvedValue("approved");
    getAppStatus.mockResolvedValue({ status: "licensed", expiryDate: "permanent", daysLeft: Infinity, permanent: true });
    const onActivated = vi.fn();

    render(
      <MemoryRouter>
        <Activation status={{ status: "trial_expired" }} onActivated={onActivated} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(onActivated).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("repeated approved sync responses do not repeat success handling", async () => {
    localStorage.setItem("handled_activation_request_id", "REQ123");
    getLocalActivationRequest.mockReturnValue({
      requestToken: "REQ123",
      deviceId: "device-1",
      createdAt: new Date().toISOString(),
      status: "pending",
      ussdNumbers: [],
    });
    checkActivationStatus.mockResolvedValue("approved");
    getAppStatus.mockResolvedValue({ status: "licensed", expiryDate: "2026-12-31", daysLeft: 195 });
    const onActivated = vi.fn();

    render(
      <MemoryRouter>
        <Activation status={{ status: "trial_expired" }} onActivated={onActivated} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(onActivated).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
