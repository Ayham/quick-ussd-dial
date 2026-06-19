import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookUser, Contact, Loader2, Search } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSavedContacts, type SavedContact } from "@/lib/contacts";
import { detectOperator } from "@/lib/ussd-profiles";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (contact: SavedContact) => void;
  onPickNative?: () => Promise<void> | void;
};

export default function AppContactsSearchDialog({ open, onOpenChange, onSelect, onPickNative }: Props) {
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setQuery("");
    setError("");
    setLoading(true);

    Promise.resolve()
      .then(() => getSavedContacts())
      .then((list) => {
        if (!cancelled) setContacts(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;

    return contacts.filter((contact) => (
      contact.phone.includes(q) || contact.name.toLowerCase().includes(q)
    ));
  }, [contacts, query]);

  const handleSelect = (contact: SavedContact) => {
    onSelect(contact);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="rounded-2xl p-0 overflow-hidden gap-0"
        style={{
          left: "50%",
          width: "min(448px, calc(100vw - 24px))",
          maxWidth: "calc(100vw - 24px)",
          transform: "translate(-50%, -50%)",
        }}
        dir="rtl"
        aria-describedby={undefined}
      >
        <div className="p-4 border-b border-border bg-card">
          <DialogTitle className="text-base text-right leading-6">البحث في جهات التطبيق</DialogTitle>

          <div className="relative mt-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="app-contact-search-input"
              type="text"
              inputMode="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالاسم أو الرقم"
              className="h-11 rounded-xl pr-10 pl-3 text-sm"
              dir="auto"
              autoFocus
            />
          </div>

          {onPickNative && (
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full h-10 rounded-xl justify-center"
              onClick={onPickNative}
            >
              <Contact className="w-4 h-4" />
              اختيار من جهات الهاتف
            </Button>
          )}
        </div>

        <div className="max-h-[58vh] overflow-y-auto bg-background">
          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              جاري تحميل جهات الاتصال...
            </div>
          ) : error ? (
            <div className="py-10 px-5 text-center text-sm text-destructive space-y-2">
              <AlertCircle className="w-5 h-5 mx-auto" />
              <p>تعذر تحميل جهات الاتصال</p>
              <p className="text-xs text-muted-foreground" dir="ltr">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 px-5 text-center text-sm text-muted-foreground">
              No contacts found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((contact) => {
                const operator = detectOperator(contact.phone);

                return (
                  <button
                    key={`${contact.phone}-${contact.name}`}
                    type="button"
                    className={cn(
                      "w-full min-h-16 px-4 py-3 flex items-center justify-between gap-3 text-right",
                      "hover:bg-muted focus-visible:outline-none focus-visible:bg-muted transition-smooth",
                    )}
                    onClick={() => handleSelect(contact)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <BookUser className="w-5 h-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground truncate">
                          {contact.name || "بدون اسم"}
                        </span>
                        <span className="block text-xs text-muted-foreground font-mono tracking-wider" dir="ltr">
                          {contact.phone}
                        </span>
                      </span>
                    </div>

                    {operator && (
                      <span
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
                          operator === "mtn"
                            ? "bg-operator-mtn text-operator-mtn-foreground"
                            : "bg-operator-syriatel text-operator-syriatel-foreground",
                        )}
                      >
                        {operator === "mtn" ? "MTN" : "SYR"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
