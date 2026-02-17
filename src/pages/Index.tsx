import { useState } from "react";
import { Phone, Hash, ArrowLeft, Smartphone } from "lucide-react";
import { profiles, buildUssdCode, dialUssd, type UssdProfile } from "@/lib/ussd-profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const Index = () => {
  const [selectedProfile, setSelectedProfile] = useState<UssdProfile | null>(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");

  const handleDial = () => {
    if (!selectedProfile) return;
    if (!phone.trim()) {
      toast.error("الرجاء إدخال رقم الهاتف");
      return;
    }
    if (!amount.trim()) {
      toast.error("الرجاء إدخال المبلغ");
      return;
    }
    const ussd = buildUssdCode(selectedProfile, phone.trim(), amount.trim());
    dialUssd(ussd);
  };

  const ussdPreview = selectedProfile && phone && amount
    ? buildUssdCode(selectedProfile, phone, amount)
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary px-4 py-5 flex items-center gap-3 shadow-md">
        {selectedProfile && (
          <button
            onClick={() => { setSelectedProfile(null); setPhone(""); setAmount(""); }}
            className="text-primary-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <Smartphone className="w-6 h-6 text-primary-foreground" />
        <h1 className="text-primary-foreground text-xl font-bold">تحويل الرصيد</h1>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full">
        {!selectedProfile ? (
          /* Profile Selection */
          <div className="space-y-3 mt-4">
            <p className="text-muted-foreground text-sm font-medium mb-4">اختر نوع التحويل</p>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => setSelectedProfile(profile)}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border bg-card shadow-sm transition-all active:scale-[0.98] hover:shadow-md ${
                  profile.operator === "mtn"
                    ? "border-operator-mtn/30 hover:border-operator-mtn"
                    : "border-operator-syriatel/30 hover:border-operator-syriatel"
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    profile.operator === "mtn"
                      ? "bg-operator-mtn text-operator-mtn-foreground"
                      : "bg-operator-syriatel text-operator-syriatel-foreground"
                  }`}
                >
                  {profile.operator === "mtn" ? "MTN" : "SYR"}
                </div>
                <div className="text-right">
                  <p className="font-bold text-card-foreground">{profile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {profile.type === "units" && "تحويل وحدات"}
                    {profile.type === "bills" && "دفع فواتير"}
                    {profile.type === "adsl" && "دفع ADSL"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          /* Transfer Form */
          <div className="mt-6 space-y-5">
            {/* Selected profile badge */}
            <div className="flex justify-center">
              <span
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
                  selectedProfile.operator === "mtn"
                    ? "bg-operator-mtn text-operator-mtn-foreground"
                    : "bg-operator-syriatel text-operator-syriatel-foreground"
                }`}
              >
                {selectedProfile.name}
              </span>
            </div>

            {/* Phone Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Phone className="w-4 h-4" />
                رقم الهاتف
              </label>
              <Input
                type="tel"
                placeholder="09XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="text-left text-lg h-12 tracking-wider"
                dir="ltr"
                inputMode="tel"
              />
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Hash className="w-4 h-4" />
                المبلغ
              </label>
              <Input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-left text-lg h-12 tracking-wider"
                dir="ltr"
                inputMode="numeric"
              />
            </div>

            {/* USSD Preview */}
            {ussdPreview && (
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">كود USSD</p>
                <p className="font-mono text-foreground text-lg tracking-wider" dir="ltr">
                  {ussdPreview}
                </p>
              </div>
            )}

            {/* Dial Button */}
            <Button
              onClick={handleDial}
              className="w-full h-14 text-lg font-bold rounded-xl shadow-lg"
              size="lg"
            >
              <Phone className="w-5 h-5 ml-2" />
              اتصال
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
