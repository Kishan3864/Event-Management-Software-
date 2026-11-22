import { deleteDoc, increment, serverTimestamp } from "firebase/firestore";
import { buildInvoiceLines, computeTotals } from "../calc";
import { HOME_STATE } from "../constants";
import { docRef, newDocRef, quickWrite, runAtomic } from "../db";
import { fyOf } from "../dates";
import { round2 } from "../format";
import type { Booking, Invoice, InvoiceType, Settings, TaxMode } from "../types";
import { invoiceCounterKey, invoiceNoOf, readNextSeq, writeSeq } from "./counters";

export interface InvoiceOptions {
  type: InvoiceType;
  date: string;
  gstRate: number;
  hsnSac: string;
  customerGstin: string;
  customerState: string;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function snapshot(b: Booking, opts: InvoiceOptions, homeState: string) {
  const taxMode: TaxMode = opts.type === "tax" ? "gst" : "none";
  const customerState = opts.customerState || homeState;
  const interState = opts.type === "tax" && customerState !== homeState;
  const gstRate = opts.type === "tax" ? n(opts.gstRate) : n(b.gstRate);
  const t = computeTotals({
    venue: b.venue,
    items: b.items || [],
    charges: b.charges || [],
    damageCharges: b.damageCharges || [],
    discount: n(b.discount),
    taxMode,
    gstRate,
    interState,
    roundOffAuto: b.roundOffAuto !== false,
  });
  const paid = round2(n(b.paid));
  const invoice = {
    bookingId: b.id,
    bookingNo: b.bookingNo,
    customerId: b.customerId,
    customer: {
      name: b.customerName,
      mobile: b.customerMobile,
      address: b.customerAddress || "",
      gstin: (opts.customerGstin || "").trim().toUpperCase(),
      state: customerState,
    },
    placeOfSupply: customerState,
    eventFrom: b.fromDate,
    eventTo: b.toDate,
    eventType: b.eventType || "",
    eventAddress: b.eventAddress || "",
    venueName: b.venue?.name || "",
    lines: buildInvoiceLines(b, opts.hsnSac?.trim() || undefined),
    subtotal: t.subtotal,
    discount: t.discount,
    taxable: t.taxable,
    gstRate: taxMode === "gst" ? gstRate : 0,
    interState,
    hsnSac: (opts.hsnSac || "").trim(),
    cgst: t.cgst,
    sgst: t.sgst,
    igst: t.igst,
    taxAmount: t.taxAmount,
    roundOff: t.roundOff,
    total: t.grandTotal,
    paid,
    balance: round2(t.grandTotal - paid),
    updatedAt: serverTimestamp(),
  };
  const bookingPatch = {
    taxMode,
    gstRate,
    interState,
    customerGstin: invoice.customer.gstin,
    customerState,
    subtotal: t.subtotal,
    discount: t.discount,
    taxable: t.taxable,
    taxAmount: t.taxAmount,
    roundOff: t.roundOff,
    grandTotal: t.grandTotal,
    total: t.grandTotal,
    balance: increment(round2(t.grandTotal - n(b.total))),
    updatedAt: serverTimestamp(),
  };
  return { invoice, bookingPatch };
}

export async function createInvoice(bookingId: string, opts: InvoiceOptions, settings: Settings) {
  const invRef = newDocRef("invoices");
  const bRef = docRef("bookings", bookingId);
  const fy = fyOf(opts.date);
  const key = invoiceCounterKey(opts.type, fy.label);
  const homeState = settings.state || HOME_STATE;
  const { result, queued } = await runAtomic(async (ctx) => {
    const bSnap = await ctx.get<Booking>(bRef);
    const seq = await readNextSeq(ctx, key);
    if (!bSnap.exists || !bSnap.data) throw new Error("Booking not found.");
    const b = { ...bSnap.data, id: bookingId } as Booking;
    if (b.status === "cancelled") throw new Error("A cancelled booking cannot be billed.");
    writeSeq(ctx, key, seq);
    const prefix = opts.type === "tax" ? settings.prefixes?.taxInvoice || "TI" : settings.prefixes?.bill || "BL";
    const invoiceNo = invoiceNoOf(prefix, fy.short, seq);
    const { invoice, bookingPatch } = snapshot(b, opts, homeState);
    ctx.set(invRef, {
      ...invoice,
      type: opts.type,
      invoiceNo,
      fy: fy.label,
      seq,
      date: opts.date,
      createdAt: serverTimestamp(),
    });
    ctx.update(bRef, bookingPatch);
    return { invoiceNo };
  });
  return { id: invRef.id, invoiceNo: result.invoiceNo, queued };
}

/** Re-reads the booking and updates the invoice (same number and date). */
export async function refreshInvoice(inv: Invoice, settings: Settings) {
  const iRef = docRef("invoices", inv.id);
  const bRef = docRef("bookings", inv.bookingId);
  const homeState = settings.state || HOME_STATE;
  return runAtomic(async (ctx) => {
    const bSnap = await ctx.get<Booking>(bRef);
    if (!bSnap.exists || !bSnap.data) throw new Error("Booking not found.");
    const b = { ...bSnap.data, id: inv.bookingId } as Booking;
    const { invoice, bookingPatch } = snapshot(
      b,
      {
        type: inv.type,
        date: inv.date,
        gstRate: inv.type === "tax" ? inv.gstRate : n(b.gstRate),
        hsnSac: inv.hsnSac || settings.hsnSac || "",
        customerGstin: inv.customer?.gstin || b.customerGstin || "",
        customerState: inv.customer?.state || b.customerState || homeState,
      },
      homeState
    );
    ctx.update(iRef, invoice);
    if (b.status !== "cancelled") ctx.update(bRef, bookingPatch);
    return { invoiceNo: inv.invoiceNo };
  });
}

export async function deleteInvoice(inv: Invoice) {
  return quickWrite(deleteDoc(docRef("invoices", inv.id)));
}
