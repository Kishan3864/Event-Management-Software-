"use client";

import {
  browserLocalPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { getDoc, getDocFromCache, onSnapshot, type DocumentData, type DocumentReference } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fromSnap, rootDoc, savesSettled } from "@/lib/db";
import { auth, cacheOwner, clearLocalData, isFirebaseConfigured, localChangesSynced, setCacheOwner } from "@/lib/firebase";
import { loginPath } from "@/lib/portal";
import { saveAdminTenant, savedAdminTenant, setCurrentTenant } from "@/lib/tenant";
import type { Membership, Tenant } from "@/lib/types";

/**
 * loading / checking : working out who is signed in
 * signedOut          : show the login page
 * ready              : a business is open (tenantId set)
 * noBusiness         : signed in but no business open (platform admins go to /admin)
 * suspended          : the business is suspended or its plan has expired
 * unreachable        : signed in, but the server could not be reached to check this login (nothing saved on this device)
 */
export type AuthStatus = "loading" | "signedOut" | "checking" | "ready" | "noBusiness" | "suspended" | "unreachable";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  isSuper: boolean;
  membership: Membership | null;
  tenantId: string | null;
  tenant: Tenant | null;
}

export type LogoutResult = "done" | "pending";

export interface LogoutOptions {
  /** Sign out even when changes made on this device have not reached the server yet (they are deleted). */
  discard?: boolean;
  /** Page to open afterwards with a full reload (default: this device's login page). false = stay on this page. */
  to?: string | false;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  /** Keeps the current sign-in on this device (once it has been checked against the business link). */
  keepSignedIn: () => Promise<void>;
  /** "pending" = not signed out, because changes made here have not reached the server (ask, then pass discard). */
  logout: (opts?: LogoutOptions) => Promise<LogoutResult>;
  resetPassword: (email: string) => Promise<void>;
  /** Platform admins: open a client business (null = close it and go back to the client list). Reloads the app. */
  switchTenant: (id: string | null) => Promise<void>;
  /** Re-read the login's business link (after an admin changes it). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "Wrong email or password. Please try again.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes or reset your password.";
    case "auth/network-request-failed":
      return "No internet connection. Please check your network.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/requires-recent-login":
      return "Please enter your current password again.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/email-already-in-use":
      return "This email already has a login. Use a different email.";
    case "permission-denied":
      return "You don't have permission to do this.";
    default:
      return (e as Error)?.message?.replace(/^Firebase:\s*/i, "") || "Something went wrong. Please try again.";
  }
}

export function tenantIsActive(t: Tenant | null | undefined): boolean {
  if (!t || t.status !== "active") return false;
  const v = t.validUntil as { toMillis?: () => number } | null | undefined;
  return !(v && typeof v.toMillis === "function" && v.toMillis() < Date.now());
}

type Lookup<T> = { ok: true; data: T | null } | { ok: false };

/** Reads one document: found / not there (or not allowed) / could not be checked (no server and not on this device). */
async function lookup<T>(ref: DocumentReference<DocumentData>): Promise<Lookup<T>> {
  try {
    const s = await getDoc(ref);
    return { ok: true, data: s.exists() ? fromSnap<T>(s) : null };
  } catch (e) {
    if ((e as { code?: string })?.code === "permission-denied") return { ok: true, data: null };
    try {
      const c = await getDocFromCache(ref);
      return { ok: true, data: c.exists() ? fromSnap<T>(c) : null };
    } catch {
      return { ok: false };
    }
  }
}

const EMPTY: AuthState = { status: "loading", user: null, isSuper: false, membership: null, tenantId: null, tenant: null };

