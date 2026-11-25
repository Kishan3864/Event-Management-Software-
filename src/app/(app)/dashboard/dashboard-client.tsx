"use client";

import { query, where } from "firebase/firestore";
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  IndianRupee,
  MessageCircle,
  PackageOpen,
  Phone,
  Plus,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { BookingRow } from "@/components/booking-row";
import { EmptyState, ListSkeleton, Section, StatCard, StatsSkeleton } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "@/hooks/use-live-query";
import { availableNow } from "@/lib/availability";
import { pendingOf } from "@/lib/calc";
import { addDays, endOfMonth, monthLabel, startOfMonth, todayYMD } from "@/lib/dates";
import { formatDateShort, formatINR, formatNumber } from "@/lib/format";
import { netPaid } from "@/lib/services/payments";
import type { Payment } from "@/lib/types";
import { openWhatsApp, reminderMessage } from "@/lib/whatsapp";
import { useData } from "@/providers/data-provider";
import { colRef } from "@/lib/db";

export function DashboardClient() {
  const { bookings, items, totalDue, settings, bookingsLoaded, coreLoaded } = useData();
  const today = todayYMD();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const payments = useLiveQuery<Payment>(
    () => query(colRef("payments"), where("date", ">=", monthStart), where("date", "<=", monthEnd)),
    [monthStart, monthEnd]
  );

  const d = useMemo(() => {
    const active = bookings.filter((b) => b.status !== "cancelled");
    const todays = active
      .filter((b) => b.fromDate <= today && b.toDate >= today)
      .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    const soon = addDays(today, 14);
    const upcoming = active
      .filter((b) => b.status === "confirmed" && b.fromDate > today && b.fromDate <= soon)
      .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    const out = bookings.filter((b) => b.status === "items_out");
    const overdue = out.filter((b) => b.toDate < today).sort((a, b) => a.toDate.localeCompare(b.toDate));
    const month = active.filter((b) => b.fromDate >= monthStart && b.fromDate <= monthEnd);
    const monthValue = month.reduce((s, b) => s + (Number(b.total) || 0), 0);
    const outItems = items.filter((i) => (Number(i.outQty) || 0) > 0).sort((a, b) => b.outQty - a.outQty);
    const outQty = outItems.reduce((s, i) => s + (Number(i.outQty) || 0), 0);
    const lowItems = items
      .filter((i) => i.active !== false && Number(i.totalQty) > 0 && availableNow(i) <= 0)
      .slice(0, 5);
    const dueList = active
      .filter((b) => pendingOf(b) > 0 && b.fromDate <= today)
      .sort((a, b) => pendingOf(b) - pendingOf(a))
      .slice(0, 6);
    return { todays, upcoming, out, overdue, month, monthValue, outItems, outQty, lowItems, dueList };
  }, [bookings, items, today, monthStart, monthEnd]);

  const collected = netPaid(payments.data);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-gradient p-5 text-primary-foreground shadow-lift sm:p-7">
        <div className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-white/[0.07]" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-[#f1d49a]/[0.08]" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/75">{formatDateShort(today)} · {monthLabel(today)}</p>
            <h1 className="mt-1 wrap-anywhere text-2xl font-semibold tracking-tight sm:text-4xl">{settings.name || "Dashboard"}</h1>
            <p className="mt-1 text-sm text-white/80">
              {d.todays.length
                ? `${d.todays.length} event${d.todays.length > 1 ? "s" : ""} today.`
                : "No events today. A good day to plan ahead."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="lg" className="flex-1 bg-white text-primary shadow-none hover:bg-white/90 sm:flex-none">
              <Link href="/bookings/new">
                <Plus /> New Booking
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Link href="/calendar" aria-label="Calendar">
                <CalendarDays />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      {!bookingsLoaded || !coreLoaded ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Today's events"
            value={d.todays.length}
            hint={d.upcoming.length ? `${d.upcoming.length} in next 14 days` : "Nothing upcoming"}
            icon={CalendarRange}
            tone="brand"
            href="/calendar"
          />
          <StatCard
            label="Items out on rent"
            value={formatNumber(d.outQty)}
            hint={`${d.out.length} booking${d.out.length === 1 ? "" : "s"}`}
            icon={Truck}
            tone="warning"
            href="/bookings?f=out"
          />
          <StatCard
            label="Overdue returns"
            value={d.overdue.length}
            hint={d.overdue.length ? "Follow up today" : "All on time"}
            icon={AlarmClock}
            tone={d.overdue.length ? "danger" : "success"}
            href="/bookings?f=overdue"
          />
          <StatCard
            label="Total pending"
            value={formatINR(totalDue)}
            hint="To be collected"
            icon={IndianRupee}
            tone="gold"
            href="/bookings?f=due"
          />
        </div>
      )}

      {/* This month */}
      <section className="grid grid-cols-2 overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-black/[0.04] sm:grid-cols-3">
        <div className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Bookings · {monthLabel(today).split(" ")[0]}</p>
          <p className="mt-1 text-xl font-semibold tabular">{d.month.length}</p>
        </div>
        <div className="border-l p-4">
          <p className="text-xs font-medium text-muted-foreground">Booking value</p>
          <p className="mt-1 text-xl font-semibold tabular">{formatINR(d.monthValue)}</p>
        </div>
        <Link href="/payments" className="col-span-2 border-t p-4 transition-colors hover:bg-muted/40 sm:col-span-1 sm:border-t-0 sm:border-l">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Wallet className="size-3.5" /> Collected
          </p>
          <p className="mt-1 text-xl font-semibold text-success tabular">{payments.loading ? "…" : formatINR(collected)}</p>
        </Link>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section
            title="Today's events"
            icon={Sparkles}
            action={
              <Link href="/calendar" className="text-sm font-medium text-primary hover:underline">
                Calendar
              </Link>
            }
          >
            {!bookingsLoaded ? (
              <ListSkeleton rows={2} />
            ) : d.todays.length ? (
              <div className="space-y-2.5">
                {d.todays.map((b) => (
                  <BookingRow key={b.id} b={b} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No events today"
                description="Bookings for today will appear here."
                className="py-7"
              />
            )}
          </Section>

          <Section
            title="Upcoming (14 days)"
            icon={CalendarRange}
            action={
              <Link href="/bookings?f=upcoming" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            }
          >
            {!bookingsLoaded ? (
              <ListSkeleton rows={3} />
            ) : d.upcoming.length ? (
              <div className="space-y-2.5">
                {d.upcoming.slice(0, 8).map((b) => (
                  <BookingRow key={b.id} b={b} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarPlus}
                title="No upcoming bookings"
                description="Create a booking to block venues and items."
                action={
                  <Button asChild size="sm">
                    <Link href="/bookings/new">
                      <Plus /> New Booking
                    </Link>
                  </Button>
                }
                className="py-7"
              />
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Overdue returns" icon={AlarmClock}>
            {d.overdue.length ? (
              <div className="space-y-2">
                {d.overdue.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-xl bg-danger-soft/60 p-3">
                    <Link href={`/bookings/view?id=${b.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-medium">{b.customerName}</p>
                      <p className="text-xs text-destructive">
                        {b.bookingNo} · due back {formatDateShort(b.toDate)}
                      </p>
                    </Link>
                    <Button asChild variant="outline" size="icon-sm" className="bg-card" aria-label="Call">
                      <a href={`tel:${b.customerMobile}`}>
                        <Phone />
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-success-soft/70 px-3 py-3 text-sm text-success">No overdue returns. All items are on time.</p>
            )}
          </Section>

          <Section
            title="Out on rent"
            icon={PackageOpen}
            action={
              <Link href="/stock" className="text-sm font-medium text-primary hover:underline">
                Stock
              </Link>
            }
          >
            {d.outItems.length ? (
              <ul className="divide-y">
                {d.outItems.slice(0, 8).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/stock/item?id=${i.id}`} className="truncate font-medium hover:underline">
                      {i.name}
                    </Link>
                    <span className="shrink-0 text-muted-foreground tabular">
                      <b className="text-foreground">{formatNumber(i.outQty)}</b> / {formatNumber(i.totalQty)} {i.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">All items are in the godown.</p>
            )}
            {d.lowItems.length ? (
              <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
                Fully booked out now: {d.lowItems.map((i) => i.name).join(", ")}
              </p>
            ) : null}
          </Section>

          <Section
            title="Pending payments"
            icon={IndianRupee}
            action={
              <Link href="/bookings?f=due" className="text-sm font-medium text-primary hover:underline">
                All dues
              </Link>
            }
          >
            {d.dueList.length ? (
              <ul className="divide-y">
                {d.dueList.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-2.5">
                    <Link href={`/bookings/view?id=${b.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.bookingNo} · {formatDateShort(b.fromDate)}
                      </p>
                    </Link>
                    <span className="text-sm font-semibold text-destructive tabular">{formatINR(pendingOf(b))}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-[#128c4b]"
                      aria-label="WhatsApp reminder"
                      onClick={() => openWhatsApp(b.customerMobile, reminderMessage(b, settings))}
                    >
                      <MessageCircle />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No pending payments for past events.</p>
            )}
            <Link href="/reports" className="mt-3 flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Open reports <ArrowRight className="size-4" />
            </Link>
          </Section>
        </div>
      </div>
    </div>
  );
}

