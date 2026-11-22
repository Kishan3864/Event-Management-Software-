"use client";

import { ChevronRight, Loader2, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomerDialog } from "@/components/customer-dialog";
import { EmptyState, ListSkeleton, PageHeader, SearchBox, ToneBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { formatINR, formatPhone, initials } from "@/lib/format";
import { listCustomers, searchCustomers } from "@/lib/services/customers";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useData } from "@/providers/data-provider";

const PAGE = 40;

export function CustomersClient() {
  const router = useRouter();
  const { dueByCustomer, totalDue } = useData();
  const [tab, setTab] = useState<"all" | "due">("all");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [results, setResults] = useState<Customer[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const loadPage = useCallback(async (after?: string) => {
    setLoading(true);
    try {
      const page = await listCustomers(after, PAGE);
      setList((prev) => (after ? [...prev, ...page] : page));
      setMore(page.length === PAGE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const t = search.trim();
    if (!t) {
      setResults(null);
      return;
    }
    const h = setTimeout(() => {
      searchCustomers(t)
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(h);
  }, [search]);

  const dueRows = useMemo(
    () =>
      [...dueByCustomer.entries()]
        .map(([id, d]) => ({
          id,
          name: d.bookings[0]?.customerName ?? "",
          mobile: d.bookings[0]?.customerMobile ?? "",
          total: d.total,
          count: d.bookings.length,
        }))
        .sort((a, b) => b.total - a.total),
    [dueByCustomer]
  );

  const shown = results ?? list;

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={totalDue > 0 ? `${formatINR(totalDue)} pending from ${dueRows.length} customer${dueRows.length === 1 ? "" : "s"}` : "Booking history and dues"}
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus /> Add
          </Button>
        }
      />
      <div className="mb-4 space-y-3">
        <div className="inline-flex rounded-full bg-muted p-1">
          {(
            [
              { v: "all", l: "All customers" },
              { v: "due", l: `With dues (${dueRows.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => setTab(t.v)}
              className={cn(
                "h-9 rounded-full px-4 text-sm font-medium transition-all",
                tab === t.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {t.l}
            </button>
          ))}
        </div>
        {tab === "all" ? <SearchBox value={search} onChange={setSearch} placeholder="Search name or mobile" /> : null}
      </div>

      {tab === "due" ? (
        dueRows.length ? (
          <div className="space-y-2">
            {dueRows.map((r) => (
              <Row key={r.id} id={r.id} name={r.name} mobile={r.mobile} right={<span className="font-semibold text-destructive tabular">{formatINR(r.total)}</span>} sub={`${r.count} booking${r.count > 1 ? "s" : ""} with dues`} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title="No pending dues" description="All customers have paid in full." />
        )
      ) : loading && !list.length ? (
        <ListSkeleton rows={6} />
      ) : shown.length ? (
        <div className="space-y-2">
          {shown.map((c) => {
            const due = dueByCustomer.get(c.id)?.total ?? 0;
            return (
              <Row
                key={c.id}
                id={c.id}
                name={c.name}
                mobile={c.mobile}
                sub={`${c.bookingsCount ?? 0} booking${c.bookingsCount === 1 ? "" : "s"}${c.address ? ` · ${c.address}` : ""}`}
                right={due > 0 ? <ToneBadge tone="danger">Due {formatINR(due)}</ToneBadge> : null}
              />
            );
          })}
          {!results && more ? (
            <div className="flex justify-center pt-3">
              <Button variant="outline" disabled={loading} onClick={() => loadPage(list[list.length - 1]?.nameLower)}>
                {loading ? <Loader2 className="animate-spin" /> : null} Load more
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title={search ? "No customer found" : "No customers yet"}
          description={search ? "Search by the start of the name, or by mobile number." : "Customers are added automatically with bookings."}
        />
      )}

      <CustomerDialog open={addOpen} onOpenChange={setAddOpen} onSaved={(id) => router.push(`/customers/view?id=${id}`)} />
    </div>
  );
}

function Row({ id, name, mobile, sub, right }: { id: string; name: string; mobile: string; sub: string; right?: React.ReactNode }) {
  return (
    <Link
      href={`/customers/view?id=${id}`}
      className="group flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft ring-1 ring-black/[0.04] transition-all hover:shadow-lift active:scale-[0.99]"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-primary">{initials(name)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatPhone(mobile)} · {sub}
        </p>
      </div>
      {right}
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}
