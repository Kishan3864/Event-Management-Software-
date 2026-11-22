"use client";

import {
  Building2,
  CalendarDays,
  ClipboardList,
  CloudOff,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Map as MapIcon,
  Plus,
  RefreshCw,
  ShieldAlert,
  TimerOff,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PRODUCT } from "@/lib/brand";
import { useSignOut } from "@/hooks/use-sign-out";
import { adminLoginHere, adminOrigin, clientLabel, linkPath, loginPath, savePortal, savedPortal, slugMatches } from "@/lib/portal";
import { formatDateShort } from "@/lib/format";
import { todayYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useData } from "@/providers/data-provider";
import { usePwa } from "@/providers/pwa-provider";
import { AppTour, markTourSeen, openAppTour, tourSeen } from "./app-tour";
import { BusinessMark } from "./brand";
import { InstallButton } from "./install-button";
import { NAV, isActive } from "./nav";
import { NoticeBell } from "./notice-bell";
import { Splash } from "./splash";

function SyncPill() {
  const { online } = usePwa();
  const { syncing } = useData();
  if (!online)
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-warning-soft px-2.5 text-xs font-medium text-warning">
        <CloudOff className="size-3.5" /> Offline
      </span>
    );
  if (syncing)
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-info-soft px-2.5 text-xs font-medium text-info">
        <RefreshCw className="size-3.5 animate-spin" /> Syncing
      </span>
    );
  return null;
}

function BlockedScreen({ icon: Icon, title, text, onRetry }: { icon: typeof ShieldAlert; title: string; text: ReactNode; onRetry?: () => void }) {
  const signOutNow = useSignOut();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-3xl bg-card p-7 text-center shadow-lift ring-1 ring-black/5">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-destructive">
          <Icon className="size-7" />
        </span>
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="mt-2 text-sm text-muted-foreground">{text}</div>
        {onRetry ? (
          <Button className="mt-6 w-full" onClick={onRetry}>
            <RefreshCw /> Try again
          </Button>
        ) : null}
        <Button className={onRetry ? "mt-2 w-full" : "mt-6 w-full"} variant={onRetry ? "outline" : "default"} onClick={() => signOutNow({ ask: false })}>
          <LogOut /> Sign out
        </Button>
        <p className="mt-5 text-xs text-muted-foreground">{PRODUCT.name} · {PRODUCT.madeBy}</p>
      </div>
    </div>
  );
}

