import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPhoneBookContacts, type SavedContact } from "@/lib/contacts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (contact: SavedContact) => void;
};

export default function PhoneBookPickerDialog({ open, onOpenChange, onSelect }: Props) {
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<SavedContact[]>([]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setQuery("");
    setLoading(true);

    (async () => {
      try {
        const list = await getPhoneBookContacts();
        if (cancelled) return;
        setContacts(list);
      } catch (err: any) {
        if (cancelled) return;

        console.error("getPhoneBookContacts error:", err);
        if (err?.message === "WEB_ONLY") {
          toast.error("هذه الميزة تعمل فقط على الجهاز");
        } else if (err?.message === "CONTACTS_PERMISSION_DENIED") {
          toast.error("تم رفض صلاحية جهات الاتصال. فعّلها من إعدادات التطبيق ثم جرّب مرة أخرى");
        } else {
          toast.error(`تعذر قراءة جهات الاتصال: ${err?.message || err}`);
        }

        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, onOpenChange]);

  const filtered = useMemo(() => {
    if (!query.trim()) return contacts;
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => c.phone.includes(q) || c.name.toLowerCase().includes(q));
  }, [contacts, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden" dir="rtl">
        <div className="p-4 border-b border-border">
          <DialogTitle className="text-base">اختيار رقم من جهات الاتصال</DialogTitle>

          <div className="relative mt-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو الرقم..."
              className="h-10 pr-9 rounded-xl text-sm"
              dir="rtl"
            />
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            {loading ? "جارٍ التحميل..." : `${filtered.length} رقم`}
          </p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              جارٍ تحميل جهات الاتصال...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">لا توجد نتائج</div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((c) => (
                <Button
                  key={`${c.phone}-${c.name}`}
                  type="button"
                  variant="ghost"
                  className={cn(
                    "w-full justify-between h-auto px-4 py-3 rounded-none",
                    "hover:bg-muted focus-visible:ring-0 focus-visible:ring-offset-0",
                  )}
                  onClick={() => {
                    onSelect(c);
                    onOpenChange(false);
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-sm font-medium text-foreground truncate">{c.name || "بدون اسم"}</p>
                      <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                        {c.phone}
                      </p>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
