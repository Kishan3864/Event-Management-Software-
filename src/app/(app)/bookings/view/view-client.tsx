"use client";

import { getDoc, getDocFromCache, query, where } from "firebase/firestore";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  EllipsisVertical,
  FileText,
  History,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  Receipt,
  RefreshCw,
  RotateCcw,
  SearchX,
  StickyNote,
  Trash2,
  Truck,
  Undo2,
  UserRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CancelDialog, InvoiceDialog, ItemsOutDialog, PaymentDialog, ReturnDialog } from "@/components/bookings/booking-dialogs";
import { EmptyState, PageHeader, PageSkeleton, Section, ToneBadge } from "@/components/common";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLiveDoc, useLiveQuery } from "@/hooks/use-live-query";
import { hasItems, isOverdue, pendingOf } from "@/lib/calc";
import { LOCATION_TYPE_LABEL, PAYMENT_MODE_LABEL, PAYMENT_TYPE_LABEL } from "@/lib/constants";
import { fromSnap, colRef, docRef, type ColName } from "@/lib/db";
import { todayYMD } from "@/lib/dates";
import {
  formatDate,
  formatDateMedium,
  formatDateRange,
  formatINR,
  formatNumber,
  formatPhone,
  formatTime,
  formatTimestamp,
  isZero,
  safeFileName,
} from "@/lib/format";
import { completeBooking, deleteBooking, reopenBooking, restoreBooking, undoReturn } from "@/lib/services/bookings";
import { deleteInvoice, refreshInvoice } from "@/lib/services/invoices";
import { deletePayment, reconcileBooking } from "@/lib/services/payments";
import type { Booking, Invoice, Payment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { bookingMessage, openWhatsApp, receiptMessage, reminderMessage } from "@/lib/whatsapp";
import { useConfirm } from "@/providers/confirm-provider";
import { useData } from "@/providers/data-provider";
import { usePdf } from "@/providers/pdf-provider";

async function loadDoc<T>(col: string, id: string): Promise<T | null> {
  const ref = docRef(col as ColName, id);
  try {
    const c = await getDocFromCache(ref);
    if (c.exists()) return fromSnap<T>(c);
  } catch {
    /* not cached */
  }
  const s = await getDoc(ref);
  return s.exists() ? fromSnap<T>(s) : null;
}

export function BookingViewClient() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const confirm = useConfirm();
  const { openPdf } = usePdf();
  const { settings, items } = useData();
  const today = todayYMD();

  const live = useLiveDoc<Booking>(() => (id ? docRef("bookings", id) : null), [id]);
  const pays = useLiveQuery<Payment>(() => (id ? query(colRef("payments"), where("bookingId", "==", id)) : null), [id]);
  const invs = useLiveQuery<Invoice>(() => (id ? query(colRef("invoices"), where("bookingId", "==", id)) : null), [id]);

  const [dlg, setDlg] = useState<null | "out" | "return" | "pay" | "invoice" | "cancel">(null);
  const [editPay, setEditPay] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

  const b = live.data;
  const payments = useMemo(
    () =>
      [...pays.data].sort(
        (x, y) => y.date.localeCompare(x.date) || (y.seq ?? 0) - (x.seq ?? 0)
      ),
    [pays.data]
  );
  const invoices = useMemo(() => [...invs.data].sort((x, y) => y.date.localeCompare(x.date) || y.seq - x.seq), [invs.data]);

  // Keep paid / balance in sync with payment entries
  useEffect(() => {
    if (!b || !live.fromServer || !pays.fromServer || pays.loading) return;
    reconcileBooking(b, pays.data).catch(() => undefined);
  }, [b, live.fromServer, pays.fromServer, pays.loading, pays.data]);

  if (!id || (!live.loading && !b)) {
    return (
      <EmptyState
        icon={SearchX}
        title="Booking not found"
        description="It may have been deleted."
        action={
          <Button asChild>
            <Link href="/bookings">Back to bookings</Link>
          </Button>
        }
      />
    );
  }
  if (live.loading || !b) return <PageSkeleton />;

  const pending = pendingOf(b);
  const refundDue = b.balance < -0.004 ? Math.abs(b.balance) : 0;
  const paidPct = b.total > 0 ? Math.min(100, Math.round((b.paid / b.total) * 100)) : b.paid > 0 ? 100 : 0;
  const withItems = hasItems(b);
  const overdue = isOverdue(b, today);
  const fileBase = `${b.bookingNo}_${safeFileName(b.customerName)}`;

  // ---------- documents
  const pdfBookingSlip = (variant: "slip" | "challan") =>
    openPdf({
      title: variant === "challan" ? "Delivery challan" : "Booking slip",
      fileName: `${variant === "challan" ? "DeliveryChallan" : "BookingSlip"}_${fileBase}.pdf`,
      job: async () => ({ kind: "bookingSlip", booking: (await loadDoc<Booking>("bookings", b.id)) ?? b, settings, variant }),
      shareText: `${variant === "challan" ? "Delivery challan" : "Booking slip"} ${b.bookingNo}`,
      whatsapp: { mobile: b.customerMobile, text: bookingMessage(b, settings) },
    });
  const pdfReturnSlip = () =>
    openPdf({
      title: "Return slip",
      fileName: `ReturnSlip_${fileBase}.pdf`,
      job: async () => ({ kind: "returnSlip", booking: (await loadDoc<Booking>("bookings", b.id)) ?? b, settings }),
      shareText: `Return slip ${b.bookingNo}`,
    });
  const pdfInvoice = (invOrId: Invoice | string, meta?: { invoiceNo: string; type: Invoice["type"] }) => {
    const info = typeof invOrId === "string" ? meta : { invoiceNo: invOrId.invoiceNo, type: invOrId.type };
    return openPdf({
      title: info ? `${info.type === "tax" ? "Tax invoice" : "Bill"} ${info.invoiceNo}` : "Invoice",
      fileName: info
        ? `${info.type === "tax" ? "TaxInvoice" : "Bill"}_${safeFileName(info.invoiceNo)}_${safeFileName(b.customerName)}.pdf`
        : `Invoice_${fileBase}.pdf`,
      job: async () => {
        const inv = typeof invOrId === "string" ? await loadDoc<Invoice>("invoices", invOrId) : invOrId;
        if (!inv) throw new Error("Invoice not found");
        const fresh = (await loadDoc<Booking>("bookings", b.id)) ?? b;
        return { kind: "invoice", invoice: inv, settings, paid: fresh.paid };
      },
      whatsapp: pending > 0 ? { mobile: b.customerMobile, text: reminderMessage(b, settings) } : null,
    });
  };
  const pdfReceipt = (pOrId: Payment | string) =>
    openPdf({
      title: typeof pOrId === "string" ? "Receipt" : `Receipt ${pOrId.receiptNo}`,
      fileName: typeof pOrId === "string" ? `Receipt_${fileBase}.pdf` : `Receipt_${safeFileName(pOrId.receiptNo)}_${safeFileName(b.customerName)}.pdf`,
      job: async () => {
        const p = typeof pOrId === "string" ? await loadDoc<Payment>("payments", pOrId) : pOrId;
        if (!p) throw new Error("Payment not found");
        const fresh = (await loadDoc<Booking>("bookings", b.id)) ?? b;
        return { kind: "receipt", payment: p, booking: fresh, settings };
      },
      whatsapp: typeof pOrId === "string" ? null : { mobile: b.customerMobile, text: receiptMessage(pOrId, b, settings) },
    });

  // ---------- actions
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    if (await confirm({ title: "Mark as completed?", description: "Use this when the event is over.", confirmText: "Mark completed" }))
      run(() => completeBooking(b.id, today), "Booking completed");
  };
  const onUndoReturn = async () => {
    if (
      await confirm({
        title: "Undo the return?",
        description: "Items will be marked as out again and damage charges from the return will be removed.",
        confirmText: "Undo return",
      })
    )
      run(() => undoReturn(b.id), "Return undone");
  };
  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${b.bookingNo}?`,
      description: `This permanently deletes the booking${payments.length ? `, its ${payments.length} payment entr${payments.length > 1 ? "ies" : "y"}` : ""}${invoices.length ? ` and ${invoices.length} invoice(s)` : ""}. This cannot be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteBooking(b);
      toast.success(`Booking ${b.bookingNo} deleted`);
      router.replace("/bookings");
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  const onDeletePayment = async (p: Payment) => {
    if (
      await confirm({
        title: `Delete ${p.receiptNo}?`,
        description: `${PAYMENT_TYPE_LABEL[p.type]} of ${formatINR(p.amount)} on ${formatDate(p.date)} will be removed.`,
        confirmText: "Delete",
        destructive: true,
      })
    )
      run(() => deletePayment(p), "Payment deleted");
  };
  const onDeleteInvoice = async (inv: Invoice) => {
    if (
      await confirm({
        title: `Delete ${inv.invoiceNo}?`,
        description: "The number will not be reused. The booking amounts stay as they are.",
        confirmText: "Delete",
        destructive: true,
      })
    )
      run(() => deleteInvoice(inv), "Invoice deleted");
  };

  const primary =
    b.status === "confirmed" && withItems
      ? { label: "Send items out", icon: Truck, onClick: () => setDlg("out") }
      : b.status === "items_out"
        ? { label: "Return items", icon: Undo2, onClick: () => setDlg("return") }
        : b.status === "confirmed"
          ? { label: "Mark completed", icon: CheckCircle2, onClick: onComplete }
          : null;

  return (
    <div>
      <PageHeader
        back="/bookings"
        title={b.bookingNo}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge b={b} />
            {b.createdAt ? <span>Booked {formatTimestamp(b.createdAt)}</span> : null}
          </span>
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-full bg-card" aria-label="More actions" disabled={busy}>
                <EllipsisVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href={`/bookings/edit?id=${b.id}`}>
                  <Pencil /> Edit booking
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => pdfBookingSlip("slip")}>
                <ClipboardList /> Booking slip PDF
              </DropdownMenuItem>
              {withItems ? (
                <DropdownMenuItem onClick={() => pdfBookingSlip("challan")}>
                  <Truck /> Delivery challan PDF
                </DropdownMenuItem>
              ) : null}
              {b.status === "completed" && withItems ? (
                <DropdownMenuItem onClick={pdfReturnSlip}>
                  <Undo2 /> Return slip PDF
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              {b.status === "completed" && withItems ? (
                <DropdownMenuItem onClick={onUndoReturn}>
                  <RotateCcw /> Undo return
                </DropdownMenuItem>
              ) : null}
              {b.status === "completed" && !withItems ? (
                <DropdownMenuItem onClick={() => run(() => reopenBooking(b.id), "Booking reopened")}>
                  <RotateCcw /> Reopen booking
                </DropdownMenuItem>
              ) : null}
              {b.status === "confirmed" ? (
                <DropdownMenuItem onClick={() => setDlg("cancel")}>
                  <Ban /> Cancel booking
                </DropdownMenuItem>
              ) : null}
              {b.status === "cancelled" ? (
                <DropdownMenuItem onClick={() => run(() => restoreBooking(b.id), "Booking restored")}>
                  <RotateCcw /> Restore booking
                </DropdownMenuItem>
              ) : null}
              {b.status === "confirmed" || b.status === "cancelled" ? (
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 /> Delete booking
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr]">
        {/* Summary + actions */}
        <div className="lg:col-start-2 lg:row-start-1">
          <Card className="gap-0 overflow-hidden p-0">
            <div className="bg-brand-gradient p-5 text-primary-foreground">
              <p className="text-sm text-white/75">{b.status === "cancelled" ? "Cancellation charge" : "Booking total"}</p>
              <p className="mt-0.5 text-3xl font-semibold tracking-tight tabular">{formatINR(b.total)}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#f1d49a] transition-all duration-500" style={{ width: `${paidPct}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-white/70">Received</p>
                  <p className="font-semibold tabular">{formatINR(b.paid)}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/70">{refundDue ? "Refund due" : "Pending"}</p>
                  <p className={cn("text-lg font-semibold tabular", pending > 0 && "text-[#ffd9a0]")}>
                    {formatINR(refundDue || pending)}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2 p-4">
              {primary ? (
                <Button size="lg" className="w-full" onClick={primary.onClick} disabled={busy}>
                  <primary.icon /> {primary.label}
                </Button>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditPay(null);
                    setDlg("pay");
                  }}
                >
                  <Wallet /> Add payment
                </Button>
                <Button variant="outline" onClick={() => setDlg("invoice")} disabled={b.status === "cancelled"}>
                  <FileText /> Invoice / Bill
                </Button>
                <Button
                  variant="outline"
                  className="text-[#128c4b]"
                  onClick={() => openWhatsApp(b.customerMobile, pending > 0 && b.fromDate <= today ? reminderMessage(b, settings) : bookingMessage(b, settings))}
                >
                  <MessageCircle /> WhatsApp
                </Button>
                <Button asChild variant="outline">
                  <a href={`tel:${b.customerMobile}`}>
                    <Phone /> Call
                  </a>
                </Button>
              </div>
              {overdue ? (
                <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-destructive">
                  Return overdue since {formatDateMedium(b.toDate)}
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        {/* Main details */}
        <div className="space-y-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <Section title="Customer & event" icon={UserRound}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-lg font-semibold">{b.customerName}</p>
                <a href={`tel:${b.customerMobile}`} className="flex items-center gap-1.5 text-sm text-primary">
                  <Phone className="size-3.5" /> +91 {formatPhone(b.customerMobile)}
                </a>
                {b.customerAddress ? <p className="text-sm text-muted-foreground">{b.customerAddress}</p> : null}
                {b.customerGstin ? <p className="text-xs text-muted-foreground">GSTIN {b.customerGstin}</p> : null}
                <Link href={`/customers/view?id=${b.customerId}`} className="inline-block pt-1 text-xs font-medium text-primary hover:underline">
                  Customer history →
                </Link>
              </div>
              <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
                {b.eventType ? <InfoLine icon={StickyNote} text={<b className="font-semibold">{b.eventType}</b>} /> : null}
                <InfoLine
                  icon={CalendarDays}
                  text={`${formatDateRange(b.fromDate, b.toDate)} · ${b.days} day${b.days > 1 ? "s" : ""}`}
                />
                {b.eventTime ? <InfoLine icon={Clock} text={formatTime(b.eventTime)} /> : null}
                {b.venue ? <InfoLine icon={MapPin} text={`${b.venue.name} (${LOCATION_TYPE_LABEL[b.venue.type]})`} /> : null}
                {b.eventAddress ? <InfoLine icon={MapPin} text={b.eventAddress} muted /> : null}
              </div>
            </div>
            {b.notes ? <p className="mt-3 rounded-xl bg-gold-soft/70 px-3 py-2 text-sm">{b.notes}</p> : null}
          </Section>

          <Section title="Items & charges" icon={Package}>
            <div className="divide-y">
              {b.venue ? (
                <LineRow
                  title={b.venue.name}
                  sub={`Venue · ${formatINR(b.venue.rate)} × ${b.venue.days} day${b.venue.days > 1 ? "s" : ""}`}
                  amount={b.venue.amount}
                />
              ) : null}
              {b.items.map((it, i) => (
                <LineRow
                  key={i}
                  title={it.name}
                  sub={`${formatNumber(it.qty)} ${it.unit} × ${formatINR(it.rate)} × ${it.days}d`}
                  amount={it.amount}
                  extra={
                    it.returnedQty != null ? (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <ToneBadge tone="success">Returned {formatNumber(it.returnedQty)}</ToneBadge>
                        {it.damagedQty ? <ToneBadge tone="warning">Damaged {formatNumber(it.damagedQty)}</ToneBadge> : null}
                        {it.missingQty ? <ToneBadge tone="danger">Missing {formatNumber(it.missingQty)}</ToneBadge> : null}
                      </span>
                    ) : b.status === "items_out" ? (
                      <span className="mt-1 inline-flex">
                        <ToneBadge tone="warning">Out {formatNumber(it.outQty ?? it.qty)}</ToneBadge>
                      </span>
                    ) : null
                  }
                />
              ))}
              {b.charges.map((c) => (
                <LineRow key={c.id} title={c.label} sub="Extra charge" amount={c.amount} />
              ))}
              {(b.damageCharges || []).map((c) => (
                <LineRow key={c.id} title={c.label} sub="Damage / missing charge" amount={c.amount} />
              ))}
              {!b.venue && !b.items.length && !b.charges.length ? (
                <p className="py-3 text-sm text-muted-foreground">No items.</p>
              ) : null}
            </div>
            <div className="mt-3 space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
              <TotalRow label="Sub total" value={b.subtotal} />
              {b.discount ? <TotalRow label="Discount" value={-b.discount} className="text-success" /> : null}
              {b.taxAmount ? <TotalRow label={`GST ${b.gstRate}% ${b.interState ? "(IGST)" : "(CGST+SGST)"}`} value={b.taxAmount} /> : null}
              {!isZero(b.roundOff) ? <TotalRow label="Round off" value={b.roundOff} /> : null}
              <TotalRow label="Grand total" value={b.grandTotal} strong />
              {b.status === "cancelled" ? (
                <p className="pt-1 text-xs text-muted-foreground">
                  Cancelled{b.cancelledDate ? ` on ${formatDate(b.cancelledDate)}` : ""}. Payable is the cancellation charge {formatINR(b.cancelCharge)}.
                  {b.cancelReason ? ` Reason: ${b.cancelReason}` : ""}
                </p>
              ) : null}
            </div>
          </Section>

          <Section
            title="Payments"
            icon={Wallet}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditPay(null);
                  setDlg("pay");
                }}
              >
                <Receipt /> Add
              </Button>
            }
          >
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment received yet.</p>
            ) : (
              <ul className="divide-y">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-xl",
                        p.type === "refund" ? "bg-danger-soft text-destructive" : "bg-success-soft text-success"
                      )}
                    >
                      <Wallet className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {PAYMENT_TYPE_LABEL[p.type]} · {PAYMENT_MODE_LABEL[p.mode]}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.receiptNo} · {formatDate(p.date)}
                        {p.note ? ` · ${p.note}` : ""}
                      </p>
                    </div>
                    <p className={cn("font-semibold tabular", p.type === "refund" && "text-destructive")}>
                      {p.type === "refund" ? "-" : ""}
                      {formatINR(p.amount)}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Payment actions">
                          <EllipsisVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => pdfReceipt(p)}>
                          <Download /> Receipt PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openWhatsApp(b.customerMobile, receiptMessage(p, b, settings))}>
                          <MessageCircle /> WhatsApp message
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditPay(p);
                            setDlg("pay");
                          }}
                        >
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => onDeletePayment(p)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Invoices & bills"
            icon={FileText}
            action={
              b.status !== "cancelled" ? (
                <Button size="sm" variant="outline" onClick={() => setDlg("invoice")}>
                  <FileText /> New
                </Button>
              ) : null
            }
          >
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoice yet. Make a Tax Invoice or a Bill when needed.</p>
            ) : (
              <ul className="divide-y">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 py-3">
                    <ToneBadge tone={inv.type === "tax" ? "brand" : "gold"}>{inv.type === "tax" ? "Tax Invoice" : "Bill"}</ToneBadge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{inv.invoiceNo}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(inv.date)} · {formatINR(inv.total)}
                        {Math.abs(inv.total - b.total) > 0.004 && b.status !== "cancelled" ? " · booking changed" : ""}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => pdfInvoice(inv)}>
                      <Download /> PDF
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Invoice actions">
                          <EllipsisVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => run(() => refreshInvoice(inv, settings), "Invoice updated from booking")}>
                          <RefreshCw /> Update from booking
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => onDeleteInvoice(inv)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Documents + timeline */}
        <div className="space-y-5 lg:col-start-2 lg:row-start-2">
          <Section title="Documents" icon={Download}>
            <div className="grid gap-2">
              <DocButton icon={ClipboardList} title="Booking slip" sub="With item list & amounts" onClick={() => pdfBookingSlip("slip")} />
              {withItems ? (
                <DocButton icon={Truck} title="Delivery challan" sub="Item list for delivery" onClick={() => pdfBookingSlip("challan")} />
              ) : null}
              {b.status === "completed" && withItems ? (
                <DocButton icon={Undo2} title="Return slip" sub="Returned, damaged & missing" onClick={pdfReturnSlip} />
              ) : null}
              {invoices[0] ? (
                <DocButton
                  icon={FileText}
                  title={invoices[0].type === "tax" ? "Latest tax invoice" : "Latest bill"}
                  sub={invoices[0].invoiceNo}
                  onClick={() => pdfInvoice(invoices[0])}
                />
              ) : null}
            </div>
          </Section>
          <Section title="Timeline" icon={History}>
            <ol className="relative space-y-4 border-l border-border pl-5">
              <TimelineItem title="Booked" date={formatTimestamp(b.createdAt)} />
              {b.outDate ? <TimelineItem title="Items sent out" date={formatDate(b.outDate)} tone="warning" /> : null}
              {b.returnDate ? (
                <TimelineItem title="Items returned" date={formatDate(b.returnDate)} tone="success" note={b.returnNote} />
              ) : b.completedDate ? (
                <TimelineItem title="Completed" date={formatDate(b.completedDate)} tone="success" />
              ) : null}
              {b.cancelledDate ? <TimelineItem title="Cancelled" date={formatDate(b.cancelledDate)} tone="danger" note={b.cancelReason} /> : null}
              {payments
                .slice()
                .reverse()
                .map((p) => (
                  <TimelineItem
                    key={p.id}
                    title={`${PAYMENT_TYPE_LABEL[p.type]} ${formatINR(p.amount)}`}
                    date={formatDate(p.date)}
                    tone={p.type === "refund" ? "danger" : "success"}
                  />
                ))}
            </ol>
          </Section>
        </div>
      </div>

      {/* Dialogs */}
      <ItemsOutDialog
        open={dlg === "out"}
        onOpenChange={(o) => setDlg(o ? "out" : null)}
        booking={b}
        items={items}
        onDone={() =>
          toast("Share the delivery challan?", {
            action: { label: "Challan", onClick: () => pdfBookingSlip("challan") },
          })
        }
      />
      <ReturnDialog
        open={dlg === "return"}
        onOpenChange={(o) => setDlg(o ? "return" : null)}
        booking={b}
        onDone={() => toast("Share the return slip?", { action: { label: "Return slip", onClick: () => pdfReturnSlip() } })}
      />
      <PaymentDialog
        open={dlg === "pay"}
        onOpenChange={(o) => {
          setDlg(o ? "pay" : null);
          if (!o) setEditPay(null);
        }}
        booking={b}
        payment={editPay}
        settings={settings}
        onSaved={(pid) => toast("Share the receipt?", { action: { label: "Receipt", onClick: () => pdfReceipt(pid) } })}
      />
      <InvoiceDialog
        open={dlg === "invoice"}
        onOpenChange={(o) => setDlg(o ? "invoice" : null)}
        booking={b}
        settings={settings}
        onCreated={(invId, invoiceNo, type) => pdfInvoice(invId, { invoiceNo, type })}
      />
      <CancelDialog open={dlg === "cancel"} onOpenChange={(o) => setDlg(o ? "cancel" : null)} booking={b} />
    </div>
  );
}

