"use client";

import { getDocs, query, where } from "firebase/firestore";
import { BarChart3, ClipboardList, FileDown, IndianRupee, Loader2, Package, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DateRangeBar } from "@/components/date-range-bar";
import { EmptyState, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { pendingOf } from "@/lib/calc";
import { STATUS_LABEL } from "@/lib/constants";
import { colRef, fromSnap } from "@/lib/db";
import { formatDate, formatINR, formatNumber } from "@/lib/format";
import type { ReportSpec } from "@/lib/pdf/types";
import {
  bookingsReport,
  bookingsSummary,
  duesReport,
  paymentsReport,
  paymentsSummary,
  periodLabel,
  presetRanges,
  stockReport,
  summariseMoves,
  type Range,
} from "@/lib/reports";
import { availableNow } from "@/lib/availability";
import type { Booking, Payment, StockMove } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useData } from "@/providers/data-provider";
import { usePdf } from "@/providers/pdf-provider";

type Tab = "bookings" | "payments" | "dues" | "stock";

const TABS: { v: Tab; l: string; icon: typeof BarChart3 }[] = [
  { v: "bookings", l: "Bookings", icon: ClipboardList },
  { v: "payments", l: "Payments", icon: Wallet },
  { v: "dues", l: "Pending dues", icon: IndianRupee },
  { v: "stock", l: "Stock", icon: Package },
];

