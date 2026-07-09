import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

export interface Transfer {
  id: string;
  device_id: string;
  user_id?: string;
  phone: string;
  amount: number;
  operator: string;
  status: string;
  created_at: string;
  synced_at: string;
  package_price?: number | null;
  package_name?: string | null;
  sync_status?: string | null;
  profile_email?: string | null;
  profile_name?: string | null;
}

export function TransfersViewer() {
  const { t } = useTranslation();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [userFilter, setUserFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');

  useEffect(() => {
    loadTransfers();
    const interval = setInterval(loadTransfers, 60000);
    return () => clearInterval(interval);
  }, []);

  async function loadTransfers() {
    try {
      const { data, error } = await supabase
        .from('transfers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const rows = (data || []) as Transfer[];
      const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))] as string[];
      const { data: profiles } = userIds.length
        ? await supabase.from('profiles').select('user_id,email,display_name').in('user_id', userIds)
        : { data: [] };
      const profileMap = Object.fromEntries(((profiles || []) as Array<{ user_id: string; email?: string | null; display_name?: string | null }>).map((profile) => [profile.user_id, profile]));

      setTransfers(rows.map((row) => ({
        ...row,
        profile_email: row.user_id ? profileMap[row.user_id]?.email ?? null : null,
        profile_name: row.user_id ? profileMap[row.user_id]?.display_name ?? null : null,
        sync_status: row.synced_at ? 'synced' : 'pending',
      })));
    } catch (error) {
      console.error('Error loading transfers:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredTransfers = useMemo(() => transfers.filter((t) => {
    const matchesSearch = [t.phone, t.device_id, t.operator, t.profile_email, t.profile_name].some((value) => (value || '').toLowerCase().includes(search.toLowerCase()));
    if (!matchesSearch) return false;

    if (userFilter !== 'all' && t.user_id !== userFilter) return false;
    if (deviceFilter !== 'all' && t.device_id !== deviceFilter) return false;

    if (dateRange.start) {
      const transferDate = new Date(t.created_at).toISOString().split('T')[0];
      if (transferDate < dateRange.start) return false;
    }

    if (dateRange.end) {
      const transferDate = new Date(t.created_at).toISOString().split('T')[0];
      if (transferDate > dateRange.end) return false;
    }

    return true;
  }), [dateRange.end, dateRange.start, deviceFilter, search, transfers, userFilter]);

  const stats = {
    total: transfers.length,
    succeeded: transfers.filter(t => t.status === 'success' || t.status === 'completed').length,
    failed: transfers.filter(t => t.status === 'failed').length,
    pending: transfers.filter(t => t.status === 'pending').length,
    totalAmount: transfers.reduce((sum, t) => sum + (t.amount || 0), 0),
    mtn: transfers.filter(t => (t.operator || '').toLowerCase() === 'mtn').length,
    syriatel: transfers.filter(t => (t.operator || '').toLowerCase() === 'syriatel').length,
  };

  const userOptions = useMemo(() => [...new Set(transfers.map((row) => row.user_id).filter(Boolean))].sort(), [transfers]);
  const deviceOptions = useMemo(() => [...new Set(transfers.map((row) => row.device_id))].sort(), [transfers]);

  if (loading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search by phone, device, user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="h-10"
            placeholder="From date"
          />
          <Input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="h-10"
            placeholder="To date"
          />
        </div>
        <div className="flex gap-2">
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All users</option>
            {userOptions.map((userId) => <option key={userId} value={userId}>{userId}</option>)}
          </select>
          <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All devices</option>
            {deviceOptions.map((deviceId) => <option key={deviceId} value={deviceId}>{deviceId}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <div className="bg-card rounded p-2 text-center">
          <div className="text-sm font-semibold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="bg-green-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-green-600">{stats.succeeded}</div>
          <div className="text-xs text-muted-foreground">Success</div>
        </div>
        <div className="bg-red-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-red-600">{stats.failed}</div>
          <div className="text-xs text-muted-foreground">Failed</div>
        </div>
        <div className="bg-blue-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-blue-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </div>
        <div className="bg-amber-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-amber-600">{stats.mtn}</div>
          <div className="text-xs text-muted-foreground">MTN</div>
        </div>
        <div className="bg-purple-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-purple-600">{stats.totalAmount.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total Amount</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-semibold">User</th>
              <th className="text-left p-3 font-semibold">Device</th>
              <th className="text-left p-3 font-semibold">Phone</th>
              <th className="text-left p-3 font-semibold">Operator</th>
              <th className="text-left p-3 font-semibold">Amount</th>
              <th className="text-left p-3 font-semibold">Package</th>
              <th className="text-left p-3 font-semibold">Sync</th>
              <th className="text-left p-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransfers.map(transfer => (
              <tr key={transfer.id} className="border-b hover:bg-muted/50">
                <td className="p-3 text-xs">{transfer.profile_name || transfer.profile_email || transfer.user_id || '—'}</td>
                <td className="p-3 text-xs font-mono whitespace-nowrap">{transfer.device_id}</td>
                <td className="p-3 font-mono text-xs" dir="ltr">{transfer.phone}</td>
                <td className="p-3 text-xs">{(transfer.operator || 'unknown').toUpperCase()}</td>
                <td className="p-3 font-semibold">{transfer.amount.toLocaleString()}</td>
                <td className="p-3 text-xs">{transfer.package_name ? `${transfer.package_name} / ${transfer.package_price ?? 0}` : '—'}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded ${transfer.sync_status === 'synced' ? 'bg-green-500/20 text-green-700' : 'bg-amber-500/20 text-amber-700'}`}>
                    {transfer.sync_status || 'pending'}
                  </span>
                </td>
                <td className="p-3 text-xs">{new Date(transfer.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredTransfers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No transfers found
        </div>
      )}

      <div className="text-xs text-muted-foreground pt-4">
        Showing {filteredTransfers.length} of {stats.total} transfers
      </div>
    </div>
  );
}
