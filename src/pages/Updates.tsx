import { useState, useEffect } from "react";
import { Download, RefreshCw, CheckCircle2, ArrowUpCircle, Clock, FileText, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";
import { checkForUpdate, getCurrentVersion, type UpdateInfo } from "@/lib/update-checker";
import { fetchReleasesFromGitHub } from "@/lib/github-releases";
import { downloadAndInstallApk, type DownloadProgress } from "@/lib/apk-downloader";
import { toast } from "@/hooks/use-toast";
import type { AppRelease } from "@/lib/marketing";

const Updates = () => {
  const [checking, setChecking] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [dlProgress, setDlProgress] = useState<DownloadProgress>({ progress: 0, status: 'idle' });
  const currentVersion = getCurrentVersion();

  const isDownloading = dlProgress.status === 'downloading' || dlProgress.status === 'opening';

  const handleDownload = async (url: string) => {
    try {
      await downloadAndInstallApk(url, setDlProgress);
    } catch (e: any) {
      toast({ title: "خطأ في التنزيل", description: e.message, variant: "destructive" });
    }
  };

  const doCheck = async () => {
    setChecking(true);
    try {
      const [info, ghReleases] = await Promise.all([
        checkForUpdate(),
        fetchReleasesFromGitHub(),
      ]);
      setUpdateInfo(info);
      setReleases(ghReleases);
    } catch {}
    setChecking(false);
  };

  useEffect(() => { doCheck(); }, []);

  return (
    <AppLayout title="التحديثات" titleIcon={<div className="w-8 h-8 rounded-lg bg-primary-foreground/15 flex items-center justify-center"><Download className="w-4.5 h-4.5 text-primary-foreground" /></div>}>
      <div className="flex-1 overflow-auto pb-safe" dir="rtl">
        <div className="p-4 space-y-4 max-w-lg mx-auto">

          {/* Current Version Card */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                {updateInfo?.hasUpdate
                  ? <ArrowUpCircle className="w-6 h-6 text-primary" />
                  : <CheckCircle2 className="w-6 h-6 text-primary" />
                }
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">
                  {checking ? "جاري الفحص..." : "حالة التطبيق"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  النسخة الحالية: <span className="font-mono font-bold">{currentVersion}</span>
                </p>
              </div>
            </div>

            {/* Update available */}
            {updateInfo?.hasUpdate && !checking && (
              <div className="space-y-3">
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">النسخة الجديدة</span>
                    <span className="font-mono font-bold text-primary text-sm">{updateInfo.latestVersion}</span>
                  </div>
                  {updateInfo.releaseDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">تاريخ الإصدار</span>
                      <span className="text-xs text-foreground">{updateInfo.releaseDate}</span>
                    </div>
                  )}
                </div>

                {updateInfo.changelog && (
                  <div className="bg-muted rounded-xl p-3">
                    <p className="text-[11px] text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> ما الجديد:
                    </p>
                    <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{updateInfo.changelog}</p>
                  </div>
                )}

                {updateInfo.downloadUrl && (
                  <Button
                    onClick={() => handleDownload(updateInfo.downloadUrl)}
                    className="w-full h-12 font-bold rounded-xl text-sm"
                    size="lg"
                    disabled={isDownloading}
                  >
                    {isDownloading
                      ? <><Loader2 className="w-5 h-5 ml-2 animate-spin" />جاري التنزيل... {dlProgress.progress}%</>
                      : <><Download className="w-5 h-5 ml-2" />تحميل وتثبيت التحديث</>
                    }
                  </Button>
                )}

                {isDownloading && (
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-300"
                      style={{ width: `${dlProgress.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Up to date */}
            {!updateInfo?.hasUpdate && !checking && (
              <p className="text-xs text-muted-foreground">أنت تستخدم أحدث إصدار من التطبيق.</p>
            )}

            {/* Check button */}
            <Button
              onClick={doCheck}
              variant="outline"
              className="w-full h-10 text-xs mt-3 rounded-xl"
              disabled={checking}
            >
              <RefreshCw className={`w-4 h-4 ml-1.5 ${checking ? "animate-spin" : ""}`} />
              {checking ? "جاري الفحص..." : "البحث عن تحديثات"}
            </Button>
          </div>

        </div>
      </div>
    </AppLayout>
  );
};

export default Updates;
