import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Palette, RotateCcw, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAccentTheme } from "@/components/theme/ThemeProvider";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_ID,
  getAccentPreset,
  getAccentSwatchColor,
  type AccentColorId,
} from "@/lib/accent-theme";

interface AccentColorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccentColorDialog({ open, onOpenChange }: AccentColorDialogProps) {
  const { t, i18n } = useTranslation();
  const { accentId, setAccentId, previewAccentId, cancelPreview, resetAccent } = useAccentTheme();
  const [selected, setSelected] = useState<AccentColorId>(accentId);

  useEffect(() => {
    if (open) setSelected(accentId);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenChange = (next: boolean) => {
    if (!next) cancelPreview();
    onOpenChange(next);
  };

  const handleSelect = (id: AccentColorId) => {
    setSelected(id);
    previewAccentId(id);
  };

  const handleApply = () => {
    setAccentId(selected);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleReset = () => {
    setSelected(DEFAULT_ACCENT_ID);
    resetAccent();
  };

  const selectedPreset = getAccentPreset(selected);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        dir={i18n.dir()}
        className="max-w-sm rounded-2xl gap-5 p-5 max-h-[90dvh] overflow-y-auto scrollbar-thin"
      >
        <DialogHeader className="text-start">
          <DialogTitle className="text-lg flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Palette className="w-4.5 h-4.5" />
            </span>
            {t("settings.colorPicker.title")}
          </DialogTitle>
          <DialogDescription>{t("settings.colorPicker.subtitle")}</DialogDescription>
        </DialogHeader>

        {/* Live preview */}
        <div className="rounded-2xl border border-border/60 overflow-hidden shadow-sm">
          <div className="header-gradient px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </span>
              <div>
                <p className="text-white text-sm font-bold leading-tight">{t("appName")}</p>
                <p className="text-white/70 text-[10px] leading-tight">{t("settings.colorPicker.previewLabel")}</p>
              </div>
            </div>
            <span
              className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            >
              {t("common.ok")}
            </span>
          </div>
          <div className="p-3.5 space-y-2.5 bg-background">
            <div className="flex items-center gap-2">
              <Button size="sm" className="flex-1 h-9 rounded-xl text-xs font-bold">
                {t("settings.colorPicker.apply")}
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-9 rounded-xl text-xs">
                {t("common.cancel")}
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2">
              <span className="text-[11px] font-medium text-muted-foreground">{t("settings.applicationColor")}</span>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: getAccentSwatchColor(selectedPreset) }} />
                {t(selectedPreset.nameKey)}
              </span>
            </div>
          </div>
        </div>

        {/* Preset swatches */}
        <div>
          <p className="text-xs font-bold text-foreground mb-2.5">{t("settings.colorPicker.presetColors")}</p>
          <div className="grid grid-cols-3 gap-2">
            {ACCENT_PRESETS.map((preset) => {
              const isSelected = selected === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelect(preset.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all duration-200 active:scale-95",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/60 bg-background/50 hover:border-primary/40 hover:bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "w-10 h-10 rounded-full transition-transform duration-200",
                      isSelected && "scale-110",
                    )}
                    style={{
                      backgroundColor: getAccentSwatchColor(preset),
                      ...(isSelected
                        ? { boxShadow: "0 0 0 3px hsl(var(--background)), 0 0 0 6px hsl(var(--primary)), 0 4px 12px -4px hsl(var(--primary) / 0.5)" }
                        : {}),
                    }}
                  />
                  <span className="text-[10px] font-semibold text-foreground leading-none">{t(preset.nameKey)}</span>
                  {isSelected && (
                    <span className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs h-10 rounded-xl text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-3.5 h-3.5 me-1" />
            {t("settings.resetToDefault")}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCancel} className="h-10 rounded-xl text-xs">
              {t("common.cancel")}
            </Button>
            <Button type="button" size="sm" onClick={handleApply} className="h-10 rounded-xl text-xs font-bold">
              {t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
