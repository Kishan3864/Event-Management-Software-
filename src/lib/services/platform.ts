// Platform (Brighton Solution) tools: add client businesses and their logins.
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { DEFAULT_SETTINGS, HOME_STATE, buildDefaultTerms } from "../constants";
import { TENANT_COLLECTIONS, rootCol, rootDoc } from "../db";
import { parseYMD } from "../dates";
import { AUTH_EMULATOR_URL, auth, db, firebaseConfig, useEmulators } from "../firebase";
import { isValidSlug, slugify, suggestSlug } from "../portal";
import type { MemberRole, Tenant, TenantStatus } from "../types";

/** Creates a login (email + password) without signing the current admin out. */
export async function createLogin(email: string, password: string): Promise<string> {
  const app2 = initializeApp(firebaseConfig, `provision-${Date.now()}`);
  try {
    const a2 = initializeAuth(app2, { persistence: inMemoryPersistence });
    if (useEmulators) connectAuthEmulator(a2, AUTH_EMULATOR_URL, { disableWarnings: true });
    const cred = await createUserWithEmailAndPassword(a2, email.trim(), password);
    const uid = cred.user.uid;
    await signOut(a2).catch(() => undefined);
    return uid;
  } finally {
    await deleteApp(app2).catch(() => undefined);
  }
}

const endOfDay = (ymd: string) => {
  const d = parseYMD(ymd);
  d.setHours(23, 59, 59, 999);
  return Timestamp.fromDate(d);
};

export interface NewClientInput {
  name: string;
  slug: string;
  city?: string;
  state?: string;
  phone?: string;
  ownerName?: string;
  /** A new login for the client's owner (the platform admin is never a member of a client). */
  owner: { mode: "new"; email: string; password: string };
  validUntil?: string | null; // YYYY-MM-DD
  notes?: string;
}

