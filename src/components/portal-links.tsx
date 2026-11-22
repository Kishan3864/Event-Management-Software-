"use client";

import { useEffect } from "react";

/** /c/<name> opened somewhere the hosting redirect did not run (local preview, offline): go to that business's login. */
export function PortalRedirect() {
  useEffect(() => {
    const m = /^\/c\/([a-z0-9-]{1,30})\/?$/i.exec(window.location.pathname);
    if (m) window.location.replace(`/login?c=${m[1].toLowerCase()}`);
  }, []);
  return null;
}
