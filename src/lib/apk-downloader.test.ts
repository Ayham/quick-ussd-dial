import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadAndInstallApk, type ProgressCallback } from "./apk-downloader";

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    deleteFile: vi.fn(),
    downloadFile: vi.fn(),
    getUri: vi.fn(),
  },
  Directory: { Cache: "CACHE" },
}));

vi.mock("@capawesome-team/capacitor-file-opener", () => ({
  FileOpener: { openFile: vi.fn() },
}));

vi.mock("./platform", () => ({
  isWebBrowser: vi.fn(),
}));

// Deterministic error messages (key returned as the translation).
vi.mock("@/lib/i18n", () => ({ default: { t: (key: string) => key } }));

import { Filesystem, Directory } from "@capacitor/filesystem";
import { FileOpener } from "@capawesome-team/capacitor-file-opener";
import { isWebBrowser } from "./platform";

const downloadFile = Filesystem.downloadFile as unknown as ReturnType<typeof vi.fn>;
const getUri = Filesystem.getUri as unknown as ReturnType<typeof vi.fn>;
const deleteFile = Filesystem.deleteFile as unknown as ReturnType<typeof vi.fn>;
const openFile = FileOpener.openFile as unknown as ReturnType<typeof vi.fn>;
const isBrowser = isWebBrowser as unknown as ReturnType<typeof vi.fn>;

describe("downloadAndInstallApk (web)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    isBrowser.mockReturnValue(true);
    deleteFile.mockResolvedValue(undefined);
    downloadFile.mockResolvedValue({ path: "app-update.apk" });
    getUri.mockResolvedValue({ uri: "file:///app-update.apk" });
  });

  it("opens the URL in a new tab and never touches native APIs", async () => {
    const url = "https://example.com/app.apk";
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    await downloadAndInstallApk(url);
    expect(openSpy).toHaveBeenCalledWith(url, "_blank");
    expect(downloadFile).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
  });
});

describe("downloadAndInstallApk (native)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    isBrowser.mockReturnValue(false);
    deleteFile.mockResolvedValue(undefined);
    downloadFile.mockResolvedValue({ path: "app-update.apk" });
    getUri.mockResolvedValue({ uri: "file:///app-update.apk" });
  });

  it("downloads, resolves the URI, and opens the APK", async () => {
    const progress: any[] = [];
    openFile.mockResolvedValue(undefined);
    await downloadAndInstallApk("https://example.com/app.apk", (p) => progress.push(p));
    expect(deleteFile).toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/app.apk", directory: Directory.Cache }),
    );
    expect(getUri).toHaveBeenCalled();
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "application/vnd.android.package-archive" }),
    );
    expect(progress[progress.length - 1].status).toBe("done");
  });

  it("reports download-failed when the path is missing", async () => {
    downloadFile.mockResolvedValue({ path: undefined });
    await expect(downloadAndInstallApk("https://example.com/app.apk")).rejects.toThrow();
    expect(openFile).not.toHaveBeenCalled();
  });

  it("throws a friendly error when installation is blocked (falls back then gives up)", async () => {
    openFile.mockRejectedValueOnce(new Error("ActivityNotFoundException"));
    openFile.mockRejectedValueOnce(new Error("ActivityNotFoundException"));
    await expect(downloadAndInstallApk("https://example.com/app.apk")).rejects.toThrow(
      "errors.apkInstallBlocked",
    );
    // First attempt used the APK MIME type, fall-back used none.
    expect(openFile).toHaveBeenCalledTimes(2);
    expect(openFile).toHaveBeenNthCalledWith(1, expect.objectContaining({ mimeType: "application/vnd.android.package-archive" }));
    expect(openFile).toHaveBeenNthCalledWith(2, expect.objectContaining({ path: "file:///app-update.apk" }));
  });
});
