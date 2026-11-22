import { deleteField, getDocs, increment, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { computeTotals, hasItems, lineAmount, newId, qtyByItem, type Totals } from "../calc";
import { colRef, docRef, newDocRef, quickWrite, runAtomic, type AtomicCtx } from "../db";
import { daysInclusive, todayYMD } from "../dates";
import { db } from "../firebase";
import { round2 } from "../format";
import type {
  Booking,
  BookingItem,
  ChargeLine,
  MoveType,
  PaymentMode,
  Settings,
  TaxMode,
  VenueLine,
} from "../types";
import { BOOKING_COUNTER, RECEIPT_COUNTER, bookingNoOf, readNextSeq, receiptNoOf, writeSeq } from "./counters";

export interface BookingDraft {
  customerId?: string | null;
  customerName: string;
  customerMobile: string;
  customerAddress?: string;
  customerGstin?: string;
  customerState?: string;
  eventType?: string;
  notes?: string;
  fromDate: string;
  toDate: string;
  eventTime?: string;
  eventAddress?: string;
  venue: VenueLine | null;
  items: BookingItem[];
  charges: ChargeLine[];
  discount: number;
  roundOffAuto: boolean;
  taxMode: TaxMode;
  gstRate: number;
  interState: boolean;
}

export interface AdvanceInput {
  amount: number;
  mode: PaymentMode;
  date: string;
  note?: string;
}

const clean = (s?: string | null) => (s ?? "").trim();
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function normaliseItems(items: BookingItem[], eventDays: number): BookingItem[] {
  return (items || [])
    .filter((i) => i.itemId && n(i.qty) > 0)
    .map((i) => {
      const qty = n(i.qty);
      const rate = Math.max(0, n(i.rate));
      const days = Math.max(1, Math.round(n(i.days)) || eventDays || 1);
      const line: BookingItem = {
        itemId: i.itemId,
        name: clean(i.name),
        unit: i.unit || "pcs",
        qty,
        rate,
        days,
        amount: lineAmount(qty, rate, days),
      };
      if (i.hsn) line.hsn = i.hsn;
      if (i.outQty != null) line.outQty = n(i.outQty);
      if (i.returnedQty != null) line.returnedQty = n(i.returnedQty);
      if (i.damagedQty != null) line.damagedQty = n(i.damagedQty);
      if (i.missingQty != null) line.missingQty = n(i.missingQty);
      return line;
    });
}

function normaliseCharges(c: ChargeLine[]): ChargeLine[] {
  return (c || [])
    .filter((x) => clean(x.label) || n(x.amount) > 0)
    .map((x) => ({
      id: x.id || newId(),
      label: clean(x.label) || "Charges",
      amount: round2(Math.max(0, n(x.amount))),
      kind: x.kind || "custom",
    }));
}

function normaliseVenue(v: VenueLine | null | undefined, eventDays: number): VenueLine | null {
  if (!v || !v.locationId) return null;
  const rate = Math.max(0, n(v.rate));
  const days = Math.max(1, Math.round(n(v.days)) || eventDays || 1);
  return { locationId: v.locationId, name: v.name, type: v.type, rate, days, amount: lineAmount(1, rate, days) };
}

function totalsFor(
  b: Pick<Booking, "venue" | "charges" | "damageCharges" | "discount" | "taxMode" | "gstRate" | "interState" | "roundOffAuto">,
  items: BookingItem[],
  damageCharges?: ChargeLine[]
): Totals {
  return computeTotals({
    venue: b.venue,
    items,
    charges: b.charges || [],
    damageCharges: damageCharges ?? b.damageCharges ?? [],
    discount: n(b.discount),
    taxMode: b.taxMode || "none",
    gstRate: n(b.gstRate),
    interState: !!b.interState,
    roundOffAuto: b.roundOffAuto !== false,
  });
}

function totalsFields(t: Totals) {
  return {
    subtotal: t.subtotal,
    discount: t.discount,
    taxable: t.taxable,
    taxAmount: t.taxAmount,
    roundOff: t.roundOff,
    grandTotal: t.grandTotal,
  };
}

function buildFields(d: BookingDraft, damageCharges: ChargeLine[], items: BookingItem[]) {
  const days = daysInclusive(d.fromDate, d.toDate);
  const venue = normaliseVenue(d.venue, days);
  const charges = normaliseCharges(d.charges);
  const t = computeTotals({
    venue,
    items,
    charges,
    damageCharges,
    discount: n(d.discount),
    taxMode: d.taxMode,
    gstRate: n(d.gstRate),
    interState: !!d.interState,
    roundOffAuto: d.roundOffAuto,
  });
  const name = clean(d.customerName);
  return {
    customerName: name,
    customerNameLower: name.toLowerCase(),
    customerMobile: d.customerMobile,
    customerAddress: clean(d.customerAddress),
    customerGstin: clean(d.customerGstin).toUpperCase(),
    customerState: d.customerState || "",
    eventType: clean(d.eventType),
    notes: clean(d.notes),
    fromDate: d.fromDate,
    toDate: d.toDate,
    eventTime: d.eventTime || "",
    eventAddress: clean(d.eventAddress),
    days,
    venue,
    locationId: venue?.locationId ?? null,
    items,
    charges,
    damageCharges,
    roundOffAuto: d.roundOffAuto,
    taxMode: d.taxMode,
    gstRate: n(d.gstRate),
    interState: !!d.interState,
    ...totalsFields(t),
  };
}

function customerPatch(d: BookingDraft): Record<string, unknown> {
  const name = clean(d.customerName);
  const p: Record<string, unknown> = {
    name,
    nameLower: name.toLowerCase(),
    mobile: d.customerMobile,
    updatedAt: serverTimestamp(),
  };
  if (clean(d.customerAddress)) p.address = clean(d.customerAddress);
  if (clean(d.customerGstin)) p.gstin = clean(d.customerGstin).toUpperCase();
  if (d.customerState) p.state = d.customerState;
  return p;
}

function addMove(
  ctx: AtomicCtx,
  m: { itemId: string; itemName: string; type: MoveType; qty: number; bookingId?: string; bookingNo?: string; note?: string; date: string }
) {
  ctx.set(newDocRef("stockMoves"), { ...m, note: m.note || "", createdAt: serverTimestamp() });
}

// ---------------------------------------------------------------- create

export async function createBooking(d: BookingDraft, settings: Settings, advance?: AdvanceInput | null) {
  const bRef = newDocRef("bookings");
  const custRef = d.customerId ? docRef("customers", d.customerId) : newDocRef("customers");
  const payRef = newDocRef("payments");
  const hasAdvance = !!advance && n(advance.amount) > 0;

  const { result, queued } = await runAtomic(async (ctx) => {
    // reads
    const bSeq = await readNextSeq(ctx, BOOKING_COUNTER);
    const rSeq = hasAdvance ? await readNextSeq(ctx, RECEIPT_COUNTER) : 0;
    // writes
    writeSeq(ctx, BOOKING_COUNTER, bSeq);
    const bookingNo = bookingNoOf(settings.prefixes?.booking, bSeq);
    const days = daysInclusive(d.fromDate, d.toDate);
    const fields = buildFields(d, [], normaliseItems(d.items, days));
    const total = fields.grandTotal;
    const paid = hasAdvance ? round2(n(advance!.amount)) : 0;
    ctx.set(bRef, {
      ...fields,
      bookingNo,
      seq: bSeq,
      customerId: custRef.id,
      status: "confirmed",
      total,
      paid,
      balance: round2(total - paid),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    ctx.set(
      custRef,
      {
        ...customerPatch(d),
        lastEventDate: d.fromDate,
        bookingsCount: increment(1),
        ...(d.customerId ? {} : { createdAt: serverTimestamp() }),
      },
      true
    );
    if (hasAdvance) {
      writeSeq(ctx, RECEIPT_COUNTER, rSeq);
      ctx.set(payRef, {
        receiptNo: receiptNoOf(settings.prefixes?.receipt, rSeq),
        seq: rSeq,
        bookingId: bRef.id,
        bookingNo,
        customerId: custRef.id,
        customerName: fields.customerName,
        customerMobile: fields.customerMobile,
        type: "advance",
        date: advance!.date || todayYMD(),
        amount: paid,
        mode: advance!.mode,
        note: clean(advance!.note),
        createdAt: serverTimestamp(),
      });
    }
    return { bookingNo };
  });
  return { id: bRef.id, bookingNo: result.bookingNo, queued, paymentId: hasAdvance ? payRef.id : null };
}

// ---------------------------------------------------------------- update

export async function updateBooking(id: string, d: BookingDraft) {
  const bRef = docRef("bookings", id);
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Booking>(bRef);
    if (!snap.exists || !snap.data) throw new Error("Booking not found. It may have been deleted.");
    const old = { ...snap.data, id } as Booking;
    const days = daysInclusive(d.fromDate, d.toDate);

    let items: BookingItem[];
    const stockOps: { itemId: string; itemName: string; delta: number }[] = [];
    if (old.status === "completed") {
      items = old.items || [];
    } else if (old.status === "items_out") {
      items = normaliseItems(d.items, days).map((l) => ({ ...l, outQty: l.qty }));
      const before = qtyByItem(old.items || [], "outQty");
      const after = qtyByItem(items, "qty");
      const names = new Map<string, string>();
      for (const l of [...(old.items || []), ...items]) names.set(l.itemId, l.name);
      for (const itemId of new Set([...before.keys(), ...after.keys()])) {
        const delta = (after.get(itemId) || 0) - (before.get(itemId) || 0);
        if (delta !== 0) stockOps.push({ itemId, itemName: names.get(itemId) || "", delta });
      }
    } else {
      items = normaliseItems(d.items, days);
    }

    const fields = buildFields(d, old.damageCharges || [], items);
    const newTotal = old.status === "cancelled" ? round2(n(old.cancelCharge)) : fields.grandTotal;
    const targetCustomerId = d.customerId || old.customerId;

    ctx.update(bRef, {
      ...fields,
      customerId: targetCustomerId,
      total: newTotal,
      balance: increment(round2(newTotal - n(old.total))),
      updatedAt: serverTimestamp(),
    });

    if (targetCustomerId === old.customerId) {
      ctx.set(docRef("customers", targetCustomerId), customerPatch(d), true);
    } else {
      ctx.set(
        docRef("customers", targetCustomerId),
        { ...customerPatch(d), bookingsCount: increment(1), lastEventDate: d.fromDate },
        true
      );
      if (old.customerId) ctx.set(docRef("customers", old.customerId), { bookingsCount: increment(-1) }, true);
    }

    const today = todayYMD();
    for (const op of stockOps) {
      ctx.update(docRef("items", op.itemId), { outQty: increment(op.delta), updatedAt: serverTimestamp() });
      addMove(ctx, {
        itemId: op.itemId,
        itemName: op.itemName,
        type: op.delta > 0 ? "out" : "returned",
        qty: Math.abs(op.delta),
        bookingId: id,
        bookingNo: old.bookingNo,
        note: "Booking quantity changed",
        date: today,
      });
    }
    return { bookingNo: old.bookingNo };
  });
}

// ---------------------------------------------------------------- items out

export async function markItemsOut(id: string, sendQty: number[], date: string, note?: string) {
  const bRef = docRef("bookings", id);
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Booking>(bRef);
    if (!snap.exists || !snap.data) throw new Error("Booking not found.");
    const old = snap.data;
    if (old.status !== "confirmed") {
      throw new Error(
        old.status === "items_out" ? "Items are already marked as out." : "Only confirmed bookings can send items."
      );
    }
    const items = (old.items || [])
      .map((l, i) => {
        const q = Math.max(0, n(sendQty[i] ?? l.qty));
        return { ...l, qty: q, outQty: q, amount: lineAmount(q, l.rate, l.days) };
      })
      .filter((l) => l.qty > 0);
    if (!items.length) throw new Error("Enter the quantity of at least one item to send.");
    const t = totalsFor(old, items);
    ctx.update(bRef, {
      items,
      ...totalsFields(t),
      total: t.grandTotal,
      balance: increment(round2(t.grandTotal - n(old.total))),
      status: "items_out",
      outDate: date,
      updatedAt: serverTimestamp(),
    });
    const names = new Map(items.map((l) => [l.itemId, l.name]));
    for (const [itemId, q] of qtyByItem(items, "qty")) {
      ctx.update(docRef("items", itemId), { outQty: increment(q), updatedAt: serverTimestamp() });
      addMove(ctx, {
        itemId,
        itemName: names.get(itemId) || "",
        type: "out",
        qty: q,
        bookingId: id,
        bookingNo: old.bookingNo,
        note: clean(note),
        date,
      });
    }
    return { bookingNo: old.bookingNo };
  });
}

