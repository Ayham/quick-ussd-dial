import { useState, useMemo } from "react";
import { UserPlus, Search, Trash2, Pencil, Phone, BookUser, Download } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { detectOperator } from "@/lib/ussd-profiles";
import {
  getSavedContacts,
  saveContact,
  updateContactName,
  deleteContact,
  importPhoneContacts,
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
  const [importing, setImporting] = useState(false);

  const reload = () => setContacts(getSavedContacts());

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.trim().toLowerCase();
    return contacts.filter(
      (c) => c.phone.includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const handleAdd = () => {
    const phone = newPhone.trim();
    const name = newName.trim();
    if (!phone || phone.length < 10) {
      toast.error("أدخل رقم هاتف صحيح");
      return;
    }
    saveContact(phone, name);
    reload();
    setNewPhone("");
    setNewName("");
    setShowAdd(false);
    toast.success("تمت إضافة جهة الاتصال");
  };

  const handleEdit = (phone: string) => {
    const name = editName.trim();
    updateContactName(phone, name);
    reload();
    setEditingPhone(null);
    toast.success("تم تحديث الاسم");
  };

  const handleDelete = (phone: string) => {
    deleteContact(phone);
    reload();
    setDeleteConfirm(null);
    toast.info("تم حذف جهة الاتصال");
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const imported = await importPhoneContacts();
      reload();
      toast.success(`تم استيراد ${imported.length} جهة اتصال`);
    } catch {
      toast.error("تعذر الوصول لجهات الاتصال");
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppLayout title="جهات الاتصال">
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
            onClick={handleImport}
            disabled={importing}
            title="استيراد من الهاتف"
          >
            <Download className="w-4 h-4" />
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

        {/* Stats */}
        <p className="text-[11px] text-muted-foreground px-1">
          {filtered.length} جهة اتصال {search && `من أصل ${contacts.length}`}
        </p>

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
