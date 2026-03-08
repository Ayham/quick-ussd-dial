import { Download, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpdateInfo } from "@/lib/update-checker";

interface ForceUpdateProps {
  updateInfo: UpdateInfo;
  onRetry: () => void;
  checking: boolean;
}

const ForceUpdate = ({ updateInfo, onRetry, checking }: ForceUpdateProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 safe-area-insets" dir="rtl">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto rounded-[22px] bg-primary/10 flex items-center justify-center">
          <Download className="w-10 h-10 text-primary" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-foreground mb-2">يتوفر تحديث جديد!</h1>
          <p className="text-sm text-muted-foreground">
            يرجى تحديث التطبيق للمتابعة
          </p>
        </div>

        {/* Version info */}
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

        {/* Actions */}
        <div className="space-y-3">
          {updateInfo.downloadUrl ? (
            <Button
              onClick={() => window.open(updateInfo.downloadUrl, "_blank")}
              className="w-full h-12 font-bold rounded-xl text-sm"
              size="lg"
            >
              <Sparkles className="w-5 h-5 ml-2" />
              تحميل التحديث
            </Button>
          ) : (
            <p className="text-xs text-destructive">رابط التحميل غير متوفر — تواصل مع الدعم</p>
          )}

          <Button
            onClick={onRetry}
            variant="ghost"
            className="w-full h-10 text-muted-foreground text-xs"
            disabled={checking}
          >
            <RefreshCw className={`w-4 h-4 ml-1.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'جاري الفحص...' : 'أعد الفحص بعد التحديث'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ForceUpdate;
