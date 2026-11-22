import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common";
import { EditBookingClient } from "./edit-client";

export const metadata: Metadata = { title: "Edit booking" };

export default function EditBookingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditBookingClient />
    </Suspense>
  );
}
