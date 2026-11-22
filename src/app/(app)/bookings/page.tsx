import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common";
import { BookingsClient } from "./bookings-client";

export const metadata: Metadata = { title: "Bookings" };

export default function BookingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BookingsClient />
    </Suspense>
  );
}
