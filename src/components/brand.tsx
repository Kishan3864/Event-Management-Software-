"use client";

import { safeLogo } from "@/lib/image";
import { cn } from "@/lib/utils";

/** The product's own icon (login, splash, installed app). */
export function Monogram({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/icon-192.png" alt="" aria-hidden className={cn("size-10 rounded-xl", className)} />
  );
}

/** A client business: its logo, or a monogram of its first letter. */
export function BusinessMark({ name, logo, className }: { name?: string; logo?: string; className?: string }) {
  const src = safeLogo(logo);
  if (src) {
    return (
      <span className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Logo" className="size-full object-contain p-0.5" />
      </span>
    );
  }
  const letter = (typeof name === "string" ? name : "").trim().charAt(0).toUpperCase();
  if (!letter) return <Monogram className={className} />;
  return (
    <span
      aria-hidden
      className={cn(
        "@container flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient font-semibold text-[#f6e2b8] shadow-sm ring-1 ring-black/5",
        className
      )}
    >
      <span className="text-[52cqw] leading-none">{letter}</span>
    </span>
  );
}

/** Backwards-compatible name used across settings/setup screens. */
export function BrandMark({ logo, name, className }: { logo?: string; name?: string; className?: string }) {
  return <BusinessMark logo={logo} name={name} className={className} />;
}
