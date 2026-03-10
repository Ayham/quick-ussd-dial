import { useState, useEffect, useRef } from "react";

import {
  Plus, Trash2, Key, Code, ArrowUp, ArrowDown, Smartphone, Signal,
  Clock, Copy, AlertTriangle, Database, Settings as SettingsIcon,
  Download, Upload
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
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
import { getDeviceId } from "@/lib/device-id";
import { getHistory } from "@/lib/transfer-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type SettingsTab = "sim" | "codes" | "amounts" | "data";

const Settings = () => {
  const navigate = useNavigate();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("sim");
  const [presets, setPresets] = useState(() => getPresets());
  const [credentials, setCredentials] = useState<OperatorCredentials>(() => getCredentials());
  const [templates, setTemplates] = useState<UssdTemplates>(() => getUssdTemplates());
  const [prefixes, setPrefixes] = useState<OperatorPrefixes>(() => getPrefixes());
  const [simAssignment, setSimAssignment] = useState<SimAssignment>(() => getSimAssignment());
  const [balanceTemplates, setBalanceTemplates] = useState<BalanceCheckTemplates>(() => getBalanceTemplates());
  const [activeOperator, setActiveOperator] = useState<Operator>("mtn");
  const [newPrefix, setNewPrefix] = useState("");

  const deviceId = getDeviceId();

  // Preset handlers
  const handleAdd = () => {
    const updated = { ...presets };
    updated[activeOperator] = [...updated[activeOperator], { amount: 0, price: 0 }];
    setPresets(updated);
  };

  const handleRemove = (index: number) => {
    const updated = { ...presets };
    updated[activeOperator] = updated[activeOperator].filter((_, i) => i !== index);
    setPresets(updated);
  };

  const handleChange = (index: number, field: keyof AmountPreset, value: string) => {
    const updated = { ...presets };
    updated[activeOperator] = updated[activeOperator].map((p, i) =>
      i === index ? { ...p, [field]: Number(value) || 0 } : p
    );
    setPresets(updated);
  };

  const handleMovePreset = (index: number, direction: "up" | "down") => {
    const list = [...presets[activeOperator]];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    [list[index], list[targetIndex]] = [list[targetIndex], list[index]];
    setPresets({ ...presets, [activeOperator]: list });
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

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "sim", label: "الشريحة", icon: <Smartphone className="w-3.5 h-3.5" /> },
    { id: "codes", label: "الأكواد", icon: <Code className="w-3.5 h-3.5" /> },
    { id: "amounts", label: "المبالغ", icon: <SettingsIcon className="w-3.5 h-3.5" /> },
    { id: "license", label: "الترخيص", icon: <Shield className="w-3.5 h-3.5" /> },
    { id: "data", label: "البيانات", icon: <Database className="w-3.5 h-3.5" /> },
  ];

  return (
    <AppLayout title="الإعدادات">

      {/* Settings Tabs */}
      <div className="bg-card border-b border-border px-2 py-2 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSettingsTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-smooth ${
              settingsTab === tab.id
                ? "bg-primary text-primary-foreground shadow-card"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <main className="flex-1 p-4 w-full overflow-y-auto pb-safe" dir="rtl">

        {/* ===== SIM TAB ===== */}
        {settingsTab === "sim" && (
          <div className="space-y-5">
            {/* Credentials */}
            <SectionCard title="بيانات الشريحة" icon={<Key className="w-4 h-4" />}>
              <div className="space-y-3">
                <FieldInput label="الرمز السري لشريحة MTN" value={credentials.mtnSecret}
                  onChange={(v) => setCredentials({ ...credentials, mtnSecret: v })} placeholder="مثال: 20326" />
                <FieldInput label="الرقم السيري لشريحة سيريتيل" value={credentials.syriatelSerial}
                  onChange={(v) => setCredentials({ ...credentials, syriatelSerial: v })} placeholder="مثال: 32362" />
                <FieldInput label="كود الموزع سيريتيل" value={credentials.syriatelDistributor}
                  onChange={(v) => setCredentials({ ...credentials, syriatelDistributor: v })} placeholder="مثال: 640322" />
              </div>
            </SectionCard>

            {/* SIM Assignment */}
            <SectionCard title="تعيين الشريحة" icon={<Smartphone className="w-4 h-4" />}>
              <div className="space-y-4">
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
            </SectionCard>

            {/* Prefixes */}
            <SectionCard title="بادئات الأرقام" icon={<Signal className="w-4 h-4" />}>
              <div className="space-y-4">
                {(["mtn", "syriatel"] as Operator[]).map((op) => (
                  <div key={op} className="space-y-2">
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
                      <Input type="text" placeholder="09X" value={op === activeOperator ? newPrefix : ""}
                        onFocus={() => setActiveOperator(op)}
                        onChange={(e) => { setActiveOperator(op); setNewPrefix(e.target.value); }}
                        className="text-left h-8 text-xs font-mono flex-1" dir="ltr" maxLength={3} inputMode="numeric" />
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleAddPrefix(op)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <Button onClick={handleSave} className="w-full h-11 font-bold rounded-xl">حفظ إعدادات الشريحة</Button>
          </div>
        )}

        {/* ===== CODES TAB ===== */}
        {settingsTab === "codes" && (
          <div className="space-y-5">
            <SectionCard title="أكواد التحويل USSD" icon={<Code className="w-4 h-4" />}>
              <div className="space-y-3">
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
            </SectionCard>

            <SectionCard title="أكواد استعلام الرصيد" icon={<Code className="w-4 h-4" />}>
              <div className="space-y-3">
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
            </SectionCard>

            <Button onClick={handleSave} className="w-full h-11 font-bold rounded-xl">حفظ الأكواد</Button>
          </div>
        )}

        {/* ===== AMOUNTS TAB ===== */}
        {settingsTab === "amounts" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {(["mtn", "syriatel"] as Operator[]).map((op) => (
                <button key={op} onClick={() => setActiveOperator(op)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeOperator === op
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
              {presets[activeOperator].map((preset, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="flex flex-col w-8">
                    <button onClick={() => handleMovePreset(i, "up")} disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleMovePreset(i, "down")} disabled={i === presets[activeOperator].length - 1}
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

            <Button onClick={handleSave} className="w-full h-11 font-bold rounded-xl">حفظ المبالغ</Button>
          </div>
        )}

        {/* ===== LICENSE TAB ===== */}
        {settingsTab === "license" && (
          <div className="space-y-5">
            <SectionCard title="حالة الترخيص" icon={<Shield className="w-4 h-4" />}>
              <div className="space-y-3">
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

                {/* Enter license */}
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
            </SectionCard>
          </div>
        )}

        {/* ===== DATA TAB ===== */}
        {settingsTab === "data" && (
          <div className="space-y-5">
            {/* Backup & Restore */}
            <SectionCard title="النسخ الاحتياطي والاستعادة" icon={<Download className="w-4 h-4" />}>
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  تصدير جميع البيانات المهمة (الإعدادات، الأكواد، المبالغ، البادئات، سجل التحويلات، الرصيد) كملف JSON واستعادتها لاحقاً.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      try {
                        const backup: Record<string, unknown> = {
                          _meta: { version: 1, date: new Date().toISOString(), deviceId },
                          presets: getPresets(),
                          credentials: getCredentials(),
                          ussdTemplates: getUssdTemplates(),
                          balanceTemplates: getBalanceTemplates(),
                          prefixes: getPrefixes(),
                          simAssignment: getSimAssignment(),
                          transferHistory: localStorage.getItem('transfer-history'),
                          savedContacts: localStorage.getItem('saved-contacts'),
                          savedBalances: localStorage.getItem('saved_balances_v1'),
                          license: localStorage.getItem('app_license_v1'),
                          trialStart: localStorage.getItem('app_trial_start_v1'),
                          syncEndpoint: localStorage.getItem('cloud_sync_endpoint_v1'),
                          syncEnabled: localStorage.getItem('cloud_sync_enabled_v1'),
                        };
                        const json = JSON.stringify(backup, null, 2);
                        const blob = new Blob([json], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        toast.success("تم تصدير النسخة الاحتياطية بنجاح");
                      } catch {
                        toast.error("فشل تصدير النسخة الاحتياطية");
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                  >
                    <Download className="w-3.5 h-3.5 ml-1" />
                    تصدير نسخة احتياطية
                  </Button>
                  <Button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.json';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          try {
                            const data = JSON.parse(ev.target?.result as string);
                            if (!data._meta || data._meta.version !== 1) {
                              toast.error("ملف غير صالح أو إصدار غير مدعوم");
                              return;
                            }
                            if (!confirm("سيتم استبدال جميع البيانات الحالية بالنسخة الاحتياطية. هل تريد المتابعة؟")) return;

                            if (data.presets) savePresets(data.presets);
                            if (data.credentials) saveCredentials(data.credentials);
                            if (data.ussdTemplates) saveUssdTemplates(data.ussdTemplates);
                            if (data.balanceTemplates) saveBalanceTemplates(data.balanceTemplates);
                            if (data.prefixes) savePrefixes(data.prefixes);
                            if (data.simAssignment) saveSimAssignment(data.simAssignment);

                            if (data.transferHistory) localStorage.setItem('transfer-history', data.transferHistory);
                            if (data.savedContacts) localStorage.setItem('saved-contacts', data.savedContacts);
                            if (data.savedBalances) localStorage.setItem('saved_balances_v1', data.savedBalances);
                            if (data.license) localStorage.setItem('app_license_v1', data.license);
                            if (data.trialStart) localStorage.setItem('app_trial_start_v1', data.trialStart);
                            if (data.syncEndpoint) localStorage.setItem('cloud_sync_endpoint_v1', data.syncEndpoint);
                            if (data.syncEnabled) localStorage.setItem('cloud_sync_enabled_v1', data.syncEnabled);

                            setPresets(getPresets());
                            setCredentials(getCredentials());
                            setTemplates(getUssdTemplates());
                            setBalanceTemplates(getBalanceTemplates());
                            setPrefixes(getPrefixes());
                            setSimAssignment(getSimAssignment());

                            toast.success("تم استعادة النسخة الاحتياطية بنجاح ✅");
                          } catch {
                            toast.error("فشل قراءة الملف — تأكد أنه ملف نسخة احتياطية صحيح");
                          }
                        };
                        reader.readAsText(file);
                      };
                      input.click();
                    }}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                  >
                    <Upload className="w-3.5 h-3.5 ml-1" />
                    استعادة نسخة احتياطية
                  </Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="إدارة البيانات" icon={<Database className="w-4 h-4" />}>
              <div className="space-y-3">
                {(() => {
                  const allHistory = getHistory();
                  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                  const olderThanMonth = allHistory.filter(r => r.timestamp <= monthAgo).length;
                  const totalAmount = allHistory.filter(r => r.status === "success").reduce((s, r) => s + Number(r.amount), 0);
                  const hasBalance = !!localStorage.getItem('saved_balances_v1');
                  const contacts = (() => { try { const c = localStorage.getItem('saved-contacts'); return c ? JSON.parse(c).length : 0; } catch { return 0; } })();
                  return (
                    <div className="bg-muted rounded-lg divide-y divide-border text-xs">
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-muted-foreground">سجل التحويلات</span>
                        <span className="font-bold text-foreground">{allHistory.length} عملية</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-muted-foreground">إجمالي المبالغ</span>
                        <span className="font-bold text-foreground">{totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-muted-foreground">أقدم من شهر</span>
                        <span className="font-bold text-destructive">{olderThanMonth} عملية</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-muted-foreground">جهات الاتصال</span>
                        <span className="font-bold text-foreground">{contacts}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-muted-foreground">بيانات الرصيد</span>
                        <span className="font-bold text-foreground">{hasBalance ? 'محفوظة' : '—'}</span>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                      try {
                        const historyRaw = localStorage.getItem('transfer-history');
                        if (historyRaw) {
                          const history = JSON.parse(historyRaw);
                          const filtered = history.filter((r: { timestamp: number }) => r.timestamp > monthAgo);
                          const removed = history.length - filtered.length;
                          localStorage.setItem('transfer-history', JSON.stringify(filtered));
                          toast.success(`تم حذف ${removed} عملية أقدم من شهر`);
                        } else {
                          toast.info("لا توجد بيانات للحذف");
                        }
                      } catch { toast.error("خطأ في الحذف"); }
                    }}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                  >
                    <Clock className="w-3.5 h-3.5 ml-1" />
                    حذف أقدم من شهر
                  </Button>
                  <Button
                    onClick={() => {
                      if (confirm("هل أنت متأكد من حذف جميع سجلات التحويل وبيانات الرصيد؟")) {
                        localStorage.removeItem('transfer-history');
                        localStorage.removeItem('saved-contacts');
                        localStorage.removeItem('saved_balances_v1');
                        toast.success("تم حذف جميع البيانات المؤقتة");
                      }
                    }}
                    variant="destructive"
                    size="sm"
                    className="flex-1 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5 ml-1" />
                    حذف الكل
                  </Button>
                </div>
                </div>
            </SectionCard>

            {/* Reset all settings */}
            <SectionCard title="إعادة تعيين" icon={<AlertTriangle className="w-4 h-4" />}>
              <Button onClick={handleReset} variant="outline" className="w-full text-xs">
                إعادة تعيين جميع الإعدادات إلى الافتراضي
              </Button>
              <p className="text-[10px] text-muted-foreground mt-2">
                يعيد البادئات والأكواد والمبالغ والشريحة إلى الإعدادات الافتراضية. لا يؤثر على الترخيص أو البيانات.
              </p>
            </SectionCard>
          </div>
        )}

        <div className="h-6" />
      </main>
    </AppLayout>
  );
};

// Helper components
const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="space-y-3">
    <h2 className="text-foreground font-bold flex items-center gap-2 text-sm">{icon}{title}</h2>
    <div className="bg-card border border-border rounded-2xl p-4 shadow-card">{children}</div>
  </div>
);

const FieldInput = ({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-muted-foreground">{label}</label>
    <Input type="number" placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-left h-11 rounded-xl border-2" dir="ltr" inputMode="numeric" />
  </div>
);

export default Settings;
