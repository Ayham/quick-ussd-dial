import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminRpc } from "@/lib/admin-rpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Shield, ShieldOff, Search } from "lucide-react";

interface Row {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
}

export function UsersRolesManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("user_id, email, display_name").order("created_at", { ascending: false }).limit(500),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const adminSet = new Set((roles ?? []).filter((r: { role: string }) => r.role === "admin").map((r: { user_id: string }) => r.user_id));
    setRows((profiles ?? []).map((p: { user_id: string; email: string | null; display_name: string | null }) => ({
      ...p, is_admin: adminSet.has(p.user_id),
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleAdmin = async (userId: string, grant: boolean) => {
    setBusy(userId);
    const { data, error } = await adminRpc("admin_set_role", {
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
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Users & Roles</h2>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {filtered.map((r) => (
            <div key={r.user_id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.display_name || r.email || r.user_id}</p>
                <p className="text-xs text-muted-foreground truncate">{r.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.is_admin && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                    Admin
                  </span>
                )}
                <Button
                  size="sm"
                  variant={r.is_admin ? "outline" : "default"}
                  disabled={busy === r.user_id}
                  onClick={() => toggleAdmin(r.user_id, !r.is_admin)}
                >
                  {r.is_admin ? (<><ShieldOff className="w-3.5 h-3.5 mr-1" />Revoke</>) : (<><Shield className="w-3.5 h-3.5 mr-1" />Make admin</>)}
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">No users found.</p>
          )}
        </div>
      )}
    </div>
  );
}
