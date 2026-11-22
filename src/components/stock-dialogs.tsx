"use client";

import { Loader2, Package, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChipGroup, Field, NumInput, num } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { availableNow } from "@/lib/availability";
import { UNITS } from "@/lib/constants";
import { todayYMD } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { ADJUST_ACTIONS, adjustStock, createItem, updateItem, type AdjustAction } from "@/lib/services/stock";
import type { Category, Item } from "@/lib/types";

export function ItemDialog({
  open,
  onOpenChange,
  item,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item?: Item | null;
  categories: Category[];
  onSaved?: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState("none");
  const [unit, setUnit] = useState("pcs");
  const [rate, setRate] = useState<number | "">("");
  const [hsn, setHsn] = useState("");
  const [qty, setQty] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setCat(item?.categoryId || "none");
    setUnit(item?.unit ?? "pcs");
    setRate(item?.rate ?? "");
    setHsn(item?.hsn ?? "");
    setQty("");
    setError(null);
  }, [open, item]);

  const units = item?.unit && !UNITS.includes(item.unit) ? [...UNITS, item.unit] : UNITS;

  const submit = async () => {
    if (!name.trim()) {
      setError("Item name is required");
      return;
    }
    setBusy(true);
    try {
      const c = categories.find((x) => x.id === cat);
      const input = { name, categoryId: c?.id ?? "", categoryName: c?.name ?? "", unit, rate: num(rate), hsn };
      if (item) {
        await updateItem(item.id, input);
        toast.success("Item updated");
        onOpenChange(false);
        onSaved?.(item.id);
      } else {
        const id = await createItem({ ...input, totalQty: num(qty) });
        toast.success(`${name.trim()} added to stock`);
        onOpenChange(false);
        onSaved?.(id);
      }
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
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5 text-primary" /> {item ? "Edit item" : "Add item"}
          </DialogTitle>
          <DialogDescription>{item ? "To change quantity, use Adjust stock." : "Items you give on rent."}</DialogDescription>
        </DialogHeader>
        <Field label="Item name" required error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Plastic Chair" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="none">No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Unit">
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {units.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rent per day">
            <NumInput prefix="₹" value={rate} onValueChange={setRate} placeholder="0" />
          </Field>
          {item ? (
            <Field label="HSN / SAC" hint="Optional">
              <Input value={hsn} onChange={(e) => setHsn(e.target.value)} />
            </Field>
          ) : (
            <Field label="Total quantity">
              <NumInput decimals={false} value={qty} onValueChange={setQty} placeholder="0" />
            </Field>
          )}
        </div>
        {!item ? (
          <Field label="HSN / SAC" hint="Optional, for tax invoices">
            <Input value={hsn} onChange={(e) => setHsn(e.target.value)} />
          </Field>
        ) : null}
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

export function AdjustDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item: Item }) {
  const [action, setAction] = useState<AdjustAction>("add");
  const [qty, setQty] = useState<number | "">("");
  const [date, setDate] = useState(todayYMD());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAction("add");
      setQty("");
      setDate(todayYMD());
      setNote("");
    }
  }, [open]);

  const hint = ADJUST_ACTIONS.find((a) => a.value === action)?.hint;
  const submit = async () => {
    setBusy(true);
    try {
      const r = await adjustStock(item, action, num(qty), note, date);
      toast.success("Stock updated", { description: r.queued ? "Saved offline. It will sync later." : undefined });
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
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-5 text-primary" /> Adjust stock
          </DialogTitle>
          <DialogDescription>
            {item.name}: total {formatNumber(item.totalQty)}, in godown {formatNumber(availableNow(item))}, damaged {formatNumber(item.damagedQty)}
          </DialogDescription>
        </DialogHeader>
        <ChipGroup size="sm" options={ADJUST_ACTIONS.map((a) => ({ value: a.value, label: a.label }))} value={action} onChange={setAction} />
        <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Quantity (${item.unit})`}>
            <NumInput decimals={false} autoFocus value={qty} onValueChange={setQty} placeholder="0" />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || num(qty) <= 0}>
            {busy ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
