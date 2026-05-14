import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface AppEvent {
  id: string;
  device_id: string;
  user_id: string | null;
  event: string;
  data: any;
  created_at: string;
}

export function EventsViewer() {
  const [rows, setRows] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 100;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('app_events')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      setRows((data || []) as AppEvent[]);
      setLoading(false);
    })();
  }, [page]);

  const filtered = rows.filter(r =>
    !search ||
    r.event.includes(search) ||
    r.device_id.includes(search)
  );

  if (loading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by event/device" className="pl-9 h-9" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b">
            <th className="text-left p-2">Event</th>
            <th className="text-left p-2">Device</th>
            <th className="text-left p-2">Data</th>
            <th className="text-left p-2">Time</th>
          </tr></thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} className="border-b hover:bg-muted/50">
                <td className="p-2 text-xs font-semibold">{e.event}</td>
                <td className="p-2 font-mono text-[10px]">{e.device_id.substring(0, 12)}...</td>
                <td className="p-2 text-[10px] font-mono max-w-xs truncate">{JSON.stringify(e.data)}</td>
                <td className="p-2 text-xs">{new Date(e.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="disabled:opacity-30">← Prev</button>
        <span>Page {page + 1}</span>
        <button disabled={rows.length < PAGE} onClick={() => setPage(p => p + 1)} className="disabled:opacity-30">Next →</button>
      </div>
    </div>
  );
}
