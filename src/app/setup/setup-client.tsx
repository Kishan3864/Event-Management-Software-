"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ImagePlus,
  Loader2,
  MapPin,
  Package,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BrandMark, Monogram } from "@/components/brand";
import { ChipGroup, Field, NumInput, num } from "@/components/common";
import { Splash } from "@/components/splash";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  buildDefaultTerms,
  HOME_STATE,
  INDIAN_STATES,
  LOCATION_TYPES,
  SUGGESTED_ITEMS,
  UNITS,
} from "@/lib/constants";
import { resizeLogo } from "@/lib/image";
import { completeSetup, syncTenantProfile } from "@/lib/services/settings";
import type { LocationType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loginPath } from "@/lib/portal";
import { useAuth } from "@/providers/auth-provider";
import { useData } from "@/providers/data-provider";

const STEPS = [
  { title: "Business", icon: Building2 },
  { title: "Venues", icon: MapPin },
  { title: "Items", icon: Package },
];

type LocRow = { key: number; name: string; type: LocationType; rate: number | ""; address: string };
type ItemRow = { key: number; name: string; category: string; unit: string; qty: number | ""; rate: number | "" };

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
let keySeq = 1;

export function SetupClient() {
  const { status, isSuper } = useAuth();
  const { settings, settingsLoaded } = useData();
  const router = useRouter();

  useEffect(() => {
    if (status === "signedOut") router.replace(loginPath());
    else if (status === "noBusiness") router.replace(isSuper ? "/admin" : "/dashboard");
    else if (status === "suspended") router.replace("/dashboard");
    else if (status === "ready" && settingsLoaded && settings.setupDone) router.replace("/dashboard");
  }, [status, isSuper, settingsLoaded, settings.setupDone, router]);

  if (status !== "ready" || !settingsLoaded || settings.setupDone) return <Splash />;
  return <SetupWizard />;
}

