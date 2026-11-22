"use client";

import { getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { ClipboardList, History, Loader2, Plus, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookingRow } from "@/components/booking-row";
import { EmptyState, Field, ListSkeleton, PageHeader, SearchBox } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pendingOf } from "@/lib/calc";
import { colRef, fromSnap } from "@/lib/db";
import { overlaps, todayYMD } from "@/lib/dates";
import { formatINR } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useData } from "@/providers/data-provider";

type Filter = "all" | "upcoming" | "today" | "out" | "overdue" | "due" | "completed" | "cancelled";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "today", label: "Today" },
  { value: "out", label: "Items out" },
  { value: "overdue", label: "Overdue" },
  { value: "due", label: "Payment due" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function matches(b: Booking, f: Filter, today: string) {
  switch (f) {
    case "upcoming":
      return b.status === "confirmed" && b.toDate >= today;
    case "today":
      return b.status !== "cancelled" && b.fromDate <= today && b.toDate >= today;
    case "out":
      return b.status === "items_out";
    case "overdue":
      return b.status === "items_out" && b.toDate < today;
    case "due":
      return pendingOf(b) > 0;
    case "completed":
      return b.status === "completed";
    case "cancelled":
      return b.status === "cancelled";
    default:
      return true;
  }
}

function textMatch(b: Booking, t: string) {
  if (!t) return true;
  const digits = t.replace(/\D/g, "");
  return (
    b.customerName.toLowerCase().includes(t) ||
    b.bookingNo.toLowerCase().includes(t) ||
    (digits.length >= 3 && b.customerMobile.includes(digits)) ||
    (b.eventType || "").toLowerCase().includes(t) ||
    (b.venue?.name || "").toLowerCase().includes(t) ||
    (b.eventAddress || "").toLowerCase().includes(t)
  );
}

export function BookingsClient() {
  const params = useSearchParams();
  const router = useRouter();
  const { bookings, bookingsLoaded, venues, windowStart } = useData();
  const today = todayYMD();
  const initial = (params.get("f") as Filter) || "all";
  const [filter, setFilter] = useState<Filter>(FILTERS.some((f) => f.value === initial) ? initial : "all");
  const [search, setSearch] = useState("");
  const [loc, setLoc] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [older, setOlder] = useState<Booking[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [searched, setSearched] = useState(false);

  const pool = useMemo(() => {
    if (!older.length) return bookings;
    const m = new Map(bookings.map((b) => [b.id, b]));
    for (const b of older) if (!m.has(b.id)) m.set(b.id, b);
    return [...m.values()];
  }, [bookings, older]);

  const t = search.trim().toLowerCase();
  const base = useMemo(
    () =>
      pool.filter(
        (b) =>
          textMatch(b, t) &&
          (loc === "all" || b.locationId === loc) &&
          overlaps(b.fromDate, b.toDate, from || "0000-01-01", to || "9999-12-31")
      ),
    [pool, t, loc, from, to]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.value] = base.filter((b) => matches(b, f.value, today)).length;
    return c;
  }, [base, today]);

  const list = useMemo(() => {
    const l = base.filter((b) => matches(b, filter, today));
    const asc = filter === "upcoming" || filter === "today" || filter === "out";
    if (filter === "overdue") return l.sort((a, b) => a.toDate.localeCompare(b.toDate));
    return l.sort((a, b) => (asc ? a.fromDate.localeCompare(b.fromDate) : b.fromDate.localeCompare(a.fromDate)));
  }, [base, filter, today]);

  const listTotal = list.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const listDue = list.reduce((s, b) => s + pendingOf(b), 0);
  const filtersActive = loc !== "all" || !!from || !!to;

  const setF = (f: Filter) => {
    setFilter(f);
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (f === "all") sp.delete("f");
    else sp.set("f", f);
    router.replace(`/bookings${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  };

  /** Searches all bookings on the server (older than the recent window). */
  const searchOlder = async () => {
    setLoadingOlder(true);
    try {
      const found = new Map<string, Booking>();
      const add = (docs: Booking[]) => docs.forEach((b) => found.set(b.id, b));
      const raw = search.trim();
      const digits = raw.replace(/\D/g, "");
      if (from || to) {
        const snap = await getDocs(
          query(colRef("bookings"), where("fromDate", ">=", from || "2000-01-01"), where("fromDate", "<=", to || "2999-12-31"), limit(500))
        );
        add(snap.docs.map((d) => fromSnap<Booking>(d)));
      }
      if (digits.length === 10) {
        const snap = await getDocs(query(colRef("bookings"), where("customerMobile", "==", digits), limit(200)));
        add(snap.docs.map((d) => fromSnap<Booking>(d)));
      } else if (/^[a-z]{1,4}-?\d+$/i.test(raw)) {
        const snap = await getDocs(query(colRef("bookings"), where("bookingNo", "==", raw.toUpperCase()), limit(5)));
        add(snap.docs.map((d) => fromSnap<Booking>(d)));
      } else if (raw.length >= 2) {
        const lower = raw.toLowerCase();
        const snap = await getDocs(
          query(colRef("bookings"), where("customerNameLower", ">=", lower), where("customerNameLower", "<=", lower + ""), limit(200))
        );
        add(snap.docs.map((d) => fromSnap<Booking>(d)));
      }
      if (!raw && !from && !to) {
        const oldest = pool.reduce((m, b) => (b.fromDate < m ? b.fromDate : m), windowStart);
        const snap = await getDocs(query(colRef("bookings"), where("fromDate", "<", oldest), orderBy("fromDate", "desc"), limit(60)));
        add(snap.docs.map((d) => fromSnap<Booking>(d)));
      }
      setOlder((prev) => {
        const m = new Map(prev.map((b) => [b.id, b]));
        for (const b of found.values()) m.set(b.id, b);
        return [...m.values()];
      });
      setSearched(true);
      if (!found.size) toast.info("No older bookings found");
    } catch (e) {
      toast.error("Search failed", { description: (e as Error).message });
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle={`${list.length} booking${list.length === 1 ? "" : "s"} · ${formatINR(listTotal)}${listDue > 0 ? ` · ${formatINR(listDue)} due` : ""}`}
        actions={
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/bookings/new">
              <Plus /> New booking
            </Link>
          </Button>
        }
      />

      <div className="sticky top-14 z-10 -mx-4 mb-4 space-y-3 bg-background/90 px-4 pt-1 pb-3 backdrop-blur-xl lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
        <div className="flex gap-2">
          <SearchBox value={search} onChange={setSearch} placeholder="Name, mobile or booking no" className="flex-1" />
          <Button
            variant={filtersActive ? "default" : "outline"}
            size="icon"
            className="shrink-0 rounded-full"
            aria-label="Filters"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal />
          </Button>
        </div>
        {showFilters ? (
          <div className="grid gap-3 rounded-2xl bg-card p-3 shadow-soft ring-1 ring-black/[0.04] sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <Field label="Location">
              <Select value={loc} onValueChange={setLoc}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="all">All locations</SelectItem>
                  {venues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Button
              variant="ghost"
              onClick={() => {
                setLoc("all");
                setFrom("");
                setTo("");
              }}
            >
              <X /> Clear
            </Button>
          </div>
        ) : null}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setF(f.value)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-all",
                filter === f.value
                  ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "bg-card text-foreground/75 hover:bg-accent"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular",
                  filter === f.value ? "bg-white/20" : "bg-muted text-muted-foreground",
                  (f.value === "overdue" || f.value === "due") && counts[f.value] > 0 && filter !== f.value && "bg-danger-soft text-destructive"
                )}
              >
                {counts[f.value] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!bookingsLoaded ? (
        <ListSkeleton rows={6} />
      ) : list.length ? (
        <div className="space-y-2.5">
          {list.map((b) => (
            <BookingRow key={b.id} b={b} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title={search || filtersActive ? "No matching bookings" : "No bookings here"}
          description={
            search || filtersActive
              ? "Recent bookings are searched first. Tap below to search older bookings too."
              : "New bookings will appear here."
          }
          action={
            !search && !filtersActive ? (
              <Button asChild>
                <Link href="/bookings/new">
                  <Plus /> New booking
                </Link>
              </Button>
            ) : null
          }
        />
      )}

      <div className="mt-6 flex flex-col items-center gap-1">
        <Button variant="outline" onClick={searchOlder} disabled={loadingOlder}>
          {loadingOlder ? <Loader2 className="animate-spin" /> : <History />}
          {search || from || to ? "Search older bookings" : searched ? "Load more older bookings" : "Load older bookings"}
        </Button>
        <p className="text-xs text-muted-foreground">Showing recent, upcoming and unpaid bookings by default.</p>
      </div>
    </div>
  );
}
