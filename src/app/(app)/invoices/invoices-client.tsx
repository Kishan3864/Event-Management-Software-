"use client";

import { getDoc, query, where } from "firebase/firestore";
import { Download, FileText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DateRangeBar } from "@/components/date-range-bar";
import { EmptyState, ListSkeleton, PageHeader, ToneBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "@/hooks/use-live-query";
import { docRef, fromSnap, colRef } from "@/lib/db";
import { formatDate, formatINR, safeFileName } from "@/lib/format";
import { presetRanges, type Range } from "@/lib/reports";
import type { Booking, Invoice } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useData } from "@/providers/data-provider";
import { usePdf } from "@/providers/pdf-provider";

export function InvoicesClient() {
  const { settings } = useData();
  const { openPdf } = usePdf();
  const [range, setRange] = useState<Range>(() => presetRanges()[3].range);
  const [type, setType] = useState<"all" | "tax" | "bill">("all");

  const invs = useLiveQuery<Invoice>(
    () => query(colRef("invoices"), where("date", ">=", range.from), where("date", "<=", range.to)),
    [range.from, range.to]
  );
  const list = useMemo(
    () =>
      [...invs.data]
        .filter((i) => type === "all" || i.type === type)
        .sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq),
    [invs.data, type]
  );
  const taxTotal = invs.data.filter((i) => i.type === "tax").reduce((s, i) => s + (i.taxAmount || 0), 0);
  const value = list.reduce((s, i) => s + (i.total || 0), 0);

  const pdf = (inv: Invoice) =>
    openPdf({
      title: `${inv.type === "tax" ? "Tax invoice" : "Bill"} ${inv.invoiceNo}`,
      fileName: `${inv.type === "tax" ? "TaxInvoice" : "Bill"}_${safeFileName(inv.invoiceNo)}_${safeFileName(inv.customer.name)}.pdf`,
      job: async () => {
        const s = await getDoc(docRef("bookings", inv.bookingId)).catch(() => null);
        const b = s && s.exists() ? fromSnap<Booking>(s) : null;
        return { kind: "invoice", invoice: inv, settings, paid: b?.paid };
      },
    });

  return (
    <div>
      <PageHeader title="Invoices & bills" subtitle={`${range.label} · ${list.length} · ${formatINR(value)}`} />
      <DateRangeBar value={range} onChange={setRange} className="mb-4" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-muted p-1">
          {(
            [
              { v: "all", l: "All" },
              { v: "tax", l: "Tax invoices" },
              { v: "bill", l: "Bills" },
            ] as const
          ).map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => setType(t.v)}
              className={cn("h-9 rounded-full px-4 text-sm font-medium transition-all", type === t.v ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {t.l}
            </button>
          ))}
        </div>
        {taxTotal > 0 ? <p className="text-sm text-muted-foreground">GST collected: <b className="text-foreground">{formatINR(taxTotal)}</b></p> : null}
      </div>
      {invs.loading ? (
        <ListSkeleton rows={5} />
      ) : list.length ? (
        <div className="rounded-2xl bg-card px-4 shadow-soft ring-1 ring-black/[0.04]">
          <ul className="divide-y">
            {list.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-3">
                <ToneBadge tone={inv.type === "tax" ? "brand" : "gold"} className="hidden sm:inline-flex">
                  {inv.type === "tax" ? "Tax" : "Bill"}
                </ToneBadge>
                <Link href={`/bookings/view?id=${inv.bookingId}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{inv.invoiceNo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {inv.customer.name} · {formatDate(inv.date)} · {inv.bookingNo}
                  </p>
                </Link>
                <span className="font-semibold tabular">{formatINR(inv.total)}</span>
                <Button variant="ghost" size="icon-sm" aria-label="Download PDF" onClick={() => pdf(inv)}>
                  <Download />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState icon={FileText} title="No invoices in this period" description="Make a Tax Invoice or Bill from any booking." />
      )}
    </div>
  );
}
