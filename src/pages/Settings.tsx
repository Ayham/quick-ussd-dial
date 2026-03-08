import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Key, Code, ArrowUp, ArrowDown, Smartphone, Signal, Shield, ShieldCheck, Clock, Copy, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getPresets, savePresets,
  getCredentials, saveCredentials,
  getUssdTemplates, saveUssdTemplates,
  getPrefixes, savePrefixes,
  getSimAssignment, saveSimAssignment,
  getBalanceTemplates, saveBalanceTemplates,
  resetAllSettings,
  DEFAULT_MTN_PRESETS, DEFAULT_SYRIATEL_PRESETS,
  DEFAULT_USSD_TEMPLATES, DEFAULT_PREFIXES,
  DEFAULT_SIM_ASSIGNMENT, DEFAULT_BALANCE_TEMPLATES,
  DEFAULT_CREDENTIALS,
  type Operator, type AmountPreset, type OperatorCredentials,
  type UssdTemplates, type OperatorPrefixes, type SimSlot, type SimAssignment,
  type BalanceCheckTemplates,
} from "@/lib/ussd-profiles";
import {
  getAppStatus, getSavedLicense, clearLicense, saveLicense, validateLicense,
  type AppLicenseStatus,
} from "@/lib/license";
import { getDeviceId } from "@/lib/device-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const Settings = () => {
  const navigate = useNavigate();
  const [presets, setPresets] = useState(() => getPresets());
  const [credentials, setCredentials] = useState<OperatorCredentials>(() => getCredentials());
  const [templates, setTemplates] = useState<UssdTemplates>(() => getUssdTemplates());
  const [prefixes, setPrefixes] = useState<OperatorPrefixes>(() => getPrefixes());
  const [simAssignment, setSimAssignment] = useState<SimAssignment>(() => getSimAssignment());
  const [balanceTemplates, setBalanceTemplates] = useState<BalanceCheckTemplates>(() => getBalanceTemplates());
  const [activeTab, setActiveTab] = useState<Operator>("mtn");
  const [newPrefix, setNewPrefix] = useState("");

  // License state
  const [licenseStatus, setLicenseStatus] = useState<AppLicenseStatus | null>(null);
  const [newLicenseKey, setNewLicenseKey] = useState("");
  const [licenseLoading, setLicenseLoading] = useState(false);
  const deviceId = getDeviceId();
  const deviceId = getDeviceId();

  useEffect(() => {
    getAppStatus().then(setLicenseStatus);
  }, []);

  // Preset handlers
  const handleAdd = () => {
    const updated = { ...presets };
    updated[activeTab] = [...updated[activeTab], { amount: 0, price: 0 }];
    setPresets(updated);
  };

  const handleRemove = (index: number) => {
    const updated = { ...presets };
    updated[activeTab] = updated[activeTab].filter((_, i) => i !== index);
    setPresets(updated);
  };

  const handleChange = (index: number, field: keyof AmountPreset, value: string) => {
    const updated = { ...presets };
    updated[activeTab] = updated[activeTab].map((p, i) =>
      i === index ? { ...p, [field]: Number(value) || 0 } : p
    );
    setPresets(updated);
  };

  const handleMovePreset = (index: number, direction: "up" | "down") => {
    const list = [...presets[activeTab]];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    [list[index], list[targetIndex]] = [list[targetIndex], list[index]];
    setPresets({ ...presets, [activeTab]: list });
  };

  // Prefix handlers
  const handleAddPrefix = (op: Operator) => {
    const trimmed = newPrefix.trim();
    if (!trimmed || trimmed.length !== 3) {
      toast.error("البادئة يجب أن تكون 3 أرقام");
      return;
    }
    if (prefixes[op].includes(trimmed)) {
      toast.error("البادئة موجودة بالفعل");
      return;
    }
    setPrefixes({ ...prefixes, [op]: [...prefixes[op], trimmed] });
    setNewPrefix("");
  };

  const handleRemovePrefix = (op: Operator, prefix: string) => {
    setPrefixes({ ...prefixes, [op]: prefixes[op].filter((p) => p !== prefix) });
  };

  const handleSave = () => {
    if (!credentials.mtnSecret.trim()) {
      toast.error("الرجاء إدخال الرمز السري لشريحة MTN");
      return;
    }
    if (!credentials.syriatelSerial.trim()) {
      toast.error("الرجاء إدخال الرقم السيري لشريحة سيريتيل");
      return;
    }
    savePresets(presets);
    saveCredentials(credentials);
    saveUssdTemplates(templates);
    savePrefixes(prefixes);
    saveSimAssignment(simAssignment);
    saveBalanceTemplates(balanceTemplates);
    toast.success("تم الحفظ بنجاح");
    toast.success("تم الحفظ بنجاح");
    navigate("/");
  };

  const handleReset = () => {
    resetAllSettings();
    setPresets({ mtn: [...DEFAULT_MTN_PRESETS], syriatel: [...DEFAULT_SYRIATEL_PRESETS] });
    setCredentials({ ...DEFAULT_CREDENTIALS });
    setTemplates({ ...DEFAULT_USSD_TEMPLATES });
    setPrefixes({ mtn: [...DEFAULT_PREFIXES.mtn], syriatel: [...DEFAULT_PREFIXES.syriatel] });
    setSimAssignment({ ...DEFAULT_SIM_ASSIGNMENT });
    setBalanceTemplates({ ...DEFAULT_BALANCE_TEMPLATES });
    toast.info("تم إعادة تعيين جميع الإعدادات");
    toast.info("تم إعادة تعيين جميع الإعدادات");
  };

  // License actions
  const handleActivateLicense = async () => {
    if (!newLicenseKey.trim()) {
      toast.error("الرجاء إدخال مفتاح الترخيص");
      return;
    }
    setLicenseLoading(true);
    try {
      const result = await validateLicense(newLicenseKey.trim());
      if (result.valid) {
        saveLicense(newLicenseKey.trim());
        toast.success("تم تفعيل الترخيص بنجاح!");
        setNewLicenseKey("");
        const s = await getAppStatus();
        setLicenseStatus(s);
      } else {
        toast.error(result.error || "مفتاح غير صالح");
      }
    } catch {
      toast.error("حدث خطأ أثناء التحقق");
    } finally {
      setLicenseLoading(false);
    }
  };

  const handleRevokeLicense = () => {
    clearLicense();
    toast.info("تم إلغاء الترخيص");
    getAppStatus().then(setLicenseStatus);
  };

  const copyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(deviceId);
      toast.success("تم نسخ معرف الجهاز");
    } catch {
      const el = document.createElement("textarea");
      el.value = deviceId;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      toast.success("تم نسخ معرف الجهاز");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-insets">
      <header className="bg-primary px-4 py-3 flex items-center gap-3 shadow-md pt-safe">
        <button onClick={() => navigate("/")} className="text-primary-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-primary-foreground text-xl font-bold">الإعدادات</h1>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full overflow-y-auto pb-safe">
        {/* License Status */}
        <Section title="حالة الترخيص" icon={<Shield className="w-4 h-4" />}>
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            {/* Status indicator */}
            {licenseStatus && (
              <div className={`flex items-center gap-3 p-3 rounded-lg ${
                licenseStatus.status === 'licensed'
                  ? "bg-green-500/10 border border-green-500/30"
                  : licenseStatus.status === 'trial'
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-destructive/10 border border-destructive/30"
              }`}>
                {licenseStatus.status === 'licensed' ? (
                  <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
                ) : licenseStatus.status === 'trial' ? (
                  <Clock className="w-5 h-5 text-primary shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    {licenseStatus.status === 'licensed' ? 'مفعّل' :
                     licenseStatus.status === 'trial' ? 'فترة تجريبية' :
                     licenseStatus.status === 'trial_expired' ? 'انتهت الفترة التجريبية' :
                     licenseStatus.status === 'license_expired' ? 'انتهى الترخيص' :
                     'تلاعب بالتاريخ'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {licenseStatus.status === 'licensed' && `ينتهي: ${(licenseStatus as any).expiryDate} (${(licenseStatus as any).daysLeft} يوم)`}
                    {licenseStatus.status === 'trial' && `متبقي ${(licenseStatus as any).daysLeft} يوم`}
                  </p>
                </div>
              </div>
            )}

            {/* Device ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                معرف الجهاز
              </label>
              <div className="flex gap-2">
                <Input value={deviceId} readOnly className="text-left text-[11px] h-9 font-mono flex-1 bg-muted" dir="ltr" />
                <Button onClick={copyDeviceId} variant="outline" size="icon" className="shrink-0 h-9 w-9">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Enter new license */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                {getSavedLicense() ? "تجديد الترخيص" : "تفعيل الترخيص"}
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="الصق مفتاح الترخيص..."
                  value={newLicenseKey}
                  onChange={(e) => setNewLicenseKey(e.target.value)}
                  className="text-left text-xs h-9 font-mono flex-1"
                  dir="ltr"
                />
                <Button
                  onClick={handleActivateLicense}
                  disabled={licenseLoading || !newLicenseKey.trim()}
                  size="sm"
                  className="h-9 text-xs"
                >
                  {licenseLoading ? "..." : "تفعيل"}
                </Button>
              </div>
            </div>

          </div>
        </Section>

        {/* Credentials */}
        <Section title="بيانات الشريحة" icon={<Key className="w-4 h-4" />}>
          <div className="space-y-3 bg-card border border-border rounded-xl p-4">
            <FieldInput label="الرمز السري لشريحة MTN" value={credentials.mtnSecret}
              onChange={(v) => setCredentials({ ...credentials, mtnSecret: v })} placeholder="مثال: 20326" />
            <FieldInput label="الرقم السيري لشريحة سيريتيل" value={credentials.syriatelSerial}
              onChange={(v) => setCredentials({ ...credentials, syriatelSerial: v })} placeholder="مثال: 32362" />
            <FieldInput label="كود الموزع سيريتيل" value={credentials.syriatelDistributor}
              onChange={(v) => setCredentials({ ...credentials, syriatelDistributor: v })} placeholder="مثال: 640322" />
          </div>
        </Section>

        {/* SIM Assignment */}
        <Section title="تعيين الشريحة" icon={<Smartphone className="w-4 h-4" />}>
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            {(["mtn", "syriatel"] as Operator[]).map((op) => (
              <div key={op} className="space-y-2">
                <p className={`font-bold text-sm ${op === "mtn" ? "text-operator-mtn" : "text-operator-syriatel"}`}>
                  {op === "mtn" ? "MTN" : "Syriatel"}
                </p>
                <div className="flex gap-2">
                  {([0, 1] as SimSlot[]).map((slot) => (
                    <button
                      key={slot}
                      onClick={() => setSimAssignment({ ...simAssignment, [op]: slot })}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all border ${
                        simAssignment[op] === slot
                          ? op === "mtn"
                            ? "border-operator-mtn bg-operator-mtn/10 text-operator-mtn"
                            : "border-operator-syriatel bg-operator-syriatel/10 text-operator-syriatel"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      SIM {slot + 1}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Operator Prefixes */}
        <Section title="بادئات الأرقام" icon={<Signal className="w-4 h-4" />}>
          {(["mtn", "syriatel"] as Operator[]).map((op) => (
            <div key={op} className="bg-card border border-border rounded-xl p-4 space-y-3 mb-3">
              <p className={`font-bold text-sm ${op === "mtn" ? "text-operator-mtn" : "text-operator-syriatel"}`}>
                {op === "mtn" ? "MTN" : "Syriatel"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {prefixes[op].map((prefix) => (
                  <span key={prefix} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs font-mono text-foreground">
                    {prefix}
                    <button onClick={() => handleRemovePrefix(op, prefix)} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input type="text" placeholder="09X" value={op === activeTab ? newPrefix : ""}
                  onFocus={() => setActiveTab(op)}
                  onChange={(e) => { setActiveTab(op); setNewPrefix(e.target.value); }}
                  className="text-left h-8 text-xs font-mono flex-1" dir="ltr" maxLength={3} inputMode="numeric" />
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleAddPrefix(op)}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </Section>

        {/* Balance Check Templates */}
        <Section title="أكواد استعلام الرصيد" icon={<Code className="w-4 h-4" />}>
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            {(["mtn", "syriatel"] as Operator[]).map((op) => (
              <div key={op} className="space-y-1.5">
                <label className={`text-xs font-bold ${op === "mtn" ? "text-operator-mtn" : "text-operator-syriatel"}`}>
                  {op === "mtn" ? "MTN" : "Syriatel"}
                </label>
                <Input type="text" value={balanceTemplates[op]}
                  onChange={(e) => setBalanceTemplates({ ...balanceTemplates, [op]: e.target.value })}
                  className="text-left text-xs h-9 font-mono" dir="ltr" />
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">
              المتغيرات: {"{secret}"} {"{serial}"}
            </p>
          </div>
        </Section>

        {/* USSD Transfer Templates */}
        <Section title="أكواد التحويل USSD" icon={<Code className="w-4 h-4" />}>
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            {(["mtn", "syriatel"] as Operator[]).map((op) => (
              <div key={op} className="space-y-1.5">
                <label className={`text-xs font-bold ${op === "mtn" ? "text-operator-mtn" : "text-operator-syriatel"}`}>
                  {op === "mtn" ? "MTN" : "Syriatel"}
                </label>
                <Input type="text" value={templates[op]}
                  onChange={(e) => setTemplates({ ...templates, [op]: e.target.value })}
                  className="text-left text-xs h-9 font-mono" dir="ltr" />
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">
              المتغيرات: {"{phone}"} {"{amount}"} {"{secret}"} {"{serial}"}
            </p>
          </div>
        </Section>

        {/* Amount Presets */}
        <h2 className="text-foreground font-bold mb-3 mt-6">قوائم المبالغ</h2>
        <div className="flex gap-2 mb-4">
          {(["mtn", "syriatel"] as Operator[]).map((op) => (
            <button key={op} onClick={() => setActiveTab(op)}
              className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${
                activeTab === op
                  ? op === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-operator-syriatel-foreground"
                  : "bg-muted text-muted-foreground"
              }`}>
              {op === "mtn" ? "MTN" : "Syriatel"}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground px-1">
            <span className="w-8" />
            <span className="flex-1">الكمية</span>
            <span className="flex-1">السعر (ل.س)</span>
            <span className="w-9" />
          </div>
          {presets[activeTab].map((preset, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="flex flex-col w-8">
                <button onClick={() => handleMovePreset(i, "up")} disabled={i === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleMovePreset(i, "down")} disabled={i === presets[activeTab].length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <Input type="number" value={preset.amount || ""} onChange={(e) => handleChange(i, "amount", e.target.value)}
                placeholder="الكمية" className="flex-1 text-left h-9 text-xs" dir="ltr" inputMode="numeric" />
              <Input type="number" value={preset.price || ""} onChange={(e) => handleChange(i, "price", e.target.value)}
                placeholder="السعر" className="flex-1 text-left h-9 text-xs" dir="ltr" inputMode="numeric" />
              <button onClick={() => handleRemove(i)}
                className="w-9 h-9 flex items-center justify-center text-destructive rounded-md hover:bg-destructive/10">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button onClick={handleAdd}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors text-sm">
            <Plus className="w-4 h-4" />
            إضافة مبلغ
          </button>
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-3 pb-4">
          <Button onClick={handleSave} className="w-full h-12 text-lg font-bold rounded-xl">حفظ</Button>
          <Button onClick={handleReset} variant="outline" className="w-full h-10">إعادة تعيين جميع الإعدادات</Button>
        </div>
      </main>
    </div>
  );
};

// Helper components
const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="mt-4 mb-6 space-y-3">
    <h2 className="text-foreground font-bold flex items-center gap-2">{icon}{title}</h2>
    {children}
  </div>
);

const FieldInput = ({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-muted-foreground">{label}</label>
    <Input type="number" placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-left h-10" dir="ltr" inputMode="numeric" />
  </div>
);

export default Settings;
