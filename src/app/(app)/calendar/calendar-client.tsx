"use client";

import { getDocs, query, where } from "firebase/firestore";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookingRow } from "@/components/booking-row";
import { EmptyState, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ITEMS_ONLY_COLOR, VENUE_COLORS } from "@/lib/constants";
import { colRef, fromSnap } from "@/lib/db";
import {
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  endOfMonth,
  monthLabel,
  parseYMD,
  startOfMonth,
  todayYMD,
} from "@/lib/dates";
import { formatDateMedium } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useData } from "@/providers/data-provider";

export function CalendarClient() {
  const { bookings, venues, windowStart } = useData();
  const today = todayYMD();
  const [month, setMonth] = useState(startOfMonth(today));
  const [selected, setSelected] = useState(today);
  const [loc, setLoc] = useState<string>("all");
  const [extra, setExtra] = useState<Booking[]>([]);

  const monthStart = month;
  const monthEnd = endOfMonth(month);

  // Months older than the live window are loaded on demand
  useEffect(() => {
    if (monthStart >= windowStart) {
      setExtra([]);
      return;
    }
    let alive = true;
    getDocs(query(colRef("bookings"), where("fromDate", ">=", addDays(monthStart, -60)), where("fromDate", "<=", monthEnd)))
      .then((s) => alive && setExtra(s.docs.map((d) => fromSnap<Booking>(d))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [monthStart, monthEnd, windowStart]);

  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    venues.forEach((v, i) => m.set(v.id, VENUE_COLORS[i % VENUE_COLORS.length]));
    return (b: Booking) => (b.locationId ? m.get(b.locationId) ?? VENUE_COLORS[0] : ITEMS_ONLY_COLOR);
  }, [venues]);

  const monthBookings = useMemo(() => {
    const m = new Map<string, Booking>();
    for (const b of [...bookings, ...extra]) {
      if (b.status === "cancelled") continue;
      if (b.toDate < monthStart || b.fromDate > monthEnd) continue;
      if (loc === "items" ? !!b.locationId : loc !== "all" && b.locationId !== loc) continue;
      m.set(b.id, b);
    }
    return [...m.values()].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  }, [bookings, extra, monthStart, monthEnd, loc]);

  const cells = useMemo(() => {
    const first = parseYMD(monthStart);
    const start = addDays(monthStart, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthStart]);

  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const d of cells) m.set(d, []);
    for (const b of monthBookings) {
      for (const d of cells) if (b.fromDate <= d && b.toDate >= d) m.get(d)!.push(b);
    }
    return m;
  }, [cells, monthBookings]);

  const dayList = byDay.get(selected) ?? monthBookings.filter((b) => b.fromDate <= selected && b.toDate >= selected);
  const lastRowNeeded = cells.slice(35).some((d) => d.slice(0, 7) === monthStart.slice(0, 7));
  const visibleCells = lastRowNeeded ? cells : cells.slice(0, 35);

  const go = (n: number) => {
    const m = addMonths(month, n);
    setMonth(m);
    setSelected(m.slice(0, 7) === today.slice(0, 7) ? today : m);
  };

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={`${monthBookings.length} booking${monthBookings.length === 1 ? "" : "s"} in ${monthLabel(month)}`}
        actions={
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/bookings/new">
              <Plus /> New booking
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-3xl bg-card p-3 shadow-soft ring-1 ring-black/[0.04] sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Button variant="outline" size="icon" className="rounded-full" aria-label="Previous month" onClick={() => go(-1)}>
              <ChevronLeft />
            </Button>
            <h2 className="flex-1 text-center text-lg font-semibold">{monthLabel(month)}</h2>
            <Button variant="outline" size="icon" className="rounded-full" aria-label="Next month" onClick={() => go(1)}>
              <ChevronRight />
            </Button>
          </div>
          <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
            <LocChip active={loc === "all"} onClick={() => setLoc("all")} label="All" />
            {venues.map((v, i) => (
              <LocChip key={v.id} active={loc === v.id} onClick={() => setLoc(v.id)} label={v.name} color={VENUE_COLORS[i % VENUE_COLORS.length]} />
            ))}
            <LocChip active={loc === "items"} onClick={() => setLoc("items")} label="Items only" color={ITEMS_ONLY_COLOR} />
            {month !== startOfMonth(today) ? (
              <button
                type="button"
                onClick={() => {
                  setMonth(startOfMonth(today));
                  setSelected(today);
                }}
                className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold text-primary hover:bg-accent"
              >
                Today
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {WEEKDAYS_SHORT.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {visibleCells.map((d) => {
              const inMonth = d.slice(0, 7) === monthStart.slice(0, 7);
              const list = byDay.get(d) ?? [];
              const isToday = d === today;
              const isSel = d === selected;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelected(d)}
                  className={cn(
                    "flex min-h-[58px] flex-col items-stretch rounded-xl border p-1 text-left transition-all sm:min-h-[92px] sm:p-1.5",
                    inMonth ? "bg-card" : "bg-muted/40 text-muted-foreground/60",
                    isSel ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-border",
                    list.length && inMonth && !isSel && "bg-accent/30"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center self-center rounded-full text-xs font-semibold tabular sm:self-start",
                      isToday && "bg-primary text-primary-foreground"
                    )}
                  >
                    {parseYMD(d).getDate()}
                  </span>
                  {/* mobile: dots */}
                  <span className="mt-1 flex flex-wrap justify-center gap-0.5 sm:hidden">
                    {list.slice(0, 4).map((b) => (
                      <span key={b.id} className="size-1.5 rounded-full" style={{ backgroundColor: colorOf(b) }} />
                    ))}
                  </span>
                  {/* desktop: bars */}
                  <span className="mt-1 hidden space-y-0.5 sm:block">
                    {list.slice(0, 3).map((b) => (
                      <span
                        key={b.id}
                        className="block truncate rounded-md px-1.5 py-0.5 text-[10.5px] leading-tight font-medium text-white"
                        style={{ backgroundColor: colorOf(b) }}
                        title={`${b.customerName} · ${b.venue?.name ?? "Items"}`}
                      >
                        {b.customerName}
                      </span>
                    ))}
                    {list.length > 3 ? <span className="block px-1 text-[10px] text-muted-foreground">+{list.length - 3} more</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Selected day</p>
              <h3 className="text-lg font-semibold">{formatDateMedium(selected)}</h3>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/bookings/new">
                <Plus /> Book
              </Link>
            </Button>
          </div>
          {dayList.length ? (
            <div className="space-y-2.5">
              {dayList.map((b) => (
                <BookingRow key={b.id} b={b} />
              ))}
            </div>
          ) : (
            <EmptyState icon={CalendarDays} title="Free day" description="No bookings on this date." className="py-8" />
          )}
          {venues.length ? (
            <div className="mt-5 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Venues on {formatDateMedium(selected)}</p>
              <ul className="space-y-1.5 text-sm">
                {venues.map((v, i) => {
                  const taken = (byDay.get(selected) ?? []).filter((b) => b.locationId === v.id);
                  return (
                    <li key={v.id} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: VENUE_COLORS[i % VENUE_COLORS.length] }} />
                      <span className="flex-1 truncate">{v.name}</span>
                      <span className={cn("text-xs font-medium", taken.length ? "text-destructive" : "text-success")}>
                        {taken.length ? `Booked · ${taken[0].customerName}` : "Available"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LocChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground/75 hover:bg-accent"
      )}
    >
      {color ? <span className="size-2 rounded-full ring-1 ring-white/50" style={{ backgroundColor: color }} /> : null}
      {label}
    </button>
  );
}

