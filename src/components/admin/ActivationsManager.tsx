import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { adminApproveActivation, adminRejectActivation } from '@/lib/activation-request';
import { Switch } from '@/components/ui/switch';

export interface Activation {
  id: string;
  request_token: string;
  device_id: string;
  user_id?: string;
  contact_name?: string;
  contact_phone?: string;
  ussd_numbers: string[];
  status: 'pending' | 'approved' | 'rejected';
  license_id?: string;
  notes?: string;
  created_at: string;
  processed_at?: string;
}

export function ActivationsManager() {
  const { t } = useTranslation();
  const [activations, setActivations] = useState<Activation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [approveData, setApproveData] = useState<{ [key: string]: { expiryDate: string; permanent: boolean } }>({});
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    loadActivations();
    const interval = setInterval(loadActivations, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadActivations() {
    try {
      const { data, error } = await supabase
        .from('activations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setActivations(data || []);
    } catch (error) {
      console.error('Error loading activations:', error);
      toast.error('Failed to load activations');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(activation: Activation) {
    const data = approveData[activation.id] || { expiryDate: '', permanent: false };
    
    if (!data.permanent && !data.expiryDate) {
      toast.error('Set expiry date');
      return;
    }

    setActionInProgress(activation.id);
    try {
      const result = await adminApproveActivation(
        activation.request_token,
        data.permanent ? null : data.expiryDate,
        activation.ussd_numbers,
        data.permanent
      );

      if (result.success) {
        toast.success(data.permanent ? 'Approved with permanent license' : 'Approved with expiry date');
        loadActivations();
      } else {
        toast.error(result.error || 'Failed to approve');
      }
    } catch (error) {
      console.error('Error approving activation:', error);
      toast.error('Failed to approve');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleReject(activation: Activation) {
    if (!confirm('Reject this activation?')) return;

    setActionInProgress(activation.id);
    try {
      const result = await adminRejectActivation(activation.request_token);

      if (result.success) {
        toast.success('Activation rejected');
        loadActivations();
      } else {
        toast.error(result.error || 'Failed to reject');
      }
    } catch (error) {
      console.error('Error rejecting activation:', error);
      toast.error('Failed to reject');
    } finally {
      setActionInProgress(null);
    }
  }

  const filteredActivations = activations.filter(a => 
    a.request_token.includes(search) || 
    a.device_id.includes(search) ||
    a.contact_name?.includes(search)
  );

  const stats = {
    total: activations.length,
    pending: activations.filter(a => a.status === 'pending').length,
    approved: activations.filter(a => a.status === 'approved').length,
    rejected: activations.filter(a => a.status === 'rejected').length,
  };

  if (loading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="relative mb-4">
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-card rounded p-2 text-center">
          <div className="text-sm font-semibold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="bg-blue-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-blue-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </div>
        <div className="bg-green-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-green-600">{stats.approved}</div>
          <div className="text-xs text-muted-foreground">Approved</div>
        </div>
        <div className="bg-red-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-red-600">{stats.rejected}</div>
          <div className="text-xs text-muted-foreground">Rejected</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-semibold">Request Token</th>
              <th className="text-left p-3 font-semibold">Device</th>
              <th className="text-left p-3 font-semibold">Contact</th>
              <th className="text-left p-3 font-semibold">Status</th>
              <th className="text-left p-3 font-semibold">Created</th>
              <th className="text-left p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredActivations.map(activation => (
              <tr key={activation.id} className="border-b hover:bg-muted/50">
                <td className="p-3 font-mono text-xs">{activation.request_token}</td>
                <td className="p-3 text-xs font-mono whitespace-nowrap">{activation.device_id}</td>
                <td className="p-3 text-xs">
                  <div>{activation.contact_name || '-'}</div>
                  <div className="text-muted-foreground">{activation.contact_phone || '-'}</div>
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded ${
                    activation.status === 'pending' ? 'bg-blue-500/20 text-blue-700' :
                    activation.status === 'approved' ? 'bg-green-500/20 text-green-700' :
                    'bg-red-500/20 text-red-700'
                  }`}>
                    {activation.status}
                  </span>
                </td>
                <td className="p-3 text-xs">
                  {new Date(activation.created_at).toLocaleDateString()}
                </td>
                <td className="p-3">
                  {activation.status === 'pending' ? (
                    <div className="min-w-[260px] space-y-2">
                      <div className="flex gap-2 items-center">
                        <Input
                          type="date"
                          value={approveData[activation.id]?.expiryDate || ''}
                          disabled={approveData[activation.id]?.permanent}
                          onChange={(e) => setApproveData({
                            ...approveData,
                            [activation.id]: {
                              expiryDate: e.target.value,
                              permanent: approveData[activation.id]?.permanent || false,
                            }
                          })}
                          className="h-8 text-xs"
                        />
                        <Button
                          onClick={() => handleApprove(activation)}
                          disabled={
                            actionInProgress === activation.id ||
                            (!approveData[activation.id]?.permanent && !approveData[activation.id]?.expiryDate)
                          }
                          variant="outline"
                          size="sm"
                          className="h-8"
                          title="Approve"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => handleReject(activation)}
                          disabled={actionInProgress === activation.id}
                          variant="outline"
                          size="sm"
                          className="h-8"
                          title="Reject"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={approveData[activation.id]?.permanent || false}
                          onCheckedChange={(checked) => setApproveData({
                            ...approveData,
                            [activation.id]: {
                              expiryDate: checked ? '' : (approveData[activation.id]?.expiryDate || ''),
                              permanent: checked,
                            }
                          })}
                        />
                        Mark as permanent
                      </label>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">Decision recorded</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredActivations.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No activation requests found
        </div>
      )}
    </div>
  );
}
