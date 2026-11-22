"use client";

import { query, where } from "firebase/firestore";
import {
  ArrowRight,
  Bell,
  Building2,
  Check,
  Copy,
  MessageCircle,
  CalendarClock,
  EllipsisVertical,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  UserCog,
  Mail,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { BusinessMark } from "@/components/brand";
import { ChipGroup, EmptyState, Field, ListSkeleton, SearchBox, ToneBadge } from "@/components/common";
import { Splash } from "@/components/splash";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLiveQuery } from "@/hooks/use-live-query";
import { PRODUCT } from "@/lib/brand";
import { HOME_STATE, INDIAN_STATES } from "@/lib/constants";
import { rootCol } from "@/lib/db";
import { auth } from "@/lib/firebase";
import { addMonths, todayYMD, toYMD } from "@/lib/dates";
import { formatDate, formatTimestamp } from "@/lib/format";
import { adminLoginHere, adminOrigin, appOrigin, clientLabel, portalUrl, slugify, suggestSlug } from "@/lib/portal";
import {
  addClientLogin,
  createClient,
  deleteClient,
  ensureClientSlugs,
  getClientNotes,
  cleanClientRecords,
  recordNeedsCleaning,
  removeMembership,
  sendLoginReset,
  sendNotice,
  setClientSlug,
  setClientStatus,
  setClientValidity,
  setMainOwner,
  updateClient,
} from "@/lib/services/platform";
import type { Membership, Tenant } from "@/lib/types";
import { cn } from "@/lib/utils";
import { openWhatsApp } from "@/lib/whatsapp";
import { authErrorMessage, tenantIsActive, useAuth } from "@/providers/auth-provider";
import { useSignOut } from "@/hooks/use-sign-out";
import { useConfirm } from "@/providers/confirm-provider";

/** A random 12-character password (about 70 bits) from the browser's secure random generator. */
function genPassword(len = 12) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const max = Math.floor(0x100000000 / abc.length) * abc.length;
  const buf = new Uint32Array(1);
  let out = "";
  while (out.length < len) {
    crypto.getRandomValues(buf);
    if (buf[0] < max) out += abc[buf[0] % abc.length];
  }
  return out;
}

const asText = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const createdMillis = (t: Tenant) => {
  const v = t.createdAt as { toMillis?: () => number } | null | undefined;
  return v && typeof v.toMillis === "function" ? v.toMillis() : Number.MAX_SAFE_INTEGER;
};

function validUntilYMD(t: Tenant): string | null {
  const v = t.validUntil as { toDate?: () => Date } | null | undefined;
  return v && typeof v.toDate === "function" ? toYMD(v.toDate()) : null;
}

function statusOf(t: Tenant): { label: string; tone: "success" | "danger" | "warning" | "muted" } {
  if (t.status !== "active") return { label: "Suspended", tone: "muted" };
  const until = validUntilYMD(t);
  if (until && !tenantIsActive(t)) return { label: "Plan expired", tone: "danger" };
  if (until && until <= toYMD(new Date(Date.now() + 15 * 86400000))) return { label: `Expires ${formatDate(until)}`, tone: "warning" };
  return { label: "Active", tone: "success" };
}