function InfoLine({ icon: Icon, text, muted }: { icon: typeof MapPin; text: ReactNode; muted?: boolean }) {
  return (
    <p className={cn("flex items-start gap-2", muted && "text-muted-foreground")}>
      <Icon className="mt-0.5 size-4 shrink-0 text-primary/70" />
      <span>{text}</span>
    </p>
  );
}

function LineRow({ title, sub, amount, extra }: { title: string; sub: string; amount: number; extra?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground tabular">{sub}</p>
        {extra}
      </div>
      <p className="font-semibold tabular">{formatINR(amount)}</p>
    </div>
  );
}

function TotalRow({ label, value, strong, className }: { label: string; value: number; strong?: boolean; className?: string }) {
  return (
    <div className={cn("flex justify-between", strong && "border-t pt-2 text-base font-semibold", className)}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular">{value < 0 ? `- ${formatINR(-value)}` : formatINR(value)}</span>
    </div>
  );
}

function DocButton({ icon: Icon, title, sub, onClick }: { icon: typeof MapPin; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:border-primary/30 hover:bg-accent/50 active:scale-[0.99]"
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <Download className="size-4 text-muted-foreground" />
    </button>
  );
}

function TimelineItem({ title, date, tone = "brand", note }: { title: string; date: string; tone?: "brand" | "success" | "warning" | "danger"; note?: string }) {
  const dot = { brand: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-destructive" }[tone];
  return (
    <li className="relative">
      <span className={cn("absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-card", dot)} />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{date}</p>
      {note ? <p className="text-xs text-muted-foreground italic">{note}</p> : null}
    </li>
  );
}
