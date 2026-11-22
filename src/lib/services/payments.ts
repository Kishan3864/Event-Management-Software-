import { increment, serverTimestamp, updateDoc } from "firebase/firestore";
import { docRef, newDocRef, quickWrite, runAtomic } from "../db";
import { isZero, round2 } from "../format";
import type { Booking, Payment, PaymentMode, PaymentType } from "../types";
import { RECEIPT_COUNTER, readNextSeq, receiptNoOf, writeSeq } from "./counters";

export interface PaymentInput {
  type: PaymentType;
  amount: number;
  date: string;
  mode: PaymentMode;
  note?: string;
}

export function signedAmount(p: { type: PaymentType; amount: number }): number {
  const a = round2(Number(p.amount) || 0);
  return p.type === "refund" ? -a : a;
}

export function netPaid(payments: Pick<Payment, "type" | "amount">[]): number {
  return round2(payments.reduce((s, p) => s + signedAmount(p), 0));
}

export async function addPayment(b: Booking, input: PaymentInput, receiptPrefix?: string) {
  const payRef = newDocRef("payments");
  const bRef = docRef("bookings", b.id);
  const amount = round2(Number(input.amount) || 0);
  if (amount <= 0) throw new Error("Enter an amount greater than zero.");
  const { result, queued } = await runAtomic(async (ctx) => {
    const seq = await readNextSeq(ctx, RECEIPT_COUNTER);
    const bSnap = await ctx.get(bRef);
    if (!bSnap.exists && !ctx.offline) throw new Error("Booking not found.");
    writeSeq(ctx, RECEIPT_COUNTER, seq);
    const receiptNo = receiptNoOf(receiptPrefix, seq);
    const s = signedAmount({ type: input.type, amount });
    ctx.set(payRef, {
      receiptNo,
      seq,
      bookingId: b.id,
      bookingNo: b.bookingNo,
      customerId: b.customerId,
      customerName: b.customerName,
      customerMobile: b.customerMobile,
      type: input.type,
      date: input.date,
      amount,
      mode: input.mode,
      note: (input.note || "").trim(),
      createdAt: serverTimestamp(),
    });
    ctx.update(bRef, { paid: increment(s), balance: increment(-s), updatedAt: serverTimestamp() });
    return { receiptNo };
  });
  return { id: payRef.id, receiptNo: result.receiptNo, queued };
}

export async function updatePayment(p: Payment, input: PaymentInput) {
  const pRef = docRef("payments", p.id);
  const bRef = docRef("bookings", p.bookingId);
  const amount = round2(Number(input.amount) || 0);
  if (amount <= 0) throw new Error("Enter an amount greater than zero.");
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Payment>(pRef);
    const old = snap.data ?? p;
    const delta = round2(signedAmount({ type: input.type, amount }) - signedAmount(old));
    ctx.update(pRef, {
      type: input.type,
      amount,
      date: input.date,
      mode: input.mode,
      note: (input.note || "").trim(),
      updatedAt: serverTimestamp(),
    });
    if (!isZero(delta)) {
      ctx.update(bRef, { paid: increment(delta), balance: increment(-delta), updatedAt: serverTimestamp() });
    }
    return { receiptNo: old.receiptNo };
  });
}

export async function deletePayment(p: Payment) {
  const pRef = docRef("payments", p.id);
  const bRef = docRef("bookings", p.bookingId);
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Payment>(pRef);
    if (!snap.exists && !ctx.offline) throw new Error("Payment already deleted.");
    const old = snap.data ?? p;
    const s = signedAmount(old);
    ctx.delete(pRef);
    ctx.update(bRef, { paid: increment(-s), balance: increment(s), updatedAt: serverTimestamp() });
    return { receiptNo: old.receiptNo };
  });
}

/** Self-healing: make the booking's paid/balance match its payment entries. */
export async function reconcileBooking(b: Booking, payments: Payment[]) {
  const paid = netPaid(payments);
  const balance = round2((Number(b.total) || 0) - paid);
  if (isZero((Number(b.paid) || 0) - paid) && isZero((Number(b.balance) || 0) - balance)) return false;
  await quickWrite(updateDoc(docRef("bookings", b.id), { paid, balance }));
  return true;
}
