import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common";
import { NewBookingClient } from "./new-client";

export const metadata: Metadata = { title: "New booking" };

export default function NewBookingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewBookingClient />
    </Suspense>
  );
}
