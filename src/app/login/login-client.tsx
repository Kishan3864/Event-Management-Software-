"use client";

import {
  Building2,
  CalendarCheck,
  CalendarClock,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Package,
  ShieldCheck,
  Users,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Monogram } from "@/components/brand";
import { Field } from "@/components/common";
import { InstallButton } from "@/components/install-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSignOut } from "@/hooks/use-sign-out";
import { PRODUCT } from "@/lib/brand";
import { isFirebaseConfigured } from "@/lib/firebase";
import { adminLoginHere, adminOrigin, clientLabel, isValidSlug, linkPath, portalFromUrl, savePortal, slugify, slugMatches } from "@/lib/portal";
import { findClientBySlug } from "@/lib/services/platform";
import { cn } from "@/lib/utils";
import { authErrorMessage, useAuth } from "@/providers/auth-provider";
import { usePwa } from "@/providers/pwa-provider";

const CLIENT_FEATURES = [
  { icon: CalendarCheck, title: "Bookings & calendar", text: "Venues and items with double-booking alerts" },
  { icon: FileText, title: "Bills & tax invoices", text: "Beautiful PDFs, share on WhatsApp" },
  { icon: Package, title: "Live stock", text: "Out on rent, returns, damaged & missing" },
];

const ADMIN_FEATURES = [
  { icon: Users, title: "All your clients", text: "Add businesses and open any of them" },
  { icon: KeyRound, title: "Logins & links", text: "Every client gets its own link and login" },
  { icon: CalendarClock, title: "Plans", text: "Plan dates, suspend and activate" },
];

/**
 * admin    : the software owner's sign-in (admin address only)
 * business : a business's own link /c/<name> (clients' address)
 * find     : clients' address without a link: shows how to open one's business link
 */
type Mode = "admin" | "business" | "find";

/** A decision that needs a tap instead of happening on its own. */
type Choice =
  | { kind: "admin"; id: string; label: string } // the software owner signed in on a business link (no admin address set up)
  | { kind: "other"; name: string; slug?: string }; // this device is already signed in to a different business

