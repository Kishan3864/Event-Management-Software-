"use client";

import { PRODUCT } from "@/lib/brand";
import { Monogram } from "./brand";

export function Splash({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6">
      <div className="relative">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/20 [animation-duration:1.8s]" />
        <Monogram className="relative size-16 rounded-2xl shadow-lift" />
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold tracking-tight">{PRODUCT.name}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
