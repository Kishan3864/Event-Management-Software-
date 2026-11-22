import { availableNow } from "./availability";
import { pendingOf } from "./calc";
import { PAYMENT_MODES, PAYMENT_MODE_LABEL, PAYMENT_TYPE_LABEL, STATUS_LABEL } from "./constants";
import { addMonths, endOfMonth, fyOf, startOfMonth, todayYMD } from "./dates";
import { formatDate, formatINR, formatNumber, round2 } from "./format";
import type { ReportSpec } from "./pdf/types";
import { signedAmount } from "./services/payments";
import type { Booking, Item, Payment, StockMove } from "./types";

export interface Range {
  from: string;
  to: string;
  label: string;
}

export function presetRanges(): { key: string; range: Range }[] {
  const today = todayYMD();
  const fy = fyOf(today);
  const lastMonth = addMonths(today, -1);
  const prevFy = fyOf(`${Number(fy.start.slice(0, 4)) - 1}-06-01`);
  return [
    { key: "today", range: { from: today, to: today, label: "Today" } },
    { key: "month", range: { from: startOfMonth(today), to: endOfMonth(today), label: "This month" } },
    { key: "last", range: { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth), label: "Last month" } },
    { key: "fy", range: { from: fy.start, to: fy.end, label: `FY ${fy.label}` } },
    { key: "prevfy", range: { from: prevFy.start, to: prevFy.end, label: `FY ${prevFy.label}` } },
  ];
}

