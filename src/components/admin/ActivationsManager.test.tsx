import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivationsManager } from "./ActivationsManager";

const adminApproveActivation = vi.fn();
const adminRejectActivation = vi.fn();

const activation = {
  id: "act-1",
  request_token: "REQ123456789",
  device_id: "device-1",
  user_id: "user-1",
  contact_name: "Customer",
  contact_phone: "0991234567",
  ussd_numbers: [],
  status: "pending",
  license_id: null,
  notes: null,
  created_at: "2026-06-19T00:00:00.000Z",
  processed_at: null,
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/activation-request", () => ({
  adminApproveActivation: (...args: unknown[]) => adminApproveActivation(...args),
  adminRejectActivation: (...args: unknown[]) => adminRejectActivation(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [activation], error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

describe("ActivationsManager approval options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminApproveActivation.mockResolvedValue({ success: true });
    adminRejectActivation.mockResolvedValue({ success: true });
  });

  it("approves with an expiry date when permanent is not selected", async () => {
    render(<ActivationsManager />);

    await screen.findByText("Customer");
    const dateInput = document.querySelector('input[type="date"]');
    if (!dateInput) throw new Error("date input not found");
    fireEvent.change(dateInput, { target: { value: "2026-12-31" } });
    fireEvent.click(screen.getByTitle("Approve"));

    await waitFor(() => expect(adminApproveActivation).toHaveBeenCalledWith(
      "REQ123456789",
      "2026-12-31",
      [],
      false,
    ));
  });

  it("approves as permanent without requiring an expiry date", async () => {
    render(<ActivationsManager />);

    await screen.findByText("Customer");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByTitle("Approve"));

    await waitFor(() => expect(adminApproveActivation).toHaveBeenCalledWith(
      "REQ123456789",
      null,
      [],
      true,
    ));
  });
});
