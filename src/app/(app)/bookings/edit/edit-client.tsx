"use client";


import { SearchX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookingForm } from "@/components/bookings/booking-form";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useLiveDoc } from "@/hooks/use-live-query";
import type { Booking } from "@/lib/types";
import { useData } from "@/providers/data-provider";
import { docRef } from "@/lib/db";

export function EditBookingClient() {
  const id = useSearchParams().get("id") ?? "";
  const { coreLoaded } = useData();
  const live = useLiveDoc<Booking>(() => (id ? docRef("bookings", id) : null), [id]);

  if (!id || (!live.loading && !live.data)) {
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
  if (live.loading || !live.data || !coreLoaded) return <PageSkeleton />;
  const b = live.data;
  return (
    <div>
      <PageHeader title={`Edit ${b.bookingNo}`} subtitle={b.customerName} back={`/bookings/view?id=${b.id}`} />
      <BookingForm key={b.id} initial={b} />
    </div>
  );
}
