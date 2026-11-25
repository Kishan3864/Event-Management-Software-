"use client";

import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail } from "firebase/auth";
import {
  Archive,
  Building2,
  DatabaseBackup,
  FileText,
  ImagePlus,
  KeyRound,
  Landmark,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Save,
  Tags,
  Trash2,
  UserCog,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand";
import { ChipGroup, Field, NumInput, PageHeader, Section, ToneBadge, num } from "@/components/common";
import { InstallButton } from "@/components/install-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT } from "@/lib/brand";
import { DEFAULT_PREFIXES, INDIAN_STATES, LOCATION_TYPES, LOCATION_TYPE_LABEL, MADE_BY } from "@/lib/constants";
import { fyOf, todayYMD } from "@/lib/dates";
import { auth } from "@/lib/firebase";
import { formatINR } from "@/lib/format";
import { resizeLogo } from "@/lib/image";
import { bookingNoOf, invoiceCounterKey, invoiceNoOf, receiptNoOf, BOOKING_COUNTER, RECEIPT_COUNTER } from "@/lib/services/counters";
import {
  archiveLocation,
  deleteCategory,
  exportBackup,
  saveCategory,
  saveLocation,
  saveSettings,
  setNextNumbers,
  syncTenantProfile,
} from "@/lib/services/settings";
import { downloadBlob } from "@/lib/share";
import type { Category, Location, LocationType, Settings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { authErrorMessage, useAuth } from "@/providers/auth-provider";
import { useSignOut } from "@/hooks/use-sign-out";
import { useConfirm } from "@/providers/confirm-provider";
import { useData } from "@/providers/data-provider";

type Tab = "business" | "venues" | "categories" | "billing" | "bank" | "account";
const TABS: { v: Tab; l: string; icon: typeof Building2 }[] = [
  { v: "business", l: "Business", icon: Building2 },
  { v: "venues", l: "Venues", icon: MapPin },
  { v: "categories", l: "Categories", icon: Tags },
  { v: "billing", l: "GST & Bills", icon: FileText },
  { v: "bank", l: "Bank & UPI", icon: Landmark },
  { v: "account", l: "Account", icon: UserCog },
];

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function SettingsClient() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = (params.get("tab") as Tab) || "business";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.v === initial) ? initial : "business");
  const select = (t: Tab) => {
    setTab(t);
    router.replace(`/settings?tab=${t}`, { scroll: false });
  };
  return (
    <div>
      <PageHeader title="Settings" subtitle="Business profile, venues, GST and account" />
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
        {TABS.map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => select(t.v)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-all",
              tab === t.v ? "border-primary bg-accent text-primary ring-2 ring-primary/15" : "bg-card text-foreground/75 hover:bg-muted"
            )}
          >
            <t.icon className="size-4" /> {t.l}
          </button>
        ))}
      </div>
      <div className="page-enter" key={tab}>
        {tab === "business" ? <BusinessTab /> : null}
        {tab === "venues" ? <VenuesTab /> : null}
        {tab === "categories" ? <CategoriesTab /> : null}
        {tab === "billing" ? <BillingTab /> : null}
        {tab === "bank" ? <BankTab /> : null}
        {tab === "account" ? <AccountTab /> : null}
      </div>
    </div>
  );
}

function SaveBar({ busy, onSave, label = "Save changes" }: { busy: boolean; onSave: () => void; label?: string }) {
  return (
    <div className="mt-5 flex justify-end">
      <Button size="lg" onClick={onSave} disabled={busy} className="w-full sm:w-auto">
        {busy ? <Loader2 className="animate-spin" /> : <Save />} {label}
      </Button>
    </div>
  );
}

async function persist(patch: Partial<Settings>, setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    const r = await saveSettings(patch);
    toast.success("Saved", { description: r === "queued" ? "Will sync when online." : undefined });
  } catch (e) {
    toast.error("Could not save", { description: (e as Error).message });
  } finally {
    setBusy(false);
  }
}

