import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface Customer {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  language: string;
  created_at: string;
}

export function CustomersManager() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 50;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      setRows(data || []);
      setLoading(false);
    })();
  }, [page]);

  const filtered = rows.filter(r =>
    !search ||
    r.email?.toLowerCase().includes(search.toLowerCase()) ||
    r.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.phone?.includes(search)
  );

  if (loading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email/name/phone" className="pl-9 h-9" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b">
            <th className="text-left p-2">Name</th><th className="text-left p-2">Email</th>
            <th className="text-left p-2">Phone</th><th className="text-left p-2">Lang</th>
            <th className="text-left p-2">Created</th>
          </tr></thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-b hover:bg-muted/50">
                <td className="p-2">{c.display_name || '-'}</td>
                <td className="p-2 text-xs">{c.email || '-'}</td>
                <td className="p-2 font-mono text-xs" dir="ltr">{c.phone || '-'}</td>
                <td className="p-2 text-xs uppercase">{c.language}</td>
                <td className="p-2 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
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