// ---------------------------------------------------------------- return

export interface ReturnLine {
  returned: number;
  damaged: number;
  missing: number;
  charge: number;
}

export async function returnItems(id: string, lines: ReturnLine[], date: string, note?: string) {
  const bRef = docRef("bookings", id);
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Booking>(bRef);
    if (!snap.exists || !snap.data) throw new Error("Booking not found.");
    const old = snap.data;
    if (old.status !== "items_out") throw new Error("Items are not out for this booking.");

    const newDamage: ChargeLine[] = [];
    const items: BookingItem[] = (old.items || []).map((l, i) => {
      const out = n(l.outQty ?? l.qty);
      const r = lines[i] ?? { returned: out, damaged: 0, missing: 0, charge: 0 };
      const damaged = Math.max(0, n(r.damaged));
      const missing = Math.max(0, n(r.missing));
      const returned = Math.max(0, n(r.returned));
      if (returned + damaged + missing !== out) {
        throw new Error(`${l.name}: returned + damaged + missing must equal ${out}.`);
      }
      if (n(r.charge) > 0) {
        const parts = [damaged ? `${damaged} damaged` : "", missing ? `${missing} missing` : ""].filter(Boolean);
        newDamage.push({
          id: newId(),
          label: `${l.name}${parts.length ? ` (${parts.join(", ")})` : ""}`,
          amount: round2(n(r.charge)),
          kind: "damage",
        });
      }
      return { ...l, outQty: out, returnedQty: returned, damagedQty: damaged, missingQty: missing };
    });

    const damageCharges = [...(old.damageCharges || []), ...newDamage];
    const t = totalsFor(old, items, damageCharges);
    ctx.update(bRef, {
      items,
      damageCharges,
      ...totalsFields(t),
      total: t.grandTotal,
      balance: increment(round2(t.grandTotal - n(old.total))),
      status: "completed",
      returnDate: date,
      completedDate: date,
      returnNote: clean(note),
      updatedAt: serverTimestamp(),
    });

    const agg = new Map<string, { name: string; out: number; ret: number; dam: number; mis: number }>();
    for (const l of items) {
      const a = agg.get(l.itemId) ?? { name: l.name, out: 0, ret: 0, dam: 0, mis: 0 };
      a.out += n(l.outQty);
      a.ret += n(l.returnedQty);
      a.dam += n(l.damagedQty);
      a.mis += n(l.missingQty);
      agg.set(l.itemId, a);
    }
    for (const [itemId, a] of agg) {
      ctx.update(docRef("items", itemId), {
        outQty: increment(-a.out),
        damagedQty: increment(a.dam),
        totalQty: increment(-a.mis),
        updatedAt: serverTimestamp(),
      });
      const base = { itemId, itemName: a.name, bookingId: id, bookingNo: old.bookingNo, date, note: clean(note) };
      if (a.ret) addMove(ctx, { ...base, type: "returned", qty: a.ret });
      if (a.dam) addMove(ctx, { ...base, type: "damaged", qty: a.dam });
      if (a.mis) addMove(ctx, { ...base, type: "missing", qty: a.mis });
    }
    return { bookingNo: old.bookingNo };
  });
}

