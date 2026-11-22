// Two separate addresses:
// - the ADMIN address (NEXT_PUBLIC_ADMIN_URL, e.g. https://tent-house-admin.web.app): only the software owner's
//   login and admin panel, with its own look;
// - the CLIENT address (NEXT_PUBLIC_APP_URL, e.g. https://tent-house-manager.web.app): every business signs in at
//   its own link /c/<name>. Each link installs as that business's own app.

const KEY = "sth.portal";

/** Lowercase, URL-safe link name from a business name ("Royal Tent House" -> "royal-tent-house"). */
export function slugify(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

/** Short default link for a business: its first word ("Royal Tent House" -> "royal"), more words if that is too short. */
export function suggestSlug(name: string): string {
  let s = "";
  for (const w of slugify(name).split("-").filter(Boolean)) {
    s = s ? `${s}-${w}` : w;
    if (s.length >= 3) break;
  }
  return s.slice(0, 30).replace(/-+$/g, "");
}

export function isValidSlug(s: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/.test(s);
}

// ---------------------------------------------------------------- the two addresses
const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).host.toLowerCase() : "";
  } catch {
    return "";
  }
};

/** The admin address host (with port), "" when not configured. */
export function adminHost(): string {
  return hostOf(process.env.NEXT_PUBLIC_ADMIN_URL);
}

/** The admin address, e.g. https://tent-house-admin.web.app ("" when not configured). */
export function adminOrigin(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_URL || "").trim().replace(/\/+$/, "");
}

/** True on the admin address. */
export function isAdminHost(): boolean {
  if (typeof window === "undefined") return false;
  const a = adminHost();
  return !!a && window.location.host.toLowerCase() === a;
}

/** Whether the software owner may sign in on this address (only the admin address; anywhere if none is configured). */
export function adminLoginHere(): boolean {
  return !adminHost() || isAdminHost();
}

/**
 * The clients' address used in links given to businesses (NEXT_PUBLIC_APP_URL), e.g. https://tent-house-manager.web.app.
 * Links never depend on the address the admin happens to be using.
 */
export function appOrigin(): string {
  const fixed = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  return typeof window !== "undefined" ? window.location.origin : "";
}

// ---------------------------------------------------------------- business links (/c/<name>)
/** The business link a page was opened with: /c/<name> (or the older /login?c=<name>). Never on the admin address. */
export function portalFromUrl(): string | null {
  if (typeof window === "undefined" || isAdminHost()) return null;
  const path = /^\/c\/([a-z0-9-]{1,30})\/?$/i.exec(window.location.pathname);
  const c = path ? path[1] : new URLSearchParams(window.location.search).get("c");
  return c && isValidSlug(c.toLowerCase()) ? c.toLowerCase() : null;
}

/** The address of a business's login: /c/<name>. It stays in the address bar, so "Add to Home screen"
 *  and "Install" keep exactly this business's address. */
export function linkPath(slug: string): string {
  return `/c/${encodeURIComponent(slug)}`;
}

/** Full link of a business, e.g. https://tent-house-manager.web.app/c/royal */
export function portalUrl(slug: string): string {
  return `${appOrigin()}${linkPath(slug)}`;
}

/**
 * Points the page's install file (web app manifest) at this business: /c/<name>/app.webmanifest gives the installed
 * app its own identity and makes it open /c/<name>/. null = the address's normal install file.
 * (The <link> itself is added by a small script in the page head, see app/layout.tsx.)
 */
export function applyInstallFile(slug: string | null) {
  if (typeof document === "undefined" || isAdminHost()) return;
  const link = document.getElementById("app-manifest") as HTMLLinkElement | null;
  const href = slug ? `${linkPath(slug)}/app.webmanifest` : "/manifest.webmanifest";
  if (link && link.getAttribute("href") !== href) link.setAttribute("href", href);
}

/** Remembers the business link on this device so sign-out (and the installed app) return to it. */
export function savePortal(slug: string | null) {
  try {
    if (slug) localStorage.setItem(KEY, slug);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  applyInstallFile(slug);
}

export function savedPortal(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Where a signed-out person goes: the admin login on the admin address; else their business link if known. */
export function loginPath(): string {
  if (isAdminHost()) return "/login";
  const s = savedPortal();
  return s ? linkPath(s) : "/login";
}

/** True when a business link names this business: its current link or one of its earlier links. */
export function slugMatches(t: { slug?: string; slugAliases?: string[] } | null | undefined, slug: string | null | undefined): boolean {
  if (!t || !slug) return false;
  return t.slug === slug || (Array.isArray(t.slugAliases) && t.slugAliases.includes(slug));
}

/** A client's name together with its link, which only the platform admin can set (look-alike names stay distinguishable). */
export function clientLabel(t: { name?: unknown; slug?: string | null }): string {
  const name = typeof t.name === "string" && t.name.trim() ? t.name : "Client";
  return t.slug ? `${name} (/c/${t.slug})` : name;
}
