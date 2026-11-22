import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common";
import { ItemClient } from "./item-client";

export const metadata: Metadata = { title: "Item" };

export default function ItemPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ItemClient />
    </Suspense>
  );
}
