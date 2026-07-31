import { Phone, History, TrendingUp, Clock } from "lucide-react";
import { useTransferSuggestions, type TransferSuggestion, timeAgo } from "@/lib/use-transfer-suggestions";
import { detectOperator } from "@/lib/ussd-profiles";
import { cn } from "@/lib/utils";

interface SmartPhoneSuggestionsProps {
  query: string;
  onSelect: (phone: string, lastPrice?: number) => void;
  className?: string;
}

export default function SmartPhoneSuggestions({ query, onSelect, className }: SmartPhoneSuggestionsProps) {
  const { suggestions, settings } = useTransferSuggestions(query);

  if (!settings.enabled) return null;
  if (suggestions.length === 0) return null;

  return (
    <div className={cn("space-y-2 animate-slide-down", className)}>
      {query.trim().length >= 2 && suggestions.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 px-1 mb-2">
            <History className="w-3 h-3" />
            اقتراحات العملاء
          </p>
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <SuggestionCard key={s.phone} suggestion={s} onSelect={onSelect} settings={settings} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onSelect,
  settings,
}: {
  suggestion: TransferSuggestion;
  onSelect: (phone: string, lastPrice?: number) => void;
  settings: { showLastPrice: boolean; showCount: boolean; showLastTime: boolean };
}) {
  const op = detectOperator(suggestion.phone);

  return (
    <button
      onClick={() => onSelect(suggestion.phone, suggestion.lastPrice)}
      className="w-full flex items-center bg-white border border-border/60 rounded-xl px-4 py-3 shadow-sm hover:shadow-md hover:border-primary/20 active:scale-[0.98] transition-all duration-150 text-right"
      dir="ltr"
    >
      <div className="w-9 h-9 rounded-xl bg-primary/5 flex items-center justify-center shrink-0 ms-0 me-3">
        <Phone className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-foreground tracking-wider">{suggestion.phone}</span>
          {op && (
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none",
              op === "mtn" ? "bg-operator-mtn text-operator-mtn-foreground" : "bg-operator-syriatel text-white"
            )}>
              {op === "mtn" ? "MTN" : "SYR"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {settings.showLastPrice && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              السعر: {suggestion.lastPrice.toLocaleString()} ل.س
            </span>
          )}
          {settings.showCount && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {suggestion.count} عملية
            </span>
          )}
        </div>
        {settings.showLastTime && (
          <span className="text-[10px] text-muted-foreground/70 mt-0.5 block">
            {timeAgo(suggestion.lastTimestamp)}
          </span>
        )}
      </div>
    </button>
  );
}
