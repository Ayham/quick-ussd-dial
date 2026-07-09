import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { adminRpc } from '@/lib/admin-rpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { adminGenerateLicenses, adminUpdateLicense, type AdminLicenseAction } from '@/lib/license-system';

export interface License {
  id: string;
  license_key: string;
  device_id?: string;
  user_id?: string;
  status: 'active' | 'expired' | 'revoked' | 'pending' | 'inactive' | 'suspended';
  level: string;
  expiry_date?: string;
  permanent: boolean;
  ussd_numbers: string[];
  created_at: string;
  activated_at?: string;
}

export function LicensesManager() {
  const { t } = useTranslation();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateCount, setGenerateCount] = useState(1);
  const [generateExpiry, setGenerateExpiry] = useState('');
  const [generatePermanent, setGeneratePermanent] = useState(false);
  const [generateDeviceId, setGenerateDeviceId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { expiryDate: string; deviceId: string }>>({});
  const [transferFor, setTransferFor] = useState<License | null>(null);
  const [transferTargetDevice, setTransferTargetDevice] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferInProgress, setTransferInProgress] = useState(false);

  async function copyText(value: string, label = 'Copied') {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error('Failed to copy');
    }
  }

  async function handleTransfer() {
    if (!transferFor) return;
    const target = transferTargetDevice.trim();
    if (target.length < 4) {
      toast.error('Enter the target device ID');
      return;
    }
    if (target === transferFor.device_id) {
      toast.error('Target device is the same as current');
      return;
    }
    setTransferInProgress(true);
    try {
      const { data, error } = await adminRpc('admin_transfer_license', {
        _license_id: transferFor.id,
        _new_device_id: target,
        _reason: transferReason.trim() || null,
      });
      if (error) throw new Error(error.message);
      const payload = data as { ok?: boolean; reason?: string } | null;
      if (!payload?.ok) throw new Error(payload?.reason || 'Transfer failed');
      toast.success('License transferred');
      setTransferFor(null);
      setTransferTargetDevice('');
      setTransferReason('');
      loadLicenses();
    } catch (err) {
      console.error('Transfer error', err);
      toast.error(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setTransferInProgress(false);
    }
  }

  useEffect(() => {
    loadLicenses();
    const interval = setInterval(loadLicenses, 60000);
    return () => clearInterval(interval);
  }, []);

  async function loadLicenses() {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLicenses(data || []);
    } catch (error) {
      console.error('Error loading licenses:', error);
      toast.error('Failed to load licenses');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateLicenses() {
    if (generateCount !== 1) {
      toast.error('Device-bound licenses are generated one at a time');
      return;
    }

    if (!generatePermanent && !generateExpiry) {
      toast.error('Set expiry date or mark as permanent');
      return;
    }

    if (!generateDeviceId.trim()) {
      toast.error('Enter the target device ID');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await adminGenerateLicenses(
        generateCount,
        generatePermanent ? null : generateExpiry,
        generatePermanent,
        [],
        generateDeviceId
      );

      if (result.success) {
        toast.success(`Generated ${result.keys.length} licenses`);
        setGenerateCount(1);
        setGenerateExpiry('');
        setGeneratePermanent(false);
        setGenerateDeviceId('');
        setShowGenerate(false);
        loadLicenses();
      } else {
        toast.error(result.error || 'Failed to generate licenses');
      }
    } catch (error) {
      console.error('Error generating licenses:', error);
      toast.error('Failed to generate licenses');
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyLicenseKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('License key copied');
    } catch {
      toast.error('Failed to copy');
    }
  }

  async function updateLicense(
    license: License,
    patch: Parameters<typeof adminUpdateLicense>[1],
    action: AdminLicenseAction,
    confirmMessage?: string
  ) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    
    const licenseId = license.id;
    setActionInProgress(licenseId);
    try {
      const result = await adminUpdateLicense(licenseId, patch, action);
      if (!result.success) throw new Error(result.error || 'License update failed');
      toast.success('License updated');
      loadLicenses();
    } catch (error) {
      console.error('Error updating license:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update license');
    } finally {
      setActionInProgress(null);
    }
  }

  const filteredLicenses = licenses.filter(l => 
    l.license_key.includes(search) || 
    l.device_id?.includes(search)
  );

  const stats = {
    total: licenses.length,
    active: licenses.filter(l => l.status === 'active').length,
    pending: licenses.filter(l => l.status === 'pending').length,
    expired: licenses.filter(l => l.status === 'expired').length,
    revoked: licenses.filter(l => l.status === 'revoked').length,
    suspended: licenses.filter(l => l.status === 'suspended').length,
  };

  if (loading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          onClick={() => setShowGenerate(!showGenerate)}
          className="h-10"
        >
          <Plus className="w-4 h-4 mr-2" />
          Generate
        </Button>
      </div>

      {showGenerate && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Count</label>
              <Input
                type="number"
                min="1"
                max="1"
                value={generateCount}
                onChange={(e) => setGenerateCount(Number(e.target.value))}
                className="h-9"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Device ID</label>
              <Input
                value={generateDeviceId}
                onChange={(e) => setGenerateDeviceId(e.target.value)}
                className="h-9 font-mono"
                placeholder="Full device ID"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Expiry Date</label>
              <Input
                type="date"
                value={generateExpiry}
                onChange={(e) => setGenerateExpiry(e.target.value)}
                disabled={generatePermanent}
                className="h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="permanent"
              checked={generatePermanent}
              onChange={(e) => setGeneratePermanent(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="permanent" className="text-sm">Mark as permanent</label>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleGenerateLicenses}
              disabled={isGenerating}
              className="flex-1"
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowGenerate(false)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-6 gap-2 mb-4">
        <div className="bg-card rounded p-2 text-center">
          <div className="text-sm font-semibold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="bg-green-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-green-600">{stats.active}</div>
          <div className="text-xs text-muted-foreground">Active</div>
        </div>
        <div className="bg-blue-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-blue-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </div>
        <div className="bg-yellow-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-yellow-600">{stats.expired}</div>
          <div className="text-xs text-muted-foreground">Expired</div>
        </div>
        <div className="bg-red-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-red-600">{stats.revoked}</div>
          <div className="text-xs text-muted-foreground">Revoked</div>
        </div>
        <div className="bg-orange-500/10 rounded p-2 text-center">
          <div className="text-sm font-semibold text-orange-600">{stats.suspended}</div>
          <div className="text-xs text-muted-foreground">Suspended</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-semibold">Key</th>
              <th className="text-left p-3 font-semibold">Status</th>
              <th className="text-left p-3 font-semibold">Expiry</th>
              <th className="text-left p-3 font-semibold">Device</th>
              <th className="text-left p-3 font-semibold">Type</th>
              <th className="text-left p-3 font-semibold">Created</th>
              <th className="text-left p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLicenses.map(license => (
              <tr key={license.id} className="border-b hover:bg-muted/50">
                <td className="p-3 font-mono text-xs">{license.license_key}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded ${
                    license.status === 'active' ? 'bg-green-500/20 text-green-700' :
                    license.status === 'pending' ? 'bg-blue-500/20 text-blue-700' :
                    license.status === 'expired' ? 'bg-yellow-500/20 text-yellow-700' :
                    license.status === 'suspended' ? 'bg-orange-500/20 text-orange-700' :
                    license.status === 'inactive' ? 'bg-slate-500/20 text-slate-700' :
                    'bg-red-500/20 text-red-700'
                  }`}>
                    {license.status}
                  </span>
                </td>
                <td className="p-3 text-xs">
                  {license.permanent ? (
                    <span className="font-semibold text-green-600">Permanent</span>
                  ) : license.expiry_date ? (
                    new Date(license.expiry_date).toLocaleDateString()
                  ) : '-'}
                </td>
                <td className="p-3 text-xs font-mono whitespace-nowrap">
                  {license.device_id ? (
                    <span className="inline-flex items-center gap-1">
                      <span title={license.device_id}>{license.device_id}</span>
                      <button
                        type="button"
                        onClick={() => copyText(license.device_id!, 'Device ID copied')}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Copy device ID"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </span>
                  ) : '-'}
                </td>
                <td className="p-3 text-xs">{license.level || 'standard'}</td>
                <td className="p-3 text-xs">
                  {new Date(license.created_at).toLocaleDateString()}
                </td>
                <td className="p-3">
                  <div className="min-w-[520px] space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => updateLicense(license, { status: 'active' }, 'license_activated')}
                        disabled={actionInProgress === license.id || license.status === 'active'}
                        variant="outline"
                        size="sm"
                        className="h-8"
                      >
                        Activate
                      </Button>
                      <Button
                        onClick={() => updateLicense(license, { status: 'inactive' }, 'license_deactivated')}
                        disabled={actionInProgress === license.id || license.status === 'inactive' || license.status === 'revoked'}
                        variant="outline"
                        size="sm"
                        className="h-8"
                      >
                        Deactivate
                      </Button>
                      <Button
                        onClick={() => updateLicense(license, { status: 'suspended' }, 'license_suspended')}
                        disabled={actionInProgress === license.id || license.status === 'suspended' || license.status === 'revoked'}
                        variant="outline"
                        size="sm"
                        className="h-8"
                      >
                        Suspend
                      </Button>
                      <Button
                        onClick={() => updateLicense(license, { status: 'active' }, 'license_reactivated')}
                        disabled={actionInProgress === license.id || license.status !== 'suspended'}
                        variant="outline"
                        size="sm"
                        className="h-8"
                      >
                        Reactivate
                      </Button>
                      <Button
                        onClick={() => updateLicense(license, { status: 'revoked' }, 'license_revoked', 'Revoke this license permanently?')}
                        disabled={actionInProgress === license.id || license.status === 'revoked'}
                        variant="outline"
                        size="sm"
                        className="h-8"
                      >
                        Revoke
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => copyLicenseKey(license.license_key)}
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Input
                      type="date"
                      value={edits[license.id]?.expiryDate ?? license.expiry_date ?? ''}
                      onChange={(e) => setEdits(prev => ({
                        ...prev,
                        [license.id]: {
                          expiryDate: e.target.value,
                          deviceId: prev[license.id]?.deviceId ?? license.device_id ?? '',
                        }
                      }))}
                      disabled={license.permanent}
                      className="h-8 w-36 text-xs"
                    />
                    <Button
                      onClick={() => updateLicense(
                        license,
                        { expiry_date: edits[license.id]?.expiryDate || license.expiry_date || null, permanent: false },
                        edits[license.id]?.expiryDate && edits[license.id]?.expiryDate !== license.expiry_date
                          ? 'license_expiry_changed'
                          : 'license_extended'
                      )}
                      disabled={actionInProgress === license.id || license.permanent || !(edits[license.id]?.expiryDate || license.expiry_date)}
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      Save expiry
                    </Button>
                    {license.permanent ? (
                      <Button
                        onClick={() => updateLicense(
                          license,
                          { permanent: false, expiry_date: edits[license.id]?.expiryDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) },
                          'license_converted_to_temporary'
                        )}
                        disabled={actionInProgress === license.id}
                        variant="outline"
                        size="sm"
                        className="h-8"
                      >
                        Temporary
                      </Button>
                    ) : (
                      <Button
                        onClick={() => updateLicense(license, { permanent: true, expiry_date: null }, 'license_converted_to_permanent')}
                        disabled={actionInProgress === license.id}
                        variant="outline"
                        size="sm"
                        className="h-8"
                      >
                        Permanent
                      </Button>
                    )}
                    <Input
                      value={edits[license.id]?.deviceId ?? license.device_id ?? ''}
                      onChange={(e) => setEdits(prev => ({
                        ...prev,
                        [license.id]: {
                          expiryDate: prev[license.id]?.expiryDate ?? license.expiry_date ?? '',
                          deviceId: e.target.value,
                        }
                      }))}
                      className="h-8 w-40 text-xs font-mono"
                      placeholder="Device ID"
                    />
                    <Button
                      onClick={() => updateLicense(
                        license,
                        { device_id: edits[license.id]?.deviceId || null },
                        'license_reassigned',
                        'Reassign this license to another device?'
                      )}
                      disabled={actionInProgress === license.id || license.status === 'revoked'}
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      Reassign
                    </Button>
                    <Button
                      onClick={() => {
                        setTransferFor(license);
                        setTransferTargetDevice('');
                        setTransferReason('');
                      }}
                      disabled={actionInProgress === license.id || license.status === 'revoked'}
                      variant="default"
                      size="sm"
                      className="h-8"
                    >
                      Transfer
                    </Button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredLicenses.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No licenses found
        </div>
      )}

      {transferFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !transferInProgress && setTransferFor(null)}
        >
          <div
            className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-semibold">Transfer license</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Rebinds this license to a new device via server RPC (with audit + lifecycle sync).
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">License key</div>
                <div className="font-mono">{transferFor.license_key}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Current device</div>
                <div className="font-mono break-all">{transferFor.device_id || '—'}</div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">New device ID</label>
              <Input
                value={transferTargetDevice}
                onChange={(e) => setTransferTargetDevice(e.target.value)}
                className="font-mono"
                placeholder="Target device ID"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Input
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. replaced phone"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setTransferFor(null)}
                disabled={transferInProgress}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleTransfer}
                disabled={transferInProgress}
              >
                {transferInProgress ? 'Transferring…' : 'Confirm transfer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