export async function createClient(input: NewClientInput): Promise<{ tenantId: string; ownerUid: string }> {
  const me = auth().currentUser;
  if (!me) throw new Error("Please sign in again.");
  const name = input.name.trim();
  if (!name) throw new Error("Business name is required.");
  const slug = await assertSlugFree(input.slug);

  const ownerEmail = input.owner.email.trim().toLowerCase();
  const ownerUid = await createLogin(ownerEmail, input.owner.password);

  const tRef = doc(rootCol("tenants"));
  const city = (input.city || "").trim();
  const state = input.state || HOME_STATE;
  const phone = (input.phone || "").replace(/\D/g, "").slice(0, 10);
  const batch = writeBatch(db());
  batch.set(tRef, {
    name,
    slug,
    city,
    state,
    phone,
    ownerName: (input.ownerName || "").trim(),
    ownerEmail,
    ownerUid,
    status: "active",
    validUntil: input.validUntil ? endOfDay(input.validUntil) : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // The software owner's private notes live outside the client's own records (clients can never read them).
  const notes = (input.notes || "").trim();
  if (notes) batch.set(rootDoc("clientNotes", tRef.id), { notes, updatedAt: serverTimestamp() });
  batch.set(rootDoc("users", ownerUid), {
    tenantId: tRef.id,
    role: "owner",
    email: ownerEmail,
    name: (input.ownerName || "").trim(),
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db(), "tenants", tRef.id, "settings", "business"), {
    ...DEFAULT_SETTINGS,
    name,
    city,
    state,
    phone1: phone,
    terms: buildDefaultTerms(city),
    setupDone: false,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return { tenantId: tRef.id, ownerUid };
}

/** Adds another login (owner or staff) to an existing client. */
export async function addClientLogin(tenantId: string, input: { email: string; password: string; name?: string; role: MemberRole }) {
  const email = input.email.trim().toLowerCase();
  const uid = await createLogin(email, input.password);
  await setDoc(rootDoc("users", uid), {
    tenantId,
    role: input.role,
    email,
    name: (input.name || "").trim(),
    createdAt: serverTimestamp(),
  });
  return uid;
}

export async function setClientStatus(tenantId: string, status: TenantStatus) {
  await updateDoc(rootDoc("tenants", tenantId), { status, updatedAt: serverTimestamp() });
}

export async function setClientValidity(tenantId: string, ymd: string | null) {
  await updateDoc(rootDoc("tenants", tenantId), {
    validUntil: ymd ? endOfDay(ymd) : deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateClient(tenantId: string, patch: { name?: string; city?: string; phone?: string; ownerName?: string; notes?: string }) {
  const { notes, ...rest } = patch;
  const batch = writeBatch(db());
  batch.update(rootDoc("tenants", tenantId), { ...rest, notes: deleteField(), updatedAt: serverTimestamp() });
  if (notes !== undefined) batch.set(rootDoc("clientNotes", tenantId), { notes: notes.trim(), updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}

/** The software owner's private notes about a client. */
export async function getClientNotes(tenantId: string): Promise<string> {
  const s = await getDoc(rootDoc("clientNotes", tenantId));
  return s.exists() ? String(s.data().notes ?? "") : "";
}

/** True when a client's record still holds something only the platform admin should know. */
export function recordNeedsCleaning(t: Tenant, adminUid: string | undefined): boolean {
  return t.notes !== undefined || t.createdBy !== undefined || (!!adminUid && t.ownerUid === adminUid);
}

/**
 * Older versions kept admin-only details in the client's own record, which the client can read:
 * the admin's notes, the admin's id (createdBy) and, for a client the admin once used himself, the admin's
 * login as owner. Moves the notes to the owner-only notes (never overwriting them) and removes the rest.
 */
export async function cleanClientRecords(tenants: Tenant[], adminUid: string | undefined) {
  for (const listed of tenants) {
    if (!recordNeedsCleaning(listed, adminUid)) continue;
    try {
      // Decide from the server's current record, not from a possibly old copy on this device.
      const fresh = await getDocFromServer(rootDoc("tenants", listed.id));
      if (!fresh.exists()) continue;
      const t = { ...(fresh.data() as Omit<Tenant, "id">), id: fresh.id } as Tenant;
      if (!recordNeedsCleaning(t, adminUid)) continue;
      const batch = writeBatch(db());
      const legacy = (t as { notes?: unknown }).notes;
      if (typeof legacy === "string" && legacy.trim()) {
        const existing = await getDoc(rootDoc("clientNotes", t.id));
        if (!existing.exists()) batch.set(rootDoc("clientNotes", t.id), { notes: legacy.trim(), updatedAt: serverTimestamp() });
      }
      const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (legacy !== undefined) patch.notes = deleteField();
      if (t.createdBy !== undefined) patch.createdBy = deleteField();
      if (adminUid && t.ownerUid === adminUid) {
        patch.ownerUid = deleteField();
        patch.ownerEmail = deleteField();
      }
      batch.update(rootDoc("tenants", t.id), patch);
      await batch.commit();
    } catch {
      /* try the next client; this one is retried next time */
    }
  }
}

/** Re-authenticates the admin and invokes the privileged Firebase endpoint. */
export async function setClientPassword(tenantId: string, uid: string, password: string, adminPassword: string) {
  const user = auth().currentUser;
  if (!user?.email) throw new Error("Sign in to the admin panel again.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, adminPassword));
  await user.getIdToken(true);
  const { connectFunctionsEmulator, getFunctions, httpsCallable } = await import("firebase/functions");
  const functions = getFunctions(auth().app, "asia-south1");
  if (useEmulators && !functionsEmulatorConnected) {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    functionsEmulatorConnected = true;
  }
  const result = await httpsCallable<{ tenantId: string; uid: string; password: string }, { email: string }>(
    functions, "setClientPassword",
  )({ tenantId, uid, password });
  return result.data.email;
}

let functionsEmulatorConnected = false;

export async function sendLoginReset(email: string) {
  await sendPasswordResetEmail(auth(), email.trim());
}

// ---------------------------------------------------------------- business links (/c/{slug})
/** A link is taken when another client uses it now or used it before (its installed app may still open it). */
async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const [now, before] = await Promise.all([
    getDocs(query(rootCol("tenants"), where("slug", "==", slug), limit(3))),
    getDocs(query(rootCol("tenants"), where("slugAliases", "array-contains", slug), limit(3))),
  ]);
  return [...now.docs, ...before.docs].some((d) => d.id !== exceptId);
}

async function assertSlugFree(raw: string, exceptId?: string): Promise<string> {
  const slug = slugify(raw);
  if (!isValidSlug(slug)) throw new Error("Link name must be 3-30 letters or numbers (a-z, 0-9, -).");
  if (await slugTaken(slug, exceptId)) throw new Error(`The link /c/${slug} is already used by another client.`);
  return slug;
}

export async function setClientSlug(tenantId: string, raw: string) {
  const slug = await assertSlugFree(raw, tenantId);
  const snap = await getDoc(rootDoc("tenants", tenantId));
  const t = (snap.data() ?? {}) as Partial<Tenant>;
  // Keep the old link as an alias so the client's installed app and saved links keep working.
  const aliases = [...new Set([...(t.slugAliases ?? []), ...(t.slug ? [t.slug] : [])])].filter((a) => a !== slug).slice(-10);
  await updateDoc(rootDoc("tenants", tenantId), { slug, slugAliases: aliases, updatedAt: serverTimestamp() });
  return slug;
}

/** Gives a unique link to clients that don't have one yet (clients added before links existed). */
export async function ensureClientSlugs(tenants: Tenant[]) {
  const used = new Set(tenants.flatMap((t) => [t.slug, ...(t.slugAliases ?? [])]).filter(Boolean) as string[]);
  for (const t of tenants) {
    if (t.slug) continue;
    const suggested = suggestSlug(t.name).slice(0, 24).replace(/-+$/g, "");
    const base = isValidSlug(suggested) ? suggested : "client";
    let slug = base;
    for (let n = 2; (used.has(slug) || !isValidSlug(slug)) && n < 10000; n++) slug = `${base}-${n}`;
    if (used.has(slug) || !isValidSlug(slug)) continue;
    used.add(slug);
    await updateDoc(rootDoc("tenants", t.id), { slug, updatedAt: serverTimestamp() });
  }
}

/**
 * Deletes a client completely: first its logins lose access (memberships removed), then all of its data, its
 * notifications, the owner's notes about it and its record (its link stops working). The Firebase logins themselves
 * stay without any access (deleting them needs the Firebase Console on the free plan).
 */
export async function deleteClient(tenantId: string, onProgress?: (deleted: number) => void): Promise<number> {
  let deleted = 0;
  const members = await getDocs(query(rootCol("users"), where("tenantId", "==", tenantId)));
  if (!members.empty) {
    const cut = writeBatch(db());
    members.docs.forEach((d) => cut.delete(d.ref));
    await cut.commit();
  }
  for (const name of [...TENANT_COLLECTIONS, "notices"]) {
    for (;;) {
      const snap = await getDocs(query(collection(db(), "tenants", tenantId, name), limit(300)));
      if (snap.empty) break;
      const batch = writeBatch(db());
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      onProgress?.(deleted);
    }
  }
  const last = writeBatch(db());
  last.delete(rootDoc("clientNotes", tenantId));
  last.delete(rootDoc("tenants", tenantId));
  await last.commit();
  return deleted;
}

/** A notification for one business: all its logins (to = "all") or one login (to = uid). Shows instantly in the app. */
export async function sendNotice(tenantId: string, input: { title: string; body: string; to: string }) {
  const title = input.title.trim();
  if (!title) throw new Error("Write a title.");
  await addDoc(collection(db(), "tenants", tenantId, "notices"), {
    title: title.slice(0, 120),
    body: input.body.trim().slice(0, 1000),
    to: input.to || "all",
    from: "admin",
    createdAt: serverTimestamp(),
  });
}

/** Admin logins are never members of a client business. */
export async function removeMembership(uid: string) {
  await deleteDoc(rootDoc("users", uid));
}

/** Makes a login the main owner shown in the client list. */
export async function setMainOwner(tenantId: string, uid: string, email: string, ownerName?: string) {
  await updateDoc(rootDoc("tenants", tenantId), {
    ownerUid: uid,
    ownerEmail: email.trim().toLowerCase(),
    ...(ownerName ? { ownerName: ownerName.trim() } : {}),
    updatedAt: serverTimestamp(),
  });
}

/** Platform admins only: the client that owns a business link (also an earlier link). Ambiguous links open nothing. */
export async function findClientBySlug(slug: string): Promise<Tenant | null> {
  for (const field of ["slug", "slugAliases"] as const) {
    const q = field === "slug" ? where("slug", "==", slug) : where("slugAliases", "array-contains", slug);
    const snap = await getDocs(query(rootCol("tenants"), q, limit(2)));
    if (snap.size > 1) return null;
    if (snap.size === 1) return { ...(snap.docs[0].data() as Omit<Tenant, "id">), id: snap.docs[0].id };
  }
  return null;
}