export function ReportsClient() {
  const { settings, bookings: liveBookings, items } = useData();
  const { openPdf } = usePdf();
  const [tab, setTab] = useState<Tab>("bookings");
  const [range, setRange] = useState<Range>(() => presetRanges()[1].range);
  const [allDues, setAllDues] = useState(true);
  const [data, setData] = useState<{ bookings: Booking[]; payments: Payment[]; moves: StockMove[] }>({ bookings: [], payments: [], moves: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const load = async () => {
      if (tab === "bookings") {
        const s = await getDocs(query(colRef("bookings"), where("fromDate", ">=", range.from), where("fromDate", "<=", range.to)));
        return { bookings: s.docs.map((d) => fromSnap<Booking>(d)) };
      }
      if (tab === "payments") {
        const s = await getDocs(query(colRef("payments"), where("date", ">=", range.from), where("date", "<=", range.to)));
        return { payments: s.docs.map((d) => fromSnap<Payment>(d)) };
      }
      if (tab === "stock") {
        const s = await getDocs(query(colRef("stockMoves"), where("date", ">=", range.from), where("date", "<=", range.to)));
        return { moves: s.docs.map((d) => fromSnap<StockMove>(d)) };
      }
      return {};
    };
    load()
      .then((r) => alive && setData((d) => ({ ...d, ...r })))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tab, range.from, range.to]);

  const dues = useMemo(
    () =>
      liveBookings
        .filter((b) => pendingOf(b) > 0 && (allDues || (b.fromDate >= range.from && b.fromDate <= range.to)))
        .sort((a, b) => a.fromDate.localeCompare(b.fromDate)),
    [liveBookings, allDues, range]
  );

  const spec: ReportSpec = useMemo(() => {
    if (tab === "bookings") return bookingsReport(data.bookings, range);
    if (tab === "payments") return paymentsReport(data.payments, range);
    if (tab === "dues") return duesReport(dues, allDues ? "All pending as on today" : periodLabel(range));
    return stockReport(items, data.moves, range);
  }, [tab, data, range, dues, allDues, items]);

  const download = () =>
    openPdf({
      title: spec.title,
      fileName: `${spec.title.replace(/\s+/g, "_")}_${tab === "dues" && allDues ? "as_on_" + range.to : `${range.from}_to_${range.to}`}.pdf`,
      job: { kind: "report", report: spec, settings },
    });

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={tab === "dues" && allDues ? "All pending dues" : `${range.label} · ${periodLabel(range)}`}
        actions={
          <Button onClick={download} disabled={loading}>
            <FileDown /> Download PDF
          </Button>
        }
      />
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {TABS.map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setTab(t.v)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-all",
              tab === t.v ? "border-primary bg-accent text-primary ring-2 ring-primary/15" : "bg-card text-foreground/75 hover:bg-muted"
            )}
          >
            <t.icon className="size-4" /> {t.l}
          </button>
        ))}
      </div>
      {tab === "dues" ? (
        <label className="mb-4 flex items-center gap-3 rounded-xl bg-card p-3 text-sm shadow-soft ring-1 ring-black/[0.04]">
          <Switch checked={allDues} onCheckedChange={setAllDues} />
          Show all pending dues (ignore dates)
        </label>
      ) : null}
      {tab !== "dues" || !allDues ? <DateRangeBar value={range} onChange={setRange} className="mb-5" /> : null}

      {error ? (
        <p className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-destructive">Could not load: {error}</p>
      ) : null}

      {spec.summary?.length ? (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {spec.summary.slice(0, 8).map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 truncate text-lg font-semibold tabular">{loading ? "…" : s.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-2xl bg-card shadow-soft ring-1 ring-black/[0.04]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : tab === "bookings" ? (
          bookingsTable(data.bookings)
        ) : tab === "payments" ? (
          paymentsTable(data.payments)
        ) : tab === "dues" ? (
          duesTable(dues)
        ) : (
          stockTable(data.moves)
        )}
      </div>
    </div>
  );

  function bookingsTable(list: Booking[]) {
    const sorted = [...list].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    const sm = bookingsSummary(list);
    if (!sorted.length) return <EmptyState icon={ClipboardList} title="No bookings in this period" className="border-0" />;
    return (
      <Table
        head={["Booking", "Date", "Customer", "Status", "Total", "Balance"]}
        rows={sorted.map((b) => [
          <Link key="n" href={`/bookings/view?id=${b.id}`} className="font-medium text-primary hover:underline">
            {b.bookingNo}
          </Link>,
          formatDate(b.fromDate),
          b.customerName,
          STATUS_LABEL[b.status],
          formatINR(b.total),
          formatINR(pendingOf(b)),
        ])}
        foot={["Total", "", `${sm.count} bookings`, "", formatINR(sm.value), formatINR(sm.pending)]}
        right={[4, 5]}
      />
    );
  }

  function paymentsTable(list: Payment[]) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const sm = paymentsSummary(list);
    if (!sorted.length) return <EmptyState icon={Wallet} title="No payments in this period" className="border-0" />;
    return (
      <Table
        head={["Date", "Receipt", "Customer", "Mode", "Amount"]}
        rows={sorted.map((p) => [
          formatDate(p.date),
          p.receiptNo,
          <Link key="c" href={`/bookings/view?id=${p.bookingId}`} className="hover:underline">
            {p.customerName}
          </Link>,
          p.mode.toUpperCase(),
          p.type === "refund" ? `-${formatINR(p.amount)}` : formatINR(p.amount),
        ])}
        foot={["Net", "", "", "", formatINR(sm.net)]}
        right={[4]}
      />
    );
  }

  function duesTable(list: Booking[]) {
    if (!list.length) return <EmptyState icon={IndianRupee} title="No pending dues" className="border-0" />;
    const total = list.reduce((s, b) => s + pendingOf(b), 0);
    return (
      <Table
        head={["Booking", "Date", "Customer", "Mobile", "Pending"]}
        rows={list.map((b) => [
          <Link key="n" href={`/bookings/view?id=${b.id}`} className="font-medium text-primary hover:underline">
            {b.bookingNo}
          </Link>,
          formatDate(b.fromDate),
          b.customerName,
          b.customerMobile,
          formatINR(pendingOf(b)),
        ])}
        foot={["Total", "", `${list.length} bookings`, "", formatINR(total)]}
        right={[4]}
      />
    );
  }

  function stockTable(moves: StockMove[]) {
    const active = items.filter((i) => i.active !== false);
    const ms = new Map(summariseMoves(moves).map((s) => [s.itemId, s]));
    if (!active.length) return <EmptyState icon={Package} title="No items" className="border-0" />;
    return (
      <Table
        head={["Item", "Total", "Out", "Damaged", "Available", "Sent (period)", "Missing (period)"]}
        rows={active.map((i) => [
          <Link key="i" href={`/stock/item?id=${i.id}`} className="font-medium hover:underline">
            {i.name}
          </Link>,
          formatNumber(i.totalQty),
          formatNumber(i.outQty),
          formatNumber(i.damagedQty),
          formatNumber(availableNow(i)),
          formatNumber(ms.get(i.id)?.out ?? 0),
          formatNumber(ms.get(i.id)?.missing ?? 0),
        ])}
        right={[1, 2, 3, 4, 5, 6]}
      />
    );
  }
}

function Table({ head, rows, foot, right = [] }: { head: string[]; rows: React.ReactNode[][]; foot?: React.ReactNode[]; right?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            {head.map((h, i) => (
              <th key={i} className={cn("px-4 py-3 font-semibold", right.includes(i) && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, ri) => (
            <tr key={ri} className="hover:bg-muted/40">
              {r.map((c, ci) => (
                <td key={ci} className={cn("px-4 py-2.5 tabular", right.includes(ci) && "text-right")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot ? (
          <tfoot>
            <tr className="border-t bg-gold-soft/50 font-semibold">
              {foot.map((c, ci) => (
                <td key={ci} className={cn("px-4 py-3 tabular", right.includes(ci) && "text-right")}>
                  {c}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
