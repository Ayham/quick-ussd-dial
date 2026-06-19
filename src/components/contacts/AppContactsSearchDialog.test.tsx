import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AppContactsSearchDialog from "./AppContactsSearchDialog";

describe("AppContactsSearchDialog", () => {
  it("filters saved app contacts by name and selects a phone number", async () => {
    localStorage.setItem(
      "named-contacts-v1",
      JSON.stringify([
        { name: "Ahmad Store", phone: "0991234567" },
        { name: "Maya", phone: "0947654321" },
      ]),
    );

    const onSelect = vi.fn();
    render(
      <AppContactsSearchDialog
        open
        onOpenChange={() => {}}
        onSelect={onSelect}
      />,
    );

    fireEvent.change(screen.getByTestId("app-contact-search-input"), {
      target: { value: "Ahmad" },
    });

    expect(await screen.findByText("Ahmad Store")).toBeInTheDocument();
    expect(screen.queryByText("Maya")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Ahmad Store"));
    expect(onSelect).toHaveBeenCalledWith({ name: "Ahmad Store", phone: "0991234567" });
  });

  it("shows an empty state when no saved contacts match", async () => {
    localStorage.setItem("named-contacts-v1", JSON.stringify([{ name: "Maya", phone: "0947654321" }]));

    render(
      <AppContactsSearchDialog
        open
        onOpenChange={() => {}}
        onSelect={() => {}}
      />,
    );

    fireEvent.change(screen.getByTestId("app-contact-search-input"), {
      target: { value: "missing" },
    });

    expect(await screen.findByText("No contacts found")).toBeInTheDocument();
  });
});
