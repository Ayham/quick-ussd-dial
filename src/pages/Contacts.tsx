import { useState, useMemo } from "react";
import { UserPlus, Search, Trash2, Pencil, BookUser, Contact, Upload, Download } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { detectOperator } from "@/lib/ussd-profiles";
import PhoneBookPickerDialog from "@/components/contacts/PhoneBookPickerDialog";
import {
  getSavedContacts,
  saveSavedContacts,
  saveContact,
  updateContactName,
  deleteContact,
  normalizePhone,
  queueContactsForSync,
  type SavedContact,
} from "@/lib/contacts";

const Contacts = () => {
  const [contacts, setContacts] = useState<SavedContact[]>(() => getSavedContacts());
  const [search, setSearch] = useState("");
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [phoneBookOpen, setPhoneBookOpen] = useState(false);

  const reload = () => setContacts(getSavedContacts());

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.trim().toLowerCase();
    return contacts.filter(
      (c) => c.phone.includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const handleAdd = async () => {
    const phone = newPhone.trim();
    const name = newName.trim();
    if (!phone || phone.length < 10) {
      toast.error("أدخل رقم هاتف صحيح");
      return;
    }
    await saveContact(phone, name);
    reload();
    setNewPhone("");
    setNewName("");
    setShowAdd(false);
    toast.success("تمت إضافة جهة الاتصال");
  };

  const handleEdit = async (phone: string) => {
    const name = editName.trim();
    await updateContactName(phone, name);
    reload();
    setEditingPhone(null);
    toast.success("تم تحديث الاسم");
  };

  const handleDelete = async (phone: string) => {
    await deleteContact(phone);
    reload();
    setDeleteConfirm(null);
    toast.info("تم حذف جهة الاتصال");
  };

  const handlePickContact = () => {
    setPhoneBookOpen(true);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: "vcf" | "csv" | "xls") => {
    const data = getSavedContacts();
    if (data.length === 0) {
      toast.error("لا توجد جهات اتصال للتصدير");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const csv = ["name,phone,operator", ...data.map((contact) =>
        [escape(contact.name || ""), escape(contact.phone), escape(detectOperator(contact.phone) || "")].join(",")
      )].join("\r\n");
      downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `contacts-${date}.csv`);
      toast.success(`تم تصدير ${data.length} جهة اتصال بصيغة CSV`);
      return;
    }
    if (format === "xls") {
      const escapeXml = (value: string) => value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      const rows = data.map((contact) =>
        `<Row><Cell><Data ss:Type="String">${escapeXml(contact.name || "")}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${escapeXml(contact.phone)}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${escapeXml(detectOperator(contact.phone) || "")}</Data></Cell></Row>`
      ).join("");
      const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>` +
        `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
        `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Contacts"><Table>` +
        `<Row><Cell><Data ss:Type="String">name</Data></Cell><Cell><Data ss:Type="String">phone</Data></Cell>` +
        `<Cell><Data ss:Type="String">operator</Data></Cell></Row>${rows}</Table></Worksheet></Workbook>`;
      downloadBlob(new Blob(["\uFEFF", xml], { type: "application/vnd.ms-excel;charset=utf-8" }), `contacts-${date}.xls`);
      toast.success(`تم تصدير ${data.length} جهة اتصال بصيغة Excel`);
      return;
    }

    const vcards = data.map(c => {
      const name = c.name || c.phone;
      return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;TYPE=CELL:${c.phone}\nEND:VCARD`;
    }).join('\n');
    const blob = new Blob([vcards], { type: 'text/vcard;charset=utf-8' });
    downloadBlob(blob, `contacts-${date}.vcf`);
    toast.success(`تم تصدير ${data.length} جهة اتصال بصيغة VCF`);
  };

  const mergeImportedContacts = async (imported: SavedContact[]) => {
    const normalized = imported
      .map((contact) => ({ phone: normalizePhone(String(contact.phone || "")), name: String(contact.name || "").trim() }))
      .filter((contact) => contact.phone.length >= 10);
    if (!normalized.length) throw new Error("no_contacts");
    const existing = getSavedContacts();
    const existingPhones = new Set(existing.map((contact) => contact.phone));
    const newContacts = normalized.filter((contact) => !existingPhones.has(contact.phone));
    saveSavedContacts([...existing, ...normalized]);
    await queueContactsForSync(normalized);
    reload();
    toast.success(`تم استيراد ${newContacts.length} جهة اتصال جديدة وتحديث ${normalized.length - newContacts.length}`);
  };

  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vcf,.json,.csv,.xls';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();

      try {
        if (file.name.endsWith('.vcf')) {
          // Parse VCF
          const entries = text.split('BEGIN:VCARD').filter(v => v.trim());
          const imported: SavedContact[] = [];
          for (const entry of entries) {
            const fnMatch = entry.match(/FN:(.*)/);
            const telMatch = entry.match(/TEL[^:]*:([\d+\s\-()]+)/);
            if (telMatch) {
              const phone = telMatch[1].replace(/[\s\-()]/g, '').replace(/^\+963/, '0').replace(/^963/, '0');
              const name = fnMatch?.[1]?.trim() || '';
              if (phone.length >= 10) imported.push({ phone, name });
            }
          }
          if (imported.length === 0) {
            toast.error("لم يتم العثور على جهات اتصال في الملف");
            return;
          }
          await mergeImportedContacts(imported);
        } else if (file.name.endsWith('.json')) {
          // Parse JSON
          const data: SavedContact[] = JSON.parse(text);
          if (!Array.isArray(data)) throw new Error('invalid');
          await mergeImportedContacts(data);
        } else if (file.name.endsWith(".csv")) {
          const rows = text.split(/\r?\n/).filter(Boolean);
          const headers = rows.shift()?.split(",").map((value) => value.replace(/^"|"$/g, "").trim().toLowerCase()) || [];
          const nameIndex = headers.findIndex((value) => ["name", "الاسم"].includes(value));
          const phoneIndex = headers.findIndex((value) => ["phone", "mobile", "الهاتف", "الرقم"].includes(value));
          await mergeImportedContacts(rows.map((row) => {
            const values = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map((value) =>
              value.replace(/^"|"$/g, "").replace(/""/g, '"').trim()
            ) || [];
            return { name: values[nameIndex] || "", phone: values[phoneIndex] || "" };
          }));
        } else {
          const doc = new DOMParser().parseFromString(text, "application/xml");
          if (doc.querySelector("parsererror")) throw new Error("invalid_excel_xml");
          const rows = Array.from(doc.getElementsByTagName("Row")).slice(1);
          await mergeImportedContacts(rows.map((row) => {
            const cells = Array.from(row.getElementsByTagName("Data")).map((cell) => cell.textContent || "");
            return { name: cells[0] || "", phone: cells[1] || "" };
          }));
        }
      } catch {
        toast.error("فشل قراءة الملف");
      }
    };
    input.click();
  };

  return (
    <AppLayout title="جهات الاتصال">
      <PhoneBookPickerDialog
        open={phoneBookOpen}
        onOpenChange={setPhoneBookOpen}
        onSelect={(picked) => {
          setSearch(picked.phone);
          void saveContact(picked.phone, picked.name).then(reload);
          toast.success(`تم اختيار ${picked.name || picked.phone}`);
        }}
      />
      <main className="flex-1 p-3 w-full overflow-y-auto pb-safe space-y-3" dir="rtl">
        {/* Search + Actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الرقم..."
              className="h-10 pr-9 rounded-xl text-sm"
              dir="rtl"
            />
          </div>
          <Button
            size="icon"
            variant="outline"
            className="h-10 w-10 rounded-xl"
            onClick={handlePickContact}
            title="اختيار من سجل الهاتف"
          >
            <Contact className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            className="h-10 w-10 rounded-xl"
            onClick={() => setShowAdd(!showAdd)}
          >
            <UserPlus className="w-4 h-4" />
          </Button>
        </div>

        {/* Add New Contact */}
        {showAdd && (
          <div className="bg-card border border-border rounded-xl p-3 space-y-2 shadow-card animate-slide-up">
            <p className="text-xs font-bold text-foreground">إضافة جهة اتصال جديدة</p>
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="رقم الهاتف"
              className="h-10 rounded-xl text-left"
              dir="ltr"
              inputMode="tel"
            />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="الاسم (اختياري)"
              className="h-10 rounded-xl"
              dir="rtl"
            />
            <div className="flex gap-2">
              <Button className="flex-1 h-9 rounded-xl text-xs font-bold" onClick={handleAdd}>
                إضافة
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-9 rounded-xl text-xs"
                onClick={() => { setShowAdd(false); setNewPhone(""); setNewName(""); }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {/* Stats + Export/Import */}
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] text-muted-foreground">
            {filtered.length} جهة اتصال {search && `من أصل ${contacts.length}`}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={handleImportFile}
              className="text-[11px] text-primary flex items-center gap-1 hover:underline"
            >
              <Upload className="w-3.5 h-3.5" />
              استيراد
            </button>
            <span className="text-muted-foreground text-[10px]">|</span>
            <button
              onClick={() => handleExport("csv")}
              className="text-[11px] text-primary flex items-center gap-1 hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              onClick={() => handleExport("xls")}
              className="text-[11px] text-primary flex items-center gap-1 hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              onClick={() => handleExport("vcf")}
              className="text-[11px] text-primary flex items-center gap-1 hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              VCF
            </button>
          </div>
        </div>

        {/* Contacts List */}
        <div className="space-y-1.5">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {search ? "لا توجد نتائج" : "لا توجد جهات اتصال محفوظة"}
            </div>
          ) : (
            filtered.map((contact) => {
              const op = detectOperator(contact.phone);
              const isEditing = editingPhone === contact.phone;
              const isDeleting = deleteConfirm === contact.phone;

              return (
                <div
                  key={contact.phone}
                  className="relative bg-card border border-border rounded-xl px-4 py-3 shadow-card"
                >
                  {/* Delete confirmation overlay */}
                  {isDeleting && (
                    <div className="absolute inset-0 bg-card/95 rounded-xl flex items-center justify-center gap-2 z-10 border border-destructive/30">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs"
                        onClick={() => handleDelete(contact.phone)}
                      >
                        <Trash2 className="w-3 h-3 ml-1" />
                        تأكيد الحذف
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        إلغاء
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <BookUser className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="الاسم"
                              className="h-7 text-xs rounded-lg flex-1"
                              dir="rtl"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleEdit(contact.phone);
                                if (e.key === "Escape") setEditingPhone(null);
                              }}
                            />
                            <Button
                              size="sm"
                              className="h-7 text-[10px] rounded-lg px-2"
                              onClick={() => handleEdit(contact.phone)}
                            >
                              حفظ
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[10px] rounded-lg px-1"
                              onClick={() => setEditingPhone(null)}
                            >
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <>
                            {contact.name && (
                              <p className="text-sm font-medium text-foreground truncate">
                                {contact.name}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                                {contact.phone}
                              </p>
                              {op && (
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                    op === "mtn"
                                      ? "bg-operator-mtn text-operator-mtn-foreground"
                                      : "bg-operator-syriatel text-operator-syriatel-foreground"
                                  }`}
                                >
                                  {op === "mtn" ? "MTN" : "SYR"}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => {
                            setEditingPhone(contact.phone);
                            setEditName(contact.name || "");
                          }}
                          className="p-1.5 rounded-lg hover:bg-muted transition-smooth text-muted-foreground hover:text-primary"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(contact.phone)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-smooth text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </AppLayout>
  );
};

export default Contacts;
