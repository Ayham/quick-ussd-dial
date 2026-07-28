import { useState, useEffect } from "react";
import { ArrowRight, Phone, Mail, Wallet, AlertTriangle, Clock, CreditCard, ArrowDownCircle, ArrowUpCircle, Plus, Minus, Search, FileText, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getCustomerAccount,
  getCustomerTransactions,
  addDebt,
  registerPayment,
  adjustBalance,
  topupCustomer,
  updateCustomerNotes,
  createTopupRequest,
  type CustomerAccount,
  type CustomerTransaction,
  type CustomerWithProfile,
} from "@/lib/distributor-management";
import { supabase } from "@/integrations/supabase/client";

type DetailTab = "overview" | "transactions" | "accounting" | "topup" | "ussd";

interface Props {
  customerId: string;
  customer: CustomerWithProfile;
  onBack: () => void;
}

export function CustomerDetail({ customerId, customer, onBack }: Props) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ussdData, setUssdData] = useState<{ secret: string | null; serial: string | null } | null>(null);
  const [notes, setNotes] = useState(customer.notes || "");
  const [busy, setBusy] = useState(false);

  // Accounting form state
  const [accountingType, setAccountingType] = useState<"debt" | "payment" | "adjustment" | "topup">("debt");
  const [accountingAmount, setAccountingAmount] = useState("");
  const [accountingNotes, setAccountingNotes] = useState("");
  const [topupOperator, setTopupOperator] = useState("syriatel");

  // Topup request form
  const [reqOperator, setReqOperator] = useState("syriatel");
  const [reqAmount, setReqAmount] = useState("");
  const [reqNotes, setReqNotes] = useState("");

  const tabs: { id: DetailTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "transactions", label: "Ledger" },
    { id: "accounting", label: "Accounting" },
    { id: "topup", label: "Topup" },
    { id: "ussd", label: "USSD" },
  ];

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [acc, txResult] = await Promise.all([
        getCustomerAccount(customerId),
        getCustomerTransactions(customerId, { limit: 50 }),
      ]);
      setAccount(acc);
      setTransactions(txResult.data);
      setTxTotal(txResult.total);

      const { data: settings } = await supabase
        .from("user_settings")
        .select("key, value")
        .eq("user_id", customerId)
        .in("key", ["ussd-credentials"]);

      if (settings && settings.length > 0) {
        const creds = settings.find(s => s.key === "ussd-credentials");
        if (creds) {
          const val = creds.value as Record<string, unknown>;
          setUssdData({ secret: (val.mtnSecret as string) || null, serial: (val.syriatelSerial as string) || null });
        }
      }
      setLoading(false);
    }
    load();
  }, [customerId]);

  const refreshAccount = async () => {
    const [acc, txResult] = await Promise.all([
      getCustomerAccount(customerId),
      getCustomerTransactions(customerId, { limit: 50 }),
    ]);
    setAccount(acc);
    setTransactions(txResult.data);
    setTxTotal(txResult.total);
  };

  const handleAccounting = async () => {
    const amount = Number(accountingAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      let result;
      switch (accountingType) {
        case "debt":
          result = await addDebt(customerId, amount, accountingNotes || undefined);
          break;
        case "payment":
          result = await registerPayment(customerId, amount, accountingNotes || undefined);
          break;
        case "adjustment":
          result = await adjustBalance(customerId, amount, accountingNotes || undefined);
          break;
        case "topup":
          result = await topupCustomer(customerId, amount, topupOperator, accountingNotes || undefined);
          break;
      }
      if (result?.ok) {
        toast.success("Operation completed");
        setAccountingAmount("");
        setAccountingNotes("");
        await refreshAccount();
      } else {
        toast.error(result?.error || "Operation failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTopupRequest = async () => {
    const amount = Number(reqAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    const result = await createTopupRequest(reqOperator, amount, reqNotes || undefined);
    setBusy(false);
    if (result.ok) {
      toast.success("Topup request submitted");
      setReqAmount("");
      setReqNotes("");
    } else {
      toast.error(result.error || "Failed");
    }
  };

  const handleSaveNotes = async () => {
    setBusy(true);
    const result = await updateCustomerNotes(customerId, notes);
    setBusy(false);
    if (result.ok) toast.success("Notes saved");
    else toast.error(result.error || "Failed");
  };

  const txTypeLabel = (type: string) => {
    switch (type) {
      case "topup": return "Topup";
      case "payment": return "Payment";
      case "debt": return "Debt";
      case "credit": return "Credit";
      case "adjustment": return "Adjustment";
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowRight className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-bold">{customer.display_name || "Unknown"}</h2>
          {customer.phone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />{customer.phone}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-smooth whitespace-nowrap ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
      ) : (
        <>
          {/* Overview Tab */}
          {tab === "overview" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="text-xl font-bold text-primary">{(account?.current_balance || 0).toLocaleString()}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground">Debt</p>
                  <p className="text-xl font-bold text-destructive">{(account?.current_debt || 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Topups</span>
                  <span className="font-bold">{(account?.total_topups || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Payments</span>
                  <span className="font-bold">{(account?.total_payments || 0).toLocaleString()}</span>
                </div>
                {account?.last_topup && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Topup</span>
                    <span className="text-xs">{new Date(account.last_topup).toLocaleDateString()}</span>
                  </div>
                )}
                {account?.last_payment && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Payment</span>
                    <span className="text-xs">{new Date(account.last_payment).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {customer.email && (
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />Email</p>
                  <p className="text-sm mt-1">{customer.email}</p>
                </div>
              )}

              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" />Internal Notes</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this customer..."
                  className="w-full mt-2 p-2 text-sm border border-border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                />
                <Button size="sm" onClick={handleSaveNotes} disabled={busy} className="mt-2">
                  Save Notes
                </Button>
              </div>
            </div>
          )}

          {/* Transactions Tab */}
          {tab === "transactions" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{txTotal} transactions</p>
              </div>
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No transactions yet</p>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="bg-card border border-border rounded-xl p-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{txTypeLabel(tx.type)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(tx.created_at).toLocaleDateString("ar-SY", {
                              year: "numeric", month: "short", day: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                          {tx.notes && <p className="text-[10px] text-muted-foreground mt-1">{tx.notes}</p>}
                        </div>
                        <div className="text-left">
                          <p className={`text-sm font-bold ${
                            tx.type === "payment" || tx.type === "credit" ? "text-primary" : "text-foreground"
                          }`}>
                            {tx.type === "payment" || tx.type === "credit" ? "+" : "-"}{tx.amount.toLocaleString()}
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            Bal: {tx.balance_after.toLocaleString()} | Debt: {tx.debt_after.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Accounting Tab */}
          {tab === "accounting" && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-bold mb-3">Accounting Operation</h3>

                <div className="grid grid-cols-4 gap-1 mb-3 p-1 bg-muted rounded-lg">
                  {[
                    { id: "debt" as const, label: "Debt", icon: AlertTriangle, color: "text-destructive" },
                    { id: "payment" as const, label: "Payment", icon: CreditCard, color: "text-primary" },
                    { id: "adjustment" as const, label: "Adjust", icon: Settings, color: "text-accent" },
                    { id: "topup" as const, label: "Topup", icon: ArrowDownCircle, color: "text-green-500" },
                  ].map((op) => (
                    <button
                      key={op.id}
                      onClick={() => setAccountingType(op.id)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-bold transition-smooth ${
                        accountingType === op.id ? "bg-background shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      <op.icon className={`w-4 h-4 ${accountingType === op.id ? op.color : ""}`} />
                      {op.label}
                    </button>
                  ))}
                </div>

                {accountingType === "topup" && (
                  <div className="flex gap-2 mb-3">
                    <Button
                      variant={topupOperator === "syriatel" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTopupOperator("syriatel")}
                      className="flex-1"
                    >
                      Syriatel
                    </Button>
                    <Button
                      variant={topupOperator === "mtn" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTopupOperator("mtn")}
                      className="flex-1"
                    >
                      MTN
                    </Button>
                  </div>
                )}

                <Input
                  type="number"
                  placeholder="Amount"
                  value={accountingAmount}
                  onChange={(e) => setAccountingAmount(e.target.value)}
                  className="mb-2"
                  dir="ltr"
                />
                <Input
                  placeholder="Notes (optional)"
                  value={accountingNotes}
                  onChange={(e) => setAccountingNotes(e.target.value)}
                  className="mb-3"
                />

                <Button onClick={handleAccounting} disabled={busy || !accountingAmount} className="w-full">
                  {busy ? "Processing..." : `Submit ${accountingType.charAt(0).toUpperCase() + accountingType.slice(1)}`}
                </Button>
              </div>
            </div>
          )}

          {/* Topup Tab */}
          {tab === "topup" && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-bold mb-3">Submit Topup Request</h3>
                <div className="flex gap-2 mb-3">
                  <Button
                    variant={reqOperator === "syriatel" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReqOperator("syriatel")}
                    className="flex-1"
                  >
                    Syriatel
                  </Button>
                  <Button
                    variant={reqOperator === "mtn" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReqOperator("mtn")}
                    className="flex-1"
                  >
                    MTN
                  </Button>
                </div>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={reqAmount}
                  onChange={(e) => setReqAmount(e.target.value)}
                  className="mb-2"
                  dir="ltr"
                />
                <Input
                  placeholder="Notes (optional)"
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  className="mb-3"
                />
                <Button onClick={handleCreateTopupRequest} disabled={busy || !reqAmount} className="w-full">
                  {busy ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </div>
          )}

          {/* USSD Tab */}
          {tab === "ussd" && (
            <div className="space-y-3">
              {ussdData ? (
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold">USSD Credentials</h3>
                  {ussdData.secret && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">MTN Secret</p>
                      <p className="text-sm font-mono font-bold mt-1">{ussdData.secret}</p>
                    </div>
                  )}
                  {ussdData.serial && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Syriatel Serial</p>
                      <p className="text-sm font-mono font-bold mt-1">{ussdData.serial}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Settings className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No USSD credentials configured</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
