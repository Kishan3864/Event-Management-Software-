import { LOCATION_TYPE_LABEL } from "./constants";
import { round2 } from "./format";
import type {
  Booking,
  BookingItem,
  BookingStatus,
  ChargeLine,
  InvoiceLine,
  TaxMode,
  VenueLine,
} from "./types";

export interface TotalsInput {
  venue?: VenueLine | null;
  items: BookingItem[];
  charges: ChargeLine[];
  damageCharges?: ChargeLine[];
  discount: number;
  taxMode: TaxMode;
  gstRate: number;
  interState: boolean;
  roundOffAuto: boolean;
}

export interface Totals {
  venueAmount: number;
  itemsAmount: number;
  chargesAmount: number;
  damageAmount: number;
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
  roundOff: number;
  grandTotal: number;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sum = (arr: number[]) => round2(arr.reduce((a, b) => a + b, 0));

export function lineAmount(qty: number, rate: number, days: number): number {
  return round2(num(qty) * num(rate) * Math.max(1, num(days) || 1));
}

export function computeTotals(i: TotalsInput): Totals {
  const venueAmount = i.venue ? round2(num(i.venue.amount)) : 0;
  const itemsAmount = sum((i.items || []).map((x) => num(x.amount)));
  const chargesAmount = sum((i.charges || []).map((x) => num(x.amount)));
  const damageAmount = sum((i.damageCharges || []).map((x) => num(x.amount)));
  const subtotal = round2(venueAmount + itemsAmount + chargesAmount + damageAmount);
  const discount = Math.min(Math.max(0, round2(num(i.discount))), subtotal);
  const taxable = round2(subtotal - discount);
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const rate = num(i.gstRate);
  if (i.taxMode === "gst" && rate > 0) {
    if (i.interState) {
      igst = round2((taxable * rate) / 100);
    } else {
      cgst = round2((taxable * rate) / 200);
      sgst = cgst;
    }
  }
  const taxAmount = round2(cgst + sgst + igst);
  const gross = round2(taxable + taxAmount);
  const roundOff = i.roundOffAuto ? round2(Math.round(gross) - gross) : 0;
  const grandTotal = round2(gross + roundOff);
  return {
    venueAmount,
    itemsAmount,
    chargesAmount,
    damageAmount,
    subtotal,
    discount,
    taxable,
    cgst,
    sgst,
    igst,
    taxAmount,
    roundOff,
    grandTotal,
  };
}

export function totalsOf(b: Booking): Totals {
  return computeTotals({
    venue: b.venue,
    items: b.items || [],
    charges: b.charges || [],
    damageCharges: b.damageCharges || [],
    discount: b.discount || 0,
    taxMode: b.taxMode || "none",
    gstRate: b.gstRate || 0,
    interState: !!b.interState,
    roundOffAuto: b.roundOffAuto !== false,
  });
}

/** Amount the customer owes for this booking right now. */
export function payableOf(b: { status: BookingStatus; grandTotal: number; cancelCharge?: number }): number {
  return b.status === "cancelled" ? round2(num(b.cancelCharge)) : round2(num(b.grandTotal));
}

export function hasItems(b: Pick<Booking, "items">): boolean {
  return (b.items || []).length > 0;
}

export function isOverdue(b: Booking, today: string): boolean {
  return b.status === "items_out" && b.toDate < today;
}

export function isActive(b: Booking): boolean {
  return b.status === "confirmed" || b.status === "items_out";
}

export function pendingOf(b: Booking): number {
  const v = round2(num(b.balance));
  return v > 0.004 ? v : 0;
}

export function statusText(b: Booking, today: string): string {
  if (b.status === "items_out") return isOverdue(b, today) ? "Return overdue" : "Items out";
  if (b.status === "completed") return hasItems(b) ? "Returned" : "Completed";
  if (b.status === "cancelled") return "Cancelled";
  if (b.fromDate <= today && b.toDate >= today) return "Today";
  if (b.toDate < today) return "Event over";
  return "Confirmed";
}

/** Total quantity of each item in a booking (lines with the same item are added up). */
export function qtyByItem(items: BookingItem[], field: "qty" | "outQty" = "qty"): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items || []) {
    const q = field === "outQty" ? num(it.outQty ?? it.qty) : num(it.qty);
    m.set(it.itemId, (m.get(it.itemId) || 0) + q);
  }
  return m;
}

export function buildInvoiceLines(b: Booking, defaultHsn?: string): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  if (b.venue) {
    lines.push({
      description: b.venue.name,
      detail: `${LOCATION_TYPE_LABEL[b.venue.type] ?? "Venue"} booking`,
      hsn: defaultHsn,
      qty: 1,
      unit: "venue",
      rate: b.venue.rate,
      days: b.venue.days,
      amount: b.venue.amount,
    });
  }
  for (const it of b.items || []) {
    lines.push({
      description: it.name,
      hsn: it.hsn || defaultHsn,
      qty: it.qty,
      unit: it.unit,
      rate: it.rate,
      days: it.days,
      amount: it.amount,
    });
  }
  for (const c of b.charges || []) {
    lines.push({ description: c.label, hsn: defaultHsn, amount: c.amount });
  }
  for (const c of b.damageCharges || []) {
    lines.push({ description: c.label, detail: "Damage / missing charge", hsn: defaultHsn, amount: c.amount });
  }
  return lines;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
