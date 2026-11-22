"use client";

import { hasItems, isOverdue, pendingOf } from "@/lib/calc";
import { todayYMD } from "@/lib/dates";
import { formatINR } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { ToneBadge } from "./common";

export function StatusBadge({ b, className }: { b: Booking; className?: string }) {
  const today = todayYMD();
  if (b.status === "cancelled") return <ToneBadge tone="muted" className={className}>Cancelled</ToneBadge>;
  if (b.status === "completed")
    return <ToneBadge tone="success" className={className}>{hasItems(b) ? "Returned" : "Completed"}</ToneBadge>;
  if (b.status === "items_out")
    return isOverdue(b, today) ? (
      <ToneBadge tone="danger" className={className}>Return overdue</ToneBadge>
    ) : (
      <ToneBadge tone="warning" className={className}>Items out</ToneBadge>
    );
  if (b.fromDate <= today && b.toDate >= today) return <ToneBadge tone="info" className={className}>Today</ToneBadge>;
  return <ToneBadge tone="brand" className={className}>Confirmed</ToneBadge>;
}

export function DueBadge({ b, className }: { b: Booking; className?: string }) {
  const p = pendingOf(b);
  if (p <= 0) {
    if (b.status === "cancelled") return null;
    return <ToneBadge tone="success" className={className}>Paid</ToneBadge>;
  }
  return <ToneBadge tone="danger" className={className}>Due {formatINR(p)}</ToneBadge>;
}
