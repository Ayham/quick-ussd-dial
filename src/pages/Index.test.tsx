import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "sonner";

import Index from "./Index";
import { createAndroidContact, openAppSettings } from "@/lib/android-contacts";

vi.mock("@/lib/cloud-sync", () => ({
  trackTransfer: vi.fn(),
}));

vi.mock("@/lib/android-contacts", () => ({
  saveContactAfterTransfer: vi.fn().mockResolvedValue(undefined),
  getContactByPhone: vi.fn().mockResolvedValue(null),
  createAndroidContact: vi.fn().mockResolvedValue({ contactId: "1", created: true, updated: false }),
  openAppSettings: vi.fn().mockResolvedValue(undefined),
  pickContactFromDevice: vi.fn().mockResolvedValue(null),
  normalizePhone: vi.fn((p: string) => p.replace(/[^\d+]/g, '')),
  searchContactsSync: vi.fn().mockResolvedValue([
    { contactId: "1", displayName: "Ahmad Store", phones: ["0991234567"] },
  ]),
  ensureContactsPermissions: vi.fn().mockResolvedValue(false),
  getAllAndroidContacts: vi.fn().mockResolvedValue([]),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {},
  },
  WebPlugin: class {},
}));

describe("Transfer phone input", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders a phone input with tel type and searches Android contacts on focus", async () => {
    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    const phoneInput = document.querySelector('input[type="tel"]');
    expect(phoneInput).toBeInTheDocument();
    expect(phoneInput).toHaveAttribute("inputmode", "tel");

    fireEvent.focus(phoneInput!);
    fireEvent.change(phoneInput!, { target: { value: "0991" } });

    const contactItem = await screen.findByText("Ahmad Store");
    expect(contactItem).toBeInTheDocument();

    fireEvent.click(contactItem);

    expect(phoneInput).toHaveValue("0991234567");
    expect(await screen.findByText("Ahmad Store")).toBeInTheDocument();
  });

  it("shows permission guidance and opens app settings when contacts permission is denied", async () => {
    const createMock = vi.mocked(createAndroidContact);
    const openSettingsMock = vi.mocked(openAppSettings);
    createMock.mockRejectedValueOnce(
      Object.assign(new Error("permission denied"), { code: "PERMISSION_DENIED" }),
    );

    render(
      <MemoryRouter>
        <Index />
        <Toaster />
      </MemoryRouter>,
    );

    const phoneInput = document.querySelector('input[type="tel"]');
    fireEvent.change(phoneInput!, { target: { value: "0991234567" } });

    fireEvent.click(await screen.findByText("حفظ الاسم"));

    const nameInput = await screen.findByPlaceholderText("الاسم");
    fireEvent.change(nameInput, { target: { value: "test name" } });

    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    expect(
      await screen.findByText("صلاحية جهات الاتصال مرفوضة. امنح التطبيق الإذن من الإعدادات ثم أعد المحاولة"),
    ).toBeInTheDocument();
    expect(openSettingsMock).toHaveBeenCalled();
  });
});
