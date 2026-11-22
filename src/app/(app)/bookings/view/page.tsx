import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common";
import { BookingViewClient } from "./view-client";

export const metadata: Metadata = { title: "Booking" };

export default function BookingViewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BookingViewClient />
    </Suspense>
  );
}