export function AdminClient() {
  const { status, isSuper, user, switchTenant, membership, tenantId, refresh } = useAuth();
  const signOutNow = useSignOut();
  const router = useRouter();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [loginFor, setLoginFor] = useState<Tenant | null>(null);
  const [planFor, setPlanFor] = useState<Tenant | null>(null);
  const [editFor, setEditFor] = useState<Tenant | null>(null);
  const [loginsFor, setLoginsFor] = useState<Tenant | null>(null);
  const [notifyFor, setNotifyFor] = useState<Tenant | null>(null);
  const [deleteFor, setDeleteFor] = useState<Tenant | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [creds, setCreds] = useState<Creds | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  // The software owner is never a member of a client business: keep admin and clients fully separate.
  useEffect(() => {
    if (!isSuper || !user || !membership) return;
    removeMembership(user.uid)
      .then(() => refresh())
      .catch(() => undefined);
  }, [isSuper, user, membership, refresh]);

  useEffect(() => {
    if (status === "signedOut") router.replace("/login");
    else if ((status === "ready" || status === "noBusiness" || status === "suspended") && !isSuper) router.replace("/dashboard");
  }, [status, isSuper, router]);

  const tenantsLive = useLiveQuery<Tenant>(() => (isSuper ? query(rootCol("tenants")) : null), [isSuper]);
  // Sorted here, not in the query, so a record missing a field can never drop out of the list; every text
  // field is forced to text so one bad record cannot break this screen.
  const tenants = useMemo(() => {
    const data = tenantsLive.data
      .map((t) => ({
        ...t,
        name: asText(t.name) || "(no name)",
        city: asText(t.city),
        phone: asText(t.phone),
        ownerEmail: asText(t.ownerEmail),
        slug: typeof t.slug === "string" && t.slug ? t.slug : undefined,
      }))
      .sort((a, b) => createdMillis(b) - createdMillis(a));
    return { ...tenantsLive, data };
  }, [tenantsLive]);
  const missingSlug = tenants.data.some((t) => !t.slug);
  const needsCleaning = tenants.data.some((t) => recordNeedsCleaning(t, user?.uid));
  // One run of each clean-up at a time (each write triggers a new list snapshot).
  const slugRun = useRef(false);
  const cleanRun = useRef(false);
  useEffect(() => {
    if (!isSuper || !missingSlug || slugRun.current) return;
    slugRun.current = true;
    ensureClientSlugs(tenants.data)
      .catch(() => undefined)
      .finally(() => (slugRun.current = false));
  }, [isSuper, missingSlug, tenants.data]);
  // Older versions kept admin-only details (notes, admin id) inside the client's record, where the client can read them.
  useEffect(() => {
    if (!isSuper || !needsCleaning || cleanRun.current) return;
    cleanRun.current = true;
    cleanClientRecords(tenants.data, user?.uid)
      .catch(() => undefined)
      .finally(() => (cleanRun.current = false));
  }, [isSuper, needsCleaning, tenants.data, user?.uid]);

  const list = useMemo(() => {
    const t = search.trim().toLowerCase();
    return tenants.data.filter(
      (x) =>
        !t ||
        x.name.toLowerCase().includes(t) ||
        (x.city || "").toLowerCase().includes(t) ||
        (x.ownerEmail || "").toLowerCase().includes(t) ||
        (x.phone || "").includes(t)
    );
  }, [tenants.data, search]);

  const counts = useMemo(() => {
    const active = tenants.data.filter((t) => tenantIsActive(t)).length;
    return { total: tenants.data.length, active, hold: tenants.data.length - active };
  }, [tenants.data]);

  if (status === "loading" || status === "signedOut" || !isSuper) return <Splash />;
  if (!adminLoginHere()) {
    // The admin panel lives only on the admin address.
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold">Admin panel is on the admin address</h1>
          <a className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground" href={`${adminOrigin()}/login`}>
            Open {adminOrigin().replace(/^https?:\/\//, "")}
          </a>
        </div>
      </div>
    );
  }

  const open = async (t: Tenant) => {
    setOpening(t.id);
    try {
      await switchTenant(t.id);
      router.push("/dashboard");
    } finally {
      setOpening(null);
    }
  };

  const toggleStatus = async (t: Tenant) => {
    const suspend = t.status === "active";
    const ok = await confirm({
      title: suspend ? `Suspend ${clientLabel(t)}?` : `Activate ${clientLabel(t)}?`,
      description: suspend
        ? "Their logins will see an 'Account on hold' screen until you activate them again. No data is deleted."
        : "Their logins will work again.",
      confirmText: suspend ? "Suspend" : "Activate",
      destructive: suspend,
    });
    if (!ok) return;
    try {
      await setClientStatus(t.id, suspend ? "suspended" : "active");
      toast.success(suspend ? "Client suspended" : "Client activated");
    } catch (e) {
      toast.error(authErrorMessage(e));
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/85 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-white">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-tight font-semibold">Admin Panel</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" /> Admin · {user?.email}
            </p>
          </div>
          {tenantId ? (
            <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={() => router.push("/dashboard")}>
              Back to app <ArrowRight />
            </Button>
          ) : null}
          <Button size="icon-sm" variant="ghost" aria-label="My account" onClick={() => setAccountOpen(true)}>
            <UserCog />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Sign out"
            onClick={async () => {
              await signOutNow();
            }}
          >
            <LogOut />
          </Button>
        </div>
      </header>

      <main className="page-enter mx-auto max-w-5xl px-4 pt-6 pb-16">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.6rem] font-semibold tracking-tight lg:text-3xl">Clients</h1>
            <p className="text-sm text-muted-foreground">Every business gets the same app with its own name, logo, data and logins.</p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus /> Add client
          </Button>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-3">
          {[
            { l: "Clients", v: counts.total, c: "text-foreground" },
            { l: "Active", v: counts.active, c: "text-success" },
            { l: "On hold", v: counts.hold, c: counts.hold ? "text-destructive" : "text-muted-foreground" },
          ].map((x) => (
            <div key={x.l} className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
              <p className="text-xs text-muted-foreground">{x.l}</p>
              <p className={cn("mt-1 text-2xl font-semibold tabular", x.c)}>{x.v}</p>
            </div>
          ))}
        </div>

        {tenants.data.length > 4 ? <SearchBox value={search} onChange={setSearch} placeholder="Search by name, city, email or phone" className="mb-4" /> : null}

        {tenants.loading ? (
          <ListSkeleton rows={3} />
        ) : list.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((t) => {
              const st = statusOf(t);
              const until = validUntilYMD(t);
              const mine = membership?.tenantId === t.id;
              return (
                <div key={t.id} className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
                  <div className="flex items-start gap-3">
                    <BusinessMark name={t.name} className="size-11" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[t.city, t.phone].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.ownerEmail}
                        {mine ? " (you)" : ""}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Client actions">
                          <EllipsisVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => setLoginsFor(t)}>
                          <Users /> Logins
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLoginFor(t)}>
                          <UserPlus /> Add a login
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setNotifyFor(t)}>
                          <Bell /> Send notification
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPlanFor(t)}>
                          <CalendarClock /> Plan validity
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditFor(t)}>
                          <Pencil /> Edit details
                        </DropdownMenuItem>
                        {t.ownerEmail ? (
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await sendLoginReset(t.ownerEmail!);
                                toast.success("Password reset link sent", { description: t.ownerEmail });
                              } catch (e) {
                                toast.error(authErrorMessage(e));
                              }
                            }}
                          >
                            <KeyRound /> Send password reset
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant={t.status === "active" ? "destructive" : "default"} onClick={() => toggleStatus(t)}>
                          {t.status === "active" ? <Pause /> : <Play />}
                          {t.status === "active" ? "Suspend" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteFor(t)}>
                          <Trash2 /> Delete client
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {t.slug ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(portalUrl(t.slug!));
                          toast.success("Client link copied", { description: portalUrl(t.slug!) });
                        } catch {
                          toast.info(portalUrl(t.slug!));
                        }
                      }}
                      className="flex items-center gap-2 rounded-xl bg-accent/60 px-3 py-2 text-left text-xs text-primary transition-colors hover:bg-accent"
                    >
                      <Link2 className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate font-medium">{portalUrl(t.slug!)}</span>
                      <Copy className="size-3.5 shrink-0" />
                    </button>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                    <span>{until ? `Plan till ${formatDate(until)}` : "No end date"}</span>
                    {t.createdAt ? <span>· Since {formatTimestamp(t.createdAt)}</span> : null}
                  </div>
                  <Button className="w-full" variant={tenantId === t.id ? "secondary" : "default"} disabled={opening === t.id} onClick={() => open(t)}>
                    {opening === t.id ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                    {tenantId === t.id ? "Open (current)" : "Open business"}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Building2}
            title={search ? "No client found" : "No clients yet"}
            description={search ? "Try another name." : "Add your first business. They get their own login, data and invoices."}
            action={
              !search ? (
                <Button onClick={() => setAddOpen(true)}>
                  <Plus /> Add client
                </Button>
              ) : null
            }
          />
        )}
        <p className="mt-10 text-center text-xs text-muted-foreground">
          {PRODUCT.name} · Made by {PRODUCT.madeBy}
        </p>
      </main>

      <AddClientDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={setCreds}
      />
      <AddLoginDialog tenant={loginFor} onClose={() => setLoginFor(null)} onCreated={setCreds} />
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} email={user?.email ?? ""} />
      <PlanDialog tenant={planFor} onClose={() => setPlanFor(null)} />
      <EditClientDialog tenant={editFor} onClose={() => setEditFor(null)} />
      <LoginsDialog
        tenant={loginsFor}
        onClose={() => setLoginsFor(null)}
        onAdd={(t) => {
          setLoginsFor(null);
          setLoginFor(t);
        }}
      />
      <NotifyDialog tenant={notifyFor} onClose={() => setNotifyFor(null)} />
      <DeleteClientDialog tenant={deleteFor} onClose={() => setDeleteFor(null)} />
    </div>
  );
}

