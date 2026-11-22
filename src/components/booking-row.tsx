"use client";

import { ChevronRight, MapPin, Package } from "lucide-react";
import Link from "next/link";
import { isOverdue, pendingOf } from "@/lib/calc";
import { MONTHS_SHORT, parseYMD, todayYMD } from "@/lib/dates";
import { formatDateRangeShort, formatINR } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DueBadge, StatusBadge } from "./status-badge";

export function DateBlock({ from, to, tone = "brand" }: { from: string; to: string; tone?: "brand" | "danger" | "muted" | "success" | "warning" }) {
  const a = parseYMD(from);
  const multi = to && to !== from;
  const b = multi ? parseYMD(to) : a;
  const tones = {
    brand: "bg-accent text-primary",
    danger: "bg-danger-soft text-destructive",
    muted: "bg-muted text-muted-foreground",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
  };
  return (
    <div className={cn("flex size-[52px] shrink-0 flex-col items-center justify-center rounded-xl leading-none", tones[tone])}>
      <span className="text-lg font-semibold tabular">
        {a.getDate()}
        {multi && b.getMonth() === a.getMonth() ? <span className="text-xs font-medium">–{b.getDate()}</span> : null}
      </span>
      <span className="mt-1 text-[10px] font-semibold tracking-wider uppercase">{MONTHS_SHORT[a.getMonth()]}</span>
    </div>
  );
}

export function BookingRow({ b, showDue = true, className }: { b: Booking; showDue?: boolean; className?: string }) {
  const today = todayYMD();
  const tone =
    b.status === "cancelled" ? "muted" : isOverdue(b, today) ? "danger" : b.status === "completed" ? "success" : b.status === "items_out" ? "warning" : "brand";
  const detail = [b.bookingNo, b.eventType].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/bookings/view?id=${b.id}`}
      className={cn(
        "group flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft ring-1 ring-black/[0.04] transition-all duration-200 hover:shadow-lift active:scale-[0.99] sm:p-3.5",
        b.status === "cancelled" && "opacity-75",
        className
      )}
    >
      <DateBlock from={b.fromDate} to={b.toDate} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-semibold">{b.customerName}</p>
        </div>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          {b.venue ? (
            <span className="flex min-w-0 items-center gap-1 truncate">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{b.venue.name}</span>
            </span>
          ) : null}
          {b.items?.length ? (
            <span className="flex shrink-0 items-center gap-1">
              <Package className="size-3" /> {b.items.length} item{b.items.length > 1 ? "s" : ""}
            </span>
          ) : null}
          {b.toDate !== b.fromDate ? <span className="hidden shrink-0 sm:inline">{formatDateRangeShort(b.fromDate, b.toDate)}</span> : null}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <StatusBadge b={b} />
          {showDue ? <DueBadge b={b} /> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <div className="text-right">
          <p className="font-semibold tabular">{formatINR(b.total)}</p>
          {pendingOf(b) > 0 && b.paid > 0 ? <p className="text-[11px] text-muted-foreground tabular">Paid {formatINR(b.paid)}</p> : null}
        </div>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
