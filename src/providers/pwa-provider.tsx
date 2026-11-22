"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PRODUCT } from "@/lib/brand";
import { isIOS } from "@/lib/share";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __bip?: BeforeInstallPromptEvent | null;
  }
}

interface PwaContextValue {
  online: boolean;
  isStandalone: boolean;
  canInstall: boolean;
  ios: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

const PwaContext = createContext<PwaContextValue | null>(null);

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [isStandalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const reloading = useRef(false);

  // Online / offline
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Install prompt (captured early by an inline script in the root layout)
  useEffect(() => {
    setStandalone(detectStandalone());
    setIos(isIOS());
    if (window.__bip) setPromptEvent(window.__bip);
    const onReady = () => setPromptEvent(window.__bip ?? null);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__bip = e as BeforeInstallPromptEvent;
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      window.__bip = null;
      setPromptEvent(null);
      setStandalone(true);
      toast.success(`${PRODUCT.name} app installed`);
    };
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setStandalone(detectStandalone());
    window.addEventListener("bip-ready", onReady);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    mq.addEventListener?.("change", onMode);
    return () => {
      window.removeEventListener("bip-ready", onReady);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mq.removeEventListener?.("change", onMode);
    };
  }, []);

  // Service worker (production only)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    // Reload only after the user taps "Update". The first install also changes the controller
    // (clients.claim) and must NOT reload the page — the user may be typing.
    let updateRequested = false;
    const showUpdate = (reg: ServiceWorkerRegistration) => {
      toast("A new version is ready", {
        id: "sw-update",
        description: "Tap Update to load the latest app.",
        duration: Infinity,
        action: {
          label: "Update",
          onClick: () => {
            updateRequested = true;
            reg.waiting?.postMessage("SKIP_WAITING");
          },
        },
      });
    };
    const onControllerChange = () => {
      if (!updateRequested || reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller && hadController) showUpdate(reg);
          });
        });
        const check = () => reg.update().catch(() => undefined);
        timer = setInterval(check, 30 * 60 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
      })
      .catch((err) => console.warn("Service worker registration failed", err));
    return () => {
      if (timer) clearInterval(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const install = useCallback(async () => {
    const ev = promptEvent ?? window.__bip ?? null;
    if (!ev) return "unavailable" as const;
    await ev.prompt();
    const choice = await ev.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    window.__bip = null;
    setPromptEvent(null);
    return choice.outcome;
  }, [promptEvent]);

  const value = useMemo(
    () => ({ online, isStandalone, canInstall: !!promptEvent && !isStandalone, ios, install }),
    [online, isStandalone, promptEvent, ios, install]
  );
  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  const ctx = useContext(PwaContext);
  if (!ctx) throw new Error("usePwa must be used inside PwaProvider");
  return ctx;
}