// ---------------------------------------------------------------- add client
function AddClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (creds: Creds) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState(HOME_STATE);
  const [phone, setPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<"none" | "1m" | "1y" | "custom">("1y");
  const [planDate, setPlanDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName("");
    setSlug("");
    setSlugEdited(false);
    setCity("");
    setState(HOME_STATE);
    setPhone("");
    setOwnerName("");
    setEmail("");
    setPassword(genPassword());
    setPlan("1y");
    setPlanDate("");
    setNotes("");
    setErrors({});
  }, [open]);

  const validUntil =
    plan === "none" ? null : plan === "1m" ? addMonths(todayYMD(), 1) : plan === "1y" ? addMonths(todayYMD(), 12) : planDate || null;

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Business name is required";
    if (slugify(slug).length < 3) e.slug = "At least 3 letters (a-z, 0-9)";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email";
    if (password.length < 6) e.password = "At least 6 characters";
    if (phone && !/^\d{10}$/.test(phone)) e.phone = "Enter 10 digits";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const { tenantId } = await createClient({
        name,
        slug,
        city,
        state,
        phone,
        ownerName,
        owner: { mode: "new", email, password },
        validUntil,
        notes,
      });
      toast.success(`${name.trim()} added`);
      onOpenChange(false);
      void tenantId;
      onCreated({ business: name.trim(), email: email.trim().toLowerCase(), password, phone, slug: slugify(slug), isNew: true });
    } catch (err) {
      toast.error("Could not add the client", { description: authErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-primary" /> Add client
          </DialogTitle>
          <DialogDescription>They get the same app with their own name, data, numbering and login.</DialogDescription>
        </DialogHeader>
        <Field label="Business name" required error={errors.name}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(suggestSlug(e.target.value));
            }}
            placeholder="e.g. Royal Tent House"
          />
        </Field>
        <Field label="Client link" required error={errors.slug} hint={slug ? portalUrl(slugify(slug)) : "Their own login link"}>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">/c/</span>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              placeholder="royal"
            />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Indore" />
          </Field>
          <Field label="Mobile" error={errors.phone}>
            <Input inputMode="tel" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <Field label="State">
          <Select value={state} onValueChange={setState}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-64">
              {INDIAN_STATES.map((s) => (
                <SelectItem key={s.code} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Owner name">
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </Field>

        <div className="rounded-2xl border p-3">
          <p className="text-sm font-semibold">Client&apos;s login</p>
          <p className="mb-3 text-xs text-muted-foreground">The client signs in with this. They will see only their own business.</p>
          <div className="grid gap-3">
            <Field label="Login email" required error={errors.email}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@email.com" />
            </Field>
            <Field label="Password" required error={errors.password} hint="They can change it later in Settings → Account.">
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} className="tabular" />
                <Button type="button" variant="outline" size="icon" aria-label="New password" onClick={() => setPassword(genPassword())}>
                  <RefreshCw />
                </Button>
              </div>
            </Field>
          </div>
        </div>

        <Field label="Plan valid till">
          <ChipGroup
            size="sm"
            options={[
              { value: "1m" as const, label: "1 month" },
              { value: "1y" as const, label: "1 year" },
              { value: "custom" as const, label: "Pick date" },
              { value: "none" as const, label: "No limit" },
            ]}
            value={plan}
            onChange={setPlan}
          />
          {plan === "custom" ? <Input type="date" className="mt-2" value={planDate} min={todayYMD()} onChange={(e) => setPlanDate(e.target.value)} /> : null}
          {validUntil ? <p className="mt-1 text-xs text-muted-foreground">Works till {formatDate(validUntil)}. Extend any time.</p> : null}
        </Field>
        <Field label="Notes (only you see this)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Plan, price, contact person…" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- add login
function AddLoginDialog({ tenant, onClose, onCreated }: { tenant: Tenant | null; onClose: () => void; onCreated: (c: Creds) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mainOwner, setMainOwnerFlag] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (tenant) {
      setEmail("");
      setPassword(genPassword());
      setName("");
      setMainOwnerFlag(false);
    }
  }, [tenant]);
  const submit = async () => {
    if (!tenant) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error("Enter a valid email");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    try {
      const uid = await addClientLogin(tenant.id, { email, password, name, role: "owner" });
      if (mainOwner) await setMainOwner(tenant.id, uid, email, name);
      toast.success("Login added");
      onClose();
      onCreated({ business: tenant.name, email: email.trim().toLowerCase(), password, phone: tenant.phone, slug: tenant.slug, isNew: false });
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" /> Add a login
          </DialogTitle>
          <DialogDescription>
            For {tenant ? clientLabel(tenant) : ""}. This person gets full access to this business only, and signs in at its link.
          </DialogDescription>
        </DialogHeader>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Login email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" required>
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="button" variant="outline" size="icon" aria-label="New password" onClick={() => setPassword(genPassword())}>
              <RefreshCw />
            </Button>
          </div>
        </Field>
        <label className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-sm">
          <Checkbox checked={mainOwner} onCheckedChange={(v) => setMainOwnerFlag(v === true)} />
          Make this the main owner login (shown in your client list)
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Mail />} Create login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- plan validity
function PlanDialog({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (tenant) setDate(validUntilYMD(tenant) ?? "");
  }, [tenant]);
  const base = date && date > todayYMD() ? date : todayYMD();
  const save = async (ymd: string | null) => {
    if (!tenant) return;
    setBusy(true);
    try {
      await setClientValidity(tenant.id, ymd);
      toast.success(ymd ? `Plan valid till ${formatDate(ymd)}` : "Plan has no end date now");
      onClose();
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" /> Plan validity
          </DialogTitle>
          <DialogDescription>{tenant ? clientLabel(tenant) : ""}: after this date their login shows “Account on hold”.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {[
            { l: "+1 month", m: 1 },
            { l: "+3 months", m: 3 },
            { l: "+1 year", m: 12 },
          ].map((x) => (
            <Button key={x.l} variant="outline" size="sm" onClick={() => setDate(addMonths(base, x.m))}>
              {x.l}
            </Button>
          ))}
        </div>
        <Field label="Valid till">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => save(null)} disabled={busy}>
            No end date
          </Button>
          <Button onClick={() => save(date || null)} disabled={busy || !date}>
            {busy ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- edit details
function EditClientDialog({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const [f, setF] = useState({ name: "", slug: "", city: "", phone: "", ownerName: "", notes: "" });
  const [busy, setBusy] = useState(false);
  // Private notes are saved only once they have loaded, so saving early can never erase them.
  const [notesLoaded, setNotesLoaded] = useState(false);
  useEffect(() => {
    if (!tenant) return;
    let alive = true;
    setNotesLoaded(false);
    setF({ name: tenant.name, slug: tenant.slug ?? "", city: tenant.city ?? "", phone: tenant.phone ?? "", ownerName: tenant.ownerName ?? "", notes: "" });
    getClientNotes(tenant.id)
      .then((notes) => {
        if (!alive) return;
        setF((x) => ({ ...x, notes }));
        setNotesLoaded(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tenant]);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!tenant || !f.name.trim()) return;
    setBusy(true);
    try {
      const { slug, notes, ...rest } = f;
      if (slugify(slug) !== (tenant.slug ?? "")) await setClientSlug(tenant.id, slug);
      await updateClient(tenant.id, { ...rest, name: f.name.trim(), ...(notesLoaded ? { notes } : {}) });
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>The name on their bills is changed by the business in Settings.</DialogDescription>
        </DialogHeader>
        <Field label="Business name" required>
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Client link" hint={f.slug ? portalUrl(slugify(f.slug)) : undefined}>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">/c/</span>
            <Input value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Mobile">
            <Input inputMode="tel" maxLength={10} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <Field label="Owner name">
          <Input value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- login details to give the client
interface Creds {
  business: string;
  email: string;
  password: string;
  phone?: string;
  slug?: string;
  isNew: boolean;
}

function CredentialsDialog({ creds, onClose }: { creds: Creds | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (creds) setCopied(false);
  }, [creds]);
  if (!creds) return null;
  const url = creds.slug ? portalUrl(creds.slug) : appOrigin();
  const message = [
    `Namaste! Your ${PRODUCT.name} account for ${creds.business} is ready.`,
    "",
    `Your link: ${url}`,
    `Login email: ${creds.email}`,
    `Password: ${creds.password}`,
    "",
    "Open the link on your phone and tap Install App to add it to your home screen.",
    "You can change the password later in Settings → Account.",
  ].join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Login details copied");
    } catch {
      toast.error("Could not copy. Please select and copy manually.");
    }
  };
  return (
    <Dialog open={!!creds} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-success" /> {creds.isNew ? `${creds.business} is ready` : "Login ready"}
          </DialogTitle>
          <DialogDescription>Send these details to the client. They will see only their own business, with a short app tour on first login.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-2xl bg-muted/50 p-4 text-sm">
          {[
            { k: "Their link", v: url },
            { k: "Login email", v: creds.email },
            { k: "Password", v: creds.password },
          ].map((r) => (
            <div key={r.k} className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">{r.k}</span>
              <span className="font-medium break-all text-right select-all">{r.v}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          {creds.phone && /^\d{10}$/.test(creds.phone) ? (
            <Button variant="outline" className="text-[#128c4b]" onClick={() => openWhatsApp(creds.phone!, message)}>
              <MessageCircle /> Send on WhatsApp
            </Button>
          ) : null}
          <Button variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy details"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- the software owner's own login
function AccountDialog({ open, onOpenChange, email }: { open: boolean; onOpenChange: (o: boolean) => void; email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setNewEmail("");
    }
  }, [open]);
  const reauth = async () => {
    const u = auth().currentUser;
    if (!u || !u.email) throw new Error("Please sign in again.");
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
    return u;
  };
  const changePassword = async () => {
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    setBusy("pw");
    try {
      await updatePassword(await reauth(), next);
      toast.success("Password changed");
      onOpenChange(false);
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const changeEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) return toast.error("Enter a valid email");
    setBusy("em");
    try {
      await verifyBeforeUpdateEmail(await reauth(), newEmail.trim());
      toast.success("Verification link sent", { description: `Open the link sent to ${newEmail.trim()} to finish.` });
      onOpenChange(false);
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="size-5 text-primary" /> My admin account
          </DialogTitle>
          <DialogDescription>Signed in as {email}. Only you can open this Clients screen.</DialogDescription>
        </DialogHeader>
        <Field label="Current password" hint="Needed for any change">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <div className="grid gap-3 rounded-2xl border p-3">
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Button variant="outline" onClick={changePassword} disabled={!current || !next || busy !== null}>
            {busy === "pw" ? <Loader2 className="animate-spin" /> : <KeyRound />} Change password
          </Button>
        </div>
        <div className="grid gap-3 rounded-2xl border p-3">
          <Field label="New login email" hint="Use your own email. A verification link is sent there first.">
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </Field>
          <Button variant="outline" onClick={changeEmail} disabled={!current || !newEmail || busy !== null}>
            {busy === "em" ? <Loader2 className="animate-spin" /> : <Mail />} Change login email
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- logins of a client
type Login = Membership & { id: string };

function useClientLogins(tenantId: string | undefined) {
  return useLiveQuery<Login>(() => (tenantId ? query(rootCol("users"), where("tenantId", "==", tenantId)) : null), [tenantId]);
}

function LoginsDialog({ tenant, onClose, onAdd }: { tenant: Tenant | null; onClose: () => void; onAdd: (t: Tenant) => void }) {
  const confirm = useConfirm();
  const logins = useClientLogins(tenant?.id);
  const [busy, setBusy] = useState<string | null>(null);
  const remove = async (l: Login) => {
    const ok = await confirm({
      title: `Remove ${l.email || "this login"}?`,
      description: "This login loses access to this business immediately. Its data stays with the business.",
      confirmText: "Remove access",
      destructive: true,
    });
    if (!ok) return;
    setBusy(l.id);
    try {
      await removeMembership(l.id);
      toast.success("Access removed", { description: l.email });
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" /> Logins
          </DialogTitle>
          <DialogDescription>{tenant ? clientLabel(tenant) : ""}</DialogDescription>
        </DialogHeader>
        <div className="divide-y rounded-lg border">
          {logins.loading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading…</p>
          ) : logins.data.length ? (
            logins.data.map((l) => (
              <div key={l.id} className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.email || "(no email)"}</p>
                  <p className="text-xs text-muted-foreground">
                    {tenant?.ownerUid === l.id ? "Main owner" : "Login"}
                    {l.name ? ` · ${l.name}` : ""}
                  </p>
                </div>
                {l.email ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await sendLoginReset(l.email!);
                        toast.success("Password reset link sent", { description: l.email });
                      } catch (e) {
                        toast.error(authErrorMessage(e));
                      }
                    }}
                  >
                    <KeyRound /> Reset
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === l.id} onClick={() => remove(l)} aria-label="Remove access">
                  {busy === l.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </div>
            ))
          ) : (
            <p className="p-3 text-sm text-muted-foreground">No logins. Add one so the business can sign in.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => tenant && onAdd(tenant)}>
            <UserPlus /> Add a login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- notification to a client
function NotifyDialog({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const logins = useClientLogins(tenant?.id);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("all");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!tenant) return;
    setTitle("");
    setBody("");
    setTo("all");
  }, [tenant]);
  const send = async () => {
    if (!tenant) return;
    setBusy(true);
    try {
      await sendNotice(tenant.id, { title, body, to });
      toast.success("Notification sent", { description: tenant.name });
      onClose();
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="size-5 text-primary" /> Send notification
          </DialogTitle>
          <DialogDescription>
            To {tenant ? clientLabel(tenant) : ""}. It appears instantly in their app, and as a phone notification while their app is open.
          </DialogDescription>
        </DialogHeader>
        <Field label="Send to">
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">All logins of this business</SelectItem>
              {logins.data.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.email || l.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Plan renewal" maxLength={120} />
        </Field>
        <Field label="Message">
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={busy || !title.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Bell />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- delete a client completely
function DeleteClientDialog({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!tenant) return;
    setTyped("");
    setDone(0);
  }, [tenant]);
  const word = tenant?.slug || "delete";
  const run = async () => {
    if (!tenant || typed.trim().toLowerCase() !== word) return;
    setBusy(true);
    try {
      await deleteClient(tenant.id, setDone);
      toast.success(`${tenant.name} deleted`, { description: "Its data, link and its logins' access are gone." });
      onClose();
    } catch (e) {
      toast.error("Could not delete the client", { description: authErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!tenant} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-5" /> Delete client
          </DialogTitle>
          <DialogDescription>
            Deletes <b className="text-foreground">{tenant ? clientLabel(tenant) : ""}</b> completely: all bookings, bills, payments, customers,
            stock, settings, its link and its logins&apos; access. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <Field label={`Type ${word} to confirm`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
        <p className="text-xs text-muted-foreground">
          The login emails stay registered without any access. To use the same email again, delete it in Firebase Console → Authentication.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={run} disabled={busy || typed.trim().toLowerCase() !== word}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} {busy ? `Deleting… ${done}` : "Delete everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
