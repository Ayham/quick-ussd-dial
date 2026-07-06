import { useState, useEffect } from "react";
import { Download, RefreshCw, Sparkles, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpdateInfo } from "@/lib/update-checker";
import { downloadAndInstallApk, type DownloadProgress } from "@/lib/apk-downloader";
import { toast } from "@/hooks/use-toast";
import { APP_VERSION } from "@/config/version";

interface UpdateBannerProps {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

/** Non-blocking banner shown at top of app */
export const UpdateBanner = ({ updateInfo, onDismiss }: UpdateBannerProps) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!updateInfo.downloadUrl) return;
    setDownloading(true);
    try {
      await downloadAndInstallApk(updateInfo.downloadUrl);
    } catch (e: any) {
      toast({ title: "خطأ في التنزيل", description: e.message, variant: "destructive" });
    }
    setDownloading(false);
  };

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-between gap-2" dir="rtl">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Download className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">
          تحديث جديد متوفر ({updateInfo.latestVersion})
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {updateInfo.downloadUrl && (
          <Button
            size="sm"
            className="h-7 text-[11px] px-3 rounded-lg"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : "تحديث"}
          </Button>
        )}
        <button onClick={onDismiss} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

interface UpdateDialogProps {
  updateInfo: UpdateInfo;
  onRetry: () => void;
  onSkip: () => void;
  checking: boolean;
}

/** Full-screen update prompt (shown periodically) */
export const UpdateDialog = ({ updateInfo, onRetry, onSkip, checking }: UpdateDialogProps) => {
  const [dlProgress, setDlProgress] = useState<DownloadProgress>({ progress: 0, status: 'idle' });

  const handleDownload = async () => {
    if (!updateInfo.downloadUrl) return;
    try {
      await downloadAndInstallApk(updateInfo.downloadUrl, setDlProgress);
    } catch (e: any) {
      toast({ title: "خطأ في التنزيل", description: e.message, variant: "destructive" });
    }
  };

  const isDownloading = dlProgress.status === 'downloading' || dlProgress.status === 'opening';

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="w-20 h-20 mx-auto rounded-[22px] bg-primary/10 flex items-center justify-center">
          {isDownloading
            ? <Loader2 className="w-10 h-10 text-primary animate-spin" />
            : <Download className="w-10 h-10 text-primary" />
          }
        </div>

        <div>
          <h1 className="text-xl font-bold text-foreground mb-2">
            {isDownloading ? "جاري تنزيل التحديث..." : "يتوفر تحديث جديد!"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isDownloading
              ? `${dlProgress.progress}% — يرجى الانتظار`
              : "ننصح بالتحديث للحصول على أحدث الميزات والإصلاحات"
            }
          </p>
        </div>

        {isDownloading && (
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${dlProgress.progress}%` }}
            />
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">النسخة الحالية</span>
            <span className="font-mono font-bold text-muted-foreground">{updateInfo.currentVersion}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">النسخة الجديدة</span>
            <span className="font-mono font-bold text-primary">{updateInfo.latestVersion}</span>
          </div>
          {updateInfo.changelog && (
            <div className="pt-2 border-t border-border">
              <p className="text-[11px] text-muted-foreground mb-1 font-medium">ما الجديد:</p>
              <p className="text-xs text-foreground whitespace-pre-wrap bg-muted rounded-xl p-3 text-right leading-relaxed">
                {updateInfo.changelog}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {updateInfo.downloadUrl && (
            <Button
              onClick={handleDownload}
              className="w-full h-12 font-bold rounded-xl text-sm"
              size="lg"
              disabled={isDownloading}
            >
              {isDownloading
                ? <><Loader2 className="w-5 h-5 ml-2 animate-spin" />جاري التنزيل...</>
                : <><Sparkles className="w-5 h-5 ml-2" />تحميل وتثبيت التحديث</>
              }
            </Button>
          )}
          <Button onClick={onRetry} variant="outline" className="w-full h-10 text-xs" disabled={checking || isDownloading}>
            <RefreshCw className={`w-4 h-4 ml-1.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'جاري الفحص...' : 'أعد الفحص بعد التحديث'}
          </Button>
          <Button onClick={onSkip} variant="ghost" className="w-full h-10 text-muted-foreground text-xs" disabled={isDownloading}>
            لاحقاً — تابع بدون تحديث
          </Button>
        </div>
      </div>
    </div>
  );
};

const REMIND_INTERVAL_MS = 24 * 60 * 60 * 1000; // Remind every 24 hours
const DISMISS_KEY = 'app_update_dismissed_at';

interface ForceUpdateProps {
  minimumVersion?: string;
  latestVersion?: string;
}

/**
 * Blocking update gate shown when the server requires a higher app version.
 */
const ForceUpdate = ({ minimumVersion, latestVersion }: ForceUpdateProps) => {
  return (
    <div className="min-h-dvh bg-background p-6 flex items-center justify-center safe-area-insets">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <RefreshCw className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Update required</h1>
          <p className="text-sm text-muted-foreground">
            Install version {minimumVersion || "required by the administrator"} or newer to continue.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Current version</span>
            <span className="font-medium text-foreground">{APP_VERSION}</span>
          </div>
          {latestVersion ? (
            <div className="mt-2 flex items-center justify-between">
              <span>Required version</span>
              <span className="font-medium text-foreground">{latestVersion}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ForceUpdate;
