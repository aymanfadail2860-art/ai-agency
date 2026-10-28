"use client";
import * as React from "react";
import { cn } from "./cn";

export interface TabItem {
  value: string;
  label: React.ReactNode;
  count?: number;
}

export function Tabs({ items, value, onValueChange, className }: { items: TabItem[]; value: string; onValueChange: (v: string) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/60 p-1", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          type="button"
          aria-selected={item.value === value}
          onClick={() => onValueChange(item.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            item.value === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
          {item.count !== undefined && <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
