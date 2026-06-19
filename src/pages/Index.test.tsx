import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Index from "./Index";

vi.mock("@/lib/license", () => ({
  getAppStatus: vi.fn(() => Promise.resolve({ status: "licensed" })),
}));

vi.mock("@/lib/cloud-sync", () => ({
  trackTransfer: vi.fn(),
}));

describe("Transfer phone input", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the main field as tel while app contact search uses text input", async () => {
    localStorage.setItem("named-contacts-v1", JSON.stringify([{ name: "Ahmad Store", phone: "0991234567" }]));

    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>,
    );

    const phoneInput = document.querySelector('input[type="tel"]');
    expect(phoneInput).toBeInTheDocument();
    expect(phoneInput).toHaveAttribute("inputmode", "tel");

    fireEvent.click(screen.getByTestId("app-contacts-search-button"));

    const searchInput = await screen.findByTestId("app-contact-search-input");
    expect(searchInput).toHaveAttribute("type", "text");
    expect(searchInput).toHaveAttribute("inputmode", "text");

    fireEvent.change(searchInput, { target: { value: "Ahmad" } });
    fireEvent.click(await screen.findByText("Ahmad Store"));

    expect(phoneInput).toHaveValue("0991234567");
    expect(await screen.findByText("Ahmad Store")).toBeInTheDocument();
  });
});
