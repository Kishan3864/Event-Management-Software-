import { serverTimestamp } from "firebase/firestore";
import { docRef, type AtomicCtx } from "../db";
import type { InvoiceType } from "../types";

export const counterRef = (key: string) => docRef("counters", key);

export const pad4 = (n: number) => String(n).padStart(4, "0");

/** Read the next number of a series. Call during the "read" phase of runAtomic. */
export async function readNextSeq(ctx: AtomicCtx, key: string): Promise<number> {
  const snap = await ctx.get<{ seq?: number }>(counterRef(key));
  return (Number(snap.data?.seq) || 0) + 1;
}

/** Save the number that was used. Call during the "write" phase of runAtomic. */
export function writeSeq(ctx: AtomicCtx, key: string, seq: number) {
  ctx.set(counterRef(key), { seq, updatedAt: serverTimestamp() }, true);
}

export const BOOKING_COUNTER = "booking";
export const RECEIPT_COUNTER = "receipt";

export function invoiceCounterKey(type: InvoiceType, fyLabel: string): string {
  return `${type === "tax" ? "taxInvoice" : "bill"}_${fyLabel}`;
}

export function bookingNoOf(prefix: string | undefined, seq: number): string {
  return `${(prefix || "BK").trim()}-${pad4(seq)}`;
}

export function receiptNoOf(prefix: string | undefined, seq: number): string {
  return `${(prefix || "RC").trim()}-${pad4(seq)}`;
}

export function invoiceNoOf(prefix: string | undefined, fyShort: string, seq: number): string {
  return `${(prefix || "INV").trim()}/${fyShort}/${pad4(seq)}`;
}
