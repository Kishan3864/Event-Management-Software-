"use client";

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** One unexpected client record must never lock the software owner out of the Clients screen. */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-3xl bg-card p-7 text-center shadow-lift ring-1 ring-black/5">
        <h1 className="text-xl font-semibold">The client list could not be shown</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A client record may contain unexpected data. Try again. If it keeps happening, check the most recently changed client in the
          Firebase console.
        </p>
        <Button className="mt-6 w-full" onClick={() => retry()}>
          <RefreshCw /> Try again
        </Button>
        <Button className="mt-2 w-full" variant="outline" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
      </div>
    </div>
  );
}
