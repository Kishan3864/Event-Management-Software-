import { PAYMENT_MODE_LABEL, PAYMENT_TYPE_LABEL } from "./constants";
import { pendingOf } from "./calc";
import { formatDate, formatDateRange, formatINR, formatTime } from "./format";
import type { Booking, Payment, Settings } from "./types";

export function waLink(mobile: string, text: string): string {
  const digits = (mobile || "").replace(/\D/g, "");
  const phone = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(mobile: string, text: string) {
  window.open(waLink(mobile, text), "_blank", "noopener,noreferrer");
}

/** Joins lines, dropping empty optional lines (null/false) and repeated blank lines. */
function compose(lines: (string | null | false | undefined)[]): string {
  const out: string[] = [];
  for (const l of lines) {
    if (l === null || l === false || l === undefined) continue;
    if (l === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(l);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

function signature(s?: Settings | null): string[] {
  const name = s?.name || "";
  const phone = [s?.phone1, s?.phone2].filter(Boolean).join(", ");
  return [name, phone].filter(Boolean);
}

export function bookingMessage(b: Booking, s?: Settings | null): string {
  const cancelled = b.status === "cancelled";
  return compose([
    `Namaste ${b.customerName} ji,`,
    "",
    `Your booking${s?.name ? ` with ${s.name}` : ""} is ${cancelled ? "cancelled" : "confirmed"}.`,
    "",
    `Booking No: ${b.bookingNo}`,
    b.eventType ? `Event: ${b.eventType}` : null,
    `Date: ${formatDateRange(b.fromDate, b.toDate)}${b.eventTime ? `, ${formatTime(b.eventTime)}` : ""}`,
    b.venue ? `Venue: ${b.venue.name}` : null,
    b.eventAddress ? `Address: ${b.eventAddress}` : null,
    ...(b.items?.length ? ["", "Items:", ...b.items.map((it) => `• ${it.name}: ${it.qty} ${it.unit}`)] : []),
    "",
    `Total: ${formatINR(b.total)}`,
    `Received: ${formatINR(b.paid)}`,
    `Balance: ${formatINR(pendingOf(b))}`,
    "",
    "Thank you!",
    ...signature(s),
  ]);
}

export function reminderMessage(b: Booking, s?: Settings | null): string {
  return compose([
    `Namaste ${b.customerName} ji,`,
    "",
    `This is a gentle reminder that ${formatINR(pendingOf(b))} is pending for your booking ${b.bookingNo} (event on ${formatDate(b.fromDate)}).`,
    `Total: ${formatINR(b.total)} | Received: ${formatINR(b.paid)}`,
    s?.bank?.upiId ? `UPI: ${s.bank.upiId}` : null,
    "",
    "Please clear the balance at the earliest. Thank you!",
    ...signature(s),
  ]);
}

export function customerDuesMessage(name: string, total: number, bookings: Booking[], s?: Settings | null): string {
  return compose([
    `Namaste ${name} ji,`,
    "",
    `Your total pending amount${s?.name ? ` with ${s.name}` : ""} is ${formatINR(total)}.`,
    ...bookings.map((b) => `• ${b.bookingNo} (${formatDate(b.fromDate)}): ${formatINR(pendingOf(b))}`),
    s?.bank?.upiId ? `UPI: ${s.bank.upiId}` : null,
    "",
    "Thank you!",
    ...signature(s),
  ]);
}

export function receiptMessage(p: Payment, b: Booking | null, s?: Settings | null): string {
  const isRefund = p.type === "refund";
  return compose([
    `Namaste ${p.customerName} ji,`,
    "",
    isRefund
      ? `We have refunded ${formatINR(p.amount)} on ${formatDate(p.date)} by ${PAYMENT_MODE_LABEL[p.mode]}.`
      : `We have received ${formatINR(p.amount)} (${PAYMENT_TYPE_LABEL[p.type]}) on ${formatDate(p.date)} by ${PAYMENT_MODE_LABEL[p.mode]}.`,
    `Receipt No: ${p.receiptNo}`,
    `Booking No: ${p.bookingNo}`,
    b ? `Balance: ${formatINR(pendingOf(b))}` : null,
    "",
    "Thank you!",
    ...signature(s),
  ]);
}
