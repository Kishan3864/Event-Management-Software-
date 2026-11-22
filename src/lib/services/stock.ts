import { increment, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { availableNow } from "../availability";
import { docRef, newDocRef, quickWrite, runAtomic } from "../db";
import { todayYMD } from "../dates";
import { db } from "../firebase";
import type { Item, MoveType } from "../types";

export interface ItemInput {
  name: string;
  categoryId?: string;
  categoryName?: string;
  unit: string;
  rate: number;
  hsn?: string;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function createItem(input: ItemInput & { totalQty: number }) {
  const ref = newDocRef("items");
  const qty = Math.max(0, Math.round(n(input.totalQty)));
  const name = input.name.trim();
  const batch = writeBatch(db());
  batch.set(ref, {
    name,
    nameLower: name.toLowerCase(),
    categoryId: input.categoryId || "",
    categoryName: input.categoryName || "",
    unit: input.unit || "pcs",
    rate: Math.max(0, n(input.rate)),
    hsn: (input.hsn || "").trim(),
    totalQty: qty,
    outQty: 0,
    damagedQty: 0,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (qty > 0) {
    batch.set(newDocRef("stockMoves"), {
      itemId: ref.id,
      itemName: name,
      type: "added",
      qty,
      note: "Opening stock",
      date: todayYMD(),
      createdAt: serverTimestamp(),
    });
  }
  await quickWrite(batch.commit());
  return ref.id;
}

export async function updateItem(id: string, input: ItemInput) {
  const name = input.name.trim();
  return quickWrite(
    updateDoc(docRef("items", id), {
      name,
      nameLower: name.toLowerCase(),
      categoryId: input.categoryId || "",
      categoryName: input.categoryName || "",
      unit: input.unit || "pcs",
      rate: Math.max(0, n(input.rate)),
      hsn: (input.hsn || "").trim(),
      updatedAt: serverTimestamp(),
    })
  );
}

export type AdjustAction = "add" | "remove" | "damage" | "repair" | "writeoff";

export const ADJUST_ACTIONS: { value: AdjustAction; label: string; hint: string }[] = [
  { value: "add", label: "Add new stock", hint: "Bought or received more" },
  { value: "remove", label: "Remove stock", hint: "Sold, lost or counted less" },
  { value: "damage", label: "Mark damaged", hint: "Found damaged in godown" },
  { value: "repair", label: "Repaired", hint: "Damaged items are usable again" },
  { value: "writeoff", label: "Scrap damaged", hint: "Damaged items thrown away" },
];

export async function adjustStock(item: Item, action: AdjustAction, qtyIn: number, note: string, date: string) {
  const ref = docRef("items", item.id);
  const qty = Math.round(n(qtyIn));
  if (qty <= 0) throw new Error("Enter a quantity greater than zero.");
  return runAtomic(async (ctx) => {
    const snap = await ctx.get<Item>(ref);
    const cur = snap.data ?? item;
    const avail = availableNow(cur);
    const damaged = n(cur.damagedQty);
    let patch: Record<string, unknown> = {};
    let type: MoveType = "adjustment";
    let moveQty = qty;
    switch (action) {
      case "add":
        patch = { totalQty: increment(qty) };
        type = "added";
        break;
      case "remove":
        if (qty > avail) throw new Error(`Only ${avail} available in godown.`);
        patch = { totalQty: increment(-qty) };
        type = "adjustment";
        moveQty = -qty;
        break;
      case "damage":
        if (qty > avail) throw new Error(`Only ${avail} available in godown.`);
        patch = { damagedQty: increment(qty) };
        type = "damaged";
        break;
      case "repair":
        if (qty > damaged) throw new Error(`Only ${damaged} marked damaged.`);
        patch = { damagedQty: increment(-qty) };
        type = "repaired";
        break;
      case "writeoff":
        if (qty > damaged) throw new Error(`Only ${damaged} marked damaged.`);
        patch = { damagedQty: increment(-qty), totalQty: increment(-qty) };
        type = "writeoff";
        break;
    }
    ctx.update(ref, { ...patch, updatedAt: serverTimestamp() });
    ctx.set(newDocRef("stockMoves"), {
      itemId: item.id,
      itemName: cur.name || item.name,
      type,
      qty: moveQty,
      note: (note || "").trim(),
      date,
      createdAt: serverTimestamp(),
    });
    return true;
  });
}

export async function setItemActive(item: Item, active: boolean) {
  if (!active && n(item.outQty) > 0) throw new Error("Some of this item is out on rent. Return it first.");
  return quickWrite(updateDoc(docRef("items", item.id), { active, updatedAt: serverTimestamp() }));
}
