import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

interface ContactRow {
  id: string;
  user_id: string | null;
  device_id: string | null;
  phone: string;
  phone_normalized: string;
  name: string;
  created_at: string;
  updated_at: string;
  profile_email?: string | null;
  profile_name?: string | null;
}

export function ContactsAdminViewer() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("all");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("contacts")
        .select("id,user_id,device_id,phone,phone_normalized,name,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (!active) return;
      if (!error) {
        const userIds = [...new Set((data || []).map((row: ContactRow) => row.user_id).filter(Boolean))] as string[];
        const { data: profiles } = userIds.length
          ? await supabase.from("profiles").select("user_id,email,display_name").in("user_id", userIds)
          : { data: [] };
        const profileMap = Object.fromEntries(((profiles || []) as Array<{ user_id: string; email?: string | null; display_name?: string | null }>).map((profile) => [profile.user_id, profile]));
        setRows(((data || []) as ContactRow[]).map((row) => ({
          ...row,
          profile_email: row.user_id ? profileMap[row.user_id]?.email ?? null : null,
          profile_name: row.user_id ? profileMap[row.user_id]?.display_name ?? null : null,
        })));
      }
      setLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !q || [row.name, row.phone, row.device_id, row.profile_email, row.profile_name].some((value) => (value || "").toLowerCase().includes(q));
      const matchesDevice = deviceFilter === "all" || (row.device_id || "") === deviceFilter;
      return matchesQuery && matchesDevice;
    });
  }, [deviceFilter, rows, search]);

  const devices = useMemo(() => [...new Set(rows.map((row) => row.device_id).filter(Boolean))].sort(), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Contacts</h2>
          <p className="text-sm text-muted-foreground">Per-user contacts mirrored from each device with sync status from the queue.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, device or user" className="pl-9" />
        </div>
        <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="all">All devices</option>
          {devices.map((deviceId) => (
            <option key={deviceId} value={deviceId}>{deviceId}</option>
          ))}
        </select>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Phone</th>
                <th className="p-2 text-left">User</th>
                <th className="p-2 text-left">Device</th>
                <th className="p-2 text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => (
                <tr key={contact.id} className="border-b hover:bg-muted/50">
                  <td className="p-2 font-medium">{contact.name || "—"}</td>
                  <td className="p-2 font-mono text-xs">{contact.phone}</td>
                  <td className="p-2 text-xs">{contact.profile_name || contact.profile_email || contact.user_id || "—"}</td>
                  <td className="p-2 font-mono text-[11px]">{contact.device_id || "—"}</td>
                  <td className="p-2 text-xs">{new Date(contact.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
