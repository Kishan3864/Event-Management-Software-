// The client business (tenant) whose data the app is currently working with.
// Set by the AuthProvider right after sign-in (before any data is read).

let current: string | null = null;

export function setCurrentTenant(id: string | null) {
  current = id;
}

export function currentTenant(): string {
  if (!current) throw new Error("No business selected. Please sign in again.");
  return current;
}

export function hasTenant(): boolean {
  return !!current;
}

const KEY = "sth.activeTenant";

/** Remembered business for platform admins who manage several clients. */
export function savedAdminTenant(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveAdminTenant(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
