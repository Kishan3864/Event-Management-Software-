"use client";

import { useSearchParams } from "next/navigation";
import { BookingForm } from "@/components/bookings/booking-form";
import { PageHeader, PageSkeleton } from "@/components/common";
import { useData } from "@/providers/data-provider";

export function NewBookingClient() {
  const { coreLoaded } = useData();
  const mobile = useSearchParams().get("mobile") ?? "";
  return (
    <div>
      <PageHeader title="New booking" subtitle="Customer, event, venue and items" back="/bookings" />
      {coreLoaded ? <BookingForm prefillMobile={mobile} /> : <PageSkeleton />}
    </div>
  );
}
