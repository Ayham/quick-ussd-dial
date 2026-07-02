import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Ban, CheckCircle, Search, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { adminSetDeviceBlocked } from '@/lib/activation-request';

export interface Device {
  id: string;
  device_id: string;
  user_id?: string;
  name?: string;
  model?: string;
  platform?: string;
  app_version?: string;
  device_fingerprint?: string;
  app_instance_id?: string;
  last_seen_at?: string;
  last_sync_at?: string;
  last_activity_at?: string;
  first_seen_at?: string;
  lifecycle_state?: string;
  last_seen: string;
  is_active: boolean;
  is_blocked: boolean;
  notes?: string;
}

interface LicenseSummary {
  id: string;
  device_id: string | null;
  license_key: string;
  status: string;
  level: string | null;
  permanent: boolean | null;
  expiry_date: string | null;
  activated_at: string | null;
}

interface TrialSummary {
  device_id: string;
  status: string;
  started_at: string;
  expires_at: string;
}

interface UserSummary {
  user_id: string;
  email?: string | null;
  display_name?: string | null;
}

export function DevicesManager() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [licenses, setLicenses] = useState<Record<string, LicenseSummary>>({});
  const [trials, setTrials] = useState<Record<string, TrialSummary>>({});
  const [users, setUsers] = useState<Record<string, UserSummary>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
    const interval = setInterval(loadDevices, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  async function loadDevices() {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .order('last_seen', { ascending: false });

      if (error) throw error;
      const deviceRows = (data || []) as Device[];
      const deviceIds = deviceRows.map(d => d.device_id);
      const userIds = [...new Set(deviceRows.map(d => d.user_id).filter(Boolean))] as string[];

      const [{ data: licenseRows }, { data: trialRows }, { data: profileRows }] = await Promise.all([
        supabase.from('licenses').select('id, device_id, license_key, status, level, permanent, expiry_date, activated_at').in('device_id', deviceIds),
        supabase.from('trials').select('device_id, status, started_at, expires_at').in('device_id', deviceIds),
        userIds.length
          ? supabase.from('profiles').select('user_id, email, display_name').in('user_id', userIds)
          : Promise.resolve({ data: [] }),
      ]);

      const licenseMap: Record<string, LicenseSummary> = {};
      ((licenseRows || []) as LicenseSummary[]).forEach(license => {
        if (!license.device_id) return;
        const current = licenseMap[license.device_id];
        if (!current || String(license.activated_at || '') > String(current.activated_at || '')) {
          licenseMap[license.device_id] = license;
        }
      });

      setDevices(deviceRows);
      setLicenses(licenseMap);
      setTrials(Object.fromEntries(((trialRows || []) as TrialSummary[]).map(trial => [trial.device_id, trial])));
      setUsers(Object.fromEntries(((profileRows || []) as UserSummary[]).map(user => [user.user_id, user])));
    } catch (error) {
      console.error('Error loading devices:', error);
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }

  async function toggleBlock(deviceId: string, currentlyBlocked: boolean) {
    setActionInProgress(deviceId);
    try {
      const result = await adminSetDeviceBlocked(deviceId, !currentlyBlocked);
      if (!result.success) throw new Error(result.error || 'Device update failed');

      setDevices(prev => prev.map(d => 
        d.device_id === deviceId ? { ...d, is_blocked: !currentlyBlocked } : d
      ));

      toast.success(!currentlyBlocked ? 'Device blocked' : 'Device unblocked');
    } catch (error) {
      console.error('Error blocking device:', error);
      toast.error('Failed to update device');
    } finally {
      setActionInProgress(null);
    }
  }

  async function copyDeviceId(deviceId: string) {
    await navigator.clipboard.writeText(deviceId);
    toast.success('Device ID copied');
  }

  const getDeviceStatus = (device: Device) => {
    if (device.lifecycle_state) return device.lifecycle_state;
    if (device.is_blocked) return 'blocked';
    if (!device.is_active) return 'inactive';
    const license = licenses[device.device_id];
    if (license?.status) return license.status;
    const trial = trials[device.device_id];
    if (trial?.status === 'active' && new Date(trial.expires_at) >= new Date()) return 'trial';
    return 'unlicensed';
  };

  const filteredDevices = devices.filter(d => {
    const license = licenses[d.device_id];
    const user = d.user_id ? users[d.user_id] : undefined;
    const status = getDeviceStatus(d);
    const q = search.trim().toLowerCase();
    const matchesSearch = !q
      || d.device_id.toLowerCase().includes(q)
      || d.device_fingerprint?.toLowerCase().includes(q)
      || d.name?.toLowerCase().includes(q)
      || d.model?.toLowerCase().includes(q)
      || user?.email?.toLowerCase().includes(q)
      || user?.display_name?.toLowerCase().includes(q)
      || license?.license_key?.toLowerCase().includes(q)
      || license?.status?.toLowerCase().includes(q);
    return matchesSearch && (statusFilter === 'all' || status === statusFilter);
  });

  if (loading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
          <option value="blocked">Blocked</option>
          <option value="unlicensed">Unlicensed</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-semibold">Device ID</th>
              <th className="text-left p-3 font-semibold">Fingerprint</th>
              <th className="text-left p-3 font-semibold">User</th>
              <th className="text-left p-3 font-semibold">License</th>
              <th className="text-left p-3 font-semibold">Trial</th>
              <th className="text-left p-3 font-semibold">Platform</th>
              <th className="text-left p-3 font-semibold">Status</th>
              <th className="text-left p-3 font-semibold">Activity</th>
              <th className="text-left p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.map(device => (
              <tr key={device.device_id} className="border-b hover:bg-muted/50 align-top">
                <td className="p-3 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold whitespace-nowrap">{device.device_id}</span>
                    <Button onClick={() => copyDeviceId(device.device_id)} variant="ghost" size="icon" className="h-7 w-7">
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="text-muted-foreground text-[11px]">{device.name}</div>
                </td>
                <td className="p-3 text-xs font-mono">
                  <div>{device.device_fingerprint || '-'}</div>
                  <div className="text-muted-foreground">{device.app_instance_id || '-'}</div>
                </td>
                <td className="p-3 text-xs">
                  <div>{device.user_id ? (users[device.user_id]?.display_name || device.user_id) : '-'}</div>
                  <div className="text-muted-foreground">{device.user_id ? users[device.user_id]?.email : ''}</div>
                </td>
                <td className="p-3 text-xs">
                  <div className="font-mono">{licenses[device.device_id]?.license_key || '-'}</div>
                  <div>{licenses[device.device_id]?.permanent ? 'Permanent' : (licenses[device.device_id]?.expiry_date || '-')}</div>
                  <div className="text-muted-foreground">{licenses[device.device_id]?.level || '-'}</div>
                </td>
                <td className="p-3 text-xs">
                  <div>{trials[device.device_id]?.status || '-'}</div>
                  <div className="text-muted-foreground">{trials[device.device_id]?.expires_at ? new Date(trials[device.device_id].expires_at).toLocaleDateString() : '-'}</div>
                </td>
                <td className="p-3 text-xs">
                  <div>{device.platform || '-'}</div>
                  <div className="text-muted-foreground">{device.model || '-'}</div>
                  <div className="text-muted-foreground">v{device.app_version || '-'}</div>
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    {device.is_blocked && (
                      <span className="text-xs bg-red-500/20 text-red-700 px-2 py-1 rounded">Blocked</span>
                    )}
                    {!device.is_active && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-700 px-2 py-1 rounded">Inactive</span>
                    )}
                    {device.is_active && !device.is_blocked && (
                      <span className="text-xs bg-green-500/20 text-green-700 px-2 py-1 rounded">Active</span>
                    )}
                    {licenses[device.device_id]?.status && (
                      <span className="text-xs bg-blue-500/20 text-blue-700 px-2 py-1 rounded">License: {licenses[device.device_id].status}</span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-xs">
                  <div>Registered: {device.first_seen_at ? new Date(device.first_seen_at).toLocaleString() : '-'}</div>
                  <div>Last sync: {device.last_sync_at ? new Date(device.last_sync_at).toLocaleString() : '-'}</div>
                  <div>Last activity: {device.last_activity_at ? new Date(device.last_activity_at).toLocaleString() : '-'}</div>
                  <div className={new Date(device.last_seen).getTime() > Date.now() - 5 * 60 * 1000 ? 'text-green-600' : 'text-muted-foreground'}>
                    {new Date(device.last_seen).getTime() > Date.now() - 5 * 60 * 1000 ? 'Online' : 'Offline'}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => toggleBlock(device.device_id, device.is_blocked)}
                      disabled={actionInProgress === device.device_id}
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      {device.is_blocked ? (
                        <><CheckCircle className="w-4 h-4 mr-1" />Unblock</>
                      ) : (
                        <><Ban className="w-4 h-4 mr-1" />Block</>
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredDevices.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No devices found
        </div>
      )}

      <div className="text-xs text-muted-foreground pt-4">
        Showing {filteredDevices.length} of {devices.length} devices
      </div>
    </div>
  );
}
