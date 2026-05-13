import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Copy, Plus, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { generateLicenseKey, adminGenerateLicenses } from '@/lib/license-system';

export interface License {
  id: string;
  license_key: string;
  device_id?: string;
  status: 'active' | 'expired' | 'revoked' | 'pending';
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

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
    if (generateCount < 1 || generateCount > 100) {
      toast.error('Generate 1-100 licenses at a time');
      return;
    }

    if (!generatePermanent && !generateExpiry) {
      toast.error('Set expiry date or mark as permanent');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await adminGenerateLicenses(
        generateCount,
        generatePermanent ? null : generateExpiry,
        generatePermanent
      );

      if (result.success) {
        toast.success(`Generated ${result.keys.length} licenses`);
        setGenerateCount(1);
        setGenerateExpiry('');
        setGeneratePermanent(false);
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

  async function revokeLicense(licenseId: string) {
    if (!confirm('Revoke this license?')) return;

    setActionInProgress(licenseId);
    try {
      const { error } = await supabase
        .from('licenses')
        .update({ status: 'revoked' })
        .eq('id', licenseId);

      if (error) throw error;

      setLicenses(prev => prev.map(l => 
        l.id === licenseId ? { ...l, status: 'revoked' } : l
      ));
      toast.success('License revoked');
    } catch (error) {
      console.error('Error revoking license:', error);
      toast.error('Failed to revoke license');
    } finally {
      setActionInProgress(null);
    }
  }

  async function deleteLicense(licenseId: string) {
    if (!confirm('Delete this license?')) return;

    setActionInProgress(licenseId);
    try {
      const { error } = await supabase
        .from('licenses')
        .delete()
        .eq('id', licenseId);

      if (error) throw error;

      setLicenses(prev => prev.filter(l => l.id !== licenseId));
      toast.success('License deleted');
    } catch (error) {
      console.error('Error deleting license:', error);
      toast.error('Failed to delete license');
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Count</label>
              <Input
                type="number"
                min="1"
                max="100"
                value={generateCount}
                onChange={(e) => setGenerateCount(Number(e.target.value))}
                className="h-9"
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

      <div className="grid grid-cols-5 gap-2 mb-4">
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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-semibold">Key</th>
              <th className="text-left p-3 font-semibold">Status</th>
              <th className="text-left p-3 font-semibold">Expiry</th>
              <th className="text-left p-3 font-semibold">Device</th>
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
                <td className="p-3 text-xs font-mono">{license.device_id?.substring(0, 8) || '-'}</td>
                <td className="p-3 text-xs">
                  {new Date(license.created_at).toLocaleDateString()}
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => copyLicenseKey(license.license_key)}
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    {license.status !== 'revoked' && (
                      <Button
                        onClick={() => revokeLicense(license.id)}
                        disabled={actionInProgress === license.id}
                        variant="outline"
                        size="sm"
                        className="h-8"
                      >
                        Revoke
                      </Button>
                    )}
                    <Button
                      onClick={() => deleteLicense(license.id)}
                      disabled={actionInProgress === license.id}
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

      {filteredLicenses.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No licenses found
        </div>
      )}
    </div>
  );
}
