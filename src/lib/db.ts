import {
  collection,
  doc,
  getDocFromCache,
  runTransaction,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { currentTenant } from "./tenant";

/** Collections that belong to one client business: tenants/{tenantId}/{collection}/{doc}. */
export const COL = {
  settings: "settings",
  locations: "locations",
  categories: "categories",
  items: "items",
  stockMoves: "stockMoves",
  customers: "customers",
  bookings: "bookings",
  payments: "payments",
  invoices: "invoices",
  counters: "counters",
} as const;

export type ColName = (typeof COL)[keyof typeof COL];
export const TENANT_COLLECTIONS = Object.values(COL) as ColName[];

/** Platform-level collections (not inside a business). */
export type RootColName = "tenants" | "users" | "admins" | "clientNotes";

// ---- current business
export const colRef = (name: ColName) => collection(db(), "tenants", currentTenant(), name);
export const docRef = (name: ColName, id: string) => doc(db(), "tenants", currentTenant(), name, id);
export const newDocRef = (name: ColName) => doc(colRef(name));
export const settingsRef = () => doc(db(), "tenants", currentTenant(), COL.settings, "business");

// ---- a specific business (platform admin tools)
export const tenantColRef = (tenantId: string, name: ColName) => collection(db(), "tenants", tenantId, name);
export const tenantDocRef = (tenantId: string, name: ColName, id: string) => doc(db(), "tenants", tenantId, name, id);

// ---- platform
export const rootCol = (name: RootColName) => collection(db(), name);
export const rootDoc = (name: RootColName, id: string) => doc(db(), name, id);

export function fromSnap<T>(snap: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): T {
  return { ...(snap.data({ serverTimestamps: "estimate" }) as object), id: snap.id } as T;
}

export function isNetworkError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  const code = err?.code ?? "";
  return (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    (code === "failed-precondition" && /offline/i.test(err?.message ?? "")) ||
    /client is offline|network/i.test(err?.message ?? "")
  );
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export interface AtomicCtx {
  offline: boolean;
  get<T = DocumentData>(ref: DocumentReference): Promise<{ exists: boolean; data: T | undefined }>;
  set(ref: DocumentReference, data: DocumentData, merge?: boolean): void;
  update(ref: DocumentReference, data: DocumentData): void;
  delete(ref: DocumentReference): void;
}

// ---- saves in progress: the open business must never change while one is running
let running = 0;
let settledWaiters: (() => void)[] = [];

/** Runs a save and counts it as in progress until it has finished (or failed). */
export async function trackSave<R>(work: () => Promise<R>): Promise<R> {
  running++;
  try {
    return await work();
  } finally {
    running--;
    if (running === 0) {
      const waiters = settledWaiters;
      settledWaiters = [];
      waiters.forEach((w) => w());
    }
  }
}

/** Resolves when no save is in progress. */
export function savesSettled(): Promise<void> {
  return running === 0 ? Promise.resolve() : new Promise((resolve) => settledWaiters.push(resolve));
}

/**
 * Runs an all-or-nothing write.
 * Online: a Firestore transaction (fresh server reads, automatic retry on conflicts).
 * Offline / weak network: the same logic as a batched write using the local cache; it syncs automatically later.
 * Inside `fn`, do every `get` before the first write.
 */
export function runAtomic<R>(fn: (ctx: AtomicCtx) => Promise<R>): Promise<{ result: R; queued: boolean }> {
  return trackSave(() => runAtomicNow(fn));
}

async function runAtomicNow<R>(fn: (ctx: AtomicCtx) => Promise<R>): Promise<{ result: R; queued: boolean }> {
  const database = db();
  // Every document of this save must belong to the business that was open when it started.
  const tenant = currentTenant();
  const sameBusiness = () => {
    if (currentTenant() !== tenant) throw new Error("The business changed while saving. Nothing was saved, please try again.");
  };
  if (isOnline()) {
    try {
      const result = await runTransaction(
        database,
        async (tx) => {
          sameBusiness();
          return fn({
            offline: false,
            get: async <T,>(ref: DocumentReference) => {
              const s = await tx.get(ref);
              return { exists: s.exists(), data: s.exists() ? (s.data() as T) : undefined };
            },
            set: (ref, data, merge) => {
              if (merge) tx.set(ref, data, { merge: true });
              else tx.set(ref, data);
            },
            update: (ref, data) => {
              tx.update(ref, data);
            },
            delete: (ref) => {
              tx.delete(ref);
            },
          });
        },
        { maxAttempts: 4 }
      );
      return { result, queued: false };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      // fall through: save offline
    }
  }

  sameBusiness();
  const batch = writeBatch(database);
  const result = await fn({
    offline: true,
    get: async <T,>(ref: DocumentReference) => {
      try {
        const s = await getDocFromCache(ref);
        return { exists: s.exists(), data: s.exists() ? (s.data() as T) : undefined };
      } catch {
        return { exists: false, data: undefined };
      }
    },
    set: (ref, data, merge) => {
      if (merge) batch.set(ref, data, { merge: true });
      else batch.set(ref, data);
    },
    update: (ref, data) => {
      batch.update(ref, data);
    },
    delete: (ref) => {
      batch.delete(ref);
    },
  });
  sameBusiness();
  // The local cache is updated immediately; the server copy syncs when the internet is back.
  batch.commit().catch((err) => console.error("Offline write failed to sync", err));
  return { result, queued: true };
}

/**
 * Waits for a simple write briefly. On a slow or missing connection the write is already saved
 * locally and will sync later, so we don't keep the user waiting.
 */
export async function quickWrite(p: Promise<unknown>, ms = 2500): Promise<"synced" | "queued"> {
  let settled = false;
  p.then(
    () => (settled = true),
    (err) => {
      settled = true;
      console.error("Write failed", err);
    }
  );
  return Promise.race([
    p.then(() => "synced" as const),
    new Promise<"synced" | "queued">((resolve) => setTimeout(() => resolve(settled ? "synced" : "queued"), ms)),
  ]);
}
