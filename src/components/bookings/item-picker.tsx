"use client";

import { Minus, PackageSearch, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, NumInput, SearchBox, num } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usableQty } from "@/lib/availability";
import { formatINR, formatNumber } from "@/lib/format";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PickerResult {
  item: Item;
  qty: number;
}

export function ItemPicker({
  open,
  onOpenChange,
  items,
  current,
  reserved,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: Item[];
  current: Record<string, number>;
  reserved: Map<string, { qty: number }>;
  onDone: (qty: Record<string, number>) => void;
}) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [qty, setQty] = useState<Record<string, number | "">>({});

  useEffect(() => {
    if (open) {
      setQty({ ...current });
      setSearch("");
    }
  }, [open, current]);

  const cats = useMemo(() => {
    const set = new Set(items.map((i) => i.categoryName || "Other"));
    return ["all", ...[...set].sort()];
  }, [items]);

  const list = useMemo(() => {
    const t = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (cat === "all" || (i.categoryName || "Other") === cat) &&
        (!t || i.name.toLowerCase().includes(t) || (i.categoryName || "").toLowerCase().includes(t))
    );
  }, [items, search, cat]);

  const selectedCount = Object.values(qty).filter((v) => num(v) > 0).length;

  const step = (id: string, d: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, num(q[id]) + d) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add items</DialogTitle>
          <DialogDescription>Available quantity is for the selected event dates.</DialogDescription>
        </DialogHeader>
        <SearchBox value={search} onChange={setSearch} placeholder="Search items" />
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                cat === c ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground/75 hover:bg-accent"
              )}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>
        <div className="-mx-1 space-y-2 px-1">
          {list.length === 0 ? (
            <EmptyState icon={PackageSearch} title="No items found" description="Add items in Stock first." className="py-8" />
          ) : (
            list.map((i) => {
              const r = reserved.get(i.id)?.qty ?? 0;
              const avail = usableQty(i) - r;
              const v = qty[i.id] ?? "";
              const over = num(v) > avail;
              return (
                <div
                  key={i.id}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors",
                    num(v) > 0 && "border-primary/40 bg-accent/40",
                    over && "border-destructive/40 bg-danger-soft/40"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatINR(i.rate)}/{i.unit}/day ·{" "}
                      <span className={cn("font-medium", avail <= 0 ? "text-destructive" : "text-success")}>
                        {formatNumber(Math.max(0, avail))} available
                      </span>
                      {r > 0 ? <span> · {formatNumber(r)} booked</span> : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="icon-sm" aria-label="Less" onClick={() => step(i.id, -1)}>
                      <Minus />
                    </Button>
                    <NumInput
                      decimals={false}
                      aria-label={`${i.name} quantity`}
                      value={v}
                      onValueChange={(nv) => setQty((q) => ({ ...q, [i.id]: nv }))}
                      className="h-9 w-16 px-1 text-center md:h-9"
                      placeholder="0"
                    />
                    <Button type="button" variant="outline" size="icon-sm" aria-label="More" onClick={() => step(i.id, 1)}>
                      <Plus />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const out: Record<string, number> = {};
              for (const [k, v] of Object.entries(qty)) out[k] = Math.max(0, Math.round(num(v)));
              onDone(out);
              onOpenChange(false);
            }}
          >
            Done{selectedCount ? ` · ${selectedCount} item${selectedCount > 1 ? "s" : ""}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
