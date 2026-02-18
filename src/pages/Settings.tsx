import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Key } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getPresets,
  savePresets,
  getCredentials,
  saveCredentials,
  DEFAULT_MTN_PRESETS,
  DEFAULT_SYRIATEL_PRESETS,
  type Operator,
  type AmountPreset,
  type OperatorCredentials,
} from "@/lib/ussd-profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const Settings = () => {
  const navigate = useNavigate();
  const [presets, setPresets] = useState(() => getPresets());
  const [credentials, setCredentials] = useState<OperatorCredentials>(() => getCredentials());
  const [activeTab, setActiveTab] = useState<Operator>("mtn");

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

  const handleSave = () => {
    // Validate credentials
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
    toast.success("تم الحفظ بنجاح");
    navigate("/");
  };

  const handleReset = () => {
    const updated = {
      ...presets,
      [activeTab]: activeTab === "mtn" ? [...DEFAULT_MTN_PRESETS] : [...DEFAULT_SYRIATEL_PRESETS],
    };
    setPresets(updated);
    toast.info("تم إعادة التعيين");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-primary px-4 py-5 flex items-center gap-3 shadow-md">
        <button onClick={() => navigate("/")} className="text-primary-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-primary-foreground text-xl font-bold">الإعدادات</h1>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full">
        {/* Credentials Section */}
        <div className="mt-4 mb-6 space-y-4">
          <h2 className="text-foreground font-bold flex items-center gap-2">
            <Key className="w-4 h-4" />
            بيانات الشريحة
          </h2>

          <div className="space-y-3 bg-card border border-border rounded-xl p-4">
            {/* MTN Secret */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                الرمز السري لشريحة MTN
              </label>
              <Input
                type="number"
                placeholder="مثال: 20326"
                value={credentials.mtnSecret}
                onChange={(e) => setCredentials({ ...credentials, mtnSecret: e.target.value })}
                className="text-left h-10"
                dir="ltr"
                inputMode="numeric"
              />
            </div>

            {/* Syriatel Serial */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                الرقم السيري لشريحة سيريتيل
              </label>
              <Input
                type="number"
                placeholder="مثال: 32362"
                value={credentials.syriatelSerial}
                onChange={(e) => setCredentials({ ...credentials, syriatelSerial: e.target.value })}
                className="text-left h-10"
                dir="ltr"
                inputMode="numeric"
              />
            </div>

            {/* Syriatel Distributor */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                كود الموزع سيريتيل
              </label>
              <Input
                type="number"
                placeholder="مثال: 640322"
                value={credentials.syriatelDistributor}
                onChange={(e) => setCredentials({ ...credentials, syriatelDistributor: e.target.value })}
                className="text-left h-10"
                dir="ltr"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <h2 className="text-foreground font-bold mb-3">قوائم المبالغ</h2>
        <div className="flex gap-2 mb-6">
          {(["mtn", "syriatel"] as Operator[]).map((op) => (
            <button
              key={op}
              onClick={() => setActiveTab(op)}
              className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${
                activeTab === op
                  ? op === "mtn"
                    ? "bg-operator-mtn text-operator-mtn-foreground"
                    : "bg-operator-syriatel text-operator-syriatel-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {op === "mtn" ? "MTN" : "Syriatel"}
            </button>
          ))}
        </div>

        {/* Presets list */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <span className="flex-1">المبلغ</span>
            <span className="flex-1">السعر (ل.س)</span>
            <span className="w-9" />
          </div>

          {presets[activeTab].map((preset, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="number"
                value={preset.amount || ""}
                onChange={(e) => handleChange(i, "amount", e.target.value)}
                placeholder="المبلغ"
                className="flex-1 text-left h-10"
                dir="ltr"
                inputMode="numeric"
              />
              <Input
                type="number"
                value={preset.price || ""}
                onChange={(e) => handleChange(i, "price", e.target.value)}
                placeholder="السعر"
                className="flex-1 text-left h-10"
                dir="ltr"
                inputMode="numeric"
              />
              <button
                onClick={() => handleRemove(i)}
                className="w-9 h-9 flex items-center justify-center text-destructive rounded-md hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <button
            onClick={handleAdd}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            إضافة مبلغ
          </button>
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-3">
          <Button onClick={handleSave} className="w-full h-12 text-lg font-bold rounded-xl">
            حفظ
          </Button>
          <Button onClick={handleReset} variant="outline" className="w-full h-10">
            إعادة تعيين الافتراضي
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Settings;