export function LoginClient() {
  const { status, isSuper, tenant, signIn, keepSignedIn, logout, switchTenant } = useAuth();
  const signOutNow = useSignOut();
  const { online } = usePwa();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  // The business link this page was opened with (/c/<name>); null = none. Read once when the page opens
  // (undefined until then), so nothing later can change which business is being entered.
  const [portal, setPortal] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode | undefined>(undefined);
  // idle: waiting · attempt: signing in · deciding: checking the login · asking: waiting for a tap · leaving
  const phase = useRef<"idle" | "attempt" | "deciding" | "asking" | "leaving">("idle");

  useEffect(() => {
    const link = portalFromUrl();
    setPortal(link);
    setMode(link ? "business" : adminLoginHere() ? "admin" : "find");
  }, []);

  useEffect(() => {
    if (portal === undefined || !mode) return;
    if (status === "loading" || status === "checking" || status === "signedOut") return;
    // One decision per sign-in: later updates (business details loading, etc.) must not start a second one.
    if (phase.current !== "idle" && phase.current !== "attempt") return;
    const justSignedIn = phase.current === "attempt";
    phase.current = "deciding";
    setBusy(true);

    const go = async (path: string) => {
      phase.current = "leaving";
      await keepSignedIn();
      router.replace(path);
    };
    const ask = (c: Choice) => {
      phase.current = "asking";
      setChoice(c);
      setBusy(false);
    };
    const refuse = async (msg: string) => {
      // Sign out completely first, then clear what was typed, then explain. Nothing of the refused login stays here.
      await logout({ discard: true, to: false }).catch(() => undefined);
      formRef.current?.reset();
      setShow(false);
      setChoice(null);
      phase.current = "idle";
      setError(msg);
      setBusy(false);
    };
    const adminAddress = adminOrigin().replace(/^https?:\/\//, "");

    void (async () => {
      if (status === "unreachable") return refuse("Cannot reach the server right now. Please check the internet and try again.");

      if (mode === "admin") {
        // The admin address: the software owner only.
        if (isSuper) return go(!justSignedIn && status === "ready" ? "/dashboard" : "/admin");
        return refuse("This is the admin address. Businesses sign in at their own link (…/c/your-name).");
      }

      if (isSuper) {
        // The software owner works on the admin address only (unless none is set up).
        if (!adminLoginHere()) return refuse(`This is a business address. Please sign in as admin at ${adminAddress}.`);
        if (portal) {
          const t = await findClientBySlug(portal).catch(() => null);
          if (t) return ask({ kind: "admin", id: t.id, label: clientLabel(t) });
        }
        return go("/admin");
      }

      if (status !== "ready" && status !== "suspended") {
        return refuse(`This login is not linked to any business yet. Please contact ${PRODUCT.madeBy}.`);
      }
      if (portal) {
        // A business link: only that business's own logins may enter.
        if (tenant?.slug && slugMatches(tenant, portal)) {
          savePortal(tenant.slug); // this device (and its installed app) now opens this business's link
          return go("/dashboard");
        }
        if (justSignedIn) return refuse("This login does not belong to this business link. Please check the link and your login.");
        return ask({ kind: "other", name: tenant?.name || "another business", slug: tenant?.slug });
      }
      // No link, already signed in on this device: back to its own business.
      if (tenant?.slug) savePortal(tenant.slug);
      return go("/dashboard");
    })();
  }, [portal, mode, status, isSuper, tenant, router, logout, keepSignedIn]);

  // Inputs are uncontrolled so anything typed before the page finishes loading is kept.
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (phase.current !== "idle") return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setBusy(true);
    phase.current = "attempt";
    try {
      await signIn(email, password);
    } catch (err) {
      phase.current = "idle";
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };

  const openChosenBusiness = async (id: string) => {
    phase.current = "leaving";
    setBusy(true);
    await keepSignedIn();
    await switchTenant(id);
  };

  const goToClients = async () => {
    phase.current = "leaving";
    setBusy(true);
    await keepSignedIn();
    router.replace("/admin");
  };

  const continueAsOther = async (slug?: string) => {
    if (slug) savePortal(slug);
    phase.current = "leaving";
    setBusy(true);
    await keepSignedIn();
    router.replace("/dashboard");
  };

  const working = busy || status === "checking";
  const isAdmin = mode === "admin";
  const features = isAdmin ? ADMIN_FEATURES : CLIENT_FEATURES;
  const brandName = isAdmin ? `${PRODUCT.name} · Admin` : PRODUCT.name;
  const BrandIcon = isAdmin ? AdminBadge : Monogram;

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel (desktop) */}
      <div className="relative hidden overflow-hidden bg-brand-gradient p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-32 -right-24 size-[28rem] rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 size-[30rem] rounded-full bg-white/[0.05]" />
        <div className="relative flex items-center gap-3">
          <BrandIcon className="size-12 rounded-2xl ring-1 ring-white/20" />
          <div>
            <p className="text-lg font-semibold">{brandName}</p>
            <p className="text-sm text-white/70">{isAdmin ? "Software owner panel" : "Bookings & billing"}</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">
            {isAdmin ? (
              <>
                Every client, login and plan <span className="text-white/75">in one panel.</span>
              </>
            ) : (
              <>
                Every booking, bill and item <span className="text-[#f1d49a]">in one place.</span>
              </>
            )}
          </h2>
          <div className="mt-10 space-y-5">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <f.icon className="size-5 text-white/85" />
                </span>
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-white/70">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/50">{isAdmin ? `Made by ${PRODUCT.madeBy}` : PRODUCT.tagline}</p>
      </div>

      {/* Form */}
      <div className="flex flex-col px-5 pt-safe pb-6 sm:px-8">
        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <BrandIcon className="size-16 rounded-2xl shadow-lift" />
              <p className="mt-4 text-xl font-semibold tracking-tight">{brandName}</p>
              <p className="text-sm text-muted-foreground">{isAdmin ? "Software owner panel" : "Bookings & billing"}</p>
            </div>
            <div className={cn("rounded-3xl border border-border/80 bg-card p-5 shadow-lift sm:p-9", isAdmin && "border-t-4 border-primary")}>
              {isAdmin ? (
                <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-primary">
                  <ShieldCheck className="size-3.5" /> Admin Panel
                </span>
              ) : null}
              {portal ? (
                <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                  <Link2 className="size-3.5 shrink-0" />
                  <span className="wrap-anywhere">{linkPath(portal)}</span>
                </div>
              ) : null}
              <h1 className="text-2xl font-semibold tracking-tight">{mode === "find" ? "Open your business" : "Welcome back"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {!mode ? "Sign in" : isAdmin ? "Software owner sign in" : mode === "business" ? "Sign in to your business" : "Every business signs in at its own link."}
              </p>
              {!isFirebaseConfigured ? (
                <p className="mt-4 rounded-xl bg-warning-soft p-3 text-sm text-warning">
                  Firebase is not configured. Add the values from .env.local.example to .env.local and rebuild.
                </p>
              ) : null}
              {mode === "find" ? (
                <>
                  {error ? (
                    <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <BusinessLinkBox />
                </>
              ) : choice ? (
                <div className="mt-6 space-y-3">
                  {choice.kind === "admin" ? (
                    <>
                      <p className="rounded-xl bg-muted/60 p-3 text-sm">
                        You signed in as the software owner. This link belongs to <b className="font-semibold">{choice.label}</b>.
                      </p>
                      <Button size="lg" className="w-full" disabled={busy} onClick={() => openChosenBusiness(choice.id)}>
                        {busy ? <Loader2 className="animate-spin" /> : <Building2 />} Open this business
                      </Button>
                      <Button size="lg" variant="outline" className="w-full" disabled={busy} onClick={goToClients}>
                        All clients
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="rounded-xl bg-muted/60 p-3 text-sm">
                        This device is signed in to <b className="font-semibold">{choice.name}</b>, not to the business of this link.
                      </p>
                      <Button
                        size="lg"
                        className="w-full"
                        disabled={busy}
                        onClick={() => signOutNow({ ask: false, to: portal ? linkPath(portal) : "/login" })}
                      >
                        <LogOut /> Sign out and use this link
                      </Button>
                      <Button size="lg" variant="outline" className="w-full" disabled={busy} onClick={() => continueAsOther(choice.slug)}>
                        Continue as {choice.name}
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <form ref={formRef} onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
                  <Field label="Email" htmlFor="email">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="username"
                        placeholder="you@email.com"
                        className="h-12 pl-10"
                      />
                    </div>
                  </Field>
                  <Field label="Password" htmlFor="password">
                    <div className="relative">
                      <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        name="password"
                        type={show ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="h-12 pr-11 pl-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        aria-label={show ? "Hide password" : "Show password"}
                        className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                      >
                        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </Field>
                  {error ? (
                    <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-destructive">
                      {error}
                    </p>
                  ) : null}
                  {!online ? (
                    <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-sm text-warning">
                      <WifiOff className="size-4" /> You are offline. Connect to sign in.
                    </p>
                  ) : null}
                  {/* Disabled until the page has loaded: an early tap must never submit the password in the URL. */}
                  <Button type="submit" size="lg" className="w-full" disabled={working || !mode}>
                    {working ? <Loader2 className="animate-spin" /> : isAdmin ? <ShieldCheck /> : null}
                    {working ? "Signing in…" : isAdmin ? "Sign in to admin" : "Sign in"}
                  </Button>
                  <div className="text-center">
                    <Link href={portal ? `/forgot-password?c=${portal}` : "/forgot-password"} className="text-sm font-medium text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                </form>
              )}
            </div>
            <div className="mt-6 flex justify-center">
              <InstallButton />
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Made by <span className="font-medium text-foreground/70">{PRODUCT.madeBy}</span>
        </p>
      </div>
    </div>
  );
}

/** The admin panel's own mark (a shield), so it never looks like a business app. */
function AdminBadge({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-10 items-center justify-center rounded-xl bg-brand-gradient text-white", className)}>
      <ShieldCheck className="size-1/2" />
    </span>
  );
}

/** Without a link (e.g. inside an installed app with no address bar) a business can type its link name. */
function BusinessLinkBox() {
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const open = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const slug = slugify(value);
    if (!isValidSlug(slug)) {
      setBad(true);
      return;
    }
    // Remembered only after a successful sign-in there.
    window.location.replace(linkPath(slug));
  };
  return (
    <form onSubmit={open} className="mt-6" noValidate>
      <p className="text-sm text-muted-foreground">
        Open the link you received on WhatsApp, or type its name (the part after <b className="text-foreground">/c/</b>):
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
          <Link2 className="size-4" />
          /c/
        </span>
        <Input
          value={value}
          onChange={(e) => {
            setBad(false);
            setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
          }}
          placeholder="your-business"
          aria-label="Business link name"
          className="h-11 min-w-0"
        />
        <Button type="submit" className="h-11">
          Open
        </Button>
      </div>
      {bad ? <p className="mt-2 text-xs text-destructive">Enter at least 3 letters or numbers.</p> : null}
    </form>
  );
}
