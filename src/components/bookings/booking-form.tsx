"use client";

import { getDocs, query, where } from "firebase/firestore";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  IndianRupee,
  Loader2,
  MapPin,
  Package,
  Plus,
  Receipt,
  Trash2,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChipGroup, Field, NumInput, Section, num } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { itemReservations, usableQty, venueConflicts } from "@/lib/availability";
import { computeTotals, lineAmount, newId } from "@/lib/calc";
import {
  EVENT_TYPES,
  HOME_STATE,
  INDIAN_STATES,
  LOCATION_TYPE_LABEL,
  PAYMENT_MODES,
} from "@/lib/constants";
import { colRef, fromSnap } from "@/lib/db";
import { addDays, daysInclusive, isValidYMD, todayYMD } from "@/lib/dates";
import { cleanMobile, formatDateRange, formatINR, formatNumber, isValidMobile } from "@/lib/format";
import { createBooking, updateBooking, type BookingDraft } from "@/lib/services/bookings";
import { findCustomerByMobile } from "@/lib/services/customers";
import type { Booking, ChargeKind, ChargeLine, Customer, PaymentMode, TaxMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/providers/confirm-provider";
import { useData } from "@/providers/data-provider";
import { ItemPicker } from "./item-picker";

interface Line {
  key: string;
  itemId: string;
  name: string;
  unit: string;
  qty: number | "";
  rate: number | "";
  days: number | "";
  hsn?: string;
  outQty?: number;
}

type Charge = { id: string; label: string; amount: number | ""; kind: ChargeKind };

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const QUICK_CHARGES: { label: string; kind: ChargeKind }[] = [
  { label: "Labour", kind: "labour" },
  { label: "Transport", kind: "transport" },
  { label: "Decoration", kind: "decoration" },
  { label: "Other", kind: "custom" },
];

export function BookingForm({ initial, prefillMobile }: { initial?: Booking | null; prefillMobile?: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { settings, venues, activeItems, items: allItems, bookings, windowStart } = useData();
  const isEdit = !!initial;
  const today = todayYMD();
  const itemsLocked = initial?.status === "completed";

  // customer
  const [mobile, setMobile] = useState(initial?.customerMobile ?? cleanMobile(prefillMobile ?? ""));
  const [name, setName] = useState(initial?.customerName ?? "");
  const [address, setAddress] = useState(initial?.customerAddress ?? "");
  const [gstin, setGstin] = useState(initial?.customerGstin ?? "");
  const [custState, setCustState] = useState(initial?.customerState || settings.state || HOME_STATE);
  const [customerId, setCustomerId] = useState<string | null>(initial?.customerId ?? null);
  const [found, setFound] = useState<Customer | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [showMore, setShowMore] = useState(
    !!(initial?.customerGstin || (initial?.customerState && initial.customerState !== (settings.state || HOME_STATE)))
  );

  // event
  const knownType = !initial?.eventType || EVENT_TYPES.includes(initial.eventType);
  const [eventType, setEventType] = useState(initial?.eventType ? (knownType ? initial.eventType : "Other") : "");
  const [eventOther, setEventOther] = useState(knownType ? "" : initial?.eventType ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [fromDate, setFromDate] = useState(initial?.fromDate ?? today);
  const [toDate, setToDate] = useState(initial?.toDate ?? today);
  const [eventTime, setEventTime] = useState(initial?.eventTime ?? "");
  const [eventAddress, setEventAddress] = useState(initial?.eventAddress ?? "");

  // venue
  const [venueId, setVenueId] = useState(initial?.venue?.locationId ?? "");
  const [venueRate, setVenueRate] = useState<number | "">(initial?.venue?.rate ?? "");
  const [venueDays, setVenueDays] = useState<number | "">(initial?.venue?.days ?? daysInclusive(initial?.fromDate ?? today, initial?.toDate ?? today));

  // items & charges
  const [lines, setLines] = useState<Line[]>(
    () =>
      initial?.items?.map((i) => ({
        key: newId(),
        itemId: i.itemId,
        name: i.name,
        unit: i.unit,
        qty: i.qty,
        rate: i.rate,
        days: i.days,
        hsn: i.hsn,
        outQty: i.outQty,
      })) ?? []
  );
  const [charges, setCharges] = useState<Charge[]>(
    () => initial?.charges?.map((c) => ({ id: c.id, label: c.label, amount: c.amount, kind: c.kind || "custom" })) ?? []
  );
  const [discount, setDiscount] = useState<number | "">(initial?.discount || "");
  const [taxMode, setTaxMode] = useState<TaxMode>(initial?.taxMode ?? "none");
  const [gstRate, setGstRate] = useState<number | "">(initial?.gstRate || settings.gstRate || 18);
  const [roundOffAuto, setRoundOffAuto] = useState(initial?.roundOffAuto ?? true);
  const [advance, setAdvance] = useState<number | "">("");
  const [advanceMode, setAdvanceMode] = useState<PaymentMode>("cash");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [extraBookings, setExtraBookings] = useState<Booking[]>([]);

  const eventDays = daysInclusive(fromDate, toDate);
  const previousVenue = initial?.venue?.locationId === venueId ? initial?.venue : null;
  const venue = venues.find((v) => v.id === venueId) ?? (
    previousVenue ? { id: previousVenue.locationId, name: previousVenue.name, type: previousVenue.type } : null
  );
  const itemsById = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);

  // ---- customer lookup by mobile
  useEffect(() => {
    const m = cleanMobile(mobile);
    if (!isValidMobile(m)) {
      setFound(null);
      if (!isEdit) setCustomerId(null);
      return;
    }
    let alive = true;
    setLookupBusy(true);
    findCustomerByMobile(m)
      .then((c) => {
        if (!alive) return;
        setFound(c);
        if (c) {
          setCustomerId(c.id);
          setName((n) => (n.trim() ? n : c.name));
          setAddress((a) => (a.trim() ? a : c.address || ""));
          setGstin((g) => g || c.gstin || "");
          if (c.state && !isEdit) {
            setCustState(c.state);
            // A customer from another state changes the tax (IGST): show the field instead of changing it silently.
            if (c.state !== (settings.state || HOME_STATE)) setShowMore(true);
          }
        } else {
          setCustomerId(isEdit ? initial!.customerId : null);
        }
      })
      .catch(() => undefined)
      .finally(() => alive && setLookupBusy(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);

  // ---- older bookings (outside the live window) for conflict checks
  useEffect(() => {
    if (!isValidYMD(fromDate) || fromDate >= windowStart) {
      setExtraBookings([]);
      return;
    }
    let alive = true;
    getDocs(query(colRef("bookings"), where("fromDate", ">=", addDays(fromDate, -60)), where("fromDate", "<=", toDate)))
      .then((snap) => alive && setExtraBookings(snap.docs.map((d) => fromSnap<Booking>(d))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fromDate, toDate, windowStart]);

  const checkSet = useMemo(() => {
    if (!extraBookings.length) return bookings;
    const m = new Map(bookings.map((b) => [b.id, b]));
    for (const b of extraBookings) if (!m.has(b.id)) m.set(b.id, b);
    return [...m.values()];
  }, [bookings, extraBookings]);

  const reserved = useMemo(() => itemReservations(checkSet, fromDate, toDate, today, initial?.id), [checkSet, fromDate, toDate, today, initial?.id]);
  const venueClash = useMemo(() => venueConflicts(checkSet, venueId, fromDate, toDate, initial?.id), [checkSet, venueId, fromDate, toDate, initial?.id]);

  // ---- totals
  const normLines = lines.map((l) => ({
    itemId: l.itemId,
    name: l.name,
    unit: l.unit,
    qty: Math.max(0, Math.round(num(l.qty))),
    rate: Math.max(0, num(l.rate)),
    days: Math.max(1, Math.round(num(l.days)) || eventDays),
    amount: lineAmount(num(l.qty), num(l.rate), Math.max(1, Math.round(num(l.days)) || eventDays)),
    ...(l.hsn ? { hsn: l.hsn } : {}),
    ...(l.outQty != null ? { outQty: l.outQty } : {}),
  }));
  const normCharges: ChargeLine[] = charges.map((c) => ({ id: c.id, label: c.label, amount: Math.max(0, num(c.amount)), kind: c.kind }));
  const venueLine = venue
    ? {
        locationId: venue.id,
        name: venue.name,
        type: venue.type,
        rate: Math.max(0, num(venueRate)),
        days: Math.max(1, Math.round(num(venueDays)) || eventDays),
        amount: lineAmount(1, num(venueRate), Math.max(1, Math.round(num(venueDays)) || eventDays)),
      }
    : null;
  const totals = computeTotals({
    venue: venueLine,
    items: normLines,
    charges: normCharges,
    damageCharges: initial?.damageCharges ?? [],
    discount: num(discount),
    taxMode,
    gstRate: num(gstRate),
    interState: custState !== (settings.state || HOME_STATE),
    roundOffAuto,
  });

  // ---- handlers
  const applyDates = (from: string, to: string) => {
    const t = from && (!to || to < from) ? from : to;
    const oldDays = eventDays;
    const nd = daysInclusive(from, t);
    setFromDate(from);
    setToDate(t);
    if (nd !== oldDays) {
      setLines((ls) => ls.map((l) => (num(l.days) === oldDays || l.days === "" ? { ...l, days: nd } : l)));
      setVenueDays((vd) => (num(vd) === oldDays || vd === "" ? nd : vd));
    }
  };

  const onVenue = (id: string) => {
    if (id === "none") {
      setVenueId("");
      return;
    }
    const v = venues.find((x) => x.id === id);
    const saved = initial?.venue?.locationId === id ? initial.venue : null;
    setVenueId(id);
    setVenueRate(v?.rate ?? saved?.rate ?? "");
    setVenueDays(saved?.days ?? eventDays);
    if (v && !eventAddress.trim()) setEventAddress([v.name, v.address].filter(Boolean).join(", "));
  };

  const onPicked = (qty: Record<string, number>) => {
    setLines((ls) => {
      const next: Line[] = [];
      const seen = new Set<string>();
      for (const l of ls) {
        if (l.itemId in qty) {
          seen.add(l.itemId);
          if (qty[l.itemId] > 0) next.push({ ...l, qty: qty[l.itemId] });
        } else next.push(l);
      }
      for (const [id, q] of Object.entries(qty)) {
        if (q <= 0 || seen.has(id)) continue;
        const it = itemsById.get(id);
        if (!it) continue;
        next.push({ key: newId(), itemId: id, name: it.name, unit: it.unit, qty: q, rate: it.rate, days: eventDays, hsn: it.hsn || undefined });
      }
      return next;
    });
  };

  const currentQty = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) m[l.itemId] = (m[l.itemId] || 0) + num(l.qty);
    return m;
  }, [lines]);

  const lineAvail = (l: Line) => {
    const it = itemsById.get(l.itemId);
    if (!it) return null;
    return usableQty(it) - (reserved.get(l.itemId)?.qty ?? 0);
  };

  const onSave = async () => {
    const e: Record<string, string> = {};
    const m = cleanMobile(mobile);
    if (!isValidMobile(m)) e.mobile = "Enter a valid 10 digit mobile number";
    if (!name.trim()) e.name = "Customer name is required";
    if (!isValidYMD(fromDate)) e.fromDate = "Choose the event date";
    if (!isValidYMD(toDate) || toDate < fromDate) e.toDate = "End date cannot be before start date";
    const realCharges = normCharges.filter((c) => c.label.trim() || c.amount > 0);
    if (!venueLine && normLines.length === 0 && realCharges.length === 0) e.lines = "Add a venue, items or charges";
    if (normLines.some((l) => l.qty <= 0)) e.lines = "Item quantity must be more than 0";
    if (realCharges.some((c) => !c.label.trim())) e.charges = "Give every charge a name";
    if (taxMode === "gst" && (num(gstRate) <= 0 || num(gstRate) > 40)) e.gst = "Enter a valid GST rate";
    if (gstin.trim() && !GSTIN_RE.test(gstin.trim().toUpperCase())) e.gstin = "GSTIN looks incorrect";
    if (!isEdit && num(advance) > totals.grandTotal + 0.001) e.advance = "Advance is more than the total";
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("Please check the highlighted fields");
      const first = document.querySelector("[data-error='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const warnings: string[] = [];
    if (venueLine && venueClash.length) {
      warnings.push(
        `${venueLine.name} is already booked: ${venueClash
          .map((b) => `${b.bookingNo} ${b.customerName} (${formatDateRange(b.fromDate, b.toDate)})`)
          .join("; ")}`
      );
    }
    if (!itemsLocked) {
      const totalsByItem = new Map<string, { name: string; qty: number; unit: string }>();
      for (const l of normLines) {
        const t = totalsByItem.get(l.itemId) ?? { name: l.name, qty: 0, unit: l.unit };
        t.qty += l.qty;
        totalsByItem.set(l.itemId, t);
      }
      for (const [id, t] of totalsByItem) {
        const it = itemsById.get(id);
        if (!it) continue;
        const avail = usableQty(it) - (reserved.get(id)?.qty ?? 0);
        if (t.qty > avail) warnings.push(`${t.name}: only ${formatNumber(Math.max(0, avail))} ${t.unit} available on these dates, you entered ${formatNumber(t.qty)}.`);
      }
    }
    if (warnings.length) {
      const ok = await confirm({
        title: "Please check before saving",
        description: (
          <ul className="list-disc space-y-1.5 pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ),
        confirmText: "Save anyway",
      });
      if (!ok) return;
    }

    const draft: BookingDraft = {
      customerId,
      customerName: name.trim(),
      customerMobile: m,
      customerAddress: address,
      customerGstin: gstin,
      customerState: custState,
      eventType: eventType === "Other" ? eventOther.trim() || "Other" : eventType,
      notes,
      fromDate,
      toDate,
      eventTime,
      eventAddress,
      venue: venueLine,
      items: normLines,
      charges: realCharges,
      discount: num(discount),
      roundOffAuto,
      taxMode,
      gstRate: num(gstRate),
      interState: custState !== (settings.state || HOME_STATE),
    };

    setSaving(true);
    try {
      if (isEdit && initial) {
        const r = await updateBooking(initial.id, draft);
        toast.success(`Booking ${initial.bookingNo} updated`, {
          description: r.queued ? "Saved on this phone. It will sync when the internet is back." : undefined,
        });
        router.replace(`/bookings/view?id=${initial.id}`);
      } else {
        const r = await createBooking(
          draft,
          settings,
          num(advance) > 0 ? { amount: num(advance), mode: advanceMode, date: today } : null
        );
        toast.success(`Booking ${r.bookingNo} saved`, {
          description: r.queued ? "Saved on this phone. It will sync when the internet is back." : undefined,
        });
        router.replace(`/bookings/view?id=${r.id}`);
      }
    } catch (err) {
      toast.error("Could not save the booking", { description: (err as Error).message });
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Customer */}
      <Section title="Customer" icon={UserRound}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number" required error={errors.mobile} hint={found ? undefined : "We'll fill details for existing customers"}>
            <div className="relative" data-error={!!errors.mobile}>
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted-foreground">+91</span>
              <Input
                inputMode="tel"
                autoComplete="tel"
                placeholder="10 digit mobile"
                value={mobile}
                maxLength={14}
                onChange={(e) => setMobile(cleanMobile(e.target.value))}
                className="pl-12 tabular"
                aria-invalid={!!errors.mobile}
              />
              {lookupBusy ? <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
            </div>
          </Field>
          <Field label="Customer name" required error={errors.name}>
            <Input
              data-error={!!errors.name}
              autoComplete="name"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
            />
          </Field>
          {found ? (
            <div className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm text-success sm:col-span-2">
              <Check className="size-4 shrink-0" />
              <span>
                Existing customer · {found.bookingsCount ?? 0} booking{found.bookingsCount === 1 ? "" : "s"}
                {found.name !== name.trim() && name.trim() ? ` (saved as “${found.name}”)` : ""}
              </span>
            </div>
          ) : null}
          <Field label="Address" className="sm:col-span-2">
            <Textarea rows={2} placeholder="House, street, area, city" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          {showMore ? (
            <>
              <Field label="Customer GSTIN" hint="Only for tax invoice" error={errors.gstin}>
                <Input value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="Optional" />
              </Field>
              <Field label="Customer state" hint={custState !== (settings.state || HOME_STATE) ? "Other state: IGST applies" : "Same state: CGST + SGST"}>
                <Select value={custState} onValueChange={setCustState}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-72">
                    {INDIAN_STATES.map((s) => (
                      <SelectItem key={s.code} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          ) : (
            <button type="button" onClick={() => setShowMore(true)} className="justify-self-start text-sm font-medium text-primary hover:underline">
              + GSTIN / other state
            </button>
          )}
        </div>
      </Section>

      {/* Event */}
      <Section title="Event" icon={CalendarDays}>
        <div className="space-y-4">
          <Field label="Event type">
            <ChipGroup size="sm" options={EVENT_TYPES.map((t) => ({ value: t, label: t }))} value={eventType} onChange={setEventType} />
            {eventType === "Other" ? (
              <Input className="mt-2" placeholder="Type the event" value={eventOther} onChange={(e) => setEventOther(e.target.value)} />
            ) : null}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="From date" required error={errors.fromDate}>
              <Input type="date" value={fromDate} onChange={(e) => applyDates(e.target.value, toDate)} data-error={!!errors.fromDate} />
            </Field>
            <Field label="To date" required error={errors.toDate}>
              <Input type="date" min={fromDate} value={toDate} onChange={(e) => applyDates(fromDate, e.target.value)} data-error={!!errors.toDate} />
            </Field>
            <Field label="Time" hint="Optional" className="col-span-2 sm:col-span-1">
              <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">
            {eventDays} day{eventDays > 1 ? "s" : ""} · {formatDateRange(fromDate, toDate)}
          </p>
          <Field label="Event address">
            <Textarea rows={2} placeholder="Where is the event?" value={eventAddress} onChange={(e) => setEventAddress(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Textarea rows={2} placeholder="Anything to remember" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Section>

      {/* Venue */}
      <Section title="Venue" icon={MapPin}>
        {venues.length === 0 && !venue ? (
          <p className="text-sm text-muted-foreground">Add a bookable location in Settings → Venues & godowns. For a one-off event, enter its address in Event details.</p>
        ) : (
          <div className="space-y-3">
            <Select value={venueId || "none"} onValueChange={onVenue}>
              <SelectTrigger aria-label="Venue">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="none">No venue (only items on rent)</SelectItem>
                {venue && !venues.some((v) => v.id === venue.id) ? (
                  <SelectItem value={venue.id}>{venue.name} (previously booked)</SelectItem>
                ) : null}
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} · {LOCATION_TYPE_LABEL[v.type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {venueLine ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Rent / day">
                    <NumInput prefix="₹" value={venueRate} onValueChange={setVenueRate} placeholder="0" />
                  </Field>
                  <Field label="Days">
                    <NumInput decimals={false} value={venueDays} onValueChange={setVenueDays} />
                  </Field>
                  <Field label="Amount" className="col-span-2 sm:col-span-1">
                    <div className="flex min-h-11 items-center rounded-xl bg-muted px-3 font-semibold tabular md:min-h-10">{formatINR(venueLine.amount)}</div>
                  </Field>
                </div>
                {venueClash.length ? (
                  <div className="flex gap-2 rounded-xl bg-danger-soft p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">Already booked on these dates</p>
                      {venueClash.map((b) => (
                        <p key={b.id} className="text-destructive/90">
                          {b.bookingNo} · {b.customerName} · {formatDateRange(b.fromDate, b.toDate)}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-success">
                    <Check className="size-4" /> Available on these dates
                  </p>
                )}
              </>
            ) : null}
          </div>
        )}
      </Section>

      {/* Items */}
      <Section
        title="Items on rent"
        icon={Package}
        action={
          !itemsLocked ? (
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} disabled={activeItems.length === 0}>
              <Plus /> Add items
            </Button>
          ) : null
        }
      >
        {itemsLocked ? (
          <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">Items are already returned, so quantities can&apos;t be changed.</p>
        ) : initial?.status === "items_out" ? (
          <p className="mb-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">Items are out. Changing a quantity will update stock.</p>
        ) : null}
        {errors.lines ? (
          <p className="mb-3 text-sm font-medium text-destructive" data-error="true">
            {errors.lines}
          </p>
        ) : null}
        {activeItems.length === 0 && lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items in stock yet. Add items in Stock first.</p>
        ) : lines.length === 0 ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed py-6 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <Package className="size-5 text-primary" />
            Tap to add chairs, tents, gadda, utensils…
          </button>
        ) : (
          <div className="space-y-2.5">
            {lines.map((l, idx) => {
              const avail = lineAvail(l);
              const short = avail !== null && num(l.qty) > avail;
              const upd = (patch: Partial<Line>) => setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
              const amount = lineAmount(num(l.qty), num(l.rate), Math.max(1, num(l.days) || eventDays));
              return (
                <div key={l.key} className={cn("rounded-2xl border bg-card p-3", short && "border-destructive/40 bg-danger-soft/30")}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{l.name}</p>
                      {avail !== null ? (
                        <p className={cn("text-xs", short ? "font-medium text-destructive" : "text-muted-foreground")}>
                          {short ? "Not enough: " : ""}
                          {formatNumber(Math.max(0, avail))} {l.unit} available on these dates
                        </p>
                      ) : null}
                    </div>
                    {!itemsLocked ? (
                      <Button variant="ghost" size="icon-sm" aria-label="Remove item" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}>
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Field label={`Qty (${l.unit})`}>
                      <NumInput decimals={false} value={l.qty} disabled={itemsLocked} onValueChange={(v) => upd({ qty: v })} />
                    </Field>
                    <Field label="Rate ₹">
                      <NumInput value={l.rate} disabled={itemsLocked} onValueChange={(v) => upd({ rate: v })} />
                    </Field>
                    <Field label="Days">
                      <NumInput decimals={false} value={l.days} disabled={itemsLocked} onValueChange={(v) => upd({ days: v })} />
                    </Field>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground tabular">
                      {formatNumber(num(l.qty))} × {formatINR(num(l.rate))} × {Math.max(1, num(l.days) || eventDays)}d
                    </span>
                    <span className="font-semibold tabular">{formatINR(amount)}</span>
                  </div>
                </div>
              );
            })}
            {!itemsLocked ? (
              <Button variant="outline" className="w-full border-dashed" onClick={() => setPickerOpen(true)}>
                <Plus /> Add more items
              </Button>
            ) : null}
          </div>
        )}
      </Section>

      {/* Charges */}
      <Section title="Extra charges" icon={Receipt}>
        <div className="space-y-2.5">
          {charges.map((c, idx) => (
            <div key={c.id} className="flex items-center gap-2">
              <Input
                placeholder="Charge name"
                value={c.label}
                onChange={(e) => setCharges((cs) => cs.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))}
                className="flex-1"
              />
              <NumInput
                prefix="₹"
                placeholder="0"
                value={c.amount}
                onValueChange={(v) => setCharges((cs) => cs.map((x, i) => (i === idx ? { ...x, amount: v } : x)))}
                className="w-32"
              />
              <Button variant="ghost" size="icon-sm" aria-label="Remove charge" onClick={() => setCharges((cs) => cs.filter((_, i) => i !== idx))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {errors.charges ? <p className="text-sm text-destructive">{errors.charges}</p> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {QUICK_CHARGES.map((q) => (
              <Button
                key={q.label}
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setCharges((cs) => [...cs, { id: newId(), label: q.kind === "custom" ? "" : q.label, amount: "", kind: q.kind }])}
              >
                <Plus /> {q.label}
              </Button>
            ))}
          </div>
          {initial?.damageCharges?.length ? (
            <div className="rounded-xl bg-muted/60 p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Damage / missing charges (from return)</p>
              {initial.damageCharges.map((d) => (
                <div key={d.id} className="flex justify-between">
                  <span>{d.label}</span>
                  <span className="tabular">{formatINR(d.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Section>

      {/* Summary */}
      <Section title="Bill summary" icon={IndianRupee}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <Field label="Discount">
              <NumInput prefix="₹" placeholder="0" value={discount} onValueChange={setDiscount} />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Add GST</p>
                <p className="text-xs text-muted-foreground">You can also choose this while making the invoice</p>
              </div>
              <Switch checked={taxMode === "gst"} onCheckedChange={(v) => setTaxMode(v ? "gst" : "none")} aria-label="Add GST" />
            </div>
            {taxMode === "gst" ? (
              <Field label="GST rate %" error={errors.gst}>
                <NumInput value={gstRate} onValueChange={setGstRate} />
              </Field>
            ) : null}
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Round off total</p>
                <p className="text-xs text-muted-foreground">To the nearest rupee</p>
              </div>
              <Switch checked={roundOffAuto} onCheckedChange={setRoundOffAuto} aria-label="Round off" />
            </div>
          </div>
          <div className="rounded-2xl bg-muted/50 p-4">
            {totals.venueAmount ? <Row label="Venue" value={formatINR(totals.venueAmount)} /> : null}
            {totals.itemsAmount ? <Row label="Items" value={formatINR(totals.itemsAmount)} /> : null}
            {totals.chargesAmount ? <Row label="Charges" value={formatINR(totals.chargesAmount)} /> : null}
            {totals.damageAmount ? <Row label="Damage charges" value={formatINR(totals.damageAmount)} /> : null}
            <Row label="Sub total" value={formatINR(totals.subtotal)} strong />
            {totals.discount ? <Row label="Discount" value={`- ${formatINR(totals.discount)}`} className="text-success" /> : null}
            {totals.taxAmount ? (
              totals.igst ? (
                <Row label={`IGST ${num(gstRate)}%`} value={formatINR(totals.igst)} />
              ) : (
                <>
                  <Row label={`CGST ${num(gstRate) / 2}%`} value={formatINR(totals.cgst)} />
                  <Row label={`SGST ${num(gstRate) / 2}%`} value={formatINR(totals.sgst)} />
                </>
              )
            ) : null}
            {totals.roundOff ? <Row label="Round off" value={formatINR(totals.roundOff)} /> : null}
            <div className="mt-2 flex items-baseline justify-between border-t pt-3">
              <span className="font-semibold">Grand total</span>
              <span className="text-2xl font-semibold text-primary tabular">{formatINR(totals.grandTotal)}</span>
            </div>
            {initial?.status === "cancelled" ? (
              <p className="mt-2 text-xs text-muted-foreground">Cancelled booking: payable is the cancellation charge ({formatINR(initial.cancelCharge)}).</p>
            ) : null}
          </div>
        </div>
        {!isEdit ? (
          <div className="mt-5 rounded-2xl border border-gold/20 bg-gold-soft/60 p-4">
            <p className="mb-3 text-sm font-semibold">Advance received (optional)</p>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-start">
              <Field error={errors.advance}>
                <NumInput prefix="₹" placeholder="0" value={advance} onValueChange={setAdvance} data-error={!!errors.advance} />
              </Field>
              <ChipGroup size="sm" options={PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))} value={advanceMode} onChange={setAdvanceMode} className="sm:pt-1.5" />
            </div>
          </div>
        ) : null}
      </Section>

      {/* Sticky save bar */}
      <div className="h-4" />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t bg-background/92 backdrop-blur-xl lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Grand total</p>
            <p className="truncate text-xl font-semibold tabular">{formatINR(totals.grandTotal)}</p>
          </div>
          <Button variant="outline" size="lg" onClick={() => router.back()} disabled={saving} className="hidden sm:inline-flex">
            Cancel
          </Button>
          <Button size="lg" onClick={onSave} disabled={saving} className="min-w-36">
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            {isEdit ? "Save changes" : "Save booking"}
          </Button>
        </div>
      </div>

      <ItemPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        items={activeItems}
        current={currentQty}
        reserved={reserved}
        onDone={onPicked}
      />
    </div>
  );
}

function Row({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between py-1 text-sm", className)}>
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular", strong && "font-semibold")}>{value}</span>
    </div>
  );
}
