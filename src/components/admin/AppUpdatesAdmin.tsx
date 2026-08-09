import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, CheckCircle2, AlertCircle, Copy, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { APP_VERSION } from "@/config/version";
import { getLatestGitHubRelease } from "@/lib/github-releases";
import { cn } from "@/lib/utils";
import type { UpdatePolicy } from "@/lib/update-checker";

const POLICY_KEY = "app_update_policy";

interface PolicyRow {
  key: string;
  value: Record<string, unknown>;
  description: string | null;
}

function valueToJsonb(value: Record<string, unknown> | null | undefined): unknown {
  return value ?? {};
}

export const AppUpdatesAdmin = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [policy, setPolicy] = useState<PolicyRow | null>(null);
  const [latestGh, setLatestGh] = useState<{ version: string; downloadUrl: string; releaseDate: string } | null>(null);
  const ghLoading = refreshing;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("system_config").select("key,value,description").eq("key", POLICY_KEY).maybeSingle();
      if (error) throw error;
      setPolicy(data as PolicyRow | null);
    } catch (e: any) {
      toast({ title: t("adminUpdates.errorLoadingPolicy"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const refreshGitHub = useCallback(async () => {
    setRefreshing(true);
    try {
      const gh = await getLatestGitHubRelease();
      setLatestGh(gh);
    } catch (e: any) {
      toast({ title: t("adminUpdates.errorFetchingLatest"), description: e.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const ensurePolicy = (): PolicyRow => {
    if (!policy) {
      const row: PolicyRow = {
        key: POLICY_KEY,
        value: { minimum_version: "", latest_version: "", download_url: "", notes: "" },
        description: "Server-controlled app update policy (minimum/latest version, download URL, notes)",
      };
      setPolicy(row);
      return row;
    }
    return policy;
  };

  const updateField = (field: string, value: string) => {
    const row = ensurePolicy();
    const next = {
      ...row,
      value: { ...(row.value as Record<string, unknown>), [field]: value },
    };
    setPolicy(next);
  };

  const setMinimumToCurrent = () => {
    updateField("minimum_version", APP_VERSION);
  };

  const setLatestFromGitHub = () => {
    if (latestGh) {
      updateField("latest_version", latestGh.version);
      updateField("download_url", latestGh.downloadUrl);
    }
  };

  const save = useCallback(async () => {
    const row = ensurePolicy();
    const payload = {
      key: row.key,
      value: valueToJsonb(row.value),
      description: row.description ?? null,
    };
    setSaving(true);
    try {
      const { error } = await supabase.from("system_config").upsert(payload);
      if (error) throw error;
      toast({ title: t("adminUpdates.saved") });
      await load();
    } catch (e: any) {
      toast({ title: t("adminUpdates.saveFailed"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [t, load]);

  const previewPolicy = (): UpdatePolicy => {
    const v = (policy?.value ?? {}) as Record<string, unknown>;
    return {
      minimumVersion: typeof v.minimum_version === "string" ? v.minimum_version : "",
      latestVersion: typeof v.latest_version === "string" ? v.latest_version : "",
      downloadUrl: typeof v.download_url === "string" ? v.download_url : "",
      notes: typeof v.notes === "string" ? v.notes : "",
    };
  };

  const isForced = (p: UpdatePolicy) => p.minimumVersion.length > 0 && APP_VERSION < p.minimumVersion;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          {t("adminUpdates.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("adminUpdates.desc")}</p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>App build version: <span className="font-mono font-bold text-foreground">{APP_VERSION}</span></span>
        <Separator orientation="vertical" className="h-4" />
        <span className={cn("inline-flex items-center gap-1", isForced(previewPolicy()) ? "text-destructive" : "text-success")}>
          <span className={cn("w-2 h-2 rounded-full", isForced(previewPolicy()) ? "bg-destructive" : "bg-success")} />
          {isForced(previewPolicy()) ? t("adminUpdates.statusForced") : t("adminUpdates.statusAdvisory")}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">{t("adminUpdates.policy")}</h3>
          {["minimum_version", "latest_version", "download_url"].map((field) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`field-${field}`} className="text-xs text-muted-foreground">
                {t(`adminUpdates.${field}`)}
              </Label>
              <Input
                id={`field-${field}`}
                value={(policy?.value?.[field] as string) ?? ""}
                onChange={(e) => updateField(field, e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="field-notes" className="text-xs text-muted-foreground">{t("adminUpdates.notes")}</Label>
            <Textarea
              id="field-notes"
              value={(policy?.value?.notes as string) ?? ""}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder={t("adminUpdates.notesPlaceholder")}
              className="text-sm"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={setMinimumToCurrent}>
              {t("adminUpdates.setMinToCurrent")}
            </Button>
            {latestGh && (
              <Button variant="secondary" size="sm" onClick={setLatestFromGitHub}>
                {t("adminUpdates.setLatestFromGitHub", { version: latestGh.version })}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={refreshGitHub} disabled={ghLoading}>
              {ghLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {t("adminUpdates.fetchLatestGitHub")}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">{t("adminUpdates.livePreview")}</h3>
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(previewPolicy(), null, 2)}
          </div>

          {latestGh && (
            <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("adminUpdates.latestOnGitHub")}</span>
                <Badge variant="outline" className="font-mono text-xs">{latestGh.version}</Badge>
              </div>
              <div className="text-xs text-muted-foreground truncate">{latestGh.downloadUrl || t("adminUpdates.noApkAsset")}</div>
              {latestGh.releaseDate && <div className="text-xs text-muted-foreground">{t("adminUpdates.releaseDate", { date: latestGh.releaseDate })}</div>}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button variant="default" size="sm" onClick={save} disabled={saving}>
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {t("adminUpdates.save")}
            </Button>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5" />
              {t("adminUpdates.reload")}
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{t("adminUpdates.note")}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Copy className="w-3.5 h-3.5" />
        <span>{t("adminUpdates.rawKey")}</span>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm grid place-items-center">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
};

export default AppUpdatesAdmin;
