import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Truck, Search, RefreshCw, ChevronLeft, ChevronRight, UserPlus, Eye, Users, Banknote, AlertCircle, Check, X, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  adminGetDistributors,
  adminGetDistributorDetail,
  adminGrantDistributor,
  adminRevokeDistributor,
  adminUpdateDistributor,
  adminAssignCustomerToDistributor,
  adminRemoveCustomerFromDistributor,
  adminRecordDistributorPayout,
  type DistributorInfo,
  type DistributorDetail,
  type DistributorCustomer,
} from "@/lib/distributor";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 20;

export function DistributorManagement() {
  const { t } = useTranslation();
  const [distributors, setDistributors] = useState<DistributorInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [grantOpen, setGrantOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutTarget, setPayoutTarget] = useState<{ id: string; name: string; pending: number } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DistributorDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchDistributors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminGetDistributors({ search, status: statusFilter, page, page_size: PAGE_SIZE });
      setDistributors(result.distributors || []);
      setTotal(result.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
    setLoading(false);
  }, [search, statusFilter, page]);

  useEffect(() => { fetchDistributors(); }, [fetchDistributors]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleRevoke = async (userId: string) => {
    setBusy(`revoke_${userId}`);
    try {
      await adminRevokeDistributor(userId);
      toast.success(t("adminDistributors.revoked"));
      fetchDistributors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
    setBusy(null);
  };

  const handleViewDetail = async (userId: string) => {
    setBusy(`detail_${userId}`);
    try {
      const result = await adminGetDistributorDetail(userId);
      if (result.ok) {
        setDetail(result);
        setDetailOpen(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">{t("adminDistributors.title")}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetchDistributors} className="h-9">
            <RefreshCw className="w-4 h-4 me-1" />
            {t("adminDistributors.refresh")}
          </Button>
          <Button size="sm" onClick={() => setGrantOpen(true)} className="h-9">
            <UserPlus className="w-4 h-4 me-1" />
            {t("adminDistributors.grantRole")}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("adminDistributors.searchPlaceholder")}
            className="ps-9 h-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="">{t("adminDistributors.allStatuses")}</option>
          <option value="active">{t("adminDistributors.active")}</option>
          <option value="inactive">{t("adminDistributors.inactive")}</option>
        </select>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-xl p-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">{t("common.loading")}</div>
      ) : distributors.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          {t("adminDistributors.noDistributors")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="text-start py-2 px-2 font-medium">{t("adminDistributors.code")}</th>
                <th className="text-start py-2 px-2 font-medium">{t("adminDistributors.name")}</th>
                <th className="text-start py-2 px-2 font-medium hidden sm:table-cell">{t("adminDistributors.commission")}</th>
                <th className="text-start py-2 px-2 font-medium">{t("adminDistributors.customers")}</th>
                <th className="text-start py-2 px-2 font-medium hidden md:table-cell">{t("adminDistributors.totalSales")}</th>
                <th className="text-start py-2 px-2 font-medium hidden md:table-cell">{t("adminDistributors.totalCommission")}</th>
                <th className="text-start py-2 px-2 font-medium hidden lg:table-cell">{t("adminDistributors.totalPaymentsAmount")}</th>
                <th className="text-start py-2 px-2 font-medium hidden lg:table-cell">{t("adminDistributors.pendingAmount")}</th>
                <th className="text-start py-2 px-2 font-medium">{t("adminDistributors.status")}</th>
                <th className="text-end py-2 px-2 font-medium">{t("adminDistributors.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {distributors.map((d) => (
                <tr key={d.user_id} className="border-b border-border/30 hover:bg-muted/50">
                  <td className="py-2.5 px-2 font-mono text-xs font-semibold text-primary">{d.code}</td>
                  <td className="py-2.5 px-2">
                    <div className="font-medium">{d.display_name || "—"}</div>
                    {d.email && <div className="text-xs text-muted-foreground">{d.email}</div>}
                  </td>
                  <td className="py-2.5 px-2 hidden sm:table-cell">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {d.commission_rate}%
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{d.customer_count}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 hidden md:table-cell">
                    <div className="flex items-center gap-1">
                      <Banknote className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{Number(d.total_sales || 0).toLocaleString()} {t("common.currencySymbol")}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 hidden md:table-cell">
                    <span className="text-xs font-semibold text-emerald-600">{Number(d.total_commission || 0).toLocaleString()} {t("common.currencySymbol")}</span>
                  </td>
                  <td className="py-2.5 px-2 hidden lg:table-cell">
                    <span className="text-xs font-semibold text-blue-600">{Number(d.total_paid || 0).toLocaleString()} {t("common.currencySymbol")}</span>
                  </td>
                  <td className="py-2.5 px-2 hidden lg:table-cell">
                    <span className="text-xs font-semibold text-amber-600">{Number((d.total_commission || 0) - (d.total_paid || 0)).toLocaleString()} {t("common.currencySymbol")}</span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      d.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                    }`}>
                      {d.status === "active" ? t("adminDistributors.active") : t("adminDistributors.inactive")}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={busy === `detail_${d.user_id}`}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleViewDetail(d.user_id)}>
                          <Eye className="w-4 h-4 me-2" />
                          {t("adminDistributors.viewDetails")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setPayoutTarget({ id: d.id, name: d.display_name || d.code, pending: Number(d.total_commission || 0) - Number(d.total_paid || 0) });
                          setPayoutOpen(true);
                        }}>
                          <Banknote className="w-4 h-4 me-2" />
                          {t("adminDistributors.recordPayout")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRevoke(d.user_id)}>
                          <X className="w-4 h-4 me-2" />
                          {t("adminDistributors.revokeRole")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t("adminDistributors.pageInfo", { page, totalPages })}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Grant Distributor Dialog */}
      <GrantDistributorDialog open={grantOpen} onOpenChange={setGrantOpen} onGranted={() => { fetchDistributors(); setGrantOpen(false); }} />

      {/* Detail Dialog */}
      {detail && (
        <DistributorDetailDialog open={detailOpen} onOpenChange={setDetailOpen} detail={detail} />
      )}

      {/* Payout Dialog */}
      {payoutTarget && (
        <PayoutDialog open={payoutOpen} onOpenChange={setPayoutOpen} target={payoutTarget} onPaid={() => { fetchDistributors(); setPayoutOpen(false); setPayoutTarget(null); }} />
      )}
    </div>
  );
}

// ─── Grant Distributor Dialog ────────────────────────────────

function GrantDistributorDialog({ open, onOpenChange, onGranted }: {
  open: boolean; onOpenChange: (v: boolean) => void; onGranted: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<Array<{ user_id: string; display_name: string | null; email: string | null }>>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [commission, setCommission] = useState("5");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || search.length < 2) { setUsers([]); return; }
    setLoadingUsers(true);
    const timeout = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .or(`display_name.ilike.%${search}%,email.ilike.%${search}%`)
          .limit(20);
        setUsers((data as Array<{ user_id: string; display_name: string | null; email: string | null }>) || []);
      } catch {
        setUsers([]);
      }
      setLoadingUsers(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [open, search]);

  const handleGrant = async () => {
    if (!selectedUser) return;
    const rate = parseFloat(commission);
    if (isNaN(rate) || rate < 0 || rate > 100) { toast.error(t("adminDistributors.commissionRequired")); return; }
    setSaving(true);
    try {
      const result = await adminGrantDistributor(selectedUser, rate);
      if (result.ok) {
        toast.success(t("adminDistributors.granted") + " — " + result.code);
        setSelectedUser(null);
        setSearch("");
        onGranted();
      } else {
        toast.error(result.error || "Failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("adminDistributors.grantRole")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">{t("adminDistributors.selectUser")} *</label>
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setSelectedUser(null); }} placeholder={t("adminDistributors.searchUser")} className="mt-1" />
            {loadingUsers && <div className="text-xs text-muted-foreground mt-1">{t("common.loading")}</div>}
            {users.length > 0 && (
              <div className="max-h-48 overflow-y-auto border rounded-lg mt-1">
                {users.map((u) => (
                  <button
                    key={u.user_id}
                    onClick={() => { setSelectedUser(u.user_id); setSearch(u.display_name || u.email || ""); setUsers([]); }}
                    className={`w-full text-start px-3 py-2 text-sm border-b border-border/30 hover:bg-muted ${selectedUser === u.user_id ? "bg-primary/10" : ""}`}
                  >
                    <div className="font-medium">{u.display_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">{t("adminDistributors.commission")} %</label>
            <Input value={commission} onChange={(e) => setCommission(e.target.value)} className="mt-1" type="number" min="0" max="100" step="0.5" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={handleGrant} disabled={saving || !selectedUser}>
              {saving ? t("common.saving") : t("adminDistributors.grantRole")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Distributor Detail Dialog ───────────────────────────────

function DistributorDetailDialog({ open, onOpenChange, detail }: {
  open: boolean; onOpenChange: (v: boolean) => void; detail: DistributorDetail;
}) {
  const { t } = useTranslation();
  const d = detail.distributor;
  if (!d) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            {d.display_name || "—"}
            <span className="text-sm font-mono text-primary">{d.code}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">{t("adminDistributors.commission")}</span>
              <div className="font-semibold text-primary">{d.commission_rate}%</div>
            </div>
            <div>
              <span className="text-muted-foreground">{t("adminDistributors.status")}</span>
              <div className={`font-semibold ${d.status === "active" ? "text-green-600" : "text-gray-600"}`}>{d.status}</div>
            </div>
            <div>
              <span className="text-muted-foreground">{t("adminDistributors.customers")}</span>
              <div className="font-semibold">{d.customer_count}</div>
            </div>
            <div>
              <span className="text-muted-foreground">{t("adminDistributors.totalSales")}</span>
              <div className="font-semibold">{Number(d.total_sales || 0).toLocaleString()}</div>
            </div>
            <div>
              <span className="text-muted-foreground">{t("adminDistributors.totalCommission")}</span>
              <div className="font-semibold">{Number(d.total_commission || 0).toLocaleString()}</div>
            </div>
            <div>
              <span className="text-muted-foreground">{t("adminDistributors.email")}</span>
              <div className="font-semibold">{d.email || "—"}</div>
            </div>
          </div>

          <div className="border-t border-border/60 pt-3">
            <h4 className="text-sm font-semibold mb-2">{t("adminDistributors.customers")} ({detail.customers?.length || 0})</h4>
            {(!detail.customers || detail.customers.length === 0) ? (
              <div className="text-sm text-muted-foreground">{t("common.noData")}</div>
            ) : (
              <div className="space-y-2">
                {detail.customers.map((c) => (
                  <div key={c.user_id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded-lg">
                    <div>
                      <div className="font-medium">{c.display_name || c.email || "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </div>
                    <div className="text-end">
                      <div className="text-xs">{Number(c.total_payments || 0).toLocaleString()}</div>
                      <div className="text-xs text-emerald-600">+{Number(c.distributor_commission || 0).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Payout Dialog ──────────────────────────────────────────

function PayoutDialog({ open, onOpenChange, target, onPaid }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  target: { id: string; name: string; pending: number };
  onPaid: () => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(target.pending > 0 ? String(target.pending) : "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handlePay = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { toast.error(t("adminDistributors.invalidAmount")); return; }
    if (val > target.pending) { toast.error(t("adminDistributors.exceedsPending")); return; }
    setSaving(true);
    try {
      const result = await adminRecordDistributorPayout(target.id, val, notes || undefined);
      if (result.ok) {
        toast.success(t("adminDistributors.payoutRecorded"));
        onPaid();
      } else {
        toast.error(result.error || "Failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5" />
            {t("adminDistributors.recordPayout")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted/50 rounded-xl p-3 text-sm">
            <div className="text-muted-foreground">{t("adminDistributors.distributor")}</div>
            <div className="font-semibold">{target.name}</div>
          </div>
          <div className="bg-emerald-50 text-emerald-700 rounded-xl p-3 text-sm flex items-center gap-2">
            <Banknote className="w-4 h-4" />
            <span>{t("adminDistributors.pendingAmount")}: <strong>{Number(target.pending).toLocaleString()} {t("common.currencySymbol")}</strong></span>
          </div>
          <div>
            <label className="text-sm font-medium">{t("adminDistributors.payoutAmount")} *</label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" type="number" min="0" step="0.01" />
          </div>
          <div>
            <label className="text-sm font-medium">{t("adminDistributors.payoutNotes")}</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder={t("adminDistributors.payoutNotesPlaceholder")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={handlePay} disabled={saving}>
              {saving ? t("common.saving") : t("adminDistributors.confirmPayout")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
