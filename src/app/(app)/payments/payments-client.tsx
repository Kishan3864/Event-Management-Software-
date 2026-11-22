"use client";

import { query, where } from "firebase/firestore";
import { Download, FileDown, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DateRangeBar } from "@/components/date-range-bar";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "@/hooks/use-live-query";
import { PAYMENT_MODE_LABEL, PAYMENT_TYPE_LABEL } from "@/lib/constants";
import { docRef, fromSnap, colRef } from "@/lib/db";
import { formatDate, formatINR, safeFileName } from "@/lib/format";
import { paymentsReport, paymentsSummary, presetRanges, type Range } from "@/lib/reports";
import type { Booking, Payment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { receiptMessage } from "@/lib/whatsapp";
import { useData } from "@/providers/data-provider";
import { usePdf } from "@/providers/pdf-provider";
import { getDoc } from "firebase/firestore";

export function PaymentsClient() {
  const { settings } = useData();
  const { openPdf } = usePdf();
  const [range, setRange] = useState<Range>(() => presetRanges()[1].range);
  const [mode, setMode] = useState<string>("all");

  const pays = useLiveQuery<Payment>(
    () => query(colRef("payments"), where("date", ">=", range.from), where("date", "<=", range.to)),
    [range.from, range.to]
  );
  const list = useMemo(
    () =>
      [...pays.data]
        .filter((p) => mode === "all" || p.mode === mode)
        .sort((a, b) => b.date.localeCompare(a.date) || (b.seq ?? 0) - (a.seq ?? 0)),
    [pays.data, mode]
  );
  const sm = paymentsSummary(pays.data);

  const receipt = (p: Payment) =>
    openPdf({
      title: `Receipt ${p.receiptNo}`,
      fileName: `Receipt_${safeFileName(p.receiptNo)}_${safeFileName(p.customerName)}.pdf`,
      job: async () => {
        const s = await getDoc(docRef("bookings", p.bookingId)).catch(() => null);
        const booking = s && s.exists() ? fromSnap<Booking>(s) : null;
        return { kind: "receipt", payment: p, booking, settings };
      },
      whatsapp: { mobile: p.customerMobile, text: receiptMessage(p, null, settings) },
    });

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={`${range.label} · ${sm.count} entr${sm.count === 1 ? "y" : "ies"}`}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              openPdf({
                title: "Payments report",
                fileName: `Payments_${range.from}_to_${range.to}.pdf`,
                job: { kind: "report", report: paymentsReport(pays.data, range), settings },
              })
            }
            disabled={pays.loading}
          >
            <FileDown /> PDF
          </Button>
        }
      />
      <DateRangeBar value={range} onChange={setRange} className="mb-4" />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
          <p className="text-xs text-muted-foreground">Received</p>
          <p className="mt-1 truncate text-lg font-semibold text-success tabular sm:text-xl">{formatINR(sm.inflow)}</p>
        </div>
        <div className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
          <p className="text-xs text-muted-foreground">Refunded</p>
          <p className="mt-1 truncate text-lg font-semibold text-destructive tabular sm:text-xl">{formatINR(sm.refunds)}</p>
        </div>
        <div className="rounded-2xl bg-brand-gradient p-4 text-primary-foreground shadow-soft">
          <p className="text-xs text-white/75">Net</p>
          <p className="mt-1 truncate text-lg font-semibold tabular sm:text-xl">{formatINR(sm.net)}</p>
        </div>
      </div>

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <ModeChip active={mode === "all"} onClick={() => setMode("all")} label="All modes" />
        {sm.byMode.map((x) => (
          <ModeChip key={x.mode} active={mode === x.mode} onClick={() => setMode(x.mode)} label={`${x.label} · ${formatINR(x.amount)}`} />
        ))}
      </div>

      {pays.loading ? (
        <ListSkeleton rows={5} />
      ) : list.length ? (
        <div className="rounded-2xl bg-card px-4 shadow-soft ring-1 ring-black/[0.04]">
          <ul className="divide-y">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    p.type === "refund" ? "bg-danger-soft text-destructive" : "bg-success-soft text-success"
                  )}
                >
                  <Wallet className="size-4" />
                </span>
                <Link href={`/bookings/view?id=${p.bookingId}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.customerName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(p.date)} · {p.receiptNo} · {p.bookingNo} · {PAYMENT_TYPE_LABEL[p.type]} · {PAYMENT_MODE_LABEL[p.mode]}
                  </p>
                </Link>
                <span className={cn("font-semibold tabular", p.type === "refund" && "text-destructive")}>
                  {p.type === "refund" ? "-" : ""}
                  {formatINR(p.amount)}
                </span>
                <Button variant="ghost" size="icon-sm" aria-label="Receipt PDF" onClick={() => receipt(p)}>
                  <Download />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState icon={Wallet} title="No payments in this period" description="Payments are added from a booking." />
      )}
    </div>
  );
}

function ModeChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground/75 hover:bg-accent"
      )}
    >
      {label}
    </button>
  );
}
