"use client";

import { limit, orderBy, query } from "firebase/firestore";
import { Boxes, ChevronRight, Hammer, History, Package, PackageCheck, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState, ListSkeleton, PageHeader, SearchBox, StatCard } from "@/components/common";
import { ItemDialog } from "@/components/stock-dialogs";
import { StockMoveRow } from "@/components/stock-move-row";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useLiveQuery } from "@/hooks/use-live-query";
import { availableNow } from "@/lib/availability";
import { formatINR, formatNumber } from "@/lib/format";
import type { StockMove } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useData } from "@/providers/data-provider";
import { colRef } from "@/lib/db";

export function StockClient() {
  const router = useRouter();
  const { items, categories, coreLoaded } = useData();
  const [tab, setTab] = useState<"items" | "history">("items");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const moves = useLiveQuery<StockMove>(
    () => (tab === "history" ? query(colRef("stockMoves"), orderBy("createdAt", "desc"), limit(150)) : null),
    [tab]
  );

  const active = items.filter((i) => i.active !== false);
  const totals = useMemo(
    () => ({
      total: active.reduce((s, i) => s + (Number(i.totalQty) || 0), 0),
      out: active.reduce((s, i) => s + (Number(i.outQty) || 0), 0),
      damaged: active.reduce((s, i) => s + (Number(i.damagedQty) || 0), 0),
    }),
    [active]
  );

  const cats = useMemo(() => {
    const names = new Set(active.map((i) => i.categoryName || "Other"));
    return ["all", ...categories.map((c) => c.name).filter((n) => names.has(n)), ...(names.has("Other") && !categories.some((c) => c.name === "Other") ? ["Other"] : [])];
  }, [active, categories]);

  const list = useMemo(() => {
    const t = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (showArchived ? i.active === false : i.active !== false) &&
        (cat === "all" || (i.categoryName || "Other") === cat) &&
        (!t || i.name.toLowerCase().includes(t) || (i.categoryName || "").toLowerCase().includes(t))
    );
  }, [items, search, cat, showArchived]);

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle={`${active.length} items`}
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus /> Add item
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total quantity" value={formatNumber(totals.total)} icon={Boxes} tone="brand" />
        <StatCard label="In godown" value={formatNumber(totals.total - totals.out - totals.damaged)} icon={PackageCheck} tone="success" />
        <StatCard label="Out on rent" value={formatNumber(totals.out)} icon={Truck} tone="warning" href="/bookings?f=out" />
        <StatCard label="Damaged" value={formatNumber(totals.damaged)} icon={Hammer} tone={totals.damaged ? "danger" : "default"} />
      </div>

      <div className="mb-4 inline-flex rounded-full bg-muted p-1">
        {(
          [
            { v: "items", l: "Items", icon: Package },
            { v: "history", l: "History", icon: History },
          ] as const
        ).map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setTab(t.v)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-all",
              tab === t.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <t.icon className="size-4" /> {t.l}
          </button>
        ))}
      </div>

      {tab === "items" ? (
        <>
          <div className="mb-4 space-y-3">
            <SearchBox value={search} onChange={setSearch} placeholder="Search items" />
            <div className="flex items-center gap-3">
              <div className="no-scrollbar -mx-4 flex flex-1 gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
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
              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Archived
              </label>
            </div>
          </div>
          {!coreLoaded ? (
            <ListSkeleton rows={6} />
          ) : list.length ? (
            <div className="grid gap-2.5 md:grid-cols-2">
              {list.map((i) => {
                const avail = availableNow(i);
                return (
                  <Link
                    key={i.id}
                    href={`/stock/item?id=${i.id}`}
                    className="group rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04] transition-all hover:shadow-lift active:scale-[0.99]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{i.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {i.categoryName || "Other"} · {formatINR(i.rate)}/{i.unit}/day
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-xl font-semibold tabular", avail <= 0 ? "text-destructive" : "text-success")}>{formatNumber(avail)}</p>
                        <p className="text-[11px] text-muted-foreground">available</p>
                      </div>
                      <ChevronRight className="mt-1 size-4 text-muted-foreground" />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-muted/60 py-1.5">
                        <p className="font-semibold tabular">{formatNumber(i.totalQty)}</p>
                        <p className="text-muted-foreground">Total</p>
                      </div>
                      <div className={cn("rounded-lg py-1.5", i.outQty ? "bg-warning-soft text-warning" : "bg-muted/60")}>
                        <p className="font-semibold tabular">{formatNumber(i.outQty)}</p>
                        <p className={i.outQty ? "" : "text-muted-foreground"}>Out</p>
                      </div>
                      <div className={cn("rounded-lg py-1.5", i.damagedQty ? "bg-danger-soft text-destructive" : "bg-muted/60")}>
                        <p className="font-semibold tabular">{formatNumber(i.damagedQty)}</p>
                        <p className={i.damagedQty ? "" : "text-muted-foreground"}>Damaged</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Package}
              title={search ? "No matching items" : showArchived ? "No archived items" : "No items yet"}
              description={search ? "Try another name." : "Add chairs, tents, gadda, utensils and more."}
              action={
                !search && !showArchived ? (
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus /> Add item
                  </Button>
                ) : null
              }
            />
          )}
        </>
      ) : moves.loading ? (
        <ListSkeleton rows={6} />
      ) : moves.data.length ? (
        <div className="rounded-2xl bg-card px-4 shadow-soft ring-1 ring-black/[0.04]">
          <ul className="divide-y">
            {moves.data.map((m) => (
              <StockMoveRow key={m.id} m={m} />
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState icon={History} title="No stock movements yet" />
      )}

      <ItemDialog open={addOpen} onOpenChange={setAddOpen} categories={categories} onSaved={(id) => router.push(`/stock/item?id=${id}`)} />
    </div>
  );
}
