import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  CACHE_SIZE_UNLIMITED,
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  waitForPendingWrites,
  type Firestore,
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined, // Storage is not used
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Local development / testing against the Firebase Emulator Suite (never set in production builds)
export const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
export const AUTH_EMULATOR_URL = "http://127.0.0.1:9199";

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function firebaseApp(): FirebaseApp {
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

export function auth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(firebaseApp());
  if (useEmulators && typeof window !== "undefined") {
    connectAuthEmulator(_auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  }
  return _auth;
}

/**
 * Firestore with offline persistence (IndexedDB) shared across tabs.
 * Writes made offline are kept locally and synced when the internet is back.
 */
export function db(): Firestore {
  if (_db) return _db;
  const app = firebaseApp();
  if (typeof window === "undefined") {
    _db = getFirestore(app);
    return _db;
  }
  try {
    _db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      }),
    });
  } catch {
    // Already initialised (hot reload) or persistence unavailable (private mode)
    _db = getFirestore(app);
  }
  if (useEmulators) connectFirestoreEmulator(_db, "127.0.0.1", 8181);
  return _db;
}

/** True when every change made on this device by the signed-in login has reached the server (waits up to `ms`). */
export async function localChangesSynced(ms = 3000): Promise<boolean> {
  if (!_db) return true;
  const pending = waitForPendingWrites(_db).then(
    () => true,
    () => false
  );
  return Promise.race([pending, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))]);
}

/**
 * Deletes the offline copy of business data kept on this device (including changes not uploaded yet), so the
 * next person who uses this device cannot find anything from the previous login. A new, empty copy is started
 * on next use. Returns false if it could not be deleted.
 */
export async function clearLocalData(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  let target: Firestore;
  try {
    target = _db ?? db(); // not started yet: its storage can still be deleted
  } catch {
    return false;
  }
  _db = null;
  try {
    await terminate(target);
    await clearIndexedDbPersistence(target);
    return true;
  } catch {
    return false;
  }
}

// Which login's business data may be in this device's offline copy (so it can be deleted before anyone else uses it).
const CACHE_OWNER = "sth.cacheOwner";

export function cacheOwner(): string | null {
  try {
    return localStorage.getItem(CACHE_OWNER);
  } catch {
    return null;
  }
}

export function setCacheOwner(uid: string | null) {
  try {
    if (uid) localStorage.setItem(CACHE_OWNER, uid);
    else localStorage.removeItem(CACHE_OWNER);
  } catch {
    /* storage unavailable */
  }
}
