import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_SUGGESTION_SETTINGS,
  getSuggestionSettings,
  saveSuggestionSettings,
} from "./use-transfer-suggestions";

describe("suggestion settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to enabled with the combined source", () => {
    const settings = getSuggestionSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.source).toBe("both");
    expect(settings.maxSuggestions).toBe(5);
  });

  it("persists the source and maximum suggestions", () => {
    saveSuggestionSettings({
      ...DEFAULT_SUGGESTION_SETTINGS,
      source: "contacts",
      maxSuggestions: 10,
    });
    const settings = getSuggestionSettings();
    expect(settings.source).toBe("contacts");
    expect(settings.maxSuggestions).toBe(10);
  });

  it("falls back to the default source for invalid stored source values", () => {
    localStorage.setItem(
      "suggestion-settings",
      JSON.stringify({ ...DEFAULT_SUGGESTION_SETTINGS, source: "bogus" }),
    );
    expect(getSuggestionSettings().source).toBe("both");
  });
});