export function periodLabel(r: Range): string {
  return r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} to ${formatDate(r.to)}`;
}

const m = (n: number) => formatINR(n, { decimals: 2, symbol: false });

// ---------------------------------------------------------------- bookings
export function bookingsSummary(list: Booking[]) {
  const active = list.filter((b) => b.status !== "cancelled");
  return {
    count: active.length,
    cancelled: list.length - active.length,
    value: round2(list.reduce((s, b) => s + (Number(b.total) || 0), 0)),
    received: round2(list.reduce((s, b) => s + (Number(b.paid) || 0), 0)),
    pending: round2(list.reduce((s, b) => s + pendingOf(b), 0)),
  };
}

export function bookingsReport(list: Booking[], r: Range): ReportSpec {
  const sorted = [...list].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  const sm = bookingsSummary(sorted);
  return {
    title: "Bookings Report",
    period: periodLabel(r),
    summary: [
      { label: "Bookings", value: String(sm.count) + (sm.cancelled ? ` (+${sm.cancelled} cancelled)` : "") },
      { label: "Booking value", value: formatINR(sm.value) },
      { label: "Received", value: formatINR(sm.received) },
      { label: "Pending", value: formatINR(sm.pending) },
    ],
    columns: [
      { key: "no", label: "Booking", width: 52 },
      { key: "date", label: "Event date", width: 74 },
      { key: "customer", label: "Customer" },
      { key: "venue", label: "Venue / items", width: 92 },
      { key: "status", label: "Status", width: 54 },
      { key: "total", label: "Total", width: 58, align: "right" },
      { key: "paid", label: "Received", width: 58, align: "right" },
      { key: "due", label: "Balance", width: 56, align: "right" },
    ],
    rows: sorted.map((b) => ({
      no: b.bookingNo,
      date: b.fromDate === b.toDate ? formatDate(b.fromDate) : `${formatDate(b.fromDate)}\n${formatDate(b.toDate)}`,
      customer: `${b.customerName}\n${b.customerMobile}`,
      venue: b.venue ? b.venue.name : `${b.items.length} item${b.items.length === 1 ? "" : "s"}`,
      status: STATUS_LABEL[b.status],
      total: m(b.total),
      paid: m(b.paid),
      due: m(pendingOf(b)),
    })),
    totals: { no: "Total", total: m(sm.value), paid: m(sm.received), due: m(sm.pending) },
  };
}

// ---------------------------------------------------------------- payments
export function paymentsSummary(list: Payment[]) {
  const inflow = round2(list.filter((p) => p.type !== "refund").reduce((s, p) => s + p.amount, 0));
  const refunds = round2(list.filter((p) => p.type === "refund").reduce((s, p) => s + p.amount, 0));
  const byMode = PAYMENT_MODES.map((md) => ({
    mode: md.value,
    label: md.label,
    amount: round2(list.filter((p) => p.mode === md.value).reduce((s, p) => s + signedAmount(p), 0)),
  }));
  return { inflow, refunds, net: round2(inflow - refunds), byMode, count: list.length };
}

export function paymentsReport(list: Payment[], r: Range): ReportSpec {
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.seq ?? 0) - (b.seq ?? 0));
  const sm = paymentsSummary(sorted);
  return {
    title: "Payments Collected",
    period: periodLabel(r),
    summary: [
      { label: "Received", value: formatINR(sm.inflow) },
      { label: "Refunded", value: formatINR(sm.refunds) },
      { label: "Net collection", value: formatINR(sm.net) },
      ...sm.byMode.filter((x) => x.amount !== 0).map((x) => ({ label: x.label, value: formatINR(x.amount) })),
    ],
    columns: [
      { key: "date", label: "Date", width: 62 },
      { key: "receipt", label: "Receipt", width: 56 },
      { key: "customer", label: "Customer" },
      { key: "booking", label: "Booking", width: 52 },
      { key: "type", label: "Type", width: 50 },
      { key: "mode", label: "Mode", width: 44 },
      { key: "amount", label: "Amount", width: 66, align: "right" },
    ],
    rows: sorted.map((p) => ({
      date: formatDate(p.date),
      receipt: p.receiptNo,
      customer: p.customerName,
      booking: p.bookingNo,
      type: PAYMENT_TYPE_LABEL[p.type],
      mode: PAYMENT_MODE_LABEL[p.mode],
      amount: p.type === "refund" ? `-${m(p.amount)}` : m(p.amount),
    })),
    totals: { date: "Net", amount: m(sm.net) },
  };
}

// ---------------------------------------------------------------- dues
export function duesReport(list: Booking[], label: string): ReportSpec {
  const sorted = [...list].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  const total = round2(sorted.reduce((s, b) => s + pendingOf(b), 0));
  const customers = new Set(sorted.map((b) => b.customerId)).size;
  return {
    title: "Pending Dues",
    period: label,
    summary: [
      { label: "Total pending", value: formatINR(total) },
      { label: "Bookings", value: String(sorted.length) },
      { label: "Customers", value: String(customers) },
    ],
    columns: [
      { key: "no", label: "Booking", width: 52 },
      { key: "date", label: "Event date", width: 62 },
      { key: "customer", label: "Customer" },
      { key: "mobile", label: "Mobile", width: 66 },
      { key: "total", label: "Total", width: 60, align: "right" },
      { key: "paid", label: "Received", width: 60, align: "right" },
      { key: "due", label: "Pending", width: 62, align: "right" },
    ],
    rows: sorted.map((b) => ({
      no: b.bookingNo,
      date: formatDate(b.fromDate),
      customer: b.customerName,
      mobile: b.customerMobile,
      total: m(b.total),
      paid: m(b.paid),
      due: m(pendingOf(b)),
    })),
    totals: { no: "Total", due: m(total) },
  };
}

// ---------------------------------------------------------------- stock
export interface MoveSummary {
  itemId: string;
  name: string;
  added: number;
  out: number;
  returned: number;
  damaged: number;
  missing: number;
}

export function summariseMoves(moves: StockMove[]): MoveSummary[] {
  const map = new Map<string, MoveSummary>();
  for (const mv of moves) {
    const s = map.get(mv.itemId) ?? { itemId: mv.itemId, name: mv.itemName, added: 0, out: 0, returned: 0, damaged: 0, missing: 0 };
    const q = Math.abs(Number(mv.qty) || 0);
    if (mv.type === "added") s.added += q;
    else if (mv.type === "out") s.out += q;
    else if (mv.type === "returned") s.returned += q;
    else if (mv.type === "damaged") s.damaged += q;
    else if (mv.type === "missing") s.missing += q;
    map.set(mv.itemId, s);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function stockReport(items: Item[], moves: StockMove[], r: Range): ReportSpec {
  const active = items.filter((i) => i.active !== false);
  const totals = active.reduce(
    (t, i) => ({
      total: t.total + (Number(i.totalQty) || 0),
      out: t.out + (Number(i.outQty) || 0),
      damaged: t.damaged + (Number(i.damagedQty) || 0),
      avail: t.avail + availableNow(i),
    }),
    { total: 0, out: 0, damaged: 0, avail: 0 }
  );
  const ms = summariseMoves(moves);
  return {
    title: "Stock Report",
    period: periodLabel(r),
    summary: [
      { label: "Items", value: String(active.length) },
      { label: "Total quantity", value: formatNumber(totals.total) },
      { label: "Out on rent", value: formatNumber(totals.out) },
      { label: "Damaged", value: formatNumber(totals.damaged) },
    ],
    note: "Current stock as on today. Movements are for the selected period.",
    columns: [
      { key: "name", label: "Item" },
      { key: "cat", label: "Category", width: 86 },
      { key: "total", label: "Total", width: 46, align: "right" },
      { key: "out", label: "Out", width: 42, align: "right" },
      { key: "dam", label: "Damaged", width: 50, align: "right" },
      { key: "avail", label: "Available", width: 54, align: "right" },
      { key: "rate", label: "Rate/day", width: 56, align: "right" },
    ],
    rows: active.map((i) => ({
      name: `${i.name} (${i.unit})`,
      cat: i.categoryName || "Other",
      total: formatNumber(i.totalQty),
      out: formatNumber(i.outQty),
      dam: formatNumber(i.damagedQty),
      avail: formatNumber(availableNow(i)),
      rate: m(i.rate),
    })),
    totals: {
      name: "Total",
      total: formatNumber(totals.total),
      out: formatNumber(totals.out),
      dam: formatNumber(totals.damaged),
      avail: formatNumber(totals.avail),
    },
    sections: [
      {
        title: "Movements in this period",
        columns: [
          { key: "name", label: "Item" },
          { key: "added", label: "Added", width: 52, align: "right" },
          { key: "out", label: "Sent out", width: 56, align: "right" },
          { key: "ret", label: "Returned", width: 58, align: "right" },
          { key: "dam", label: "Damaged", width: 56, align: "right" },
          { key: "mis", label: "Missing", width: 52, align: "right" },
        ],
        rows: ms.map((s) => ({
          name: s.name,
          added: formatNumber(s.added),
          out: formatNumber(s.out),
          ret: formatNumber(s.returned),
          dam: formatNumber(s.damaged),
          mis: formatNumber(s.missing),
        })),
      },
    ],
  };
}
