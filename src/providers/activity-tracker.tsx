"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { adminOrigin, isAdminHost, savedPortal, slugMatches } from "@/lib/portal";
import { ACTIVITY_INTERVAL_MS, recordActivity } from "@/lib/services/activity";
import { useAuth } from "@/providers/auth-provider";

const SCREENS = new Set(["setup", "dashboard", "bookings", "calendar", "customers", "invoices", "payments", "reports", "settings", "stock", "more"]);

export function ActivityTracker() {
  const { isSuper, status, tenant, tenantId, user } = useAuth();
  const screen = usePathname()?.split("/")[1] ?? "";
  const uid = user?.uid;
  const portal = typeof window === "undefined" ? null : savedPortal();
  const blocked = !!portal && !slugMatches(tenant, portal);

  useEffect(() => {
    if (isSuper || status !== "ready" || !tenantId || !uid || blocked ||
        (adminOrigin() && isAdminHost()) || !SCREENS.has(screen)) return;
    const report = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void recordActivity(uid, tenantId, screen).catch(() => undefined);
      }
    };
    report();
    const timer = window.setInterval(report, ACTIVITY_INTERVAL_MS);
    document.addEventListener("visibilitychange", report);
    window.addEventListener("online", report);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("online", report);
    };
  }, [isSuper, status, tenantId, uid, screen, blocked]);

  return null;
}
