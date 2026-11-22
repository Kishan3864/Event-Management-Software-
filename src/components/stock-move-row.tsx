"use client";

import { ArrowDownLeft, ArrowUpRight, Hammer, PackageMinus, PackagePlus, SearchX, SlidersHorizontal, Trash2, Wrench } from "lucide-react";
import Link from "next/link";
import { MOVE_LABEL } from "@/lib/constants";
import { formatDate, formatNumber } from "@/lib/format";
import type { MoveType, StockMove } from "@/lib/types";
import { cn } from "@/lib/utils";

const META: Record<MoveType, { icon: typeof ArrowUpRight; cls: string; sign: string }> = {
  added: { icon: PackagePlus, cls: "bg-success-soft text-success", sign: "+" },
  out: { icon: ArrowUpRight, cls: "bg-warning-soft text-warning", sign: "" },
  returned: { icon: ArrowDownLeft, cls: "bg-info-soft text-info", sign: "" },
  damaged: { icon: Hammer, cls: "bg-danger-soft text-destructive", sign: "" },
  missing: { icon: SearchX, cls: "bg-danger-soft text-destructive", sign: "-" },
  adjustment: { icon: SlidersHorizontal, cls: "bg-muted text-foreground", sign: "" },
  repaired: { icon: Wrench, cls: "bg-success-soft text-success", sign: "" },
  writeoff: { icon: Trash2, cls: "bg-muted text-muted-foreground", sign: "-" },
};

export function StockMoveRow({ m, showItem = true }: { m: StockMove; showItem?: boolean }) {
  const meta = META[m.type] ?? META.adjustment;
  const Icon = m.type === "adjustment" && m.qty < 0 ? PackageMinus : meta.icon;
  const qty = m.type === "adjustment" ? (m.qty > 0 ? `+${formatNumber(m.qty)}` : formatNumber(m.qty)) : `${meta.sign}${formatNumber(Math.abs(m.qty))}`;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", meta.cls)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {showItem ? `${m.itemName} · ` : ""}
          {MOVE_LABEL[m.type] ?? m.type}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDate(m.date)}
          {m.bookingNo ? (
            <>
              {" · "}
              <Link href={`/bookings/view?id=${m.bookingId}`} className="text-primary hover:underline">
                {m.bookingNo}
              </Link>
            </>
          ) : null}
          {m.note ? ` · ${m.note}` : ""}
        </p>
      </div>
      <span className="font-semibold tabular">{qty}</span>
    </li>
  );
}
