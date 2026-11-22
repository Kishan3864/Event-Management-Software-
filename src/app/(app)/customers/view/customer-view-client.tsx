"use client";

import { query, where } from "firebase/firestore";
import { ClipboardList, MessageCircle, Pencil, Phone, Plus, SearchX, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookingRow } from "@/components/booking-row";
import { EmptyState, ListSkeleton, PageHeader, PageSkeleton, Section, StatCard } from "@/components/common";
import { CustomerDialog } from "@/components/customer-dialog";
import { Button } from "@/components/ui/button";
import { useLiveDoc, useLiveQuery } from "@/hooks/use-live-query";
import { pendingOf } from "@/lib/calc";
import { PAYMENT_MODE_LABEL, PAYMENT_TYPE_LABEL } from "@/lib/constants";
import { formatDate, formatINR, formatPhone, initials } from "@/lib/format";
import { deleteCustomer } from "@/lib/services/customers";
import { netPaid } from "@/lib/services/payments";
import type { Booking, Customer, Payment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { customerDuesMessage, openWhatsApp } from "@/lib/whatsapp";
import { useConfirm } from "@/providers/confirm-provider";
import { useData } from "@/providers/data-provider";
import { IndianRupee } from "lucide-react";
import { colRef, docRef } from "@/lib/db";

export function CustomerViewClient() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const confirm = useConfirm();
  const { settings } = useData();
  const [editOpen, setEditOpen] = useState(false);

  const live = useLiveDoc<Customer>(() => (id ? docRef("customers", id) : null), [id]);
  const bks = useLiveQuery<Booking>(() => (id ? query(colRef("bookings"), where("customerId", "==", id)) : null), [id]);
  const pays = useLiveQuery<Payment>(() => (id ? query(colRef("payments"), where("customerId", "==", id)) : null), [id]);

  const bookings = useMemo(() => [...bks.data].sort((a, b) => b.fromDate.localeCompare(a.fromDate)), [bks.data]);
  const payments = useMemo(() => [...pays.data].sort((a, b) => b.date.localeCompare(a.date)), [pays.data]);
  const billed = bookings.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const received = netPaid(payments);
  const dueBookings = bookings.filter((b) => pendingOf(b) > 0);
  const pending = dueBookings.reduce((s, b) => s + pendingOf(b), 0);

  const c = live.data;
  if (!id || (!live.loading && !c)) {
    return (
      <EmptyState
        icon={SearchX}
        title="Customer not found"
        action={
          <Button asChild>
            <Link href="/customers">Back to customers</Link>
          </Button>
        }
      />
    );
  }
  if (live.loading || !c) return <PageSkeleton />;

  const onDelete = async () => {
    if (!(await confirm({ title: `Delete ${c.name}?`, description: "Only customers without bookings can be deleted.", confirmText: "Delete", destructive: true }))) return;
    try {
      await deleteCustomer(c);
      toast.success("Customer deleted");
      router.replace("/customers");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        back="/customers"
        title={c.name}
        subtitle={`+91 ${formatPhone(c.mobile)}${c.address ? ` · ${c.address}` : ""}`}
        actions={
          <>
            <Button variant="outline" size="icon" className="rounded-full bg-card" aria-label="Edit" onClick={() => setEditOpen(true)}>
              <Pencil />
            </Button>
            {bookings.length === 0 ? (
              <Button variant="outline" size="icon" className="rounded-full bg-card text-destructive" aria-label="Delete" onClick={onDelete}>
                <Trash2 />
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-5 flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-lg font-semibold text-primary-foreground">
          {initials(c.name)}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {c.gstin ? <p className="text-muted-foreground">GSTIN {c.gstin}</p> : null}
          {c.state ? <p className="text-muted-foreground">{c.state}</p> : null}
          {c.notes ? <p className="mt-1">{c.notes}</p> : null}
          {!c.gstin && !c.notes ? <p className="text-muted-foreground">Customer since {bookings.length ? formatDate(bookings[bookings.length - 1].fromDate) : "today"}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Call">
            <a href={`tel:${c.mobile}`}>
              <Phone />
            </a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="text-[#128c4b]"
            aria-label="WhatsApp"
            onClick={() =>
              openWhatsApp(c.mobile, pending > 0 ? customerDuesMessage(c.name, pending, dueBookings, settings) : `Namaste ${c.name} ji,\n\n`)
            }
          >
            <MessageCircle />
          </Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Billed" value={formatINR(billed)} icon={ClipboardList} tone="brand" hint={`${bookings.length} booking${bookings.length === 1 ? "" : "s"}`} />
        <StatCard label="Received" value={formatINR(received)} icon={Wallet} tone="success" />
        <StatCard label="Pending" value={formatINR(pending)} icon={IndianRupee} tone={pending > 0 ? "danger" : "default"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Section
          title="Bookings"
          icon={ClipboardList}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/bookings/new?mobile=${c.mobile}`}>
                <Plus /> New
              </Link>
            </Button>
          }
        >
          {bks.loading ? (
            <ListSkeleton rows={3} />
          ) : bookings.length ? (
            <div className="space-y-2.5">
              {bookings.map((b) => (
                <BookingRow key={b.id} b={b} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          )}
        </Section>
        <Section title="Payments" icon={Wallet}>
          {payments.length ? (
            <ul className="divide-y">
              {payments.map((p) => (
                <li key={p.id}>
                  <Link href={`/bookings/view?id=${p.bookingId}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {PAYMENT_TYPE_LABEL[p.type]} · {PAYMENT_MODE_LABEL[p.mode]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.receiptNo} · {p.bookingNo} · {formatDate(p.date)}
                      </p>
                    </div>
                    <span className={cn("font-semibold tabular", p.type === "refund" && "text-destructive")}>
                      {p.type === "refund" ? "-" : ""}
                      {formatINR(p.amount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          )}
        </Section>
      </div>

      <CustomerDialog open={editOpen} onOpenChange={setEditOpen} customer={c} />
    </div>
  );
}
