import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTranslation } from "react-i18next";

import i18n, { setLanguage, getLanguage, en, ar } from "@/lib/i18n";

const STORAGE_KEY = "app_lang_v1";

const SAMPLE_KEYS = [
  "balance.title",
  "balance.check",
  "balance.checking",
  "balance.expectedBalance",
  "balance.savedBalance",
  "balance.enterYourBalance",
  "common.save",
  "common.cancel",
  "common.error",
  "common.currencySymbol",
  "index.chooseAmount",
  "index.confirmTransferTitle",
  "index.transferButton",
  "auth.nameRequired",
  "auth.accountCreated",
  "auth.enterEmail",
  "auth.forgotPasswordDesc",
  "settings.lowBalance",
  "settings.saveThresholds",
  "settings.advancedSettings",
  "settings.resetTitle",
  "settings.deleteAllDataTitle",
  "settings.languageChangeNote",
  "settings.backupRestore",
  "settings.restoreConfirmTitle",
  "settings.cleanup",
  "settings.dataManagement",
  "settings.lastOperation",
  "settings.timeSinceMinutes",
  "settings.now",
  "updates.currentVersion",
  "adminEvents.page",
  "adminTransfers.mtn",
  "adminTransfers.synced",
  "adminActivationRequests.daysUnit",
  "forceUpdate.updateAvailable",
  "forceUpdate.checkButton",
  "activation.year1",
  "activation.lifetime",
  "onboarding.welcomeTitle",
  "nav.transfer",
  "profile.language",
  "operator.mtn",
  "operator.syriatel",
];

const INTENTIONALLY_IDENTICAL = new Set(["operator.mtn", "adminTransfers.mtn"]);

function switchTo(lng: "ar" | "en") {
  return new Promise<void>((resolve) => {
    const handler = (l: string) => {
      if (l === lng) {
        i18n.off("languageChanged", handler);
        resolve();
      }
    };
    i18n.on("languageChanged", handler);
    setLanguage(lng);
  });
}

function Probe() {
  const { t } = useTranslation();
  return (
    <div>
      <p data-testid="title">{t("balance.title")}</p>
      <p data-testid="save">{t("common.save")}</p>
      <p data-testid="thresholds">{t("settings.saveThresholds")}</p>
      <p data-testid="currency">{t("common.currencySymbol")}</p>
    </div>
  );
}

describe("i18n language switching", () => {
  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.removeAttribute("dir");
    document.documentElement.removeAttribute("lang");
    await switchTo("ar");
  });

  it("defaults to Arabic and sets rtl/ar document attributes", () => {
    expect(getLanguage()).toBe("ar");
    expect(i18n.language).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });

  it("switches to English with ltr/en attributes and persists the choice", async () => {
    await switchTo("en");
    expect(getLanguage()).toBe("en");
    expect(i18n.language).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("en");
  });

  it("switches back to Arabic with rtl/ar attributes", async () => {
    await switchTo("en");
    await switchTo("ar");
    expect(i18n.language).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("ar");
  });

  it("re-renders translated UI when the language changes", async () => {
    render(<Probe />);
    expect(screen.getByTestId("title").textContent).toBe("الرصيد");
    expect(screen.getByTestId("save").textContent).toBe("حفظ");
    expect(screen.getByTestId("thresholds").textContent).not.toBe("settings.saveThresholds");

    await act(async () => { await switchTo("en"); });
    expect(screen.getByTestId("title").textContent).toBe("Balance");
    expect(screen.getByTestId("save").textContent).toBe("Save");
    expect(screen.getByTestId("currency").textContent).toBe("SYP");

    await act(async () => { await switchTo("ar"); });
    expect(screen.getByTestId("title").textContent).toBe("الرصيد");
  });

  it("resolves every sampled key in both languages without leaking raw keys", async () => {
    const values: Record<string, Record<string, string>> = { ar: {}, en: {} };
    for (const lang of ["ar", "en"] as const) {
      await switchTo(lang);
      for (const key of SAMPLE_KEYS) {
        const value = i18n.t(key);
        expect(typeof value).toBe("string");
        expect(value.trim().length).toBeGreaterThan(0);
        expect(value).not.toBe(key);
        values[lang][key] = value;
      }
    }
    for (const key of SAMPLE_KEYS) {
      if (INTENTIONALLY_IDENTICAL.has(key)) continue;
      expect(values.ar[key]).not.toBe(values.en[key]);
    }
  });
});

function collectLeaves(obj: unknown, prefix = "", out: Set<string> = new Set()): Set<string> {
  if (obj === null || typeof obj !== "object") {
    out.add(prefix);
    return out;
  }
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      collectLeaves(value, path, out);
    } else {
      out.add(path);
    }
  }
  return out;
}

describe("i18n ar/en key parity", () => {
  it("has identical leaf-key sets in both locales (no missing or orphaned keys)", () => {
    const strip = (keys: Set<string>) => new Set([...keys].map((k) => k.replace(/^translation\./, "")));
    const arKeys = strip(collectLeaves(ar));
    const enKeys = strip(collectLeaves(en));
    const missingInEn = [...arKeys].filter((k) => !enKeys.has(k)).sort();
    const missingInAr = [...enKeys].filter((k) => !arKeys.has(k)).sort();
    expect(missingInEn, `keys present in ar but missing in en: ${missingInEn.join(", ")}`).toEqual([]);
    expect(missingInAr, `keys present in en but missing in ar: ${missingInAr.join(", ")}`).toEqual([]);
  });
});
