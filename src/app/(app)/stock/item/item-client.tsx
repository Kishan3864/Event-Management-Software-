"use client";

import { limit, orderBy, query, where } from "firebase/firestore";
import { Archive, ArchiveRestore, Boxes, CalendarClock, Hammer, History, PackageCheck, Pencil, SearchX, SlidersHorizontal, Truck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ListSkeleton, PageHeader, PageSkeleton, Section, StatCard, ToneBadge } from "@/components/common";
import { AdjustDialog, ItemDialog } from "@/components/stock-dialogs";
import { StockMoveRow } from "@/components/stock-move-row";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "@/hooks/use-live-query";
import { availableNow } from "@/lib/availability";
import { todayYMD } from "@/lib/dates";
import { formatDateRangeShort, formatINR, formatNumber } from "@/lib/format";
import { setItemActive } from "@/lib/services/stock";
import type { StockMove } from "@/lib/types";
import { useConfirm } from "@/providers/confirm-provider";
import { useData } from "@/providers/data-provider";
import { colRef } from "@/lib/db";

export function ItemClient() {
  const id = useSearchParams().get("id") ?? "";
  const confirm = useConfirm();
  const { items, categories, bookings, coreLoaded } = useData();
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const today = todayYMD();

  const moves = useLiveQuery<StockMove>(
    () => (id ? query(colRef("stockMoves"), where("itemId", "==", id), orderBy("createdAt", "desc"), limit(200)) : null),
    [id]
  );

  const item = items.find((i) => i.id === id);
  const reservations = useMemo(
    () =>
      bookings
        .filter((b) => (b.status === "confirmed" || b.status === "items_out") && b.items.some((l) => l.itemId === id))
        .map((b) => ({
          b,
          qty: b.items.filter((l) => l.itemId === id).reduce((s, l) => s + Number(b.status === "items_out" ? l.outQty ?? l.qty : l.qty), 0),
        }))
        .sort((a, b) => a.b.fromDate.localeCompare(b.b.fromDate)),
    [bookings, id]
  );

  if (!coreLoaded) return <PageSkeleton />;
  if (!item) {
    return (
      <EmptyState
        icon={SearchX}
        title="Item not found"
        action={
          <Button asChild>
            <Link href="/stock">Back to stock</Link>
          </Button>
        }
      />
    );
  }

  const avail = availableNow(item);
  const archived = item.active === false;

  const toggleArchive = async () => {
    if (!archived) {
      const ok = await confirm({
        title: `Archive ${item.name}?`,
        description: "It will be hidden from new bookings. History stays. You can restore it any time.",
        confirmText: "Archive",
      });
      if (!ok) return;
    }
    try {
      await setItemActive(item, archived);
      toast.success(archived ? "Item restored" : "Item archived");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        back="/stock"
        title={item.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {item.categoryName || "Other"} · {formatINR(item.rate)}/{item.unit}/day
            {item.hsn ? ` · HSN ${item.hsn}` : ""}
            {archived ? <ToneBadge tone="muted">Archived</ToneBadge> : null}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="icon" className="rounded-full bg-card" aria-label="Edit item" onClick={() => setEditOpen(true)}>
              <Pencil />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full bg-card" aria-label={archived ? "Restore item" : "Archive item"} onClick={toggleArchive}>
              {archived ? <ArchiveRestore /> : <Archive />}
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total owned" value={formatNumber(item.totalQty)} hint={item.unit} icon={Boxes} tone="brand" />
        <StatCard label="In godown now" value={formatNumber(avail)} icon={PackageCheck} tone={avail > 0 ? "success" : "danger"} />
        <StatCard label="Out on rent" value={formatNumber(item.outQty)} icon={Truck} tone="warning" />
        <StatCard label="Damaged" value={formatNumber(item.damagedQty)} icon={Hammer} tone={item.damagedQty ? "danger" : "default"} />
      </div>
      <Button className="mb-5 w-full sm:w-auto" onClick={() => setAdjustOpen(true)}>
        <SlidersHorizontal /> Adjust stock
      </Button>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Booked & out" icon={CalendarClock}>
          {reservations.length ? (
            <ul className="divide-y">
              {reservations.map(({ b, qty }) => (
                <li key={b.id}>
                  <Link href={`/bookings/view?id=${b.id}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.bookingNo} · {formatDateRangeShort(b.fromDate, b.toDate)}
                      </p>
                    </div>
                    <ToneBadge tone={b.status === "items_out" ? (b.toDate < today ? "danger" : "warning") : "brand"}>
                      {b.status === "items_out" ? "Out" : "Booked"} {formatNumber(qty)}
                    </ToneBadge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Not booked in any upcoming booking.</p>
          )}
        </Section>
        <Section title="Stock history" icon={History}>
          {moves.loading ? (
            <ListSkeleton rows={3} />
          ) : moves.error ? (
            <p className="text-sm text-muted-foreground">History is being prepared. Please check again in a few minutes.</p>
          ) : moves.data.length ? (
            <ul className="divide-y">
              {moves.data.map((m) => (
                <StockMoveRow key={m.id} m={m} showItem={false} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
          )}
        </Section>
      </div>

      <ItemDialog open={editOpen} onOpenChange={setEditOpen} item={item} categories={categories} />
      <AdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} item={item} />
    </div>
  );
}