/** Reverses a return entered by mistake: items go back to "out" and damage charges are removed. */
export async function undoReturn(id: string) {
  const bRef = docRef("bookings", id);
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Booking>(bRef);
    if (!snap.exists || !snap.data) throw new Error("Booking not found.");
    const old = snap.data;
    if (old.status !== "completed" || !hasItems(old) || !old.returnDate) {
      throw new Error("This booking has no return to undo.");
    }
    const agg = new Map<string, { name: string; out: number; dam: number; mis: number }>();
    const items: BookingItem[] = (old.items || []).map((l) => {
      const a = agg.get(l.itemId) ?? { name: l.name, out: 0, dam: 0, mis: 0 };
      a.out += n(l.outQty ?? l.qty);
      a.dam += n(l.damagedQty);
      a.mis += n(l.missingQty);
      agg.set(l.itemId, a);
      const rest = { ...l };
      delete rest.returnedQty;
      delete rest.damagedQty;
      delete rest.missingQty;
      return rest;
    });
    const damageCharges = (old.damageCharges || []).filter((c) => c.kind !== "damage");
    const t = totalsFor(old, items, damageCharges);
    ctx.update(bRef, {
      items,
      damageCharges,
      ...totalsFields(t),
      total: t.grandTotal,
      balance: increment(round2(t.grandTotal - n(old.total))),
      status: "items_out",
      returnDate: deleteField(),
      completedDate: deleteField(),
      returnNote: deleteField(),
      updatedAt: serverTimestamp(),
    });
    const today = todayYMD();
    for (const [itemId, a] of agg) {
      ctx.update(docRef("items", itemId), {
        outQty: increment(a.out),
        damagedQty: increment(-a.dam),
        totalQty: increment(a.mis),
        updatedAt: serverTimestamp(),
      });
      const base = { itemId, itemName: a.name, bookingId: id, bookingNo: old.bookingNo, date: today, note: "Return undone" };
      addMove(ctx, { ...base, type: "out", qty: a.out });
      if (a.dam) addMove(ctx, { ...base, type: "repaired", qty: a.dam });
      if (a.mis) addMove(ctx, { ...base, type: "adjustment", qty: a.mis });
    }
    return { bookingNo: old.bookingNo };
  });
}

