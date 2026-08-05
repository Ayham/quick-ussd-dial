import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "sonner";

import Index from "./Index";
import { createAndroidContact, getContactByPhone, openAppSettings } from "@/lib/android-contacts";

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
    vi.mocked(getContactByPhone).mockResolvedValue(null);
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

    const contactItem = (await screen.findAllByText("Ahmad Store"))[0];
    expect(contactItem).toBeInTheDocument();

    fireEvent.click(contactItem);

    expect(phoneInput).toHaveValue("0991234567");
    expect((await screen.findAllByText("Ahmad Store")).length).toBeGreaterThan(0);
  });

  it("shows recent phone numbers on focus before typing and fills the input on select", async () => {
    localStorage.setItem("transfer-history", JSON.stringify([
      { phone: "0991111222", amount: "100", price: "120", operator: "syriatel", timestamp: Date.now(), status: "success", transferType: "phone" },
      { phone: "0945555666", amount: "50", price: "60", operator: "mtn", timestamp: Date.now() - 5000, status: "success", transferType: "phone" },
    ]));

    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    const phoneInput = document.querySelector('input[type="tel"]');
    fireEvent.focus(phoneInput!);

    expect(await screen.findByText("0991111222")).toBeInTheDocument();
    fireEvent.click(screen.getByText("0991111222"));

    expect(phoneInput).toHaveValue("0991111222");
  });

  it("auto-fills the customer name from contacts when a full matching number is entered", async () => {
    vi.mocked(getContactByPhone).mockResolvedValue({ contactId: "9", displayName: "Auto Match", phone: "0991234567" });

    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    const phoneInput = document.querySelector('input[type="tel"]');
    fireEvent.change(phoneInput!, { target: { value: "0991234567" } });

    expect(await screen.findByText("Auto Match")).toBeInTheDocument();
  });

  it("shows the contact name on customer suggestions and fills the phone on select", async () => {
    vi.mocked(getContactByPhone).mockResolvedValue({ contactId: "7", displayName: "Ali Shop", phone: "0997654321" });
    localStorage.setItem("transfer-history", JSON.stringify([
      { phone: "0997654321", amount: "100", price: "120", operator: "syriatel", timestamp: Date.now(), status: "success", transferType: "phone" },
    ]));

    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    const phoneInput = document.querySelector('input[type="tel"]');
    fireEvent.change(phoneInput!, { target: { value: "099765" } });

    expect(await screen.findByText("Ali Shop")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ali Shop"));

    expect(phoneInput).toHaveValue("0997654321");
  });

  it("renders the horizontal amount display when configured", async () => {
    localStorage.setItem("amount-display-style", "horizontal");

    const { container } = render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    const phoneInput = document.querySelector('input[type="tel"]');
    fireEvent.change(phoneInput!, { target: { value: "0991234567" } });

    expect(await screen.findByText("2,019")).toBeInTheDocument();
    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
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
