import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format-date";
import { Input } from "@/components/ui/input";
import { Search, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppEvent {
  id: string;
  device_id: string;
  user_id: string | null;
  event: string;
  data: any;
  created_at: string;
}

export function EventsViewer() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 100;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("app_events")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      setRows((data || []) as AppEvent[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) =>
    !search ||
    r.event.includes(search) ||
    r.device_id.includes(search)
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("adminEvents.searchPlaceholder")} className="pl-9 h-9" />
<Button
	           size="sm"
	           variant="ghost"
	           className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 rounded-lg"
	           onClick={load}
	           title={t("adminEvents.refresh")}
	         >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loadError && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-2xl p-3 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <Button variant="outline" size="sm" onClick={load}>{t("common.retry")}</Button>
        </div>
      )}

      {loading ? <div className="text-center py-8">{t("common.loading")}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b">
<th className="text-left p-2">{t("adminEvents.event")}</th>
	               <th className="text-left p-2">{t("adminEvents.device")}</th>
	               <th className="text-left p-2">{t("adminEvents.data")}</th>
	               <th className="text-left p-2">{t("adminEvents.time")}</th>
            </tr></thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b hover:bg-muted/50">
                  <td className="p-2 text-xs font-semibold">{e.event}</td>
                  <td className="p-2 font-mono text-[10px] whitespace-nowrap">{e.device_id}</td>
                  <td className="p-2 text-[10px] font-mono max-w-xs truncate">{JSON.stringify(e.data)}</td>
                  <td className="p-2 text-xs">{formatDateTime(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between text-xs text-muted-foreground">
<button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="disabled:opacity-30">{t("adminEvents.prev")}</button>
	        <span>{t("adminEvents.page", { page: page + 1 })}</span>
	        <button disabled={rows.length < PAGE} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-30">{t("adminEvents.next")}</button>
      </div>
    </div>
  );
}
