"use client";

import { Building2, ChevronRight, LogOut, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { ActivityLocation } from "@/components/activity-location";
import { openAppTour } from "@/components/app-tour";
import { BrandMark } from "@/components/brand";
import { PageHeader } from "@/components/common";
import { InstallButton } from "@/components/install-button";
import { MORE_NAV } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { MADE_BY } from "@/lib/constants";
import { formatINR } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import { useSignOut } from "@/hooks/use-sign-out";
import { useData } from "@/providers/data-provider";

export function MoreClient() {
  const { settings, totalDue, activeItems } = useData();
  const { user, isSuper } = useAuth();
  const signOutNow = useSignOut();
  const hints: Record<string, string> = {
    "/customers": totalDue > 0 ? `${formatINR(totalDue)} pending` : "History & dues",
    "/stock": `${activeItems.length} items`,
  };
  return (
    <div>
      <PageHeader title="More" />
      <div className="mb-5 flex items-center gap-3 rounded-3xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
        <BrandMark logo={settings.logo} name={settings.name} className="size-12 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{settings.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <InstallButton compact />
      </div>
      {isSuper ? (
        <Link
          href="/admin"
          className="mb-3 flex items-center gap-3 rounded-2xl border border-dashed border-primary/30 bg-accent/40 p-4 transition-all active:scale-[0.99]"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Clients (Admin)</span>
            <span className="block truncate text-xs text-muted-foreground">Add businesses, logins and plans</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {MORE_NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="group flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04] transition-all hover:shadow-lift active:scale-[0.98]"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
              <n.icon className="size-5" />
            </span>
            <span>
              <span className="flex items-center justify-between font-semibold">
                {n.label}
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="block truncate text-xs text-muted-foreground">{hints[n.href] ?? n.description}</span>
            </span>
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={openAppTour}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-soft ring-1 ring-black/[0.04] transition-all active:scale-[0.99]"
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-gold-soft text-gold">
          <MapIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">App tour</span>
          <span className="block truncate text-xs text-muted-foreground">How booking, items, payments and bills work · ऐप कैसे चलाएँ</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>
      {!isSuper ? <ActivityLocation /> : null}
      <Button
        variant="outline"
        className="mt-6 w-full"
        onClick={async () => {
          await signOutNow();
        }}
      >
        <LogOut /> Sign out
      </Button>
      <p className="mt-6 text-center text-xs text-muted-foreground">Made by {MADE_BY}</p>
    </div>
  );
}
