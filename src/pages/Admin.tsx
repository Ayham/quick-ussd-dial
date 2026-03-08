import { useState, useEffect, useMemo } from "react";
import {
  Shield, Key, Copy, Lock, LogOut, Settings2, Clock,
  AlertTriangle, BarChart3, History, Trash2, Search, Edit, Check, X,
  Cloud, Wifi, WifiOff, RefreshCw, Database, ShieldCheck
} from "lucide-react";
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
import {
  getLicenseHistory, addLicenseRecord, deleteLicenseRecord, updateLicenseNote,
  addKeyGenerationRecord, getKeyGenerationLog,
  getLicenseStats,
  type LicenseRecord,
} from "@/lib/license-history";
import {
  getSyncEndpoint, saveSyncEndpoint, isSyncEnabled,
  getQueueSize, getLastSyncTime, syncNow,
} from "@/lib/cloud-sync";

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

// ======= Admin Tabs =======
type AdminTab = 'dashboard' | 'generate' | 'archive' | 'keys' | 'settings';

const Admin = () => {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(isAdminAuthenticated());
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Keys
  const [hasKeys, setHasKeys] = useState(false);
  const [confirmGenerateKeys, setConfirmGenerateKeys] = useState(false);
  const [publicKeyJson, setPublicKeyJson] = useState("");
  const [importKeyText, setImportKeyText] = useState("");

  // License generation
  const [deviceId, setDeviceId] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [isPermanent, setIsPermanent] = useState(false);
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });
  const [generatedLicense, setGeneratedLicense] = useState("");

  // Archive
  const [licenseHistory, setLicenseHistory] = useState<LicenseRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");

  // Password
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Trial
  const [trialDays, setTrialDaysLocal] = useState(() => getTrialDays());

  // Cloud Sync
  const [syncEndpoint, setSyncEndpoint] = useState(() => getSyncEndpoint());
  const [syncQueue, setSyncQueue] = useState(() => getQueueSize());
  const [syncing, setSyncing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Stats
  const stats = useMemo(() => getLicenseStats(), [licenseHistory]);
  const keyGenLog = useMemo(() => getKeyGenerationLog(), [hasKeys]);

  useEffect(() => {
    if (authenticated) {
      checkKeys();
      setLicenseHistory(getLicenseHistory());
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
        true, ['sign', 'verify']
      );
      const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
      const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      await saveKeyToDB('privateKey', privJwk);
      await saveKeyToDB('publicKey', pubJwk);
      addKeyGenerationRecord(pubJwk.n as string);
      setHasKeys(true);
      setConfirmGenerateKeys(false);
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
    try { await navigator.clipboard.writeText(json); toast.success("تم نسخ المفتاح العام"); }
    catch { toast.info("المفتاح العام معروض أدناه"); }
  };

  const handleExportPrivateKey = async () => {
    const priv = await loadKeyFromDB('privateKey');
    if (!priv) { toast.error("لم يتم توليد المفاتيح بعد"); return; }
    try { await navigator.clipboard.writeText(JSON.stringify(priv)); toast.success("تم نسخ المفتاح الخاص — احفظه!"); }
    catch { toast.error("فشل النسخ"); }
  };

  const handleImportPrivateKey = async () => {
    try {
      const jwk = JSON.parse(importKeyText.trim());
      await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']);
      await saveKeyToDB('privateKey', jwk);
      await saveKeyToDB('publicKey', { kty: jwk.kty, e: jwk.e, n: jwk.n, alg: jwk.alg, ext: true });
      setHasKeys(true);
      setImportKeyText("");
      toast.success("تم استيراد المفتاح بنجاح!");
    } catch { toast.error("المفتاح غير صالح"); }
  };

  const handleGenerateLicense = async () => {
    if (!deviceId.trim()) { toast.error("أدخل معرف الجهاز"); return; }
    if (!isPermanent && !expiryDate) { toast.error("اختر تاريخ الانتهاء"); return; }
    try {
      const privJwk = await loadKeyFromDB('privateKey');
      if (!privJwk) { toast.error("لم يتم توليد المفاتيح بعد"); return; }
      const finalExpiry = isPermanent ? 'permanent' : expiryDate;
      const payload = { deviceId: deviceId.trim(), expiryDate: finalExpiry };
      const dataB64 = btoa(JSON.stringify(payload));
      const privKey = await crypto.subtle.importKey('jwk', privJwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
      const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privKey, new TextEncoder().encode(dataB64));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
      const license = dataB64 + '.' + sigB64;

      setGeneratedLicense(license);

      // Save to archive
      addLicenseRecord({
        deviceId: deviceId.trim(),
        expiryDate: finalExpiry,
        createdAt: new Date().toISOString(),
        licenseKey: license,
        customerNote: customerNote.trim() || undefined,
      });
      setLicenseHistory(getLicenseHistory());

      toast.success("تم توليد الترخيص وحفظه في الأرشيف!");
    } catch (e) {
      toast.error("خطأ في توليد الترخيص");
      console.error(e);
    }
  };

  const handleCopyLicense = async (key: string) => {
    try { await navigator.clipboard.writeText(key); toast.success("تم نسخ الترخيص"); }
    catch { toast.error("فشل النسخ"); }
  };

  const handleDeleteRecord = (id: string) => {
    deleteLicenseRecord(id);
    setLicenseHistory(getLicenseHistory());
    toast.info("تم حذف السجل");
  };

  const handleSaveNote = (id: string) => {
    updateLicenseNote(id, editNoteText);
    setLicenseHistory(getLicenseHistory());
    setEditingNoteId(null);
    toast.success("تم حفظ الملاحظة");
  };

  const handleChangePassword = () => {
    if (!newUsername.trim()) { toast.error("أدخل اسم المستخدم"); return; }
    if (!newPassword.trim() || newPassword.length < 4) { toast.error("كلمة السر 4 أحرف على الأقل"); return; }
    if (newPassword !== confirmPassword) { toast.error("كلمة السر غير متطابقة"); return; }
    saveAdminCredentials({ username: newUsername.trim(), password: newPassword });
    setShowPasswordChange(false);
    setNewUsername(""); setNewPassword(""); setConfirmPassword("");
    toast.success("تم تغيير بيانات الدخول");
  };

  const handleSaveTrialDays = () => {
    saveTrialDays(trialDays);
    toast.success(`تم تعيين الفترة التجريبية إلى ${trialDays} يوم`);
  };

  // Filtered archive
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return licenseHistory;
    const q = searchQuery.toLowerCase();
    return licenseHistory.filter(r =>
      r.deviceId.toLowerCase().includes(q) ||
      r.customerNote?.toLowerCase().includes(q) ||
      r.expiryDate.includes(q)
    );
  }, [licenseHistory, searchQuery]);

  // ======= Login =======
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
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className="h-11" dir="ltr"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">كلمة السر</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" className="h-11" dir="ltr"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            </div>
            <Button onClick={handleLogin} className="w-full h-11 font-bold rounded-xl">
              <Lock className="w-4 h-4 ml-2" />دخول
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ======= Dashboard =======
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

      {/* Tab Navigation */}
      <div className="bg-card border-b border-border px-2 py-1.5 flex gap-1 overflow-x-auto">
        {([
          { id: 'dashboard' as AdminTab, label: 'الرئيسية', icon: BarChart3 },
          { id: 'generate' as AdminTab, label: 'توليد ترخيص', icon: Shield },
          { id: 'archive' as AdminTab, label: 'الأرشيف', icon: History },
          { id: 'keys' as AdminTab, label: 'المفاتيح', icon: Key },
          { id: 'settings' as AdminTab, label: 'إعدادات', icon: Settings2 },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full overflow-y-auto">

        {/* ===== DASHBOARD TAB ===== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="إجمالي التراخيص" value={stats.total} color="text-primary" />
              <StatCard label="تراخيص فعّالة" value={stats.active} color="text-green-500" />
              <StatCard label="تراخيص منتهية" value={stats.expired} color="text-destructive" />
              <StatCard label="أجهزة فريدة" value={stats.uniqueDevices} color="text-primary" />
              <StatCard label="اليوم" value={stats.todayCount} color="text-primary" />
              <StatCard label="هذا الشهر" value={stats.thisMonthCount} color="text-primary" />
            </div>

            {/* Keys Status */}
            <div className={`flex items-center gap-3 p-3 rounded-xl text-sm ${
              hasKeys ? "bg-green-500/10 border border-green-500/30" : "bg-destructive/10 border border-destructive/30"
            }`}>
              <Key className={`w-5 h-5 ${hasKeys ? "text-green-500" : "text-destructive"}`} />
              <span className="text-foreground font-medium">{hasKeys ? "مفاتيح RSA جاهزة" : "⚠️ لم يتم توليد المفاتيح"}</span>
            </div>

            {/* Recent licenses */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">آخر التراخيص المولّدة</h3>
              {licenseHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center bg-card border border-border rounded-xl">
                  لم يتم توليد أي تراخيص بعد
                </p>
              ) : (
                licenseHistory.slice(0, 5).map(record => (
                  <LicenseItem key={record.id} record={record} onCopy={handleCopyLicense} compact />
                ))
              )}
              {licenseHistory.length > 5 && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setActiveTab('archive')}>
                  عرض الكل ({licenseHistory.length})
                </Button>
              )}
            </div>

            {/* Key generation log */}
            {keyGenLog.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-foreground">سجل توليد المفاتيح</h3>
                <div className="bg-card border border-border rounded-xl divide-y divide-border">
                  {keyGenLog.map(log => (
                    <div key={log.id} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {new Date(log.createdAt).toLocaleDateString('ar-SY', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="font-mono text-[10px] text-foreground">{log.publicKeyFingerprint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== GENERATE TAB ===== */}
        {activeTab === 'generate' && (
          <div className="space-y-4">
            <SectionCard title="توليد ترخيص جديد" icon={<Shield className="w-4 h-4" />}>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">معرف الجهاز (Device ID)</label>
                  <Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="الصق معرف الجهاز من الزبون..." className="text-left text-xs h-10 font-mono" dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">نوع الترخيص</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsPermanent(false)}
                      className={`flex-1 h-10 rounded-lg text-xs font-medium border transition-all ${
                        !isPermanent ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 inline ml-1" />
                      محدد بتاريخ
                    </button>
                    <button
                      onClick={() => setIsPermanent(true)}
                      className={`flex-1 h-10 rounded-lg text-xs font-medium border transition-all ${
                        isPermanent ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5 inline ml-1" />
                      دائم
                    </button>
                  </div>
                </div>
                {!isPermanent && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">تاريخ انتهاء الترخيص</label>
                    <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
                      className="text-left h-10 text-sm" dir="ltr" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">ملاحظة (اسم الزبون / رقم الهاتف)</label>
                  <Input value={customerNote} onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="اختياري — للتعريف بالزبون" className="h-10 text-sm" />
                </div>
                <Button onClick={handleGenerateLicense} disabled={!hasKeys} className="w-full h-11 font-bold rounded-xl">
                  توليد الترخيص
                </Button>
                {!hasKeys && (
                  <p className="text-[11px] text-destructive text-center">يجب توليد مفاتيح RSA أولاً من تبويب "المفاتيح"</p>
                )}
              </div>

              {generatedLicense && (
                <div className="space-y-2 mt-4 pt-4 border-t border-border">
                  <label className="text-xs font-medium text-muted-foreground">✅ مفتاح الترخيص</label>
                  <div className="bg-muted border border-border rounded-lg p-3 font-mono text-[10px] break-all text-foreground leading-relaxed" dir="ltr">
                    {generatedLicense}
                  </div>
                  <Button onClick={() => handleCopyLicense(generatedLicense)} variant="outline" size="sm" className="w-full text-xs">
                    <Copy className="w-3.5 h-3.5 ml-1" />نسخ الترخيص وإرساله للزبون
                  </Button>
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* ===== ARCHIVE TAB ===== */}
        {activeTab === 'archive' && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بمعرف الجهاز أو الملاحظة أو التاريخ..."
                className="h-10 text-sm pr-9"
              />
            </div>

            {/* Summary bar */}
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-2">
              <span>إجمالي: {filteredHistory.length} ترخيص</span>
              <span className="flex gap-3">
                <span className="text-green-500">فعّال: {filteredHistory.filter(r => r.expiryDate >= new Date().toISOString().split('T')[0]).length}</span>
                <span className="text-destructive">منتهي: {filteredHistory.filter(r => r.expiryDate < new Date().toISOString().split('T')[0]).length}</span>
              </span>
            </div>

            {/* List */}
            <div className="space-y-2">
              {filteredHistory.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  {searchQuery ? "لا توجد نتائج" : "لم يتم توليد أي تراخيص بعد"}
                </p>
              ) : (
                filteredHistory.map(record => (
                  <div key={record.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
                    <LicenseItem record={record} onCopy={handleCopyLicense} />

                    {/* Note editing */}
                    {editingNoteId === record.id ? (
                      <div className="flex gap-2 mt-1">
                        <Input value={editNoteText} onChange={(e) => setEditNoteText(e.target.value)}
                          placeholder="ملاحظة..." className="h-8 text-xs flex-1" />
                        <button onClick={() => handleSaveNote(record.id)} className="text-green-500 p-1"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingNoteId(null)} className="text-muted-foreground p-1"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        {record.customerNote && (
                          <span className="text-[11px] text-muted-foreground">📝 {record.customerNote}</span>
                        )}
                        <div className="flex gap-1 mr-auto">
                          <button onClick={() => { setEditingNoteId(record.id); setEditNoteText(record.customerNote || ""); }}
                            className="text-muted-foreground hover:text-foreground p-1"><Edit className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteRecord(record.id)}
                            className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ===== KEYS TAB ===== */}
        {activeTab === 'keys' && (
          <div className="space-y-4">
            <SectionCard title="مفاتيح التشفير RSA" icon={<Key className="w-4 h-4" />}>
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                hasKeys ? "bg-green-500/10 border border-green-500/30 text-green-600" : "bg-destructive/10 border border-destructive/30 text-destructive"
              }`}>
                {hasKeys ? "✅ المفاتيح جاهزة" : "⚠️ لم يتم توليد المفاتيح بعد"}
              </div>

              {/* Generate / Regenerate with confirmation */}
              {!confirmGenerateKeys ? (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button onClick={() => {
                    if (hasKeys) setConfirmGenerateKeys(true);
                    else handleGenerateKeys();
                  }} size="sm" variant={hasKeys ? "outline" : "default"} className="text-xs">
                    {hasKeys ? "توليد مفاتيح جديدة" : "توليد المفاتيح"}
                  </Button>
                  {hasKeys && (
                    <>
                      <Button onClick={handleExportPublicKey} size="sm" variant="outline" className="text-xs">نسخ المفتاح العام</Button>
                      <Button onClick={handleExportPrivateKey} size="sm" variant="outline" className="text-xs">تصدير المفتاح الخاص</Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-3 p-4 rounded-xl bg-destructive/10 border-2 border-destructive/30 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-destructive">تحذير مهم!</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        توليد مفاتيح جديدة سيجعل <strong className="text-foreground">جميع التراخيص السابقة غير صالحة</strong>.
                        كل الزبائن سيحتاجون تراخيص جديدة.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        هل أنت متأكد؟ هذا الإجراء لا يمكن التراجع عنه.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleGenerateKeys} size="sm" variant="destructive" className="text-xs flex-1">
                      نعم، توليد مفاتيح جديدة
                    </Button>
                    <Button onClick={() => setConfirmGenerateKeys(false)} size="sm" variant="outline" className="text-xs">
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}

              {publicKeyJson && (
                <div className="mt-3">
                  <label className="text-xs text-muted-foreground">المفتاح العام (انسخه إلى ملف license.ts)</label>
                  <textarea readOnly value={publicKeyJson}
                    className="w-full mt-1 p-2 rounded-lg bg-muted border border-border text-[11px] font-mono h-20 resize-none text-foreground" dir="ltr" />
                </div>
              )}

              <div className="mt-3 border-t border-border pt-3">
                <label className="text-xs text-muted-foreground">استيراد مفتاح خاص</label>
                <textarea value={importKeyText} onChange={(e) => setImportKeyText(e.target.value)}
                  placeholder="الصق JWK المفتاح الخاص هنا..."
                  className="w-full mt-1 p-2 rounded-lg bg-muted border border-border text-[11px] font-mono h-16 resize-none text-foreground" dir="ltr" />
                <Button onClick={handleImportPrivateKey} size="sm" variant="outline" className="text-xs mt-2">استيراد</Button>
              </div>
            </SectionCard>

            {/* Key generation history */}
            {keyGenLog.length > 0 && (
              <SectionCard title="سجل توليد المفاتيح" icon={<History className="w-4 h-4" />}>
                <div className="divide-y divide-border">
                  {keyGenLog.map((log, i) => (
                    <div key={log.id} className="py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {i === 0 && <span className="bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded text-[10px] font-bold">حالي</span>}
                        <span className="text-muted-foreground">
                          {new Date(log.createdAt).toLocaleDateString('ar-SY', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-foreground">{log.publicKeyFingerprint}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <SectionCard title="مدة الفترة التجريبية" icon={<Clock className="w-4 h-4" />}>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">عدد الأيام</label>
                  <Input type="number" value={trialDays} onChange={(e) => setTrialDaysLocal(Number(e.target.value) || 1)}
                    className="text-left h-10 text-sm" dir="ltr" min={1} max={365} inputMode="numeric" />
                </div>
                <Button onClick={handleSaveTrialDays} size="sm" className="h-10">حفظ</Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">عدد أيام الفترة التجريبية للتطبيقات الجديدة</p>
            </SectionCard>

            <SectionCard title="بيانات الدخول" icon={<Lock className="w-4 h-4" />}>
              {!showPasswordChange ? (
                <Button onClick={() => { setNewUsername(getAdminCredentials().username); setShowPasswordChange(true); }}
                  variant="outline" size="sm" className="text-xs">
                  <Lock className="w-3.5 h-3.5 ml-1" />تغيير بيانات الدخول
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">اسم المستخدم</label>
                    <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="h-9 text-sm" dir="ltr" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">كلمة السر الجديدة</label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-9 text-sm" dir="ltr" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">تأكيد كلمة السر</label>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-9 text-sm" dir="ltr" />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleChangePassword} size="sm" className="text-xs flex-1">حفظ</Button>
                    <Button onClick={() => setShowPasswordChange(false)} size="sm" variant="outline" className="text-xs">إلغاء</Button>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Cloud Sync */}
            <SectionCard title="المزامنة السحابية (Google Sheets)" icon={<Cloud className="w-4 h-4" />}>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">رابط Google Apps Script</label>
                  <Input
                    value={syncEndpoint}
                    onChange={(e) => setSyncEndpoint(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="text-left h-9 text-xs font-mono" dir="ltr"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => {
                    saveSyncEndpoint(syncEndpoint);
                    toast.success("تم حفظ رابط المزامنة");
                  }} size="sm" className="text-xs flex-1">
                    حفظ الرابط
                  </Button>
                  <Button onClick={async () => {
                    setSyncing(true);
                    try {
                      const result = await syncNow();
                      setSyncQueue(getQueueSize());
                      if (result.sent > 0) {
                        toast.success(`تم مزامنة ${result.sent} حدث بنجاح`);
                      } else if (result.failed > 0) {
                        toast.error("فشلت المزامنة — تحقق من الرابط");
                      } else {
                        toast.info("لا توجد بيانات للمزامنة");
                      }
                    } catch {
                      toast.error("خطأ في المزامنة");
                    } finally {
                      setSyncing(false);
                    }
                  }} size="sm" variant="outline" className="text-xs" disabled={syncing || !syncEndpoint}>
                    <RefreshCw className={`w-3.5 h-3.5 ml-1 ${syncing ? 'animate-spin' : ''}`} />
                    مزامنة الآن
                  </Button>
                </div>

                {/* Sync status */}
                <div className="bg-muted rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">الحالة</span>
                    <span className="flex items-center gap-1">
                      {isSyncEnabled() ? (
                        <><Wifi className="w-3.5 h-3.5 text-green-500" /> مفعّلة</>
                      ) : (
                        <><WifiOff className="w-3.5 h-3.5 text-muted-foreground" /> غير مفعّلة</>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">في الانتظار</span>
                    <span className="font-bold text-foreground">{syncQueue} حدث</span>
                  </div>
                  {getLastSyncTime() && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">آخر مزامنة</span>
                      <span className="text-foreground">
                        {new Date(getLastSyncTime()!).toLocaleString('ar-SY')}
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  البيانات تُحفظ محلياً وتُرسل تلقائياً عند توفر الإنترنت. 
                  راجع ملف <span className="font-mono">google-apps-script.js</span> للحصول على كود Google Apps Script.
                </p>
              </div>
            </SectionCard>
          </div>
        )}

        <div className="h-8" />
      </main>
    </div>
  );
};

// ======= Sub-components =======

const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="bg-card border border-border rounded-xl p-3 text-center">
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
  </div>
);

const LicenseItem = ({ record, onCopy, compact }: { record: LicenseRecord; onCopy: (key: string) => void; compact?: boolean }) => {
  const today = new Date().toISOString().split('T')[0];
  const isActive = record.expiryDate >= today;

  return (
    <div className={`flex items-center justify-between ${compact ? "bg-card border border-border rounded-xl px-3 py-2.5" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? "bg-green-500" : "bg-destructive"}`} />
          <span className="font-mono text-[11px] text-foreground truncate">{record.deviceId.substring(0, 18)}...</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground mr-4">
          <span>انتهاء: {record.expiryDate}</span>
          <span>•</span>
          <span>{new Date(record.createdAt).toLocaleDateString('ar-SY', { month: 'short', day: 'numeric' })}</span>
          {record.customerNote && <span>• {record.customerNote}</span>}
        </div>
      </div>
      <button onClick={() => onCopy(record.licenseKey)} className="text-muted-foreground hover:text-primary p-1.5 shrink-0">
        <Copy className="w-4 h-4" />
      </button>
    </div>
  );
};

const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="space-y-3">
    <h2 className="text-foreground font-bold flex items-center gap-2 text-sm">{icon}{title}</h2>
    <div className="bg-card border border-border rounded-xl p-4">{children}</div>
  </div>
);

export default Admin;
