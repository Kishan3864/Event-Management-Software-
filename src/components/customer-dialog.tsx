"use client";

import { Loader2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HOME_STATE, INDIAN_STATES } from "@/lib/constants";
import { cleanMobile, isValidMobile } from "@/lib/format";
import { saveCustomer } from "@/lib/services/customers";
import type { Customer } from "@/lib/types";
import { useData } from "@/providers/data-provider";

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer?: Customer | null;
  onSaved?: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  // New customers start in this business's own state (not a fixed one), so GST is right for every client.
  const { settings } = useData();
  const homeState = settings.state || HOME_STATE;
  const [state, setState] = useState(homeState);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? "");
    setMobile(customer?.mobile ?? "");
    setAddress(customer?.address ?? "");
    setGstin(customer?.gstin ?? "");
    setState(customer?.state || homeState);
    setNotes(customer?.notes ?? "");
    setErrors({});
  }, [open, customer, homeState]);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required";
    if (!isValidMobile(mobile)) e.mobile = "Enter a valid 10 digit mobile number";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const id = await saveCustomer(customer?.id ?? null, { name, mobile, address, gstin, state, notes });
      toast.success(customer ? "Customer updated" : "Customer added");
      onOpenChange(false);
      onSaved?.(id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="size-5 text-primary" /> {customer ? "Edit customer" : "Add customer"}
          </DialogTitle>
          <DialogDescription>Changes apply to new bookings. Old bookings keep their saved details.</DialogDescription>
        </DialogHeader>
        <Field label="Mobile number" required error={errors.mobile}>
          <Input inputMode="tel" maxLength={14} value={mobile} onChange={(e) => setMobile(cleanMobile(e.target.value))} placeholder="10 digit mobile" />
        </Field>
        <Field label="Name" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Address">
          <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GSTIN">
            <Input value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="Optional" />
          </Field>
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
        </div>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
