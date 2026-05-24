import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Cloud, Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export interface SyncLog {
  id: string;
  device_id: string | null;
  event: string;
  status: string;
  payload?: unknown;
  error?: string | null;
  created_at: string;
}

export function SyncStatusMonitor() {
  const { t } = useTranslation();
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    loadSyncData();
    const interval = setInterval(loadSyncData, 30000);
    
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', () => setIsOnline(true));
      window.removeEventListener('offline', () => setIsOnline(false));
    };
  }, []);

  async function loadSyncData() {
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSyncLogs((data || []) as SyncLog[]);

      const lastTime = localStorage.getItem('supabase_sync_last_v1');
      setLastSync(lastTime);

      try {
        const queue = JSON.parse(localStorage.getItem('supabase_sync_queue_v1') || '[]');
        setQueueSize(queue.length);
      } catch {
        setQueueSize(0);
      }
    } catch (error) {
      console.error('Error loading sync data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function manualSync() {
    try {
      const { pushEvent, flush } = await import('@/lib/supabase-sync');
      toast.info('Sync in progress...');
      const result = await flush();
      toast.success(`Synced ${result.sent} events`);
      loadSyncData();
    } catch (error) {
      console.error('Error during sync:', error);
      toast.error('Sync failed');
    }
  }

  const stats = {
    total: syncLogs.length,
    succeeded: syncLogs.filter(s => s.status === 'synced').length,
    failed: syncLogs.filter(s => s.status === 'failed' || s.status === 'error').length,
    pending: syncLogs.filter(s => s.status === 'pending').length,
  };

  if (loading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            {isOnline ? (
              <Wifi className="w-6 h-6 text-green-600" />
            ) : (
              <WifiOff className="w-6 h-6 text-red-600" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-lg font-bold">
                {isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <Cloud className="w-6 h-6 text-blue-600" />
            <div>
              <p className="text-sm text-muted-foreground">Queue Size</p>
              <p className="text-lg font-bold">{queueSize} pending</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Last Sync</p>
              <p className="text-sm font-mono">
                {lastSync ? new Date(lastSync).toLocaleTimeString() : 'Never'}
              </p>
            </div>
            <Button
              onClick={manualSync}
              disabled={!isOnline}
              variant="outline"
              size="sm"
              className="h-9"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card rounded p-2 text-center">
          <div className="text-sm font-semibold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="bg-green-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-green-600">{stats.succeeded}</div>
          <div className="text-xs text-muted-foreground">Succeeded</div>
        </div>
        <div className="bg-red-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-red-600">{stats.failed}</div>
          <div className="text-xs text-muted-foreground">Failed</div>
        </div>
        <div className="bg-blue-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-blue-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </div>
      </div>

      {/* Logs */}
      <div>
        <h3 className="text-lg font-bold mb-3">Sync Logs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-semibold">Device</th>
                <th className="text-left p-3 font-semibold">Event</th>
                <th className="text-left p-3 font-semibold">Status</th>
                <th className="text-left p-3 font-semibold">Records</th>
                <th className="text-left p-3 font-semibold">Time</th>
                <th className="text-left p-3 font-semibold">Error</th>
              </tr>
            </thead>
            <tbody>
              {syncLogs.map(log => (
                <tr key={log.id} className="border-b hover:bg-muted/50">
                  <td className="p-3 text-xs font-mono">{(log.device_id || '').substring(0, 8)}...</td>
                  <td className="p-3 text-xs">{log.event}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      log.status === 'synced' ? 'bg-green-500/20 text-green-700' :
                      (log.status === 'failed' || log.status === 'error') ? 'bg-red-500/20 text-red-700' :
                      'bg-blue-500/20 text-blue-700'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs font-mono">
                    {typeof (log.payload as { records_count?: unknown } | undefined)?.records_count === 'number'
                      ? (log.payload as { records_count: number }).records_count
                      : '-'}
                  </td>
                  <td className="p-3 text-xs">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </td>
                  <td className="p-3 text-xs">
                    {log.error ? (
                      <div className="flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-3 h-3" />
                        {log.error.substring(0, 40)}...
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {syncLogs.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No sync logs
        </div>
      )}
    </div>
  );
}
