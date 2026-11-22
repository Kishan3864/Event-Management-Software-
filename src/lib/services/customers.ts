import {
  deleteDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
} from "firebase/firestore";
import { colRef, docRef, fromSnap, newDocRef, quickWrite } from "../db";
import type { Customer } from "../types";

export async function findCustomerByMobile(mobile: string): Promise<Customer | null> {
  if (!/^\d{10}$/.test(mobile)) return null;
  const snap = await getDocs(query(colRef("customers"), where("mobile", "==", mobile), limit(1)));
  return snap.empty ? null : fromSnap<Customer>(snap.docs[0]);
}

export interface CustomerInput {
  name: string;
  mobile: string;
  address?: string;
  gstin?: string;
  state?: string;
  notes?: string;
}

export async function saveCustomer(id: string | null, input: CustomerInput) {
  const existing = await findCustomerByMobile(input.mobile);
  if (existing && existing.id !== id) {
    throw new Error(`${existing.name} already uses this mobile number.`);
  }
  const ref = id ? docRef("customers", id) : newDocRef("customers");
  const name = input.name.trim();
  await quickWrite(
    setDoc(
      ref,
      {
        name,
        nameLower: name.toLowerCase(),
        mobile: input.mobile,
        address: (input.address || "").trim(),
        gstin: (input.gstin || "").trim().toUpperCase(),
        state: input.state || "",
        notes: (input.notes || "").trim(),
        updatedAt: serverTimestamp(),
        ...(id ? {} : { createdAt: serverTimestamp(), bookingsCount: 0 }),
      },
      { merge: true }
    )
  );
  return ref.id;
}

export async function deleteCustomer(c: Customer) {
  const used = await getDocs(query(colRef("bookings"), where("customerId", "==", c.id), limit(1)));
  if (!used.empty) throw new Error("This customer has bookings and cannot be deleted.");
  return quickWrite(deleteDoc(docRef("customers", c.id)));
}

export async function listCustomers(afterName?: string, pageSize = 40): Promise<Customer[]> {
  const parts = [orderBy("nameLower"), ...(afterName ? [startAfter(afterName)] : []), limit(pageSize)];
  const snap = await getDocs(query(colRef("customers"), ...parts));
  return snap.docs.map((d) => fromSnap<Customer>(d));
}

export async function searchCustomers(term: string): Promise<Customer[]> {
  const t = term.trim();
  if (!t) return [];
  const digits = t.replace(/\D/g, "");
  const isPhone = digits.length >= 3 && digits.length === t.replace(/[\s+-]/g, "").length;
  const q = isPhone
    ? query(colRef("customers"), where("mobile", ">=", digits), where("mobile", "<=", digits + ""), limit(30))
    : query(
        colRef("customers"),
        where("nameLower", ">=", t.toLowerCase()),
        where("nameLower", "<=", t.toLowerCase() + ""),
        limit(30)
      );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromSnap<Customer>(d));
}