async function resolveFor(u: User, prefer?: string | null): Promise<AuthState> {
  const [admin, member] = await Promise.all([lookup<{ id: string }>(rootDoc("admins", u.uid)), lookup<Membership>(rootDoc("users", u.uid))]);
  // A business's device never stores the admin record (a business may not read it), so offline that check cannot be
  // made there. Platform admins are never members of a business, so a known business login is a business login.
  const isSuperKnown = admin.ok ? !!admin.data : member.ok && member.data ? false : null;
  if (!member.ok || isSuperKnown === null) {
    setCurrentTenant(null);
    return { ...EMPTY, user: u, status: "unreachable" };
  }
  const isSuper = isSuperKnown;
  const membership = member.data;
  const base = { user: u, isSuper, membership };
  // Platform admins always start on the Clients screen; they open a client only when they choose to.
  const tid = prefer !== undefined ? prefer : isSuper ? savedAdminTenant() : membership?.tenantId ?? null;
  if (!tid) {
    setCurrentTenant(null);
    return { ...base, status: "noBusiness", tenantId: null, tenant: null };
  }
  const found = await lookup<Tenant>(rootDoc("tenants", tid));
  if (!found.ok) {
    setCurrentTenant(null);
    return { ...base, status: "unreachable", tenantId: null, tenant: null };
  }
  const tenant = found.data;
  if (!tenant) {
    if (isSuper) saveAdminTenant(null);
    setCurrentTenant(null);
    return { ...base, status: "noBusiness", tenantId: null, tenant: null };
  }
  if (!isSuper && !tenantIsActive(tenant)) {
    setCurrentTenant(null);
    return { ...base, status: "suspended", tenantId: tid, tenant };
  }
  setCurrentTenant(tid);
  return { ...base, status: "ready", tenantId: tid, tenant };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(EMPTY);
  // This window is signing out itself: "reload" = logout() cleans up and reloads; "stay" = it stays on this page.
  const ownSignOut = useRef<false | "reload" | "stay">(false);
  // A login was signed in in this window since it was opened.
  const hadUser = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setState({ ...EMPTY, status: "signedOut" });
      return;
    }
    let alive = true;
    const unsub = onAuthStateChanged(auth(), async (u) => {
      if (!alive) return;
      if (!u) {
        setCurrentTenant(null);
        const own = ownSignOut.current;
        ownSignOut.current = false;
        if (own === "reload") {
          // logout() reloads the page in a moment; show the splash meanwhile (no data, no extra navigation).
          if (alive) setState(EMPTY);
          return;
        }
        if (!own) {
          // The session ended without signing out here (signed out in another window, password changed, login
          // removed): delete what it left on this device, and start this window completely fresh.
          if (hadUser.current && alive) setState(EMPTY);
          if (cacheOwner()) {
            if (await clearLocalData()) setCacheOwner(null);
          }
          if (hadUser.current) {
            window.location.replace(loginPath());
            return;
          }
        }
        if (alive) setState({ ...EMPTY, status: "signedOut" });
        return;
      }
      hadUser.current = true;
      setState((s) => ({ ...s, status: "checking", user: u }));
      // Anything another login left on this device is deleted before this login reads anything.
      const owner = cacheOwner();
      if (owner && owner !== u.uid) await clearLocalData();
      setCacheOwner(u.uid);
      const next = await resolveFor(u);
      if (alive) setState(next);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  // Follow live changes to the open business (suspension, plan expiry, name).
  const { tenantId, isSuper, user } = state;
  useEffect(() => {
    if (!tenantId || !user) return;
    // The business was deleted, or this login's access was removed by the admin: it is closed at once.
    const lost = () =>
      setState((s) => {
        if (s.tenantId !== tenantId) return s;
        setCurrentTenant(null);
        return { ...s, status: "noBusiness", tenantId: null, tenant: null };
      });
    const stopMember = isSuper
      ? undefined
      : onSnapshot(
          rootDoc("users", user.uid),
          (snap) => {
            const m = snap.exists() ? (snap.data() as Membership) : null;
            if (!snap.metadata.fromCache && (!m || m.tenantId !== tenantId)) lost();
          },
          () => undefined
        );
    const stopTenant = onSnapshot(
      rootDoc("tenants", tenantId),
      (snap) => {
        const t = snap.exists() ? fromSnap<Tenant>(snap) : null;
        if (!t && !snap.metadata.fromCache) return lost();
        setState((s) => {
          if (s.tenantId !== tenantId) return s;
          if (!t) return s;
          if (!s.isSuper && !tenantIsActive(t)) {
            setCurrentTenant(null);
            return { ...s, tenant: t, status: "suspended" };
          }
          if (s.status === "suspended" && tenantIsActive(t)) {
            setCurrentTenant(tenantId);
            return { ...s, tenant: t, status: "ready" };
          }
          return { ...s, tenant: t };
        });
      },
      // Not allowed any more (access removed): closed as well.
      (err) => {
        if (!isSuper && (err as { code?: string })?.code === "permission-denied") lost();
      }
    );
    return () => {
      stopTenant();
      stopMember?.();
    };
  }, [tenantId, isSuper, user]);

  const signIn = useCallback(async (email: string, password: string) => {
    // Until this sign-in has been checked against the business link it lives only in this tab,
    // so closing the tab during the check ends it.
    await setPersistence(auth(), browserSessionPersistence).catch(() => undefined);
    await signInWithEmailAndPassword(auth(), email.trim(), password);
  }, []);

  const keepSignedIn = useCallback(async () => {
    try {
      await setPersistence(auth(), indexedDBLocalPersistence);
    } catch {
      await setPersistence(auth(), browserLocalPersistence).catch(() => undefined);
    }
  }, []);

  const logout = useCallback(async (opts: LogoutOptions = {}): Promise<LogoutResult> => {
    await savesSettled();
    // Changes not uploaded yet would be lost by signing out; the caller asks the user first.
    if (!opts.discard && !(await localChangesSynced())) return "pending";
    const to = opts.to === undefined ? loginPath() : opts.to;
    saveAdminTenant(null);
    setCurrentTenant(null);
    if (auth().currentUser) {
      ownSignOut.current = to ? "reload" : "stay";
      await signOut(auth());
    }
    // Nothing from this login stays on the device: its offline copy is deleted.
    if (await clearLocalData()) setCacheOwner(null);
    if (to) window.location.replace(to);
    return "done";
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth(), email.trim());
  }, []);

  const switchTenant = useCallback(async (id: string | null) => {
    if (!auth().currentUser) return;
    // Let any save finish in the business it started in, then reload the app for the other business,
    // so nothing still running can touch the wrong business.
    // (The open business is not changed in this page at all: whatever is still running finishes in its own business.)
    await savesSettled();
    saveAdminTenant(id);
    window.location.assign(id ? "/dashboard" : "/admin");
  }, []);

  const refresh = useCallback(async () => {
    const u = auth().currentUser;
    if (!u) return;
    await savesSettled();
    setState(await resolveFor(u));
  }, []);

  const value = useMemo(
    () => ({ ...state, signIn, keepSignedIn, logout, resetPassword, switchTenant, refresh }),
    [state, signIn, keepSignedIn, logout, resetPassword, switchTenant, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
