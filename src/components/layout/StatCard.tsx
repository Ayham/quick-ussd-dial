import React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  suffix?: string;
  trend?: { value: number; isPositive: boolean };
  className?: string;
  iconBg?: string;
  iconColor?: string;
}

export function StatCard({ icon, label, value, suffix, trend, className, iconBg = "bg-primary/10", iconColor = "text-primary" }: StatCardProps) {
  return (
    <div className={cn("bg-white border border-border/60 rounded-2xl p-4.5 shadow-sm", className)}>
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          <span className={iconColor}>{icon}</span>
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold tracking-tight text-foreground">
            {typeof value === "number" ? value.toLocaleString() : value}
            {suffix && <span className="text-sm text-muted-foreground ms-1 font-normal">{suffix}</span>}
          </p>
        </div>
        {trend && (
          <span className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-full",
            trend.isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          )}>
            {trend.isPositive ? "+" : ""}{trend.value}%
          </span>
        )}
      </div>
    </div>
  );
}
