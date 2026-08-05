import { useState, useCallback } from "react";

import {
  Plus, Trash2, Key, Code, ArrowUp, ArrowDown, Smartphone, Signal,
  AlertTriangle, Shield, Database, Settings as SettingsIcon,
  Download, Upload, Globe, ChevronDown, Lock, FolderOpen,
  Trash, RotateCw, HardDrive, Info, AlertCircle, CheckCircle,
  Bell, Store,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { setLanguage, getLanguage } from "@/lib/i18n";
import {
  getPresets, savePresets,
  getCredentials, saveCredentials,
  getUssdTemplates, saveUssdTemplates,
  getPrefixes, savePrefixes,
  getSimAssignment, saveSimAssignment,
  getBalanceTemplates, saveBalanceTemplates,
  resetAllSettings,
  type Operator, type AmountPreset, type OperatorCredentials,
  type UssdTemplates, type OperatorPrefixes, type SimSlot, type SimAssignment,
  type BalanceCheckTemplates,
} from "@/lib/ussd-profiles";
import { getHistory } from "@/lib/transfer-history";
import { getActualDeductedAmount } from "@/lib/amount-utils";
import { getBusinessName, saveBusinessName } from "@/lib/onboarding";
import {
  getLowBalanceThresholds,
  saveLowBalanceThresholds,
  type LowBalanceThresholds,
} from "@/lib/balance-tracking";
import {
  getSuggestionSettings,
  saveSuggestionSettings,
  type SuggestionSettings,
  type SuggestionSource,
} from "@/lib/use-transfer-suggestions";
import {
  getAmountDisplayStyle,
  saveAmountDisplayStyle,
  type AmountDisplayStyle,
} from "@/lib/amount-display";
import {
  createBackup, validateBackup, restoreBackup,
  getBackupPreview, cleanOldHistory, deleteAllHistory,
  deleteAllData, getStorageStats, getFormattedSize,
} from "@/lib/backup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type SettingsSection = "sim" | "codes" | "amounts" | "thresholds" | "suggestions" | "data" | "language" | "business";

const Settings = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<SettingsSection | null>(null);
  const [presets, setPresets] = useState(() => getPresets());
  const [credentials, setCredentials] = useState<OperatorCredentials>(() => getCredentials());
  const [templates, setTemplates] = useState<UssdTemplates>(() => getUssdTemplates());
  const [prefixes, setPrefixes] = useState<OperatorPrefixes>(() => getPrefixes());
  const [simAssignment, setSimAssignment] = useState<SimAssignment>(() => getSimAssignment());
  const [balanceTemplates, setBalanceTemplates] = useState<BalanceCheckTemplates>(() => getBalanceTemplates());
  const [activeOperator, setActiveOperator] = useState<Operator>("mtn");
  const [newPrefix, setNewPrefix] = useState("");
  const [language, setLanguageState] = useState(() => getLanguage());
  const [suggestionSettings, setSuggestionSettings] = useState<SuggestionSettings>(() => getSuggestionSettings());
  const [thresholds, setThresholds] = useState<LowBalanceThresholds>(() => getLowBalanceThresholds());
  const [amountDisplayStyle, setAmountDisplayStyle] = useState<AmountDisplayStyle>(() => getAmountDisplayStyle());
  const [businessName, setBusinessName] = useState(() => getBusinessName());

  const [backupPassword, setBackupPassword] = useState("");
  const [backupWithPassword, setBackupWithPassword] = useState(false);
  const [restorePreview, setRestorePreview] = useState<ReturnType<typeof getBackupPreview> | null>(null);
  const [restoreErrors, setRestoreErrors] = useState<string[]>([]);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [cleanupAge, setCleanupAge] = useState<number>(30 * 24 * 60 * 60 * 1000);
  const [storageStats, setStorageStats] = useState(() => getStorageStats());
  const [showBackupInfo, setShowBackupInfo] = useState(false);

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
      toast.error("الرجاء إدخال الرقم السري لشريحة سيريتيل");
      return;
    }
    if (!credentials.syriatelDistributor.trim()) {
      toast.error("الرجاء إدخال كود الموزع سيريتيل");
      return;
    }
    savePresets(presets);
    saveCredentials(credentials);
    saveUssdTemplates(templates);
    savePrefixes(prefixes);
    saveSimAssignment(simAssignment);
    saveBalanceTemplates(balanceTemplates);
    saveLowBalanceThresholds(thresholds);
    toast.success("تم الحفظ بنجاح");
    navigate("/");
  };

  const handleLanguageChange = (newLang: 'ar' | 'en') => {
    setLanguage(newLang);
    setLanguageState(newLang);
    toast.success(t('common.success'));
  };

  const handleSaveBusinessName = () => {
    saveBusinessName(businessName);
    toast.success("تم حفظ الاسم التجاري");
  };

  const allHistory = getHistory();
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const olderThanMonth = allHistory.filter(r => r.timestamp <= monthAgo).length;
  const totalAmount = allHistory.filter(r => r.status === "success").reduce((s, r) => s + getActualDeductedAmount(r.operator, Number(r.amount)), 0);


  const handleExportBackup = () => {
    try {
      const json = backupWithPassword ? createBackup(backupPassword || undefined) : createBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Raseed_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("تم إنشاء النسخة الاحتياطية بنجاح ✅");
      setStorageStats(getStorageStats());
    } catch {
      toast.error("فشل إنشاء النسخة الاحتياطية");
    }
  };

  const handleImportBackup = () => {
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
          const result = validateBackup(data);
          if (result.preview) {
            setRestorePreview(result.preview);
            setRestoreErrors(result.errors);
          } else {
            toast.error("ملف غير صالح أو إصدار غير مدعوم");
          }
        } catch {
          toast.error("فشل قراءة الملف — تأكد أنه ملف نسخة احتياطية صحيح");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleDoRestore = () => {
    if (!restorePreview) return;
    setRestoreLoading(true);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { setRestoreLoading(false); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          const result = restoreBackup(data, restorePassword || undefined);
          if (result.success) {
            setPresets(getPresets());
            setCredentials(getCredentials());
            setTemplates(getUssdTemplates());
            setBalanceTemplates(getBalanceTemplates());
            setPrefixes(getPrefixes());
            setSimAssignment(getSimAssignment());
            setStorageStats(getStorageStats());
            toast.success("تم استعادة النسخة الاحتياطية بنجاح ✅");
            setRestorePreview(null);
            setRestoreErrors([]);
            setRestorePassword("");
          } else {
            toast.error(result.error || "فشل الاستعادة");
          }
        } catch {
          toast.error("فشل قراءة الملف");
        }
        setRestoreLoading(false);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleResetSettings = () => {
    resetAllSettings();
    toast.success("تم إعادة الإعدادات إلى الافتراضي");
    setPresets(getPresets());
    setCredentials(getCredentials());
    setTemplates(getUssdTemplates());
    setBalanceTemplates(getBalanceTemplates());
    setPrefixes(getPrefixes());
    setSimAssignment(getSimAssignment());
  };

  const handleDeleteAllData = () => {
    deleteAllData();
    setPresets(getPresets());
    setCredentials(getCredentials());
    setTemplates(getUssdTemplates());
    setBalanceTemplates(getBalanceTemplates());
    setPrefixes(getPrefixes());
    setSimAssignment(getSimAssignment());
    setStorageStats(getStorageStats());
    toast.success("تم حذف جميع البيانات");
  };

  const handleCleanup = (ageMs: number) => {
    const result = cleanOldHistory(ageMs);
    setStorageStats(getStorageStats());
    if (result.removed > 0) {
      toast.success(`تم حذف ${result.removed} عملية قديمة`);
    } else {
      toast.info("لا توجد عمليات قديمة للحذف");
    }
  };

  const handleDeleteAllTransfers = () => {
    const result = deleteAllHistory();
    setStorageStats(getStorageStats());
    toast.success(`تم حذف ${result.removed} عملية تحويل`);
  };

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode; description: string }[] = [
    { id: "sim", label: "الشريحة والاتصال", icon: <Smartphone className="w-5 h-5" />, description: "بيانات الشريحة وبادئات الأرقام" },
    { id: "business", label: "الملف التجاري", icon: <Store className="w-5 h-5" />, description: "الاسم التجاري المعروض في التطبيق" },
{ id: "codes", label: "أكواد USSD", icon: <Code className="w-5 h-5" />, description: "أكواد التحويل واستعلام الرصيد" },
    { id: "amounts", label: "المبالغ", icon: <SettingsIcon className="w-5 h-5" />, description: "قائمة مبالغ التحويل" },
    { id: "thresholds", label: "تنبيه الرصيد", icon: <Bell className="w-5 h-5" />, description: "الحد الأدنى للرصيد والتنبيهات" },
    { id: "suggestions", label: "اقتراحات العملاء", icon: <HardDrive className="w-5 h-5" />, description: "إعدادات اقتراحات العملاء" },
    { id: "data", label: "البيانات", icon: <Database className="w-5 h-5" />, description: "النسخ الاحتياطي والإدارة والاستعادة" },
    { id: "language", label: "اللغة", icon: <Globe className="w-5 h-5" />, description: "اختيار واجهة التطبيق" },
  ];

  return (
    <AppLayout title="الإعدادات" hideNav>
      <main className="flex-1 w-full max-w-lg mx-auto p-3 space-y-2.5 pb-8" dir="rtl">

        {sections.map((section) => {
          const isOpen = activeSection === section.id;
          return (
            <div key={section.id} className="animate-slide-up">
              <button
                onClick={() => setActiveSection(isOpen ? null : section.id)}
                className={cn(
                  "w-full flex items-center gap-3.5 p-4 rounded-2xl transition-all duration-200",
                  isOpen
                    ? "bg-primary/10 border-2 border-primary/20 shadow-sm"
                    : "bg-white border border-border/60 shadow-sm hover:bg-muted/50 active:scale-[0.98]"
                )}
              >
                <div className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all",
                  isOpen ? "bg-primary text-white shadow-sm" : "bg-muted text-muted-foreground"
                )}>
                  {section.icon}
                </div>
                <div className="text-right flex-1">
                  <span className={cn("text-sm font-bold block", isOpen ? "text-primary" : "text-foreground")}>{section.label}</span>
                  <span className="text-[11px] text-muted-foreground">{section.description}</span>
                </div>
                <ChevronDown className={cn(
                  "w-5 h-5 transition-transform duration-200",
                  isOpen ? "text-primary rotate-180" : "text-muted-foreground"
                )} />
              </button>

              {isOpen && (
                <div className="mt-2.5 px-1 space-y-4 animate-slide-down">
                  {/* SIM SECTION */}
                  {section.id === "sim" && (
                    <>
                      <SettingsCard title="بيانات الشريحة" icon={<Key className="w-4 h-4" />}>
                        <div className="space-y-3">
                          <FieldInput label="الرمز السري لشريحة MTN" value={credentials.mtnSecret}
                            onChange={(v) => setCredentials({ ...credentials, mtnSecret: v })} placeholder="مثال: 20326" />
                          <FieldInput label="الرقم السري لشريحة سيريتيل" value={credentials.syriatelSerial}
                            onChange={(v) => setCredentials({ ...credentials, syriatelSerial: v })} placeholder="مثال: 32362" />
                          <FieldInput label="كود الموزع سيريتيل" value={credentials.syriatelDistributor}
                            onChange={(v) => setCredentials({ ...credentials, syriatelDistributor: v })} placeholder="مثال: 640322" />
                        </div>
                      </SettingsCard>

                      <SettingsCard title="تعيين الشريحة" icon={<Smartphone className="w-4 h-4" />}>
                        <div className="space-y-4">
                          {(["mtn", "syriatel"] as Operator[]).map((op) => (
                            <div key={op} className="space-y-2">
                              <p className={cn("font-bold text-sm", op === "mtn" ? "text-operator-mtn" : "text-operator-syriatel")}>
                                {op === "mtn" ? "MTN" : "Syriatel"}
                              </p>
                              <div className="flex gap-2">
                                {([0, 1] as SimSlot[]).map((slot) => (
                                  <button
                                    key={slot}
                                    onClick={() => setSimAssignment({ ...simAssignment, [op]: slot })}
                                    className={cn(
                                      "flex-1 py-3 rounded-xl text-sm font-bold transition-all border-2 active:scale-95",
                                      simAssignment[op] === slot
                                        ? op === "mtn"
                                          ? "border-operator-mtn bg-operator-mtn/10 text-operator-mtn"
                                          : "border-operator-syriatel bg-operator-syriatel/10 text-operator-syriatel"
                                        : "border-border/60 text-muted-foreground bg-white"
                                    )}
                                  >
                                    SIM {slot + 1}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </SettingsCard>

                      <SettingsCard title="بادئات الأرقام" icon={<Signal className="w-4 h-4" />}>
                        <div className="space-y-4">
                          {(["mtn", "syriatel"] as Operator[]).map((op) => (
                            <div key={op} className="space-y-2">
                              <p className={cn("font-bold text-sm", op === "mtn" ? "text-operator-mtn" : "text-operator-syriatel")}>
                                {op === "mtn" ? "MTN" : "Syriatel"}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {prefixes[op].map((prefix) => (
                                  <span key={prefix} className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-muted text-xs font-mono text-foreground shadow-sm">
                                    {prefix}
                                    <button onClick={() => handleRemovePrefix(op, prefix)} className="text-destructive hover:text-destructive/80 p-0.5">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <Input type="text" placeholder="09X" value={op === activeOperator ? newPrefix : ""}
                                  onFocus={() => setActiveOperator(op)}
                                  onChange={(e) => { setActiveOperator(op); setNewPrefix(e.target.value); }}
                                  className="text-left h-9 text-xs font-mono flex-1 rounded-xl" dir="ltr" maxLength={3} inputMode="numeric" />
                                <Button size="sm" variant="outline" className="h-9 text-xs rounded-xl" onClick={() => handleAddPrefix(op)}>
                                  <Plus className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </SettingsCard>

                      <Button onClick={handleSave} className="w-full h-12 font-bold rounded-xl shadow-sm mt-2">حفظ إعدادات الشريحة</Button>
                    </>
                  )}

                  {/* BUSINESS SECTION */}
                  {section.id === "business" && (
                    <>
                      <SettingsCard title="الاسم التجاري" icon={<Store className="w-4 h-4" />}>
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            يظهر الاسم التجاري كعنوان رئيسي في الصفحة الرئيسية بدلاً من "تحويل رصيد"
                          </p>
                          <Input
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            placeholder="مثال: مكتب الرصيد"
                            className="h-11 rounded-xl bg-background/50 text-base"
                          />
                        </div>
                      </SettingsCard>
                      <Button onClick={handleSaveBusinessName} className="w-full h-12 font-bold rounded-xl shadow-sm mt-2">حفظ الاسم التجاري</Button>
                    </>
                  )}

                  {/* CODES SECTION */}
                  {section.id === "codes" && (
                    <>
                      <SettingsCard title="أكواد التحويل USSD" icon={<Code className="w-4 h-4" />}>
                        <div className="space-y-3">
                          {(["mtn", "syriatel"] as Operator[]).map((op) => (
                            <div key={op} className="space-y-1.5">
                              <label className={cn("text-xs font-bold", op === "mtn" ? "text-operator-mtn" : "text-operator-syriatel")}>
                                {op === "mtn" ? "MTN" : "Syriatel"}
                              </label>
                              <Input type="text" value={templates[op]}
                                onChange={(e) => setTemplates({ ...templates, [op]: e.target.value })}
                                className="text-left text-xs h-10 font-mono rounded-xl bg-background/50" dir="ltr" />
                            </div>
                          ))}
                          <div className="text-[10px] text-muted-foreground bg-muted/60 rounded-xl p-3 border border-border/50">
                            المتغيرات: <span className="font-mono bg-white px-1.5 py-0.5 rounded">{`{phone}`}</span> <span className="font-mono bg-white px-1.5 py-0.5 rounded">{`{amount}`}</span> <span className="font-mono bg-white px-1.5 py-0.5 rounded">{`{secret}`}</span> <span className="font-mono bg-white px-1.5 py-0.5 rounded">{`{serial}`}</span>
                          </div>
                        </div>
                      </SettingsCard>

                      <SettingsCard title="أكواد استعلام الرصيد" icon={<Code className="w-4 h-4" />}>
                        <div className="space-y-3">
                          {(["mtn", "syriatel"] as Operator[]).map((op) => (
                            <div key={op} className="space-y-1.5">
                              <label className={cn("text-xs font-bold", op === "mtn" ? "text-operator-mtn" : "text-operator-syriatel")}>
                                {op === "mtn" ? "MTN" : "Syriatel"}
                              </label>
                              <Input type="text" value={balanceTemplates[op]}
                                onChange={(e) => setBalanceTemplates({ ...balanceTemplates, [op]: e.target.value })}
                                className="text-left text-xs h-10 font-mono rounded-xl bg-background/50" dir="ltr" />
                            </div>
                          ))}
                          <div className="text-[10px] text-muted-foreground bg-muted/60 rounded-xl p-3 border border-border/50">
                            المتغيرات: <span className="font-mono bg-white px-1.5 py-0.5 rounded">{`{secret}`}</span> <span className="font-mono bg-white px-1.5 py-0.5 rounded">{`{serial}`}</span>
                          </div>
                        </div>
                      </SettingsCard>

                      <Button onClick={handleSave} className="w-full h-12 font-bold rounded-xl shadow-sm mt-2">حفظ الأكواد</Button>
                    </>
                  )}

                  {/* AMOUNTS SECTION */}
                  {section.id === "amounts" && (
                    <>
                      <div className="flex gap-2 p-1.5 bg-muted/80 rounded-xl border border-border/50">
                        {(["mtn", "syriatel"] as Operator[]).map((op) => (
                          <button key={op} onClick={() => setActiveOperator(op)}
                            className={cn(
                              "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all",
                              activeOperator === op
                                ? op === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground shadow-sm" : "bg-operator-syriatel text-white shadow-sm"
                                : "text-muted-foreground"
                            )}>
                            {op === "mtn" ? "MTN" : "Syriatel"}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground px-1 font-medium">
                          <span className="w-8" />
                          <span className="flex-1">الكمية</span>
                          <span className="flex-1">السعر (ل.س)</span>
                          <span className="w-10" />
                        </div>
                        {presets[activeOperator].map((preset, i) => (
                          <div key={i} className="flex items-center gap-1.5 bg-white border border-border/60 rounded-xl p-1.5 shadow-sm">
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
                              placeholder="الكمية" className="flex-1 text-left h-9 text-xs rounded-lg bg-background/50" dir="ltr" inputMode="numeric" />
                            <Input type="number" value={preset.price || ""} onChange={(e) => handleChange(i, "price", e.target.value)}
                              placeholder="السعر" className="flex-1 text-left h-9 text-xs rounded-lg bg-background/50" dir="ltr" inputMode="numeric" />
                            <button onClick={() => handleRemove(i)}
                              className="w-9 h-9 flex items-center justify-center text-destructive rounded-lg hover:bg-destructive/10">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button onClick={handleAdd}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors text-sm active:scale-[0.98] bg-white">
                          <Plus className="w-4 h-4" />
                          إضافة مبلغ
                        </button>
                      </div>

                      <SettingsCard title="طريقة عرض المبالغ" icon={<SettingsIcon className="w-4 h-4" />}>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => { setAmountDisplayStyle("grid"); saveAmountDisplayStyle("grid"); }}
                            className={cn(
                              "py-3.5 rounded-xl text-sm font-bold border-2 transition-all active:scale-95",
                              amountDisplayStyle === "grid"
                                ? "border-primary bg-primary/10 text-primary shadow-sm"
                                : "border-border/60 text-muted-foreground bg-white hover:border-primary/30"
                            )}
                          >
                            شبكة (Grid)
                          </button>
                          <button
                            onClick={() => { setAmountDisplayStyle("horizontal"); saveAmountDisplayStyle("horizontal"); }}
                            className={cn(
                              "py-3.5 rounded-xl text-sm font-bold border-2 transition-all active:scale-95",
                              amountDisplayStyle === "horizontal"
                                ? "border-primary bg-primary/10 text-primary shadow-sm"
                                : "border-border/60 text-muted-foreground bg-white hover:border-primary/30"
                            )}
                          >
                            تمرير أفقي (Horizontal)
                          </button>
                        </div>
                      </SettingsCard>

                      <Button onClick={handleSave} className="w-full h-12 font-bold rounded-xl shadow-sm mt-2">حفظ المبالغ</Button>
                    </>
                  )}

                  {/* SUGGESTIONS SECTION */}
                  {section.id === "suggestions" && (
                    <>
                      <SettingsCard title="اقتراحات العملاء" icon={<HardDrive className="w-4 h-4" />}>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground">تفعيل اقتراحات العملاء</span>
                            <Switch
                              checked={suggestionSettings.enabled}
                              onCheckedChange={(v) => setSuggestionSettings({ ...suggestionSettings, enabled: v })}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">الحد الأقصى للاقتراحات</label>
                            <div className="flex gap-2">
                              {[2, 5, 10, 15].map((n) => (
                                <button
                                  key={n}
                                  onClick={() => setSuggestionSettings({ ...suggestionSettings, maxSuggestions: n })}
                                  className={cn(
                                    "flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all",
                                    suggestionSettings.maxSuggestions === n
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border/60 text-muted-foreground bg-white hover:border-primary/30"
                                  )}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">مصدر الاقتراحات</label>
                            <div className="space-y-1.5">
                              {([
                                { value: "both" as SuggestionSource, label: "التحويلات الأخيرة + جهات الاتصال", desc: "مزيج من السجل وجهات الاتصال المحفوظة" },
                                { value: "history" as SuggestionSource, label: "التحويلات الأخيرة فقط", desc: "من سجل التحويلات الناجحة فقط" },
                                { value: "contacts" as SuggestionSource, label: "جهات الاتصال المحفوظة فقط", desc: "من جهات الاتصال على الجهاز فقط" },
                              ]).map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => setSuggestionSettings({ ...suggestionSettings, source: opt.value })}
                                  className={cn(
                                    "w-full flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-start",
                                    suggestionSettings.source === opt.value
                                      ? "border-primary bg-primary/10"
                                      : "border-border/60 bg-white hover:border-primary/30"
                                  )}
                                >
                                  <span className={cn(
                                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                    suggestionSettings.source === opt.value
                                      ? "border-primary bg-primary"
                                      : "border-border bg-white"
                                  )}>
                                    {suggestionSettings.source === opt.value && (
                                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                                    )}
                                  </span>
                                  <span className="flex flex-col">
                                    <span className={cn(
                                      "text-sm font-bold",
                                      suggestionSettings.source === opt.value ? "text-primary" : "text-foreground"
                                    )}>
                                      {opt.label}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">عرض السعر الأخير</span>
                            <Switch
                              checked={suggestionSettings.showLastPrice}
                              onCheckedChange={(v) => setSuggestionSettings({ ...suggestionSettings, showLastPrice: v })}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">عرض عدد مرات التحويل</span>
                            <Switch
                              checked={suggestionSettings.showCount}
                              onCheckedChange={(v) => setSuggestionSettings({ ...suggestionSettings, showCount: v })}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">عرض وقت آخر تحويل</span>
                            <Switch
                              checked={suggestionSettings.showLastTime}
                              onCheckedChange={(v) => setSuggestionSettings({ ...suggestionSettings, showLastTime: v })}
                            />
                          </div>
                        </div>
                      </SettingsCard>
                      <Button onClick={() => { saveSuggestionSettings(suggestionSettings); toast.success("تم حفظ إعدادات الاقتراحات"); }} className="w-full h-12 font-bold rounded-xl shadow-sm" variant="outline">
                        حفظ إعدادات الاقتراحات
                      </Button>
                    </>
                  )}

                  {/* THRESHOLDS SECTION */}
                  {section.id === "thresholds" && (
                    <>
                      <SettingsCard title="الحد الأدنى للرصيد" icon={<Bell className="w-4 h-4" />}>
                        <div className="space-y-4">
                          <p className="text-xs text-muted-foreground">
                            عند وصول الرصيد إلى الحد الأدنى أو أقل، سيظهر تنبيه في صفحة الرصيد
                          </p>
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-operator-mtn">MTN</label>
                              <Input type="number" value={thresholds.mtn || ""}
                                onChange={(e) => setThresholds({ ...thresholds, mtn: Number(e.target.value) || 0 })}
                                placeholder="10000"
                                className="text-left h-11 rounded-xl border-2 bg-background/50" dir="ltr" inputMode="numeric" />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-operator-syriatel">Syriatel</label>
                              <Input type="number" value={thresholds.syriatel || ""}
                                onChange={(e) => setThresholds({ ...thresholds, syriatel: Number(e.target.value) || 0 })}
                                placeholder="10000"
                                className="text-left h-11 rounded-xl border-2 bg-background/50" dir="ltr" inputMode="numeric" />
                            </div>
                          </div>
                        </div>
                      </SettingsCard>
                      <Button onClick={handleSave} className="w-full h-12 font-bold rounded-xl shadow-sm mt-2">حفظ التنبيهات</Button>
                    </>
                  )}

                   {/* DATA SECTION */}
                  {section.id === "data" && (
                    <>
                      {/* Backup & Restore */}
                      <SettingsCard title="النسخ الاحتياطي والاستعادة" icon={<Download className="w-4 h-4" />}>
                        <div className="space-y-3">
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            إنشاء نسخة احتياطية مشفرة لجميع الإعدادات والأكواد والمبالغ وسجل التحويلات
                          </p>

                          <div className="bg-muted/40 rounded-xl p-3.5 space-y-2.5 border border-border/40">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">البيانات المشمولة</p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                              <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500" /> إعدادات التطبيق</span>
                              <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500" /> أكواد USSD</span>
                              <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500" /> المبالغ الجاهزة</span>
                              <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500" /> البادئات</span>
                              <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500" /> خرائط الشريحة</span>
                              <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500" /> قوالب الرصيد</span>
                              <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500" /> سجل التحويلات</span>
                              <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500" /> بيانات الرصيد</span>
                              <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500" /> الاسم التجاري</span>
                            </div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-2 pt-2 border-t border-border/40">المستبعدة</p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                              <span className="flex items-center gap-1.5"><Trash2 className="w-3 h-3 text-destructive" /> مفتاح الترخيص</span>
                              <span className="flex items-center gap-1.5"><Trash2 className="w-3 h-3 text-destructive" /> معرف الجهاز</span>
                              <span className="flex items-center gap-1.5"><Trash2 className="w-3 h-3 text-destructive" /> حالة التفعيل</span>
                              <span className="flex items-center gap-1.5"><Trash2 className="w-3 h-3 text-destructive" /> بيانات تسجيل الدخول</span>
                              <span className="flex items-center gap-1.5"><Trash2 className="w-3 h-3 text-destructive" /> بيانات Supabase</span>
                              <span className="flex items-center gap-1.5"><Trash2 className="w-3 h-3 text-destructive" /> سجلات الأخطاء</span>
                              <span className="flex items-center gap-1.5"><Trash2 className="w-3 h-3 text-destructive" /> بيانات الشرائح السرية</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                              <input type="checkbox" checked={backupWithPassword}
                                onChange={(e) => setBackupWithPassword(e.target.checked)}
                                className="w-4 h-4 accent-primary" />
                              <Shield className="w-3.5 h-3.5" />
                              تشفير النسخة بكلمة مرور
                            </label>
                            {backupWithPassword && (
                              <Input type="password" placeholder="أدخل كلمة المرور" value={backupPassword}
                                onChange={(e) => setBackupPassword(e.target.value)}
                                className="text-right h-10 rounded-xl bg-background/50 text-sm" />
                            )}
                          </div>

                          <div className="flex gap-2">
                            <Button onClick={handleExportBackup} variant="outline" size="sm"
                              className="flex-1 text-xs h-10 rounded-xl">
                              <Download className="w-3.5 h-3.5 me-1" />
                              إنشاء نسخة احتياطية
                            </Button>
                            <Button onClick={handleImportBackup} variant="outline" size="sm"
                              className="flex-1 text-xs h-10 rounded-xl">
                              <Upload className="w-3.5 h-3.5 me-1" />
                              استعادة
                            </Button>
                          </div>
                        </div>
                      </SettingsCard>

                      {/* Restore Preview */}
                      {restorePreview && (
                        <SettingsCard title="معاينة النسخة الاحتياطية" icon={<FolderOpen className="w-4 h-4" />}>
                          <div className="space-y-3">
                            <div className="bg-muted/40 rounded-xl p-3 space-y-2 text-xs border border-border/40">
                              <div className="flex justify-between"><span className="text-muted-foreground">الإصدار</span><span className="font-bold">{restorePreview.backupVersion}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">التاريخ</span><span className="font-bold">{restorePreview.createdAt}</span></div>
                              <div className="flex justify-between items-center"><span className="text-muted-foreground">إصدار التطبيق</span><span className={cn("font-bold", restorePreview.appVersion !== "0.4.5" ? "text-accent" : "")}>{restorePreview.appVersion}</span></div>
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 text-xs"><CheckCircle className="w-3.5 h-3.5 text-green-500" /><span>{restorePreview.presetsCount} مبالغ جاهزة</span></div>
                              <div className="flex items-center gap-2 text-xs"><CheckCircle className="w-3.5 h-3.5 text-green-500" /><span>{restorePreview.transferCount} عملية تحويل</span></div>
                              <div className="flex items-center gap-2 text-xs"><CheckCircle className="w-3.5 h-3.5 text-green-500" /><span>{restorePreview.balanceEntries} إدخال رصيد</span></div>
                            </div>
                            {restoreErrors.length > 0 && (
                              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-xs space-y-1">
                                {restoreErrors.map((err, i) => (
                                  <p key={i} className="text-destructive flex items-center gap-1.5"><AlertCircle className="w-3 h-3" />{err}</p>
                                ))}
                              </div>
                            )}
                            {restorePreview.appVersion !== "0.4.5" && (
                              <p className="text-[11px] text-accent bg-accent/10 rounded-xl p-2.5 border border-accent/20">
                                ⚠️ تم إنشاء هذه النسخة بإصدار مختلف من التطبيق. قد تختلف بعض الإعدادات.
                              </p>
                            )}
                            <div className="flex gap-2">
                              <Button onClick={() => { setRestorePreview(null); setRestoreErrors([]); setRestorePassword(""); }}
                                variant="outline" size="sm" className="flex-1 text-xs h-10 rounded-xl">إلغاء</Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" className="flex-1 text-xs h-10 rounded-xl font-bold">استعادة</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>تأكيد الاستعادة</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      سيتم استبدال جميع البيانات الحالية بالنسخة الاحتياطية. هذا الإجراء لا يمكن التراجع عنه.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDoRestore} disabled={restoreLoading}>
                                      {restoreLoading ? "جاري الاستعادة..." : "استعادة"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </SettingsCard>
                      )}

                      {/* Data Management */}
                      <SettingsCard title="إدارة البيانات" icon={<Database className="w-4 h-4" />}>
                        <div className="space-y-3">
                          <div className="bg-muted/60 rounded-xl divide-y divide-border/60 border border-border/50 text-xs">
                            <InfoRow label="سجل التحويلات" value={`${allHistory.length} عملية`} />
                            <InfoRow label="إجمالي التحويل" value={`${totalAmount.toLocaleString()} ل.س`} />
                            <InfoRow label="آخر عملية" value={allHistory.length > 0 ? `منذ ${getTimeSince(allHistory[0].timestamp)}` : "—"} />
                            <InfoRow label="العمليات القديمة" value={`${olderThanMonth} (>شهر)`} valueClassName={olderThanMonth > 0 ? "text-destructive" : undefined} />
                            <InfoRow label="مستوى التخزين" value={getFormattedSize(storageStats.totalBytes)} />
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1 text-xs h-10 rounded-xl"
                              onClick={() => setActiveSection("data")}>
                              إدارة السجل
                            </Button>
                          </div>
                        </div>
                      </SettingsCard>

                      {/* Cleanup */}
                      <SettingsCard title="تنظيف البيانات" icon={<Trash className="w-4 h-4" />}>
                        <div className="space-y-3">
                          <p className="text-[11px] text-muted-foreground">حذف سجلات التحويلات القديمة مع الاحتفاظ بالبيانات المهمة</p>
                          <div className="space-y-2">
                            {([
                              { label: "أقدم من شهر (30 يوم)", ms: 30 * 24 * 60 * 60 * 1000 },
                              { label: "أقدم من 3 أشهر (90 يوم)", ms: 90 * 24 * 60 * 60 * 1000 },
                              { label: "أقدم من سنة (365 يوم)", ms: 365 * 24 * 60 * 60 * 1000 },
                            ]).map((option) => (
                              <button key={option.ms} onClick={() => handleCleanup(option.ms)}
                                className={cn(
                                  "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-sm",
                                  cleanupAge === option.ms
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border/60 bg-white text-foreground hover:border-primary/30"
                                )}>
                                <span>{option.label}</span>
                                {cleanupAge === option.ms && <CheckCircle className="w-4 h-4" />}
                              </button>
                            ))}
                          </div>
                          <div className="border-t border-border/40 pt-3 space-y-2">
                            <p className="text-[11px] font-bold text-destructive">مناطق خطر</p>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" className="w-full text-xs h-10 rounded-xl">
                                  <Trash2 className="w-3.5 h-3.5 me-1" />
                                  حذف جميع سجلات التحويلات
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>حذف جميع التحويلات؟</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    سيتم حذف جميع سجلات التحويلات وعدم إمكانية استرجاعها. هذا الإجراء لا يمكن التراجع عنه.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                  <AlertDialogAction onClick={handleDeleteAllTransfers} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    حذف الكل
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </SettingsCard>

                      {/* Advanced Settings */}
                      <SettingsCard title="إعدادات متقدمة" icon={<AlertTriangle className="w-4 h-4" />} variant="warning">
                        <div className="space-y-3">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" className="w-full text-xs h-10 rounded-xl">
                                <RotateCw className="w-3.5 h-3.5 me-1" />
                                إعادة إعدادات التطبيق
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>إعادة تعيين الإعدادات؟</AlertDialogTitle>
                                <AlertDialogDescription>
                                  سيتم إعادة جميع الإعدادات إلى القيم الافتراضية (الأكواد، المبالغ، البادئات، الشريحة). لن يتم حذف سجل التحويلات أو بيانات الرصيد أو بيانات الترخيص.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={handleResetSettings}>إعادة التعيين</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          <div className="border-t border-border/40 pt-3">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-full text-xs h-10 rounded-xl">
                                  <Trash2 className="w-3.5 h-3.5 me-1" />
                                  حذف جميع البيانات
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>حذف جميع بيانات التطبيق؟</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    سيتم حذف جميع البيانات بما في ذلك سجل التحويلات والإعدادات وجهات الاتصال وبيانات الرصيد. هذا الإجراء لا يمكن التراجع عنه. اكتب <b>RESET</b> لتأكيد الحذف.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="py-2">
                                  <Input placeholder="اكتب RESET للتأكيد"
                                    onChange={(e) => { /* controlled for confirmation check */ }}
                                    className="text-right h-11 rounded-xl border-2 border-destructive/30 focus:border-destructive"
                                    dir="ltr" />
                                </div>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                  <AlertDialogAction onClick={handleDeleteAllData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    حذف جميع البيانات
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </SettingsCard>
                    </>
                  )}

                  {/* LANGUAGE SECTION */}
                  {section.id === "language" && (
                    <SettingsCard title="اختر اللغة" icon={<Globe className="w-4 h-4" />}>
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">سيتم تطبيق التغيير فوراً</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleLanguageChange('ar')}
                            className={cn(
                              "py-4 rounded-xl text-sm font-bold transition-all border-2 active:scale-95",
                              language === 'ar'
                                ? "bg-primary text-white border-primary shadow-sm"
                                : "bg-white text-foreground border-border/60 hover:border-primary/30"
                            )}
                          >
                            العربية
                          </button>
                          <button
                            onClick={() => handleLanguageChange('en')}
                            className={cn(
                              "py-4 rounded-xl text-sm font-bold transition-all border-2 active:scale-95",
                              language === 'en'
                                ? "bg-primary text-white border-primary shadow-sm"
                                : "bg-white text-foreground border-border/60 hover:border-primary/30"
                            )}
                          >
                            English
                          </button>
                        </div>
                      </div>
                    </SettingsCard>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </AppLayout>
  );
};

function getTimeSince(timestamp: number): string {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} س`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

const SettingsCard = ({ title, icon, children, variant }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "warning";
}) => (
  <div className={cn(
    "bg-white border rounded-2xl p-4.5 shadow-sm space-y-3.5",
    variant === "warning" ? "border-accent/30" : "border-border/60"
  )}>
    <h3 className={cn(
      "font-bold flex items-center gap-2 text-sm",
      variant === "warning" ? "text-accent" : "text-foreground"
    )}>
      <span className={cn(
        "w-7 h-7 rounded-lg flex items-center justify-center",
        variant === "warning" ? "bg-accent/10" : "bg-primary/10"
      )}>
        {icon}
      </span>
      {title}
    </h3>
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
      className="text-left h-11 rounded-xl border-2 bg-background/50" dir="ltr" inputMode="numeric" />
  </div>
);

const InfoRow = ({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) => (
  <div className="flex items-center justify-between px-3.5 py-2.5">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn("font-bold text-foreground", valueClassName)}>{value}</span>
  </div>
);

export default Settings;