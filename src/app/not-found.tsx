import Link from "next/link";
import { PortalRedirect } from "@/components/portal-links";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <PortalRedirect />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="size-16 rounded-2xl shadow-lift" />
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">The page you opened does not exist.</p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
