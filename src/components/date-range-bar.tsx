"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { presetRanges, type Range } from "@/lib/reports";
import { cn } from "@/lib/utils";

export function DateRangeBar({ value, onChange, className }: { value: Range; onChange: (r: Range) => void; className?: string }) {
  const presets = useMemo(() => presetRanges(), []);
  const activeKey = presets.find((p) => p.range.from === value.from && p.range.to === value.to)?.key ?? "custom";
  const [custom, setCustom] = useState(activeKey === "custom");

  return (
    <div className={cn("space-y-3", className)}>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setCustom(false);
              onChange(p.range);
            }}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-all",
              !custom && activeKey === p.key ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25" : "bg-card text-foreground/75 hover:bg-accent"
            )}
          >
            {p.range.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom(true)}
          className={cn(
            "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-all",
            custom || activeKey === "custom" ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground/75 hover:bg-accent"
          )}
        >
          Custom
        </button>
      </div>
      {custom ? (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Input
            type="date"
            aria-label="From date"
            value={value.from}
            onChange={(e) => e.target.value && onChange({ from: e.target.value, to: value.to < e.target.value ? e.target.value : value.to, label: "Custom" })}
          />
          <Input
            type="date"
            aria-label="To date"
            min={value.from}
            value={value.to}
            onChange={(e) => e.target.value && onChange({ from: value.from, to: e.target.value, label: "Custom" })}
          />
        </div>
      ) : null}
    </div>
  );
}
