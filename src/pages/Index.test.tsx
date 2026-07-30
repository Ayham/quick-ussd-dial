import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Index from "./Index";

vi.mock("@/lib/cloud-sync", () => ({
  trackTransfer: vi.fn(),
}));

vi.mock("@/lib/android-contacts", () => ({
  saveContactAfterTransfer: vi.fn(),
  getContactByPhone: vi.fn(),
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
});
