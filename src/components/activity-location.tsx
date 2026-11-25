"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useLiveDoc } from "@/hooks/use-live-query";
import { activityRef, shareActivityLocation, stopSharingActivityLocation, type ClientActivity } from "@/lib/services/activity";
import { useAuth } from "@/providers/auth-provider";

export function ActivityLocation() {
  const { user, tenantId } = useAuth();
  const uid = user?.uid;
  const { data, loading } = useLiveDoc<ClientActivity>(() => uid ? activityRef(uid) : null, [uid]);
  const [busy, setBusy] = useState(false);
  const shared = Boolean(data?.location);
  if (!uid || !tenantId) return null;

  const change = async (share: boolean) => {
    setBusy(true);
    try {
      if (share) {
        if (!navigator.geolocation) throw new Error("Location sharing is unavailable in this browser.");
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000, maximumAge: 60_000 });
        });
        await shareActivityLocation(uid, tenantId, position.coords.latitude, position.coords.longitude);
      } else {
        await stopSharingActivityLocation(uid);
      }
      toast.success(share ? "Approximate location shared" : "Shared location removed");
    } catch (error) {
      toast.error((error as Error).message || "Location could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Activity & location" icon={MapPin} className="mt-3">
      <p className="mb-3 text-sm text-muted-foreground">
        The platform admin can see when your login recently used the app. You can also share your approximate area (about 10 km), if you choose.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || loading} onClick={() => void change(true)}>
          {shared ? "Update shared location" : "Share approximate location"}
        </Button>
        {shared ? (
          <Button variant="ghost" disabled={busy} onClick={() => void change(false)}>Remove shared location</Button>
        ) : null}
      </div>
    </Section>
  );
}
