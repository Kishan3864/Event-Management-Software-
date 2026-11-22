import { deleteDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { PRODUCT } from "../brand";
import { TENANT_COLLECTIONS, docRef, newDocRef, quickWrite, rootDoc, settingsRef, tenantColRef, trackSave } from "../db";
import { currentTenant } from "../tenant";
import { todayYMD } from "../dates";
import { db } from "../firebase";
import type { Category, Item, LocationType, Settings } from "../types";

export async function saveSettings(patch: Partial<Settings>) {
  return quickWrite(setDoc(settingsRef(), { ...patch, updatedAt: serverTimestamp() }, { merge: true }));
}

export interface LocationInput {
  name: string;
  type: LocationType;
  address?: string;
  rate?: number;
}

export async function saveLocation(id: string | null, input: LocationInput) {
  const ref = id ? docRef("locations", id) : newDocRef("locations");
  await quickWrite(
    setDoc(
      ref,
      {
        name: input.name.trim(),
        type: input.type,
        address: (input.address || "").trim(),
        rate: Math.max(0, Number(input.rate) || 0),
        active: true,
        ...(id ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true }
    )
  );
  return ref.id;
}

export async function archiveLocation(id: string) {
  return quickWrite(updateDoc(docRef("locations", id), { active: false }));
}

export async function saveCategory(id: string | null, name: string, order: number, items: Item[] = []) {
  const ref = id ? docRef("categories", id) : newDocRef("categories");
  const batch = writeBatch(db());
  batch.set(ref, { name: name.trim(), order, ...(id ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
  if (id) {
    for (const it of items.filter((i) => i.categoryId === id)) {
      batch.update(docRef("items", it.id), { categoryName: name.trim() });
    }
  }
  await quickWrite(batch.commit());
  return ref.id;
}

export async function deleteCategory(c: Category, items: Item[]) {
  if (items.some((i) => i.categoryId === c.id && i.active !== false)) {
    throw new Error("Move the items in this category to another category first.");
  }
  return quickWrite(deleteDoc(docRef("categories", c.id)));
}

export interface SetupData {
  settings: Partial<Settings>;
  locations: LocationInput[];
  categories: string[];
  items: { name: string; category: string; unit: string; qty: number; rate: number }[];
}

/** First-run setup: saves business profile, venues, categories and opening stock in one go. */
export async function completeSetup(data: SetupData) {
  const batch = writeBatch(db());
  const catIds = new Map<string, string>();
  data.categories.forEach((name, i) => {
    const ref = newDocRef("categories");
    catIds.set(name, ref.id);
    batch.set(ref, { name, order: i, createdAt: serverTimestamp() });
  });
  for (const l of data.locations) {
    batch.set(newDocRef("locations"), {
      name: l.name.trim(),
      type: l.type,
      address: (l.address || "").trim(),
      rate: Math.max(0, Number(l.rate) || 0),
      active: true,
      createdAt: serverTimestamp(),
    });
  }
  const today = todayYMD();
  for (const it of data.items) {
    const ref = newDocRef("items");
    const qty = Math.max(0, Math.round(Number(it.qty) || 0));
    const name = it.name.trim();
    batch.set(ref, {
      name,
      nameLower: name.toLowerCase(),
      categoryId: catIds.get(it.category) || "",
      categoryName: it.category || "",
      unit: it.unit || "pcs",
      rate: Math.max(0, Number(it.rate) || 0),
      hsn: "",
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
        date: today,
        createdAt: serverTimestamp(),
      });
    }
  }
  batch.set(settingsRef(), { ...data.settings, setupDone: true, updatedAt: serverTimestamp() }, { merge: true });
  return quickWrite(batch.commit(), 4000);
}

/** Downloads every collection as JSON (manual backup). */
export function exportBackup(): Promise<Blob> {
  // Fixed to the business open when the backup started (an admin switching business cannot mix two businesses).
  const tid = currentTenant();
  return trackSave(() => buildBackup(tid));
}

async function buildBackup(tid: string): Promise<Blob> {
  const names = TENANT_COLLECTIONS;
  const out: Record<string, unknown[]> = {};
  for (const name of names) {
    const snap = await getDocs(tenantColRef(tid, name));
    out[name] = snap.docs.map((d) => {
      const data = d.data();
      for (const k of Object.keys(data)) {
        const v = data[k] as { toDate?: () => Date };
        if (v && typeof v.toDate === "function") data[k] = v.toDate().toISOString();
      }
      return { id: d.id, ...data };
    });
  }
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), app: PRODUCT.name, data: out }, null, 2);
  return new Blob([json], { type: "application/json" });
}

/** Sets the next number of one or more numbering series (counter key -> next number). */
export async function setNextNumbers(next: Record<string, number>) {
  const batch = writeBatch(db());
  for (const [key, n] of Object.entries(next)) {
    batch.set(docRef("counters", key), { seq: Math.max(0, Math.floor(n) - 1), updatedAt: serverTimestamp() }, { merge: true });
  }
  return quickWrite(batch.commit());
}

/** Keeps the platform's client list in step with the business profile (name, city, phone). */
export function syncTenantProfile(patch: { name: string; city?: string; phone?: string }) {
  updateDoc(rootDoc("tenants", currentTenant()), { ...patch, updatedAt: serverTimestamp() }).catch(() => undefined);
}
