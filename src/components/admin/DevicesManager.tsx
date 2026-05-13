import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Ban, CheckCircle, Search } from 'lucide-react';
import { toast } from 'sonner';

export interface Device {
  id: string;
  device_id: string;
  user_id?: string;
  name?: string;
  model?: string;
  platform?: string;
  app_version?: string;
  last_seen: string;
  is_active: boolean;
  is_blocked: boolean;
  notes?: string;
}

export function DevicesManager() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
      setDevices(data || []);
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
      const { error } = await supabase
        .from('devices')
        .update({ is_blocked: !currentlyBlocked })
        .eq('device_id', deviceId);

      if (error) throw error;

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

  async function deleteDevice(deviceId: string) {
    if (!confirm('Are you sure you want to delete this device?')) return;

    setActionInProgress(deviceId);
    try {
      const { error } = await supabase
        .from('devices')
        .delete()
        .eq('device_id', deviceId);

      if (error) throw error;

      setDevices(prev => prev.filter(d => d.device_id !== deviceId));
      toast.success('Device deleted');
    } catch (error) {
      console.error('Error deleting device:', error);
      toast.error('Failed to delete device');
    } finally {
      setActionInProgress(null);
    }
  }

  const filteredDevices = devices.filter(d => 
    d.device_id.includes(search) || 
    d.name?.includes(search) ||
    d.model?.includes(search)
  );

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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-semibold">{t('admin.devices')}</th>
              <th className="text-left p-3 font-semibold">Model</th>
              <th className="text-left p-3 font-semibold">Platform</th>
              <th className="text-left p-3 font-semibold">Status</th>
              <th className="text-left p-3 font-semibold">Last Seen</th>
              <th className="text-left p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.map(device => (
              <tr key={device.device_id} className="border-b hover:bg-muted/50">
                <td className="p-3 font-mono text-xs">
                  <div className="font-semibold">{device.device_id.substring(0, 12)}...</div>
                  <div className="text-muted-foreground text-[11px]">{device.name}</div>
                </td>
                <td className="p-3 text-xs">{device.model || '-'}</td>
                <td className="p-3 text-xs">{device.platform || '-'}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    {device.is_blocked && (
                      <span className="text-xs bg-red-500/20 text-red-700 px-2 py-1 rounded">Blocked</span>
                    )}
                    {!device.is_active && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-700 px-2 py-1 rounded">Inactive</span>
                    )}
                    {device.is_active && !device.is_blocked && (
                      <span className="text-xs bg-green-500/20 text-green-700 px-2 py-1 rounded">Active</span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-xs">
                  {new Date(device.last_seen).toLocaleString()}
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
                    <Button
                      onClick={() => deleteDevice(device.device_id)}
                      disabled={actionInProgress === device.device_id}
                      variant="destructive"
                      size="sm"
                      className="h-8"
                    >
                      <Trash2 className="w-4 h-4" />
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