function AdminBar() {
  const { isSuper, tenant } = useAuth();
  if (!isSuper) return null;
  return (
    <div className="bg-brand-deep text-white">
      <div className="mx-auto flex h-9 max-w-6xl items-center gap-2 px-4 text-xs lg:px-8">
        <Building2 className="size-3.5 shrink-0 text-[#f1d49a]" />
        <span className="truncate">
          Admin view: <b className="font-semibold">{tenant ? clientLabel(tenant) : "Client"}</b>
          {tenant && tenant.status !== "active" ? " (suspended)" : ""}
        </span>
        <Link href="/admin" className="ml-auto shrink-0 rounded-full bg-white/10 px-2.5 py-1 font-medium hover:bg-white/20">
          All clients
        </Link>
      </div>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { settings } = useData();
  const { user, isSuper } = useAuth();
  const signOutNow = useSignOut();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-16 items-center gap-3 px-5">
        <BusinessMark name={settings.name} logo={settings.logo} />
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-tight font-semibold">{settings.name || "Your business"}</p>
          <p className="truncate text-xs text-muted-foreground">{settings.city || PRODUCT.name}</p>
        </div>
      </div>
      <div className="px-4 pb-2">
        <Button asChild className="w-full rounded-xl">
          <Link href="/bookings/new" data-tour="new-booking">
            <Plus /> New Booking
          </Link>
        </Button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                active ? "bg-accent text-primary" : "text-foreground/70 hover:bg-muted hover:text-foreground"
              )}
            >
              <n.icon className={cn("size-[18px]", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              {n.label}
              {active ? <span className="ml-auto size-1.5 rounded-full bg-primary" /> : null}
            </Link>
          );
        })}
        {isSuper ? (
          <Link
            href="/admin"
            className="group mt-2 flex h-11 items-center gap-3 rounded-xl border border-dashed border-primary/25 px-3 text-sm font-medium text-primary hover:bg-accent"
          >
            <Building2 className="size-[18px]" /> Clients (Admin)
          </Link>
        ) : null}
      </nav>
      <div className="space-y-3 border-t p-4">
        {!isSuper ? (
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={openAppTour}>
            <MapIcon /> App tour
          </Button>
        ) : null}
        <InstallButton className="w-full justify-center" />
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{user?.email}</p>
            <p className="text-[11px] text-muted-foreground">{isSuper ? "Admin" : "Owner"}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Sign out"
                onClick={() => signOutNow()}
              >
                <LogOut />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const { settings } = useData();
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 pt-safe backdrop-blur-xl supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 lg:h-16 lg:px-8">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 lg:hidden">
          <BusinessMark name={settings.name} logo={settings.logo} className="size-9" />
          <span className="truncate text-[15px] font-semibold tracking-tight">{settings.name || "Your business"}</span>
        </Link>
        <p className="hidden text-sm text-muted-foreground lg:block">{formatDateShort(todayYMD())}</p>
        <div className="ml-auto flex items-center gap-2">
          <SyncPill />
          <NoticeBell />
          <InstallButton compact />
          <Button asChild size="sm" className="hidden rounded-full lg:inline-flex">
            <Link href="/bookings/new" data-tour="new-booking">
              <Plus /> New Booking
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const items = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/bookings", label: "Bookings", icon: ClipboardList },
    { href: "/bookings/new", label: "New", icon: Plus, primary: true },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/more", label: "More", icon: LayoutGrid },
  ];
  const moreActive = ["/more", "/customers", "/stock", "/payments", "/invoices", "/reports", "/settings"].some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/90 pb-safe backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
        {items.map((it) => {
          const active =
            it.href === "/more"
              ? moreActive
              : it.href === "/bookings"
                ? pathname === "/bookings" || (pathname.startsWith("/bookings/") && pathname !== "/bookings/new")
                : isActive(pathname, it.href);
          if (it.primary) {
            return (
              <Link key={it.href} href={it.href} aria-label="New booking" data-tour="new-booking" className="flex flex-col items-center justify-center">
                <span
                  className={cn(
                    "-mt-7 flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-lift ring-4 ring-background transition-transform active:scale-95",
                    pathname === "/bookings/new" && "ring-accent"
                  )}
                >
                  <Plus className="size-7" />
                </span>
                <span className="mt-0.5 text-[10.5px] font-medium text-primary">New</span>
              </Link>
            );
          }
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[10.5px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-accent")}>
                <it.icon className="size-[20px]" />
              </span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { status, isSuper, tenant, tenantId, user, refresh } = useAuth();
  const { settings, settingsLoaded } = useData();
  const router = useRouter();
  const pathname = usePathname();

  // This device opens one business's link. A signed-in session of another business found here goes through
  // that link's login page (which asks what to do) instead of opening on its own.
  const signedInBusiness = !isSuper && (status === "ready" || status === "suspended") && !!tenant?.slug;
  const saved = signedInBusiness ? savedPortal() : null;
  const otherBusiness = signedInBusiness && !!saved && !slugMatches(tenant, saved);
  // The software owner works only on the admin address; a business only on the clients' address.
  const wrongAddress = status !== "loading" && status !== "checking" && status !== "signedOut" && (isSuper ? !adminLoginHere() : !!user && adminLoginHere() && !!adminOrigin());

  useEffect(() => {
    if (status === "signedOut") router.replace(loginPath());
    else if (wrongAddress) return;
    else if (status === "noBusiness" && isSuper) router.replace("/admin");
    else if (otherBusiness) router.replace(saved ? linkPath(saved) : "/login");
    else if (signedInBusiness && tenant?.slug && saved !== tenant.slug) savePortal(tenant.slug);
  }, [status, isSuper, router, wrongAddress, otherBusiness, signedInBusiness, saved, tenant?.slug]);

  // First-time app tour for client logins (once per login; can be reopened from More → App tour)
  const [tourOpen, setTourOpen] = useState(false);
  const showTour = status === "ready" && settingsLoaded && !!settings.setupDone && !isSuper && !!user && !tourSeen(user.uid, settings.tourDone);
  useEffect(() => {
    if (showTour) setTourOpen(true);
  }, [showTour]);
  useEffect(() => {
    const open = () => setTourOpen(true);
    window.addEventListener("open-app-tour", open);
    return () => window.removeEventListener("open-app-tour", open);
  }, []);

  // A business's own name in the browser tab and as the iPhone home-screen name ("Add to Home Screen").
  useEffect(() => {
    if (isSuper || status !== "ready" || !settings.name) return;
    const name = settings.name.trim();
    document.title = name;
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", name.slice(0, 30));
    document.querySelector('meta[name="application-name"]')?.setAttribute("content", name);
  }, [isSuper, status, settings.name, pathname]);

  const needsSetup = status === "ready" && settingsLoaded && !settings.setupDone;
  useEffect(() => {
    if (needsSetup) router.replace("/setup");
  }, [needsSetup, router]);

  if (status === "loading" || status === "checking" || status === "signedOut" || otherBusiness) return <Splash />;
  if (wrongAddress) {
    return (
      <BlockedScreen
        icon={ShieldAlert}
        title={isSuper ? "Use the admin address" : "Use your business link"}
        text={
          isSuper ? (
            <>
              The admin panel opens only at <b className="text-foreground">{adminOrigin().replace("https://", "")}</b>.{" "}
              <a className="font-medium text-primary underline" href={`${adminOrigin()}/login`}>
                Open admin
              </a>
            </>
          ) : (
            "This is the admin address. Please open the link you received for your business."
          )
        }
      />
    );
  }
  if (status === "unreachable") {
    return (
      <BlockedScreen
        icon={CloudOff}
        title="Cannot reach the server"
        text="Your login could not be checked. Please check the internet and try again."
        onRetry={() => void refresh()}
      />
    );
  }
  if (status === "noBusiness") {
    if (isSuper) return <Splash label="Opening clients…" />;
    return (
      <BlockedScreen
        icon={ShieldAlert}
        title="No business"
        text={`This login has no business (it was removed or is not linked yet). Please contact ${PRODUCT.madeBy}.`}
      />
    );
  }
  if (status === "suspended") {
    return (
      <BlockedScreen
        icon={TimerOff}
        title="Account on hold"
        text={
          <>
            <b className="text-foreground">{tenant?.name}</b> is not active right now (suspended or plan expired). Please contact {PRODUCT.madeBy} to
            continue. Your data is safe.
          </>
        }
      />
    );
  }
  if (!settingsLoaded || needsSetup) return <Splash label={needsSetup ? "Opening setup…" : "Loading your data…"} />;

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="lg:pl-64">
        <AdminBar />
        <TopBar />
        <main key={`${tenantId}:${pathname}`} className="page-enter mx-auto max-w-6xl px-4 pt-5 pb-28 lg:px-8 lg:pt-7 lg:pb-14">
          {children}
        </main>
      </div>
      <BottomNav />
      <AppTour
        open={tourOpen}
        business={settings.name}
        onClose={() => {
          setTourOpen(false);
          if (user && !isSuper) markTourSeen(user.uid);
        }}
      />
    </div>
  );
}
