import { useState, useEffect } from "react";

import {
  Plus, Trash2, Key, Code, ArrowUp, ArrowDown, Smartphone, Signal,
  Clock, AlertTriangle, Database, Settings as SettingsIcon,
  Download, Upload, Globe, ChevronDown, ChevronLeft
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SettingsSection = "sim" | "codes" | "amounts" | "data" | "language";

const Settings = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<SettingsSection | null>("sim");
  const [presets, setPresets] = useState(() => getPresets());
  const [credentials, setCredentials] = useState<OperatorCredentials>(() => getCredentials());
  const [templates, setTemplates] = useState<UssdTemplates>(() => getUssdTemplates());
  const [prefixes, setPrefixes] = useState<OperatorPrefixes>(() => getPrefixes());
  const [simAssignment, setSimAssignment] = useState<SimAssignment>(() => getSimAssignment());
  const [balanceTemplates, setBalanceTemplates] = useState<BalanceCheckTemplates>(() => getBalanceTemplates());
  const [activeOperator, setActiveOperator] = useState<Operator>("mtn");
  const [newPrefix, setNewPrefix] = useState("");
  const [language, setLanguageState] = useState(() => getLanguage());

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

  const handleLanguageChange = (newLang: 'ar' | 'en') => {
    setLanguage(newLang);
    setLanguageState(newLang);
    toast.success(t('common.success'));
  };

  const sections: { id: SettingsSection; label: string; icon: React.ReactNode; description: string }[] = [
    { id: "sim", label: "الشريحة والاتصال", icon: <Smartphone className="w-5 h-5" />, description: "بيانات الشريحة وبادئات الأرقام" },
    { id: "codes", label: "أكواد USSD", icon: <Code className="w-5 h-5" />, description: "أكواد التحويل واستعلام الرصيد" },
    { id: "amounts", label: "المبالغ", icon: <SettingsIcon className="w-5 h-5" />, description: "قائمة مبالغ التحويل" },
    { id: "data", label: "البيانات", icon: <Database className="w-5 h-5" />, description: "النسخ الاحتياطي والإدارة" },
    { id: "language", label: "اللغة", icon: <Globe className="w-5 h-5" />, description: "اختيار واجهة التطبيق" },
  ];

  return (
    <AppLayout title="الإعدادات" hideNav>
      <main className="flex-1 w-full max-w-lg mx-auto p-3 space-y-2 pb-8" dir="rtl">

        {/* Section Cards - Samsung One UI style */}
        {sections.map((section) => {
          const isOpen = activeSection === section.id;
          return (
            <div key={section.id} className="animate-slide-up">
              <button
                onClick={() => setActiveSection(isOpen ? null : section.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-4 rounded-2xl transition-all duration-200",
                  isOpen
                    ? "bg-primary/10 border-2 border-primary/20"
                    : "bg-card border border-border shadow-card hover:bg-muted/50 active:scale-[0.98]"
                )}
              >
                <div className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                  isOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
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

              {/* Section Content */}
              {isOpen && (
                <div className="mt-2 px-1 space-y-4 animate-slide-down">
                  {/* ===== SIM SECTION ===== */}
                  {section.id === "sim" && (
                    <>
                      <SettingsCard title="بيانات الشريحة" icon={<Key className="w-4 h-4" />}>
                        <div className="space-y-3">
                          <FieldInput label="الرمز السري لشريحة MTN" value={credentials.mtnSecret}
                            onChange={(v) => setCredentials({ ...credentials, mtnSecret: v })} placeholder="مثال: 20326" />
                          <FieldInput label="الرقم السيري لشريحة سيريتيل" value={credentials.syriatelSerial}
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
                                      "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border-2 active:scale-95",
                                      simAssignment[op] === slot
                                        ? op === "mtn"
                                          ? "border-operator-mtn bg-operator-mtn/10 text-operator-mtn"
                                          : "border-operator-syriatel bg-operator-syriatel/10 text-operator-syriatel"
                                        : "border-border text-muted-foreground"
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
                                  <span key={prefix} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-xs font-mono text-foreground">
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
                                  className="text-left h-9 text-xs font-mono flex-1" dir="ltr" maxLength={3} inputMode="numeric" />
                                <Button size="sm" variant="outline" className="h-9 text-xs rounded-lg" onClick={() => handleAddPrefix(op)}>
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </SettingsCard>

                      <Button onClick={handleSave} className="w-full h-12 font-bold rounded-xl">حفظ إعدادات الشريحة</Button>
                    </>
                  )}

                  {/* ===== CODES SECTION ===== */}
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
                                className="text-left text-xs h-10 font-mono rounded-xl" dir="ltr" />
                            </div>
                          ))}
                          <p className="text-[10px] text-muted-foreground bg-muted rounded-lg p-2">
                            المتغيرات: <span className="font-mono bg-background px-1 rounded">{"{phone}"}</span> <span className="font-mono bg-background px-1 rounded">{"{amount}"}</span> <span className="font-mono bg-background px-1 rounded">{"{secret}"}</span> <span className="font-mono bg-background px-1 rounded">{"{serial}"}</span>
                          </p>
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
                                className="text-left text-xs h-10 font-mono rounded-xl" dir="ltr" />
                            </div>
                          ))}
                          <p className="text-[10px] text-muted-foreground bg-muted rounded-lg p-2">
                            المتغيرات: <span className="font-mono bg-background px-1 rounded">{"{secret}"}</span> <span className="font-mono bg-background px-1 rounded">{"{serial}"}</span>
                          </p>
                        </div>
                      </SettingsCard>

                      <Button onClick={handleSave} className="w-full h-12 font-bold rounded-xl">حفظ الأكواد</Button>
                    </>
                  )}

                  {/* ===== AMOUNTS SECTION ===== */}
                  {section.id === "amounts" && (
                    <>
                      {/* Operator Toggle */}
                      <div className="flex gap-2 p-1 bg-muted rounded-xl">
                        {(["mtn", "syriatel"] as Operator[]).map((op) => (
                          <button key={op} onClick={() => setActiveOperator(op)}
                            className={cn(
                              "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all",
                              activeOperator === op
                                ? op === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground shadow-sm" : "bg-operator-syriatel text-operator-syriatel-foreground shadow-sm"
                                : "text-muted-foreground"
                            )}>
                            {op === "mtn" ? "MTN" : "Syriatel"}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground px-1">
                          <span className="w-8" />
                          <span className="flex-1">الكمية</span>
                          <span className="flex-1">السعر (ل.س)</span>
                          <span className="w-10" />
                        </div>
                        {presets[activeOperator].map((preset, i) => (
                          <div key={i} className="flex items-center gap-1.5 bg-card border border-border rounded-xl p-1.5 shadow-card">
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
                              placeholder="الكمية" className="flex-1 text-left h-9 text-xs rounded-lg" dir="ltr" inputMode="numeric" />
                            <Input type="number" value={preset.price || ""} onChange={(e) => handleChange(i, "price", e.target.value)}
                              placeholder="السعر" className="flex-1 text-left h-9 text-xs rounded-lg" dir="ltr" inputMode="numeric" />
                            <button onClick={() => handleRemove(i)}
                              className="w-9 h-9 flex items-center justify-center text-destructive rounded-lg hover:bg-destructive/10">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button onClick={handleAdd}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors text-sm active:scale-[0.98]">
                          <Plus className="w-4 h-4" />
                          إضافة مبلغ
                        </button>
                      </div>

                      <Button onClick={handleSave} className="w-full h-12 font-bold rounded-xl">حفظ المبالغ</Button>
                    </>
                  )}

                  {/* ===== DATA SECTION ===== */}
                  {section.id === "data" && (
                    <>
                      <SettingsCard title="النسخ الاحتياطي والاستعادة" icon={<Download className="w-4 h-4" />}>
                        <div className="space-y-3">
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            تصدير جميع البيانات المهمة (الإعدادات، الأكواد، المبالغ، البادئات، سجل التحويلات، الرصيد) كملف JSON واستعادتها لاحقاً.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => {
                                try {
                                  const backup: Record<string, unknown> = {
                                    _meta: { version: 1, date: new Date().toISOString() },
                                    presets: getPresets(),
                                    credentials: getCredentials(),
                                    ussdTemplates: getUssdTemplates(),
                                    balanceTemplates: getBalanceTemplates(),
                                    prefixes: getPrefixes(),
                                    simAssignment: getSimAssignment(),
                                    transferHistory: localStorage.getItem('transfer-history'),
                                    savedContacts: localStorage.getItem('saved-contacts'),
                                    savedBalances: localStorage.getItem('saved_balances_v1'),
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
                              className="flex-1 text-xs h-10 rounded-xl"
                            >
                              <Download className="w-3.5 h-3.5 me-1" />
                              تصدير
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
                              className="flex-1 text-xs h-10 rounded-xl"
                            >
                              <Upload className="w-3.5 h-3.5 me-1" />
                              استعادة
                            </Button>
                          </div>
                        </div>
                      </SettingsCard>

                      <SettingsCard title="إدارة البيانات" icon={<Database className="w-4 h-4" />}>
                        <div className="space-y-3">
                          {(() => {
                            const allHistory = getHistory();
                            const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                            const olderThanMonth = allHistory.filter(r => r.timestamp <= monthAgo).length;
                            const totalAmount = allHistory.filter(r => r.status === "success").reduce((s, r) => s + Number(r.amount), 0);
                            const hasBalance = !!localStorage.getItem('saved_balances_v1');
                            const contacts = (() => { try { const c = localStorage.getItem('saved-contacts'); return c ? JSON.parse(c).length : 0; } catch { return 0; } })();
                            return (
                              <div className="bg-muted rounded-xl divide-y divide-border text-xs">
                                <InfoRow label="سجل التحويلات" value={`${allHistory.length} عملية`} />
                                <InfoRow label="إجمالي المبالغ" value={totalAmount.toLocaleString()} />
                                <InfoRow label="أقدم من شهر" value={`${olderThanMonth} عملية`} valueClassName="text-destructive" />
                                <InfoRow label="جهات الاتصال" value={contacts.toString()} />
                                <InfoRow label="بيانات الرصيد" value={hasBalance ? 'محفوظة' : '—'} />
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
                              className="flex-1 text-xs h-10 rounded-xl"
                            >
                              <Clock className="w-3.5 h-3.5 me-1" />
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
                              className="flex-1 text-xs h-10 rounded-xl"
                            >
                              <Trash2 className="w-3.5 h-3.5 me-1" />
                              حذف الكل
                            </Button>
                          </div>
                        </div>
                      </SettingsCard>

                      <SettingsCard title="إعادة تعيين" icon={<AlertTriangle className="w-4 h-4" />} variant="warning">
                        <div className="space-y-2">
                          <Button onClick={() => { resetAllSettings(); toast.success("تم إعادة التعيين"); window.location.reload(); }} variant="outline" className="w-full text-xs h-10 rounded-xl">
                            إعادة تعيين جميع الإعدادات إلى الافتراضي
                          </Button>
                          <p className="text-[10px] text-muted-foreground">
                            يعيد البادئات والأكواد والمبالغ والشريحة إلى الإعدادات الافتراضية. لا يؤثر على الترخيص أو البيانات.
                          </p>
                        </div>
                      </SettingsCard>
                    </>
                  )}

                  {/* ===== LANGUAGE SECTION ===== */}
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
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-card text-foreground border-border hover:border-primary/30"
                            )}
                          >
                            العربية
                          </button>
                          <button
                            onClick={() => handleLanguageChange('en')}
                            className={cn(
                              "py-4 rounded-xl text-sm font-bold transition-all border-2 active:scale-95",
                              language === 'en'
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-card text-foreground border-border hover:border-primary/30"
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

// Helper components
const SettingsCard = ({ title, icon, children, variant }: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  variant?: "default" | "warning";
}) => (
  <div className={cn(
    "bg-card border rounded-2xl p-4 shadow-card space-y-3",
    variant === "warning" ? "border-accent/30" : "border-border"
  )}>
    <h3 className={cn(
      "font-bold flex items-center gap-2 text-sm",
      variant === "warning" ? "text-accent" : "text-foreground"
    )}>
      {icon}{title}
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
      className="text-left h-11 rounded-xl border-2" dir="ltr" inputMode="numeric" />
  </div>
);

const InfoRow = ({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) => (
  <div className="flex items-center justify-between px-3 py-2.5">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn("font-bold text-foreground", valueClassName)}>{value}</span>
  </div>
);

export default Settings;
