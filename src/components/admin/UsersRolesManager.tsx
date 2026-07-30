import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Shield, ShieldOff, Search, AlertTriangle } from "lucide-react";

interface Row {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
}

export function UsersRolesManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const results = await Promise.all([
        supabase.from("profiles").select("user_id, email, display_name").order("created_at", { ascending: false }).limit(500),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const profilesResult = results[0];
      const rolesResult = results[1];
      if (profilesResult.error) throw profilesResult.error;
      if (rolesResult.error) throw rolesResult.error;
      const adminSet = new Set((rolesResult.data ?? []).filter((r: { role: string }) => r.role === "admin").map((r: { user_id: string }) => r.user_id));
      setRows((profilesResult.data ?? []).map((p: { user_id: string; email: string | null; display_name: string | null }) => ({
        ...p, is_admin: adminSet.has(p.user_id),
      })));
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err);
      setLoadError(msg);
      toast.error("Failed to load users: " + msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleAdmin = async (userId: string, grant: boolean) => {
    setBusy(userId);
    const { data, error } = await supabase.rpc("admin_set_role", {
      _target_user: userId, _role: "admin", _grant: grant,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const res = data as { ok: boolean; reason?: string } | null;
    if (!res?.ok) {
      toast.error(res?.reason === "last_admin" ? "Cannot remove the last admin" : (res?.reason || "Failed"));
      return;
    }
    toast.success(grant ? "Admin granted" : "Admin revoked");
    load();
  };

  const filtered = rows.filter(r => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (r.email || "").toLowerCase().includes(s) || (r.display_name || "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="border border-destructive/20 bg-destructive/10 rounded-2xl p-3 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}
      <div className="relative">
        <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="ps-9 h-10 rounded-xl" placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : (
        <div className="bg-white border border-border/60 rounded-2xl divide-y divide-border/60 shadow-sm">
          {filtered.map((r) => (
            <div key={r.user_id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {(r.display_name || r.email || "?")[0].toUpperCase()}
                  </div>
                  <p className="text-sm font-medium truncate">{r.display_name || r.email || r.user_id}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{r.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.is_admin && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    Admin
                  </span>
                )}
                <Button
                  size="sm"
                  variant={r.is_admin ? "outline" : "default"}
                  className="rounded-xl h-9 text-xs"
                  disabled={busy === r.user_id}
                  onClick={() => toggleAdmin(r.user_id, !r.is_admin)}
                >
                  {r.is_admin ? (<><ShieldOff className="w-3.5 h-3.5 me-1" />Revoke</>) : (<><Shield className="w-3.5 h-3.5 me-1" />Make admin</>)}
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-8 text-center">No users found.</p>
          )}
        </div>
      )}
    </div>
  );
}
