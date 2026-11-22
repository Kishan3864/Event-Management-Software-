"use client";

import { AlertTriangle, CheckCheck, FileText, Loader2, Receipt, Truck, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChipGroup, Field, NumInput, num } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { availableNow } from "@/lib/availability";
import { computeTotals, pendingOf } from "@/lib/calc";
import { HOME_STATE, INDIAN_STATES, PAYMENT_MODES } from "@/lib/constants";
import { todayYMD } from "@/lib/dates";
import { formatINR, formatNumber, round2 } from "@/lib/format";
import { cancelBooking, markItemsOut, returnItems } from "@/lib/services/bookings";
import { createInvoice } from "@/lib/services/invoices";
import { addPayment, updatePayment } from "@/lib/services/payments";
import type { Booking, InvoiceType, Item, Payment, PaymentMode, PaymentType, Settings } from "@/lib/types";
import { cn } from "@/lib/utils";

const queuedNote = "Saved on this phone. It will sync when the internet is back.";

// ============================================================ Items out
export function ItemsOutDialog({
  open,
  onOpenChange,
  booking,
  items,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  booking: Booking;
  items: Item[];
  onDone?: () => void;
}) {
  const [qty, setQty] = useState<(number | "")[]>([]);
  const [date, setDate] = useState(todayYMD());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => {
    if (open) {
      setQty(booking.items.map((i) => i.qty));
      setDate(todayYMD());
      setNote("");
    }
  }, [open, booking.items]);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await markItemsOut(booking.id, qty.map((q) => Math.max(0, Math.round(num(q)))), date, note);
      toast.success("Items marked as out", { description: r.queued ? queuedNote : "Stock updated." });
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error("Could not update", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5 text-primary" /> Send items out
          </DialogTitle>
          <DialogDescription>Check the quantity being sent. Change it if less is going.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {booking.items.map((l, i) => {
            const it = byId.get(l.itemId);
            const avail = it ? availableNow(it) : null;
            const short = avail !== null && num(qty[i]) > avail;
            return (
              <div key={i} className={cn("flex items-center gap-3 rounded-xl border p-3", short && "border-destructive/40 bg-danger-soft/40")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.name}</p>
                  <p className={cn("text-xs", short ? "text-destructive" : "text-muted-foreground")}>
                    Booked {formatNumber(l.qty)} · {avail === null ? "" : `${formatNumber(Math.max(0, avail))} in godown`}
                  </p>
                </div>
                <NumInput
                  decimals={false}
                  aria-label={`${l.name} quantity to send`}
                  value={qty[i] ?? ""}
                  onValueChange={(v) => setQty((arr) => arr.map((x, j) => (j === i ? v : x)))}
                  className="w-24 text-center"
                />
              </div>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} placeholder="Vehicle, person…" onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Truck />} Confirm items out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ Return
interface RL {
  damaged: number | "";
  missing: number | "";
  charge: number | "";
}

export function ReturnDialog({
  open,
  onOpenChange,
  booking,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  booking: Booking;
  onDone?: () => void;
}) {
  const [rows, setRows] = useState<RL[]>([]);
  const [date, setDate] = useState(todayYMD());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRows(booking.items.map(() => ({ damaged: "", missing: "", charge: "" })));
      setDate(todayYMD());
      setNote("");
    }
  }, [open, booking.items]);

  const computed = booking.items.map((l, i) => {
    const out = Number(l.outQty ?? l.qty) || 0;
    const r = rows[i] ?? { damaged: "", missing: "", charge: "" };
    const damaged = Math.round(num(r.damaged));
    const missing = Math.round(num(r.missing));
    return { out, damaged, missing, returned: out - damaged - missing, charge: num(r.charge) };
  });
  const invalid = computed.some((c) => c.returned < 0);
  const totalCharge = round2(computed.reduce((s, c) => s + c.charge, 0));
  const anyIssue = computed.some((c) => c.damaged || c.missing);

  const upd = (i: number, patch: Partial<RL>) => setRows((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    if (invalid) {
      toast.error("Damaged + missing can't be more than the quantity sent");
      return;
    }
    setBusy(true);
    try {
      const r = await returnItems(
        booking.id,
        computed.map((c) => ({ returned: c.returned, damaged: c.damaged, missing: c.missing, charge: c.charge })),
        date,
        note
      );
      toast.success("Return saved", { description: r.queued ? queuedNote : "Stock updated and booking completed." });
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error("Could not save the return", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="size-5 text-primary" /> Return items
          </DialogTitle>
          <DialogDescription>
            Everything is counted as returned. Enter only damaged or missing quantities, and a charge if you want to bill it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          {booking.items.map((l, i) => {
            const c = computed[i];
            return (
              <div key={i} className={cn("rounded-2xl border p-3", c.returned < 0 && "border-destructive/50 bg-danger-soft/40", (c.damaged || c.missing) && c.returned >= 0 && "border-warning/40 bg-warning-soft/30")}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-medium">{l.name}</p>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    Sent {formatNumber(c.out)} · <span className={c.returned < 0 ? "text-destructive" : "font-medium text-success"}>Returned {formatNumber(Math.max(0, c.returned))}</span>
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Field label="Damaged">
                    <NumInput decimals={false} placeholder="0" value={rows[i]?.damaged ?? ""} onValueChange={(v) => upd(i, { damaged: v })} />
                  </Field>
                  <Field label="Missing">
                    <NumInput decimals={false} placeholder="0" value={rows[i]?.missing ?? ""} onValueChange={(v) => upd(i, { missing: v })} />
                  </Field>
                  <Field label="Charge ₹">
                    <NumInput
                      placeholder={c.damaged || c.missing ? String(round2((c.damaged + c.missing) * l.rate)) : "0"}
                      value={rows[i]?.charge ?? ""}
                      onValueChange={(v) => upd(i, { charge: v })}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Return date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <div className="rounded-xl bg-muted/60 p-3 text-sm">
          {anyIssue ? (
            <p>
              Damage / missing charge added to bill: <b className="tabular">{formatINR(totalCharge)}</b>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-success">
              <CheckCheck className="size-4" /> All items returned in good condition
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || invalid}>
            {busy ? <Loader2 className="animate-spin" /> : <CheckCheck />} Save return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ Payment
export function PaymentDialog({
  open,
  onOpenChange,
  booking,
  payment,
  settings,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  booking: Booking;
  payment?: Payment | null;
  settings: Settings;
  onSaved?: (id: string) => void;
}) {
  const [type, setType] = useState<PaymentType>("payment");
  const [amount, setAmount] = useState<number | "">("");
  const [date, setDate] = useState(todayYMD());
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (payment) {
      setType(payment.type);
      setAmount(payment.amount);
      setDate(payment.date);
      setMode(payment.mode);
      setNote(payment.note || "");
    } else {
      const pending = pendingOf(booking);
      const t: PaymentType = booking.balance < -0.004 ? "refund" : booking.paid <= 0 && booking.fromDate > todayYMD() ? "advance" : "payment";
      setType(t);
      setAmount(t === "refund" ? round2(Math.abs(booking.balance)) : t === "payment" && pending > 0 ? pending : "");
      setDate(todayYMD());
      setMode("cash");
      setNote("");
    }
  }, [open, payment, booking]);

  const submit = async () => {
    if (num(amount) <= 0) {
      setError("Enter the amount");
      return;
    }
    setBusy(true);
    try {
      const input = { type, amount: num(amount), date, mode, note };
      if (payment) {
        const r = await updatePayment(payment, input);
        toast.success("Payment updated", { description: r.queued ? queuedNote : undefined });
        onOpenChange(false);
        onSaved?.(payment.id);
      } else {
        const r = await addPayment(booking, input, settings.prefixes.receipt);
        toast.success(`${type === "refund" ? "Refund" : "Payment"} saved · ${r.receiptNo}`, { description: r.queued ? queuedNote : undefined });
        onOpenChange(false);
        onSaved?.(r.id);
      }
    } catch (e) {
      toast.error("Could not save", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" /> {payment ? `Edit ${payment.receiptNo}` : "Add payment"}
          </DialogTitle>
          <DialogDescription>
            {booking.bookingNo} · Total {formatINR(booking.total)} · Pending {formatINR(pendingOf(booking))}
          </DialogDescription>
        </DialogHeader>
        <ChipGroup
          options={[
            { value: "advance" as PaymentType, label: "Advance" },
            { value: "payment" as PaymentType, label: "Payment" },
            { value: "refund" as PaymentType, label: "Refund" },
          ]}
          value={type}
          onChange={setType}
        />
        <Field label={type === "refund" ? "Refund amount" : "Amount received"} error={error}>
          <NumInput prefix="₹" autoFocus value={amount} onValueChange={(v) => { setAmount(v); setError(null); }} className="h-12 text-lg" placeholder="0" />
        </Field>
        {type !== "refund" && pendingOf(booking) > 0 && !payment ? (
          <button type="button" className="-mt-2 self-start text-xs font-medium text-primary hover:underline" onClick={() => setAmount(pendingOf(booking))}>
            Full pending: {formatINR(pendingOf(booking))}
          </button>
        ) : null}
        <Field label="Mode">
          <ChipGroup size="sm" options={PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))} value={mode} onChange={setMode} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} placeholder="UTR / cheque no" onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Receipt />} {payment ? "Save changes" : "Save payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ Invoice / Bill
export function InvoiceDialog({
  open,
  onOpenChange,
  booking,
  settings,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  booking: Booking;
  settings: Settings;
  onCreated?: (id: string, invoiceNo: string, type: InvoiceType) => void;
}) {
  const [type, setType] = useState<InvoiceType>("bill");
  const [date, setDate] = useState(todayYMD());
  const [gstRate, setGstRate] = useState<number | "">(18);
  const [hsn, setHsn] = useState("");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState(HOME_STATE);
  const [busy, setBusy] = useState(false);
  const home = settings.state || HOME_STATE;

  useEffect(() => {
    if (!open) return;
    setType(booking.taxMode === "gst" ? "tax" : "bill");
    setDate(todayYMD());
    setGstRate(booking.gstRate || settings.gstRate || 18);
    setHsn(settings.hsnSac || "");
    setGstin(booking.customerGstin || "");
    setState(booking.customerState || home);
  }, [open, booking, settings, home]);

  const t = computeTotals({
    venue: booking.venue,
    items: booking.items || [],
    charges: booking.charges || [],
    damageCharges: booking.damageCharges || [],
    discount: booking.discount || 0,
    taxMode: type === "tax" ? "gst" : "none",
    gstRate: num(gstRate),
    interState: type === "tax" && state !== home,
    roundOffAuto: booking.roundOffAuto !== false,
  });
  const changes = Math.abs(t.grandTotal - booking.total) > 0.004;

  const submit = async () => {
    if (type === "tax" && (num(gstRate) <= 0 || num(gstRate) > 40)) {
      toast.error("Enter a valid GST rate");
      return;
    }
    setBusy(true);
    try {
      const r = await createInvoice(booking.id, { type, date, gstRate: num(gstRate), hsnSac: hsn, customerGstin: gstin, customerState: state }, settings);
      toast.success(`${type === "tax" ? "Tax invoice" : "Bill"} ${r.invoiceNo} created`, { description: r.queued ? queuedNote : undefined });
      onOpenChange(false);
      onCreated?.(r.id, r.invoiceNo, type);
    } catch (e) {
      toast.error("Could not create", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" /> Make invoice / bill
          </DialogTitle>
          <DialogDescription>Choose a Tax Invoice (with GST) or a simple Bill (without GST).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { v: "bill", title: "Bill", sub: "Without GST" },
              { v: "tax", title: "Tax Invoice", sub: "With GST" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setType(o.v)}
              className={cn(
                "rounded-2xl border p-3 text-left transition-all",
                type === o.v ? "border-primary bg-accent ring-2 ring-primary/20" : "bg-card hover:bg-muted/50"
              )}
            >
              <p className="font-semibold">{o.title}</p>
              <p className="text-xs text-muted-foreground">{o.sub}</p>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {type === "tax" ? (
            <Field label="GST rate %">
              <NumInput value={gstRate} onValueChange={setGstRate} />
            </Field>
          ) : null}
        </div>
        {type === "tax" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="HSN / SAC code">
              <Input value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="e.g. 997319" />
            </Field>
            <Field label="Customer GSTIN" hint="Optional">
              <Input value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
            </Field>
            <Field label="Customer state" className="sm:col-span-2" hint={state !== home ? "Other state: IGST" : "Same state: CGST + SGST"}>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-64">
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : null}
        <div className="rounded-2xl bg-muted/50 p-4 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-muted-foreground">Taxable value</span>
            <span className="tabular">{formatINR(t.taxable)}</span>
          </div>
          {type === "tax" ? (
            t.igst ? (
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">IGST {num(gstRate)}%</span>
                <span className="tabular">{formatINR(t.igst)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">CGST {num(gstRate) / 2}%</span>
                  <span className="tabular">{formatINR(t.cgst)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">SGST {num(gstRate) / 2}%</span>
                  <span className="tabular">{formatINR(t.sgst)}</span>
                </div>
              </>
            )
          ) : null}
          {t.roundOff ? (
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Round off</span>
              <span className="tabular">{formatINR(t.roundOff)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="text-primary tabular">{formatINR(t.grandTotal)}</span>
          </div>
        </div>
        {changes ? (
          <p className="flex gap-2 rounded-xl bg-warning-soft p-3 text-xs text-warning">
            <AlertTriangle className="size-4 shrink-0" />
            The booking total will change from {formatINR(booking.total)} to {formatINR(t.grandTotal)}.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <FileText />} Create {type === "tax" ? "tax invoice" : "bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ Cancel
export function CancelDialog({
  open,
  onOpenChange,
  booking,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  booking: Booking;
}) {
  const [charge, setCharge] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCharge(Math.max(0, round2(booking.paid || 0)));
      setReason("");
    }
  }, [open, booking.paid]);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await cancelBooking(booking.id, num(charge), reason, todayYMD());
      toast.success(`Booking ${booking.bookingNo} cancelled`, { description: r.queued ? queuedNote : undefined });
      onOpenChange(false);
    } catch (e) {
      toast.error("Could not cancel", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const refund = round2((booking.paid || 0) - num(charge));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel booking {booking.bookingNo}?</DialogTitle>
          <DialogDescription>
            The venue and items will be free for other bookings. Received so far: <b>{formatINR(booking.paid)}</b>.
          </DialogDescription>
        </DialogHeader>
        <Field label="Cancellation charge (kept)" hint="Amount you keep from the customer">
          <NumInput prefix="₹" value={charge} onValueChange={setCharge} placeholder="0" />
        </Field>
        {refund > 0.004 ? (
          <p className="rounded-xl bg-info-soft p-3 text-xs text-info">
            {formatINR(refund)} will show as payable to the customer. Add a Refund entry after you return it.
          </p>
        ) : null}
        <Field label="Reason">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep booking
          </Button>
          <Button variant="destructive" className="bg-destructive text-white hover:bg-destructive/90" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null} Cancel booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