// ======================================================================= Business
function BusinessTab() {
  const { settings } = useData();
  const [f, setF] = useState(() => ({
    name: settings.name ?? "",
    tagline: settings.tagline ?? "",
    address: settings.address ?? "",
    city: settings.city ?? "",
    state: settings.state ?? "Madhya Pradesh",
    pincode: settings.pincode ?? "",
    phone1: settings.phone1 ?? "",
    phone2: settings.phone2 ?? "",
    email: settings.email ?? "",
    gstin: settings.gstin ?? "",
    logo: settings.logo ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const onLogo = async (file?: File | null) => {
    if (!file) return;
    try {
      set("logo", await resizeLogo(file));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Business name is required";
    if (f.gstin && !GSTIN_RE.test(f.gstin.trim().toUpperCase())) e.gstin = "GSTIN looks incorrect";
    if (f.phone1 && !/^\d{10}$/.test(f.phone1)) e.phone1 = "Enter 10 digits";
    setErrors(e);
    if (Object.keys(e).length) return;
    void persist({ ...f, name: f.name.trim(), gstin: f.gstin.trim().toUpperCase() }, setBusy);
    syncTenantProfile({ name: f.name.trim(), city: f.city.trim(), phone: f.phone1 });
  };

  return (
    <div className="space-y-5">
      <Section title="Logo" icon={ImagePlus}>
        <div className="flex items-center gap-4">
          <BrandMark logo={f.logo} name={f.name} className="size-20 rounded-2xl" />
          <div className="flex-1 text-sm text-muted-foreground">Shown on bills, invoices and slips. It is resized automatically.</div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(ev) => onLogo(ev.target.files?.[0])} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus /> {f.logo ? "Change" : "Upload"}
            </Button>
            {f.logo ? (
              <Button variant="ghost" size="sm" onClick={() => set("logo", "")}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </Section>
      <Section title="Business details" icon={Building2}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" required error={errors.name}>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Tagline">
            <Input value={f.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Pincode">
            <Input inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="State" hint="Used to decide CGST+SGST or IGST">
            <Select value={f.state} onValueChange={(v) => set("state", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-72">
                {INDIAN_STATES.map((s) => (
                  <SelectItem key={s.code} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="GSTIN" error={errors.gstin}>
            <Input value={f.gstin} maxLength={15} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="Optional" />
          </Field>
          <Field label="Mobile" error={errors.phone1}>
            <Input inputMode="tel" maxLength={10} value={f.phone1} onChange={(e) => set("phone1", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Other number">
            <Input inputMode="tel" maxLength={10} value={f.phone2} onChange={(e) => set("phone2", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>
        <SaveBar busy={busy} onSave={save} />
      </Section>
    </div>
  );
}

// ======================================================================= Venues
function VenuesTab() {
  const { locations } = useData();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<Location | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <Section
      title="Venues & godowns"
      icon={MapPin}
      action={
        <Button
          size="sm"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus /> Add
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">Use any saved venue in a booking. Godowns are storage locations.</p>
      {locations.length ? (
        <ul className="divide-y">
          {locations.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-3">
              <ToneBadge tone={l.type === "godown" ? "muted" : l.type === "resort" ? "brand" : "success"}>{LOCATION_TYPE_LABEL[l.type]}</ToneBadge>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{l.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {l.type !== "godown" ? `${formatINR(l.rate ?? 0)} / day` : "Storage"}
                  {l.address ? ` · ${l.address}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit"
                onClick={() => {
                  setEdit(l);
                  setOpen(true);
                }}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove"
                onClick={async () => {
                  if (await confirm({ title: `Remove ${l.name}?`, description: "Old bookings keep this venue name.", confirmText: "Remove", destructive: true })) {
                    await archiveLocation(l.id);
                    toast.success("Removed");
                  }
                }}
              >
                <Archive />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No venues yet.</p>
      )}
      <LocationDialog open={open} onOpenChange={setOpen} location={edit} />
    </Section>
  );
}

function LocationDialog({ open, onOpenChange, location }: { open: boolean; onOpenChange: (o: boolean) => void; location: Location | null }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("venue");
  const [rate, setRate] = useState<number | "">("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(location?.name ?? "");
    setType(location?.type ?? "venue");
    setRate(location?.rate ?? "");
    setAddress(location?.address ?? "");
  }, [open, location]);
  const submit = async () => {
    if (!name.trim()) {
      toast.error("Enter a name");
      return;
    }
    setBusy(true);
    try {
      await saveLocation(location?.id ?? null, { name, type, rate: num(rate), address });
      toast.success("Saved");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{location ? "Edit location" : "Add location"}</DialogTitle>
          <DialogDescription>Choose Other venue for halls, grounds and any other bookable location.</DialogDescription>
        </DialogHeader>
        <ChipGroup options={LOCATION_TYPES.map((t) => ({ value: t.value, label: t.label }))} value={type} onChange={setType} />
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City Convention Hall" />
        </Field>
        {type !== "godown" ? (
          <Field label="Default rent per day">
            <NumInput prefix="₹" value={rate} onValueChange={setRate} placeholder="0" />
          </Field>
        ) : null}
        <Field label="Address">
          <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ======================================================================= Categories
function CategoriesTab() {
  const { categories, items } = useData();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await saveCategory(null, name, categories.length);
      setName("");
      toast.success("Category added");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Item categories" icon={Tags}>
      <div className="mb-4 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button onClick={add} disabled={busy || !name.trim()}>
          <Plus /> Add
        </Button>
      </div>
      <ul className="divide-y">
        {categories.map((c) => {
          const count = items.filter((i) => i.categoryId === c.id && i.active !== false).length;
          return (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              {editing?.id === c.id ? (
                <>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" autoFocus />
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!editName.trim()) return;
                      await saveCategory(c.id, editName, c.order ?? 0, items);
                      setEditing(null);
                      toast.success("Renamed");
                    }}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <p className="flex-1 font-medium">{c.name}</p>
                  <span className="text-xs text-muted-foreground">{count} item{count === 1 ? "" : "s"}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Rename"
                    onClick={() => {
                      setEditing(c);
                      setEditName(c.name);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete"
                    onClick={async () => {
                      if (!(await confirm({ title: `Delete ${c.name}?`, confirmText: "Delete", destructive: true }))) return;
                      try {
                        await deleteCategory(c, items);
                        toast.success("Deleted");
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ======================================================================= Billing
function BillingTab() {
  const { settings, counters } = useData();
  const [gstRate, setGstRate] = useState<number | "">(settings.gstRate ?? 18);
  const [hsn, setHsn] = useState(settings.hsnSac ?? "");
  const [prefixes, setPrefixes] = useState({ ...DEFAULT_PREFIXES, ...settings.prefixes });
  const [terms, setTerms] = useState(settings.terms ?? "");
  const [bookingTerms, setBookingTerms] = useState(settings.bookingTerms ?? "");
  const [busy, setBusy] = useState(false);
  const fy = fyOf(todayYMD());
  const keys = {
    booking: BOOKING_COUNTER,
    taxInvoice: invoiceCounterKey("tax", fy.label),
    bill: invoiceCounterKey("bill", fy.label),
    receipt: RECEIPT_COUNTER,
  } as const;
  const current = {
    booking: (counters[keys.booking] ?? 0) + 1,
    taxInvoice: (counters[keys.taxInvoice] ?? 0) + 1,
    bill: (counters[keys.bill] ?? 0) + 1,
    receipt: (counters[keys.receipt] ?? 0) + 1,
  };
  const [nextNo, setNextNo] = useState<Record<keyof typeof keys, number | "">>(current);

  const preview = {
    booking: bookingNoOf(prefixes.booking, num(nextNo.booking) || 1),
    taxInvoice: invoiceNoOf(prefixes.taxInvoice, fy.short, num(nextNo.taxInvoice) || 1),
    bill: invoiceNoOf(prefixes.bill, fy.short, num(nextNo.bill) || 1),
    receipt: receiptNoOf(prefixes.receipt, num(nextNo.receipt) || 1),
  };

  const save = () => {
    if (num(gstRate) < 0 || num(gstRate) > 40) {
      toast.error("Enter a valid GST rate");
      return;
    }
    const changed: Record<string, number> = {};
    for (const k of Object.keys(keys) as (keyof typeof keys)[]) {
      const n = Math.floor(num(nextNo[k]));
      if (n < 1) {
        toast.error("Next number must be 1 or more");
        return;
      }
      if (n !== current[k]) changed[keys[k]] = n;
    }
    if (Object.keys(changed).length) void setNextNumbers(changed);
    const clean = (s: string, d: string) => (s || d).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || d;
    void persist(
      {
        gstRate: num(gstRate),
        hsnSac: hsn.trim(),
        prefixes: {
          booking: clean(prefixes.booking, "BK"),
          taxInvoice: clean(prefixes.taxInvoice, "TI"),
          bill: clean(prefixes.bill, "BL"),
          receipt: clean(prefixes.receipt, "RC"),
        },
        terms,
        bookingTerms,
      },
      setBusy
    );
  };

  return (
    <div className="space-y-5">
      <Section title="GST" icon={FileText}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default GST rate %" hint="Used for Tax Invoices. CGST+SGST in your state, IGST for other states.">
            <NumInput value={gstRate} onValueChange={setGstRate} />
          </Field>
          <Field label="Default HSN / SAC code" hint="Printed on tax invoices">
            <Input value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="e.g. 997319" />
          </Field>
        </div>
      </Section>
      <Section title="Numbering" icon={FileText}>
        <p className="mb-3 text-sm text-muted-foreground">
          Tax invoices and bills restart from 0001 every financial year (April to March). Change the next number only when moving from another
          software, and never to a number that is already used.
        </p>
        <div className="grid gap-3">
          {(
            [
              { k: "booking", l: "Booking" },
              { k: "taxInvoice", l: `Tax invoice (FY ${fy.label})` },
              { k: "bill", l: `Bill (FY ${fy.label})` },
              { k: "receipt", l: "Payment receipt" },
            ] as const
          ).map((p) => (
            <div key={p.k} className="grid grid-cols-[1fr_1fr] items-end gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[180px_1fr_1fr]">
              <p className="col-span-2 text-sm font-medium sm:col-span-1 sm:self-center">
                {p.l}
                <span className="block text-xs font-normal text-muted-foreground">Next: {preview[p.k]}</span>
              </p>
              <Field label="Prefix">
                <Input value={prefixes[p.k]} maxLength={6} onChange={(e) => setPrefixes((x) => ({ ...x, [p.k]: e.target.value.toUpperCase() }))} />
              </Field>
              <Field label="Next number">
                <NumInput decimals={false} value={nextNo[p.k]} onValueChange={(v) => setNextNo((x) => ({ ...x, [p.k]: v }))} />
              </Field>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Terms" icon={FileText}>
        <div className="grid gap-4">
          <Field label="Invoice / bill terms" hint="One point per line">
            <Textarea rows={5} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </Field>
          <Field label="Booking slip terms" hint="One point per line">
            <Textarea rows={4} value={bookingTerms} onChange={(e) => setBookingTerms(e.target.value)} />
          </Field>
        </div>
        <SaveBar busy={busy} onSave={save} />
      </Section>
    </div>
  );
}

// ======================================================================= Bank
function BankTab() {
  const { settings } = useData();
  const [b, setB] = useState({
    accountName: settings.bank?.accountName ?? "",
    bankName: settings.bank?.bankName ?? "",
    accountNo: settings.bank?.accountNo ?? "",
    ifsc: settings.bank?.ifsc ?? "",
    branch: settings.bank?.branch ?? "",
    upiId: settings.bank?.upiId ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof b, v: string) => setB((x) => ({ ...x, [k]: v }));
  return (
    <Section title="Bank & UPI details" icon={Landmark}>
      <p className="mb-4 text-sm text-muted-foreground">Printed as text on bills and invoices so customers can pay you.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account holder name">
          <Input value={b.accountName} onChange={(e) => set("accountName", e.target.value)} />
        </Field>
        <Field label="Bank name">
          <Input value={b.bankName} onChange={(e) => set("bankName", e.target.value)} />
        </Field>
        <Field label="Account number">
          <Input inputMode="numeric" value={b.accountNo} onChange={(e) => set("accountNo", e.target.value)} />
        </Field>
        <Field label="IFSC">
          <Input value={b.ifsc} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Branch">
          <Input value={b.branch} onChange={(e) => set("branch", e.target.value)} />
        </Field>
        <Field label="UPI ID">
          <Input value={b.upiId} onChange={(e) => set("upiId", e.target.value.trim())} placeholder="name@bank" />
        </Field>
      </div>
      <SaveBar busy={busy} onSave={() => void persist({ bank: b }, setBusy)} />
    </Section>
  );
}

// ======================================================================= Account
function AccountTab() {
  const { user } = useAuth();
  const signOutNow = useSignOut();
  const { settings } = useData();
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [em, setEm] = useState({ current: "", email: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const reauth = async (password: string) => {
    const u = auth().currentUser;
    if (!u || !u.email) throw new Error("Please sign in again.");
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
    return u;
  };

  const changePassword = async () => {
    if (pw.next.length < 8) return toast.error("New password must be at least 8 characters");
    if (pw.next !== pw.again) return toast.error("New passwords do not match");
    setBusy("pw");
    try {
      const u = await reauth(pw.current);
      await updatePassword(u, pw.next);
      setPw({ current: "", next: "", again: "" });
      toast.success("Password changed");
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const changeEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(em.email.trim())) return toast.error("Enter a valid email");
    setBusy("em");
    try {
      const u = await reauth(em.current);
      await verifyBeforeUpdateEmail(u, em.email.trim());
      setEm({ current: "", email: "" });
      toast.success("Verification link sent", { description: `Open the link sent to ${em.email.trim()} to finish. Then sign in with the new email.` });
    } catch (e) {
      toast.error(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const backup = async () => {
    setBusy("backup");
    try {
      const blob = await exportBackup();
      downloadBlob(blob, `${(settings.name || "Business").replace(/[^a-z0-9]+/gi, "")}_backup_${todayYMD()}.json`);
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error("Backup failed", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Section title="Signed in as" icon={UserCog}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 font-medium break-all">{user?.email}</p>
          <InstallButton />
          <Button
            variant="outline"
            onClick={async () => {
              await signOutNow();
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </Section>
      <Section title="Change password" icon={KeyRound}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((x) => ({ ...x, current: e.target.value }))} />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((x) => ({ ...x, next: e.target.value }))} />
          </Field>
          <Field label="New password again">
            <Input type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw((x) => ({ ...x, again: e.target.value }))} />
          </Field>
        </div>
        <SaveBar busy={busy === "pw"} onSave={changePassword} label="Change password" />
      </Section>
      <Section title="Change login email" icon={Mail}>
        <p className="mb-4 text-sm text-muted-foreground">
          Use your real email so “Forgot password” works. We send a link to the new email; the change happens after you open it.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New email">
            <Input type="email" value={em.email} onChange={(e) => setEm((x) => ({ ...x, email: e.target.value }))} />
          </Field>
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={em.current} onChange={(e) => setEm((x) => ({ ...x, current: e.target.value }))} />
          </Field>
        </div>
        <SaveBar busy={busy === "em"} onSave={changeEmail} label="Send verification link" />
      </Section>
      <Section title="Backup" icon={DatabaseBackup}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-muted-foreground">Download all bookings, payments, invoices, stock and customers as a file. Keep it safe.</p>
          <Button variant="outline" onClick={backup} disabled={busy === "backup"}>
            {busy === "backup" ? <Loader2 className="animate-spin" /> : <DatabaseBackup />} Download backup
          </Button>
        </div>
      </Section>
      <p className="py-2 text-center text-xs text-muted-foreground">
        {PRODUCT.name} · Made by <span className="font-medium">{MADE_BY}</span>
      </p>
    </div>
  );
}
