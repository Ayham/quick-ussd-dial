import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { adminRpc } from '@/lib/admin-rpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus, Square } from 'lucide-react';

interface Trial {
  id: string;
  device_id: string;
  started_at: string;
  expires_at: string;
  days_total: number;
  status: string;
  extended_by_admin: boolean;
}

export function TrialsManager() {
  const [rows, setRows] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [extra, setExtra] = useState<Record<string, number>>({});

  async function load() {
    const { data } = await supabase
      .from('trials')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(200);
    setRows((data || []) as Trial[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function extend(id: string, deviceId: string) {
    const days = extra[id] || 7;
    const { data, error } = await adminRpc('admin_extend_trial', {
      _device_id: deviceId,
      _days: days,
    });
    const result = data as { ok?: boolean; reason?: string } | null;
    if (error || !result?.ok) toast.error(error?.message || result?.reason || 'Trial update failed');
    else { toast.success(`Extended by ${days} days`); load(); }
  }

  async function endTrial(deviceId: string) {
    if (!confirm('End this trial now?')) return;
    const { data, error } = await supabase.rpc('admin_end_trial', { _device_id: deviceId });
    const result = data as { ok?: boolean; reason?: string } | null;
    if (error || !result?.ok) toast.error(error?.message || result?.reason || 'Trial update failed');
    else { toast.success('Trial ended'); load(); }
  }

  if (loading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead><tr className="border-b">
          <th className="text-left p-2">Device</th>
          <th className="text-left p-2">Started</th>
          <th className="text-left p-2">Expires</th>
          <th className="text-left p-2">Status</th>
          <th className="text-left p-2">Actions</th>
        </tr></thead>
        <tbody>
          {rows.map(t => {
            const expired = new Date(t.expires_at) < new Date();
            return (
              <tr key={t.id} className="border-b hover:bg-muted/50">
                <td className="p-2 font-mono text-[10px] whitespace-nowrap">{t.device_id}</td>
                <td className="p-2 text-xs">{new Date(t.started_at).toLocaleDateString()}</td>
                <td className="p-2 text-xs">{new Date(t.expires_at).toLocaleDateString()}</td>
                <td className="p-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${expired ? 'bg-red-500/20 text-red-700' : 'bg-green-500/20 text-green-700'}`}>
                    {expired ? 'expired' : t.status}
                  </span>
                </td>
                <td className="p-2 flex gap-1">
                  <Input type="number" placeholder="7"
                    value={extra[t.id] ?? ''}
                    onChange={(e) => setExtra(s => ({ ...s, [t.id]: Number(e.target.value) }))}
                    className="h-7 w-16 text-xs" />
                  <Button size="sm" className="h-7" onClick={() => extend(t.id, t.device_id)} title="Adjust trial days">
                    <Plus className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => endTrial(t.device_id)} title="End trial">
                    <Square className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className="text-center py-8 text-muted-foreground">No trials</div>}
    </div>
  );
}