function SetupWizard() {
  const { tenant } = useAuth();
  const { settings } = useData();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const [biz, setBiz] = useState({
    name: settings.name || tenant?.name || "",
    tagline: settings.tagline || "Tent, Resort & Garden",
    address: settings.address || "",
    city: settings.city || tenant?.city || "",
    state: settings.state || tenant?.state || HOME_STATE,
    pincode: settings.pincode || "",
    phone1: settings.phone1 || tenant?.phone || "",
    phone2: "",
    email: "",
    gstin: "",
    logo: "",
  });
  const [locs, setLocs] = useState<LocRow[]>([
    { key: keySeq++, name: "", type: "garden", rate: "", address: "" },
    { key: keySeq++, name: "", type: "resort", rate: "", address: "" },
    { key: keySeq++, name: "Godown", type: "godown", rate: "", address: "" },
  ]);
  const [items, setItems] = useState<ItemRow[]>([]);

  const setB = (k: keyof typeof biz, v: string) => setBiz((b) => ({ ...b, [k]: v }));

  const validateStep = () => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!biz.name.trim()) e.name = "Business name is required";
      if (biz.phone1 && !/^\d{10}$/.test(biz.phone1.replace(/\D/g, ""))) e.phone1 = "Enter a 10 digit mobile number";
      if (biz.gstin && !GSTIN_RE.test(biz.gstin.trim().toUpperCase())) e.gstin = "GSTIN looks incorrect (15 characters)";
      if (biz.email && !/^\S+@\S+\.\S+$/.test(biz.email)) e.email = "Enter a valid email";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(2, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onLogo = async (f?: File | null) => {
    if (!f) return;
    try {
      setB("logo", await resizeLogo(f));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const addSuggested = (s: (typeof SUGGESTED_ITEMS)[number]) => {
    if (items.some((i) => i.name.toLowerCase() === s.name.toLowerCase())) return;
    setItems((list) => [...list, { key: keySeq++, name: s.name, category: s.category, unit: s.unit, qty: "", rate: "" }]);
  };

  const finish = async () => {
    const cleanLocs = locs.filter((l) => l.name.trim());
    const cleanItems = items.filter((i) => i.name.trim());
    setSaving(true);
    try {
      await completeSetup({
        settings: {
          ...DEFAULT_SETTINGS,
          ...biz,
          name: biz.name.trim(),
          gstin: biz.gstin.trim().toUpperCase(),
          phone1: biz.phone1.replace(/\D/g, ""),
          phone2: biz.phone2.replace(/\D/g, ""),
          terms: buildDefaultTerms(biz.city),
        },
        locations: cleanLocs.map((l) => ({ name: l.name, type: l.type, rate: num(l.rate), address: l.address })),
        categories: DEFAULT_CATEGORIES,
        items: cleanItems.map((i) => ({ name: i.name, category: i.category, unit: i.unit, qty: num(i.qty), rate: num(i.rate) })),
      });
      syncTenantProfile({ name: biz.name.trim(), city: biz.city.trim(), phone: biz.phone1.replace(/\D/g, "") });
      toast.success("Setup complete. Welcome!");
      router.replace("/dashboard");
    } catch (err) {
      toast.error("Could not save setup", { description: (err as Error).message });
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/85 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <Monogram className="size-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Welcome{biz.name ? `, ${biz.name}` : ""}! Let&apos;s set up your app</p>
            <p className="text-xs text-muted-foreground">Takes 2 minutes. You can change everything later.</p>
          </div>
        </div>
        <div className="mx-auto flex max-w-3xl gap-2 px-4 pb-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex flex-1 flex-col gap-1.5">
              <div className={cn("h-1.5 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
              <p className={cn("text-xs font-medium", i === step ? "text-primary" : "text-muted-foreground")}>
                {i + 1}. {s.title}
              </p>
            </div>
          ))}
        </div>
      </header>

      <main className="page-enter mx-auto max-w-3xl px-4 pt-6 pb-32" key={step}>
        {step === 0 ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Business details</h1>
              <p className="text-sm text-muted-foreground">Printed on every bill, invoice and slip.</p>
            </div>
            <div className="flex items-center gap-4 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
              <BrandMark logo={biz.logo} name={biz.name} className="size-16 rounded-2xl" />
              <div className="flex-1">
                <p className="font-medium">Logo</p>
                <p className="text-xs text-muted-foreground">Optional. A square image looks best.</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
              <div className="flex gap-2">
                {biz.logo ? (
                  <Button variant="ghost" size="sm" onClick={() => setB("logo", "")}>
                    Remove
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <ImagePlus /> {biz.logo ? "Change" : "Upload"}
                </Button>
              </div>
            </div>
            <div className="grid gap-4 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04] sm:grid-cols-2 sm:p-5">
              <Field label="Business name" required error={errors.name} className="sm:col-span-2">
                <Input value={biz.name} onChange={(e) => setB("name", e.target.value)} />
              </Field>
              <Field label="Tagline" className="sm:col-span-2">
                <Input value={biz.tagline} onChange={(e) => setB("tagline", e.target.value)} placeholder="Tent, Resort & Garden" />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Textarea rows={2} value={biz.address} onChange={(e) => setB("address", e.target.value)} placeholder="Shop no, road, area" />
              </Field>
              <Field label="City">
                <Input value={biz.city} onChange={(e) => setB("city", e.target.value)} />
              </Field>
              <Field label="Pincode">
                <Input inputMode="numeric" maxLength={6} value={biz.pincode} onChange={(e) => setB("pincode", e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="State" className="sm:col-span-2">
                <Select value={biz.state} onValueChange={(v) => setB("state", v)}>
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
              <Field label="Mobile number" error={errors.phone1}>
                <Input inputMode="tel" maxLength={10} value={biz.phone1} onChange={(e) => setB("phone1", e.target.value.replace(/\D/g, ""))} placeholder="10 digit mobile" />
              </Field>
              <Field label="Other number">
                <Input inputMode="tel" maxLength={10} value={biz.phone2} onChange={(e) => setB("phone2", e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input type="email" value={biz.email} onChange={(e) => setB("email", e.target.value)} />
              </Field>
              <Field label="GSTIN" hint="Only if registered under GST" error={errors.gstin}>
                <Input value={biz.gstin} maxLength={15} onChange={(e) => setB("gstin", e.target.value.toUpperCase())} placeholder="23XXXXX0000X1Z5" />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Venues & godowns</h1>
              <p className="text-sm text-muted-foreground">
                Add your resorts and gardens (bookable venues) and your godown. Leave a row empty to skip it.
              </p>
            </div>
            <div className="space-y-3">
              {locs.map((l, idx) => (
                <div key={l.key} className="space-y-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
                  <div className="flex items-center gap-2">
                    <ChipGroup
                      size="sm"
                      options={LOCATION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                      value={l.type}
                      onChange={(v) => setLocs((arr) => arr.map((x, i) => (i === idx ? { ...x, type: v } : x)))}
                      className="flex-1"
                    />
                    <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setLocs((arr) => arr.filter((_, i) => i !== idx))}>
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                    <Input
                      placeholder={l.type === "godown" ? "e.g. Main Godown" : l.type === "resort" ? "Resort name" : "Garden name"}
                      value={l.name}
                      onChange={(e) => setLocs((arr) => arr.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                    />
                    {l.type !== "godown" ? (
                      <NumInput
                        prefix="₹"
                        placeholder="Rent per day"
                        value={l.rate}
                        onValueChange={(v) => setLocs((arr) => arr.map((x, i) => (i === idx ? { ...x, rate: v } : x)))}
                      />
                    ) : null}
                  </div>
                  <Input
                    placeholder="Address / area (optional)"
                    value={l.address}
                    onChange={(e) => setLocs((arr) => arr.map((x, i) => (i === idx ? { ...x, address: e.target.value } : x)))}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {LOCATION_TYPES.map((t) => (
                <Button
                  key={t.value}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setLocs((arr) => [...arr, { key: keySeq++, name: "", type: t.value, rate: "", address: "" }])}
                >
                  <Plus /> {t.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Items on rent</h1>
              <p className="text-sm text-muted-foreground">
                Add the items you give on rent with total quantity and rent per day. You can add more later in Stock.
              </p>
            </div>
            <div className="rounded-2xl bg-gold-soft/70 p-4 ring-1 ring-gold/15">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gold">
                <Sparkles className="size-4" /> Quick add
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_ITEMS.map((s) => {
                  const added = items.some((i) => i.name.toLowerCase() === s.name.toLowerCase());
                  return (
                    <button
                      key={s.name}
                      type="button"
                      disabled={added}
                      onClick={() => addSuggested(s)}
                      className={cn(
                        "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-all active:scale-95",
                        added ? "border-transparent bg-success-soft text-success" : "border-gold/25 bg-card hover:border-gold/60"
                      )}
                    >
                      {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              {items.map((it, idx) => {
                const upd = (patch: Partial<ItemRow>) => setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
                return (
                  <div key={it.key} className="space-y-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-black/[0.04]">
                    <div className="flex gap-2">
                      <Input placeholder="Item name" value={it.name} onChange={(e) => upd({ name: e.target.value })} className="flex-1" />
                      <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}>
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Select value={it.category} onValueChange={(v) => upd({ category: v })}>
                        <SelectTrigger aria-label="Category">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {DEFAULT_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={it.unit} onValueChange={(v) => upd({ unit: v })}>
                        <SelectTrigger aria-label="Unit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <NumInput decimals={false} placeholder="Total qty" value={it.qty} onValueChange={(v) => upd({ qty: v })} />
                      <NumInput prefix="₹" placeholder="Rent / day" value={it.rate} onValueChange={(v) => upd({ rate: v })} />
                    </div>
                  </div>
                );
              })}
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() => setItems((arr) => [...arr, { key: keySeq++, name: "", category: "Other", unit: "pcs", qty: "", rate: "" }])}
              >
                <Plus /> Add another item
              </Button>
            </div>
          </div>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 pb-safe backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {step > 0 ? (
            <Button variant="outline" size="lg" onClick={back} disabled={saving}>
              <ArrowLeft /> Back
            </Button>
          ) : null}
          <div className="flex-1" />
          {step < 2 ? (
            <Button size="lg" onClick={next}>
              Next <ArrowRight />
            </Button>
          ) : (
            <Button size="lg" onClick={finish} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              Finish setup
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
