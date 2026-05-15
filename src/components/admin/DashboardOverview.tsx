import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Smartphone, Key, CheckCircle, TrendingUp, Cloud } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface DashboardMetrics {
  totalDevices: number;
  activeDevices: number;
  blockedDevices: number;
  totalUsers: number;
  totalLicenses: number;
  activeLicenses: number;
  pendingActivations: number;
  totalTransfers: number;
  totalTransferValue: number;
  lastSyncTime?: string;
  queueSize: number;
}

export function DashboardOverview() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalDevices: 0,
    activeDevices: 0,
    blockedDevices: 0,
    totalUsers: 0,
    totalLicenses: 0,
    activeLicenses: 0,
    pendingActivations: 0,
    totalTransfers: 0,
    totalTransferValue: 0,
    queueSize: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  async function loadMetrics() {
    try {
      const [
        { data: devices },
        { data: users },
        { data: licenses },
        { data: activations },
        { data: transfers },
      ] = await Promise.all([
        supabase.from('devices').select('id, is_active, is_blocked'),
        supabase.from('profiles').select('id'),
        supabase.from('licenses').select('status'),
        supabase.from('activations').select('status'),
        supabase.from('transfers').select('amount'),
      ]);

      const activeDevices = devices?.filter(d => d.is_active && !d.is_blocked).length || 0;
      const blockedDevices = devices?.filter(d => d.is_blocked).length || 0;
      const activeLicenses = licenses?.filter(l => l.status === 'active').length || 0;
      const pendingActivations = activations?.filter(a => a.status === 'pending').length || 0;
      const totalTransferValue = transfers?.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0;

      let queueSize = 0;
      try {
        queueSize = JSON.parse(localStorage.getItem('supabase_sync_queue_v1') || '[]').length;
      } catch {
        queueSize = 0;
      }

      setMetrics({
        totalDevices: devices?.length || 0,
        activeDevices,
        blockedDevices,
        totalUsers: users?.length || 0,
        totalLicenses: licenses?.length || 0,
        activeLicenses,
        pendingActivations,
        totalTransfers: transfers?.length || 0,
        totalTransferValue,
        lastSyncTime: localStorage.getItem('supabase_sync_last_v1') || undefined,
        queueSize,
      });
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  }

  const MetricCard = ({ 
    label, 
    value, 
    icon: Icon, 
    color = 'blue' 
  }: { 
    label: string; 
    value: string | number; 
    icon: any;
    color?: string;
  }) => {
    const colorClasses = {
      blue: 'bg-blue-500/10 text-blue-600',
      green: 'bg-green-500/10 text-green-600',
      red: 'bg-red-500/10 text-red-600',
      purple: 'bg-purple-500/10 text-purple-600',
    };

    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className={`p-2 rounded-lg ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('admin.dashboard')}</h2>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          label={t('admin.totalDevices')} 
          value={metrics.totalDevices}
          icon={Smartphone}
          color="blue"
        />
        <MetricCard 
          label={t('admin.activeDevices')} 
          value={metrics.activeDevices}
          icon={Smartphone}
          color="green"
        />
        <MetricCard 
          label={t('admin.blockedDevices')} 
          value={metrics.blockedDevices}
          icon={Smartphone}
          color="red"
        />
        <MetricCard 
          label={t('admin.customers')} 
          value={metrics.totalUsers}
          icon={Users}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard 
          label={t('admin.licenses')} 
          value={`${metrics.activeLicenses}/${metrics.totalLicenses}`}
          icon={Key}
          color="green"
        />
        <MetricCard 
          label={t('admin.activations')} 
          value={metrics.pendingActivations}
          icon={CheckCircle}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard 
          label={t('admin.totalTransfers')} 
          value={metrics.totalTransfers}
          icon={TrendingUp}
          color="purple"
        />
        <MetricCard 
          label={t('admin.syncStatus')} 
          value={metrics.queueSize === 0 ? 'Synced' : `${metrics.queueSize} pending`}
          icon={Cloud}
          color={metrics.queueSize === 0 ? 'green' : 'yellow'}
        />
      </div>

      {metrics.lastSyncTime && (
        <div className="text-sm text-muted-foreground">
          <strong>{t('admin.lastSync')}:</strong> {new Date(metrics.lastSyncTime).toLocaleString()}
        </div>
      )}
    </div>
  );
}