// ---------------------------------------------------------------- status changes

export async function completeBooking(id: string, date: string) {
  const bRef = docRef("bookings", id);
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Booking>(bRef);
    if (!snap.exists || !snap.data) throw new Error("Booking not found.");
    const old = snap.data;
    if (old.status !== "confirmed") throw new Error("Only confirmed bookings can be completed.");
    if (hasItems(old)) throw new Error("This booking has items. Use Items Out and Return.");
    ctx.update(bRef, { status: "completed", completedDate: date, updatedAt: serverTimestamp() });
    return { bookingNo: old.bookingNo };
  });
}

export async function reopenBooking(id: string) {
  const bRef = docRef("bookings", id);
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Booking>(bRef);
    if (!snap.exists || !snap.data) throw new Error("Booking not found.");
    const old = snap.data;
    if (old.status !== "completed" || hasItems(old)) throw new Error("Only completed venue bookings can be reopened.");
    ctx.update(bRef, { status: "confirmed", completedDate: deleteField(), updatedAt: serverTimestamp() });
    return { bookingNo: old.bookingNo };
  });
}

export async function cancelBooking(id: string, charge: number, reason: string, date: string) {
  const bRef = docRef("bookings", id);
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Booking>(bRef);
    if (!snap.exists || !snap.data) throw new Error("Booking not found.");
    const old = snap.data;
    if (old.status !== "confirmed") throw new Error("Only confirmed bookings can be cancelled. Return items first.");
    const total = round2(Math.max(0, n(charge)));
    ctx.update(bRef, {
      status: "cancelled",
      cancelCharge: total,
      cancelReason: clean(reason),
      cancelledDate: date,
      total,
      balance: increment(round2(total - n(old.total))),
      updatedAt: serverTimestamp(),
    });
    return { bookingNo: old.bookingNo };
  });
}

