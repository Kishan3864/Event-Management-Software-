import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsClient />
    </Suspense>
  );
}
