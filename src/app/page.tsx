"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Splash } from "@/components/splash";
import { linkPath, loginPath, portalFromUrl, slugMatches } from "@/lib/portal";
import { useAuth } from "@/providers/auth-provider";

export default function Home() {
  const { status, isSuper, tenant } = useAuth();
  const router = useRouter();
  useEffect(() => {
    // An installed business app starts at /c/<its link>/ (older ones at /?c=<link>).
    const link = portalFromUrl();
    const toLink = link ? linkPath(link) : null;
    if (status === "signedOut") router.replace(toLink ?? loginPath());
    else if (status === "ready" || status === "suspended") {
      // Signed in to a different business than the link names: the login page asks what to do.
      if (toLink && !isSuper && !slugMatches(tenant, link)) router.replace(toLink);
      else router.replace("/dashboard");
    } else if (status === "noBusiness") router.replace(isSuper ? "/admin" : "/dashboard");
    else if (status === "unreachable") router.replace("/dashboard");
  }, [status, isSuper, tenant, router]);
  return <Splash />;
}
