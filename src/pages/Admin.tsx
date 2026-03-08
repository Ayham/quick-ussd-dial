import { useState, useEffect } from "react";
import { Shield, Key, Copy, Lock, LogOut, Settings2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  verifyAdmin,
  isAdminAuthenticated,
  setAdminAuthenticated,
  getAdminCredentials,
  saveAdminCredentials,
} from "@/lib/admin-auth";
import { getTrialDays, saveTrialDays } from "@/lib/license";

// ======= IndexedDB for RSA Keys =======
const DB_NAME = 'LicenseAdminDB';
const STORE_NAME = 'keys';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveKeyToDB(name: string, jwk: JsonWebKey) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(jwk, name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadKeyFromDB(name: string): Promise<JsonWebKey | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ======= Component =======
const Admin = () => {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(isAdminAuthenticated());

  // Login state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Keys state
  const [hasKeys, setHasKeys] = useState(false);

  // License generation
  const [deviceId, setDeviceId] = useState("");
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });
  const [generatedLicense, setGeneratedLicense] = useState("");

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Trial days
  const [trialDays, setTrialDaysLocal] = useState(() => getTrialDays());

  // Public key export
  const [publicKeyJson, setPublicKeyJson] = useState("");

  // Import private key
  const [importKeyText, setImportKeyText] = useState("");

  useEffect(() => {
    if (authenticated) {
      checkKeys();
    }
  }, [authenticated]);

  const checkKeys = async () => {
    const priv = await loadKeyFromDB('privateKey');
    const pub = await loadKeyFromDB('publicKey');
    setHasKeys(!!(priv && pub));
  };

  const handleLogin = () => {
    if (verifyAdmin(username, password)) {
      setAdminAuthenticated(true);
      setAuthenticated(true);
      toast.success("تم تسجيل الدخول");
    } else {
      toast.error("اسم المستخدم أو كلمة السر غير صحيحة");
    }
  };

  const handleLogout = () => {
    setAdminAuthenticated(false);
    setAuthenticated(false);
    navigate("/");
  };

  const handleGenerateKeys = async () => {
    try {
      const keyPair = await crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['sign', 'verify']
      );
      const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
      const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      await saveKeyToDB('privateKey', privJwk);
      await saveKeyToDB('publicKey', pubJwk);
      setHasKeys(true);
      toast.success("تم توليد مفاتيح RSA بنجاح!");
    } catch (e) {
      toast.error("خطأ في توليد المفاتيح");
      console.error(e);
    }
  };

  const handleExportPublicKey = async () => {
    const pub = await loadKeyFromDB('publicKey');
    if (!pub) { toast.error("لم يتم توليد المفاتيح بعد"); return; }
    const filtered = { kty: pub.kty, e: pub.e, n: pub.n, alg: pub.alg, ext: pub.ext };
    const json = JSON.stringify(filtered, null, 2);
    setPublicKeyJson(json);
    try {
      await navigator.clipboard.writeText(json);
      toast.success("تم نسخ المفتاح العام");
    } catch {
      toast.info("المفتاح العام معروض أدناه — انسخه يدوياً");
    }
  };

  const handleExportPrivateKey = async () => {
    const priv = await loadKeyFromDB('privateKey');
    if (!priv) { toast.error("لم يتم توليد المفاتيح بعد"); return; }
    const json = JSON.stringify(priv);
    try {
      await navigator.clipboard.writeText(json);
      toast.success("تم نسخ المفتاح الخاص — احفظه في مكان آمن!");
    } catch {
      toast.error("فشل النسخ");
    }
  };

  const handleImportPrivateKey = async () => {
    try {
      const text = importKeyText.trim();
      if (!text) { toast.error("الصق المفتاح الخاص أولاً"); return; }
      const jwk = JSON.parse(text);
      await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']);
      await saveKeyToDB('privateKey', jwk);
      const pubJwk = { kty: jwk.kty, e: jwk.e, n: jwk.n, alg: jwk.alg, ext: true };
      await saveKeyToDB('publicKey', pubJwk);
      setHasKeys(true);
      setImportKeyText("");
      toast.success("تم استيراد المفتاح بنجاح!");
    } catch {
      toast.error("المفتاح غير صالح");
    }
  };

  const handleGenerateLicense = async () => {
    if (!deviceId.trim()) { toast.error("أدخل معرف الجهاز"); return; }
    if (!expiryDate) { toast.error("اختر تاريخ الانتهاء"); return; }

    try {
      const privJwk = await loadKeyFromDB('privateKey');
      if (!privJwk) { toast.error("لم يتم توليد المفاتيح بعد"); return; }

      const payload = { deviceId: deviceId.trim(), expiryDate };
      const dataB64 = btoa(JSON.stringify(payload));

      const privKey = await crypto.subtle.importKey(
        'jwk', privJwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
      );

      const encoder = new TextEncoder();
      const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privKey, encoder.encode(dataB64));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

      const license = dataB64 + '.' + sigB64;
      setGeneratedLicense(license);
      toast.success("تم توليد الترخيص بنجاح!");
    } catch (e) {
      toast.error("خطأ في توليد الترخيص");
      console.error(e);
    }
  };

  const handleCopyLicense = async () => {
    try {
      await navigator.clipboard.writeText(generatedLicense);
      toast.success("تم نسخ الترخيص");
    } catch {
      toast.error("فشل النسخ");
    }
  };

  const handleChangePassword = () => {
    if (!newUsername.trim()) { toast.error("أدخل اسم المستخدم الجديد"); return; }
    if (!newPassword.trim() || newPassword.length < 4) { toast.error("كلمة السر يجب أن تكون 4 أحرف على الأقل"); return; }
    if (newPassword !== confirmPassword) { toast.error("كلمة السر غير متطابقة"); return; }
    saveAdminCredentials({ username: newUsername.trim(), password: newPassword });
    setShowPasswordChange(false);
    setNewUsername("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("تم تغيير بيانات الدخول");
  };

  const handleSaveTrialDays = () => {
    saveTrialDays(trialDays);
    toast.success(`تم تعيين الفترة التجريبية إلى ${trialDays} يوم`);
  };

  // ======= Login Screen =======
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6" dir="rtl">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">لوحة الإدارة</h1>
            <p className="text-sm text-muted-foreground mt-1">سجّل دخولك للمتابعة</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">اسم المستخدم</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="h-11"
                dir="ltr"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">كلمة السر</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="h-11"
                dir="ltr"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <Button onClick={handleLogin} className="w-full h-11 font-bold rounded-xl">
              <Lock className="w-4 h-4 ml-2" />
              دخول
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ======= Admin Dashboard =======
  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <header className="bg-primary px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary-foreground" />
          <h1 className="text-primary-foreground text-lg font-bold">لوحة الإدارة</h1>
        </div>
        <button onClick={handleLogout} className="text-primary-foreground p-1">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full overflow-y-auto space-y-5">

        {/* RSA Keys */}
        <SectionCard title="مفاتيح التشفير RSA" icon={<Key className="w-4 h-4" />}>
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            hasKeys ? "bg-green-500/10 border border-green-500/30 text-green-600" : "bg-destructive/10 border border-destructive/30 text-destructive"
          }`}>
            {hasKeys ? "✅ المفاتيح جاهزة" : "⚠️ لم يتم توليد المفاتيح بعد"}
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <Button onClick={handleGenerateKeys} size="sm" variant={hasKeys ? "outline" : "default"} className="text-xs">
              {hasKeys ? "توليد مفاتيح جديدة" : "توليد المفاتيح"}
            </Button>
            {hasKeys && (
              <>
                <Button onClick={handleExportPublicKey} size="sm" variant="outline" className="text-xs">
                  نسخ المفتاح العام
                </Button>
                <Button onClick={handleExportPrivateKey} size="sm" variant="outline" className="text-xs">
                  تصدير المفتاح الخاص
                </Button>
              </>
            )}
          </div>

          {publicKeyJson && (
            <div className="mt-3">
              <label className="text-xs text-muted-foreground">المفتاح العام (انسخه إلى ملف license.ts)</label>
              <textarea
                readOnly
                value={publicKeyJson}
                className="w-full mt-1 p-2 rounded-lg bg-muted border border-border text-[11px] font-mono h-20 resize-none text-foreground"
                dir="ltr"
              />
            </div>
          )}

          {/* Import */}
          <div className="mt-3 border-t border-border pt-3">
            <label className="text-xs text-muted-foreground">استيراد مفتاح خاص</label>
            <textarea
              value={importKeyText}
              onChange={(e) => setImportKeyText(e.target.value)}
              placeholder="الصق JWK المفتاح الخاص هنا..."
              className="w-full mt-1 p-2 rounded-lg bg-muted border border-border text-[11px] font-mono h-16 resize-none text-foreground"
              dir="ltr"
            />
            <Button onClick={handleImportPrivateKey} size="sm" variant="outline" className="text-xs mt-2">
              استيراد
            </Button>
          </div>
        </SectionCard>

        {/* License Generator */}
        <SectionCard title="توليد ترخيص" icon={<Shield className="w-4 h-4" />}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">معرف الجهاز (Device ID)</label>
              <Input
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="الصق معرف الجهاز من الزبون..."
                className="text-left text-xs h-10 font-mono"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">تاريخ انتهاء الترخيص</label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="text-left h-10 text-sm"
                dir="ltr"
              />
            </div>
            <Button onClick={handleGenerateLicense} disabled={!hasKeys} className="w-full h-11 font-bold rounded-xl">
              توليد الترخيص
            </Button>

            {generatedLicense && (
              <div className="space-y-2 mt-2">
                <label className="text-xs font-medium text-muted-foreground">مفتاح الترخيص</label>
                <div className="bg-muted border border-border rounded-lg p-3 font-mono text-[10px] break-all text-foreground leading-relaxed" dir="ltr">
                  {generatedLicense}
                </div>
                <Button onClick={handleCopyLicense} variant="outline" size="sm" className="w-full text-xs">
                  <Copy className="w-3.5 h-3.5 ml-1" />
                  نسخ الترخيص
                </Button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Trial Duration */}
        <SectionCard title="مدة الفترة التجريبية" icon={<Clock className="w-4 h-4" />}>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">عدد الأيام</label>
              <Input
                type="number"
                value={trialDays}
                onChange={(e) => setTrialDaysLocal(Number(e.target.value) || 1)}
                className="text-left h-10 text-sm"
                dir="ltr"
                min={1}
                max={365}
                inputMode="numeric"
              />
            </div>
            <Button onClick={handleSaveTrialDays} size="sm" className="h-10">
              حفظ
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            هذا يحدد عدد أيام الفترة التجريبية للتطبيقات الجديدة
          </p>
        </SectionCard>

        {/* Change Password */}
        <SectionCard title="بيانات الدخول" icon={<Settings2 className="w-4 h-4" />}>
          {!showPasswordChange ? (
            <Button onClick={() => {
              const creds = getAdminCredentials();
              setNewUsername(creds.username);
              setShowPasswordChange(true);
            }} variant="outline" size="sm" className="text-xs">
              <Lock className="w-3.5 h-3.5 ml-1" />
              تغيير بيانات الدخول
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">اسم المستخدم الجديد</label>
                <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
                  className="h-9 text-sm" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">كلمة السر الجديدة</label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="h-9 text-sm" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">تأكيد كلمة السر</label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-9 text-sm" dir="ltr" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleChangePassword} size="sm" className="text-xs flex-1">حفظ</Button>
                <Button onClick={() => setShowPasswordChange(false)} size="sm" variant="outline" className="text-xs">إلغاء</Button>
              </div>
            </div>
          )}
        </SectionCard>

        <div className="h-8" />
      </main>
    </div>
  );
};

// Helper
const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="space-y-3">
    <h2 className="text-foreground font-bold flex items-center gap-2 text-sm">{icon}{title}</h2>
    <div className="bg-card border border-border rounded-xl p-4">
      {children}
    </div>
  </div>
);

export default Admin;
