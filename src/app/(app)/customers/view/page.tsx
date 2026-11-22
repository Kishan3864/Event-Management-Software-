import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common";
import { CustomerViewClient } from "./customer-view-client";

export const metadata: Metadata = { title: "Customer" };

export default function CustomerViewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CustomerViewClient />
    </Suspense>
  );
}