export async function restoreBooking(id: string) {
  const bRef = docRef("bookings", id);
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Booking>(bRef);
    if (!snap.exists || !snap.data) throw new Error("Booking not found.");
    const old = snap.data;
    if (old.status !== "cancelled") throw new Error("This booking is not cancelled.");
    const total = round2(n(old.grandTotal));
    ctx.update(bRef, {
      status: "confirmed",
      cancelCharge: deleteField(),
      cancelReason: deleteField(),
      cancelledDate: deleteField(),
      total,
      balance: increment(round2(total - n(old.total))),
      updatedAt: serverTimestamp(),
    });
    return { bookingNo: old.bookingNo };
  });
}

// ---------------------------------------------------------------- delete

export async function deleteBooking(b: Booking) {
  if (b.status === "items_out" || b.status === "completed") {
    throw new Error("Only confirmed or cancelled bookings can be deleted.");
  }
  const [pays, invs] = await Promise.all([
    getDocs(query(colRef("payments"), where("bookingId", "==", b.id))),
    getDocs(query(colRef("invoices"), where("bookingId", "==", b.id))),
  ]);
  const batch = writeBatch(db());
  batch.delete(docRef("bookings", b.id));
  pays.forEach((p) => batch.delete(p.ref));
  invs.forEach((i) => batch.delete(i.ref));
  if (b.customerId) batch.set(docRef("customers", b.customerId), { bookingsCount: increment(-1) }, { merge: true });
  return quickWrite(batch.commit());
}
