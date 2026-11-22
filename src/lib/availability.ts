import { overlaps } from "./dates";
import type { Booking, Item } from "./types";

export interface Reservation {
  bookingId: string;
  bookingNo: string;
  customerName: string;
  fromDate: string;
  toDate: string;
  qty: number;
  status: Booking["status"];
}

const FAR_FUTURE = "9999-12-31";

/** Other bookings that already hold this venue on overlapping dates. */
export function venueConflicts(
  bookings: Booking[],
  locationId: string | null | undefined,
  from: string,
  to: string,
  excludeId?: string
): Booking[] {
  if (!locationId || !from || !to) return [];
  return bookings.filter(
    (b) =>
      b.id !== excludeId &&
      b.status !== "cancelled" &&
      b.locationId === locationId &&
      overlaps(b.fromDate, b.toDate, from, to)
  );
}

/**
 * Quantity of each item already promised to other bookings for the given dates.
 * Items that are out and overdue are treated as unavailable until they come back.
 */
export function itemReservations(
  bookings: Booking[],
  from: string,
  to: string,
  today: string,
  excludeId?: string
): Map<string, { qty: number; list: Reservation[] }> {
  const map = new Map<string, { qty: number; list: Reservation[] }>();
  if (!from || !to) return map;
  for (const b of bookings) {
    if (b.id === excludeId) continue;
    if (b.status !== "confirmed" && b.status !== "items_out") continue;
    const effTo = b.status === "items_out" && b.toDate < today ? FAR_FUTURE : b.toDate;
    if (!overlaps(b.fromDate, effTo, from, to)) continue;
    for (const line of b.items || []) {
      const qty = b.status === "items_out" ? Number(line.outQty ?? line.qty) || 0 : Number(line.qty) || 0;
      if (qty <= 0) continue;
      const entry = map.get(line.itemId) ?? { qty: 0, list: [] };
      entry.qty += qty;
      entry.list.push({
        bookingId: b.id,
        bookingNo: b.bookingNo,
        customerName: b.customerName,
        fromDate: b.fromDate,
        toDate: b.toDate,
        qty,
        status: b.status,
      });
      map.set(line.itemId, entry);
    }
  }
  return map;
}

/** Usable stock (good condition) = total - damaged. */
export function usableQty(item: Pick<Item, "totalQty" | "damagedQty">): number {
  return Math.max(0, (Number(item.totalQty) || 0) - (Number(item.damagedQty) || 0));
}

/** Available right now in the godown = total - out - damaged. */
export function availableNow(item: Pick<Item, "totalQty" | "damagedQty" | "outQty">): number {
  return (Number(item.totalQty) || 0) - (Number(item.outQty) || 0) - (Number(item.damagedQty) || 0);
}

/** Available for a date range = usable - reserved by other bookings. */
export function availableForDates(
  item: Pick<Item, "totalQty" | "damagedQty">,
  reserved: number
): number {
  return usableQty(item) - reserved;
}
