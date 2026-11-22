"use client";

import { ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Monogram } from "@/components/brand";
import { Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRODUCT } from "@/lib/brand";
import { MADE_BY } from "@/lib/constants";
import { linkPath, portalFromUrl } from "@/lib/portal";
import { authErrorMessage, useAuth } from "@/providers/auth-provider";

export function ForgotClient() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Back to the same login the person came from (their business link, or the software owner's page).
  const [back, setBack] = useState("/login");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(true);
    const c = portalFromUrl();
    if (c) setBack(linkPath(c));
  }, []);

  // Uncontrolled input: anything typed before the page finishes loading is kept.
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setEmail(email);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // Do not reveal whether an account exists
      if (code === "auth/user-not-found") setSent(true);
      else setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background px-5 pt-safe pb-6">
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Monogram className="size-14 rounded-2xl shadow-lift" />
            <p className="mt-3 text-lg font-semibold">{PRODUCT.name}</p>
          </div>
          <div className="rounded-3xl bg-card p-6 shadow-lift ring-1 ring-black/[0.04] sm:p-8">
            {sent ? (
              <div className="text-center">
                <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success-soft text-success">
                  <MailCheck className="size-7" />
                </span>
                <h1 className="mt-4 text-xl font-semibold">Check your email</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  If <b className="text-foreground">{email}</b> is registered, a link to reset your password has been sent. Check the
                  spam folder too.
                </p>
                <Button asChild className="mt-6 w-full" size="lg">
                  <Link href={back}>Back to sign in</Link>
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">Forgot password?</h1>
                <p className="mt-1 text-sm text-muted-foreground">Enter your login email. We will send you a reset link.</p>
                <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
                  <Field label="Email" htmlFor="email">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="username"
                        defaultValue={email}
                        className="h-12 pl-10"
                        placeholder="owner@email.com"
                      />
                    </div>
                  </Field>
                  {error ? <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-destructive">{error}</p> : null}
                  <Button type="submit" size="lg" className="w-full" disabled={busy || !loaded}>
                    {busy ? <Loader2 className="animate-spin" /> : null}
                    Send reset link
                  </Button>
                </form>
                <Link href={back} className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  <ArrowLeft className="size-4" /> Back to sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Made by {MADE_BY}</p>
    </div>
  );
}
