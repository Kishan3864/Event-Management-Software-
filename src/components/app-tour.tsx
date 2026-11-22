"use client";

import { setDoc } from "firebase/firestore";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { quickWrite, settingsRef } from "@/lib/db";

/**
 * Guided tour: the screen dims, the tour opens each part of the app and highlights where things are.
 * Targets are elements marked with data-tour="…" (page headers, the New booking button).
 */
interface Step {
  route: string;
  target?: string;
  title: string;
  en: string;
  hi: string;
}

const steps = (business: string): Step[] => [
  {
    route: "/dashboard",
    title: `Welcome${business ? `, ${business}` : ""}!`,
    en: "This short tour shows where everything is in your app. Tap Next to move, Skip to close.",
    hi: "यह छोटा टूर दिखाएगा कि ऐप में कौन-सी चीज़ कहाँ है। आगे बढ़ने के लिए Next दबाएँ।",
  },
  {
    route: "/dashboard",
    target: "new-booking",
    title: "New booking",
    en: "Tap here for every new booking: customer mobile, dates, venue, items, charges and advance.",
    hi: "हर नई बुकिंग यहाँ से बनाएँ: ग्राहक का मोबाइल, तारीख, venue, सामान, चार्ज और एडवांस।",
  },
  {
    route: "/bookings",
    target: "page-header",
    title: "Bookings",
    en: "All bookings are here. Open one to send items out, take them back, add a payment or make the bill.",
    hi: "सारी बुकिंग यहाँ हैं। बुकिंग खोलकर सामान भेजें, वापस लें, पेमेंट जोड़ें या बिल बनाएँ।",
  },
  {
    route: "/calendar",
    target: "page-header",
    title: "Calendar",
    en: "See which days and venues are booked. The app warns you before double booking.",
    hi: "कौन-सी तारीख और venue बुक है, यहाँ देखें। डबल बुकिंग से पहले ऐप चेतावनी देता है।",
  },
  {
    route: "/customers",
    target: "page-header",
    title: "Customers",
    en: "Every customer with their bookings and pending money. Add a new customer here.",
    hi: "हर ग्राहक, उसकी बुकिंग और बकाया पैसा। नया ग्राहक यहाँ जोड़ें।",
  },
  {
    route: "/stock",
    target: "page-header",
    title: "Stock",
    en: "Add each item you give on rent with its quantity and rent. Stock updates by itself when items go out and come back.",
    hi: "हर सामान की संख्या और किराया यहाँ डालें। सामान जाने और लौटने पर स्टॉक अपने-आप बदलता है।",
  },
  {
    route: "/payments",
    target: "page-header",
    title: "Payments",
    en: "All payments and receipts: cash, UPI, bank and cheque.",
    hi: "सारे पेमेंट और रसीदें: Cash, UPI, बैंक और चेक।",
  },
  {
    route: "/invoices",
    target: "page-header",
    title: "Bills & invoices",
    en: "Tax invoices (with GST) and bills. Download, print or send them on WhatsApp.",
    hi: "GST वाले Tax Invoice और Bill। डाउनलोड, प्रिंट या WhatsApp पर भेजें।",
  },
  {
    route: "/reports",
    target: "page-header",
    title: "Reports",
    en: "PDF reports of bookings, payments, dues and stock.",
    hi: "बुकिंग, पेमेंट, बकाया और स्टॉक की PDF रिपोर्ट।",
  },
  {
    route: "/settings",
    target: "page-header",
    title: "Settings",
    en: "Your business details, logo, GST, bank/UPI, venues, bill numbering and password.",
    hi: "आपके बिज़नेस की जानकारी, logo, GST, बैंक/UPI, venue, बिल नंबर और पासवर्ड।",
  },
  {
    route: "/dashboard",
    title: "You're ready!",
    en: "Tip: use Install App to keep it on your phone. You can see this tour again from More → App tour.",
    hi: "Install App से ऐप को फोन में रख लें। यह टूर दोबारा More → App tour में मिलेगा।",
  },
];

const KEY = (uid: string) => `sth.tourDone.${uid}`;

/** Has this login already seen the tour (on this phone or any other)? */
export function tourSeen(uid: string, tourDone?: Record<string, boolean>): boolean {
  if (tourDone?.[uid]) return true;
  try {
    return localStorage.getItem(KEY(uid)) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(uid: string) {
  try {
    localStorage.setItem(KEY(uid), "1");
  } catch {
    /* ignore */
  }
  void quickWrite(setDoc(settingsRef(), { tourDone: { [uid]: true } }, { merge: true })).catch(() => undefined);
}

export function openAppTour() {
  window.dispatchEvent(new Event("open-app-tour"));
}

/** The visible element marked data-tour="name" (the same mark can exist for phone and desktop layouts). */
function findTarget(name: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return (
    all.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    }) ?? null
  );
}

type Box = { top: number; left: number; width: number; height: number };

export function AppTour({ open, onClose, business }: { open: boolean; onClose: () => void; business: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const list = steps(business);
  const s = list[Math.min(i, list.length - 1)];
  const last = i === list.length - 1;

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  // Go to the step's page.
  useEffect(() => {
    if (open && s.route && pathname !== s.route) router.push(s.route);
  }, [open, s.route, pathname, router]);

  // Find and follow the highlighted part (it appears once the page has loaded).
  const target = s.target;
  const route = s.route;
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      setView({ w: window.innerWidth, h: window.innerHeight });
      const el = target ? findTarget(target) : null;
      if (!el) return setBox(null);
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    setBox(null);
    let tries = 0;
    let scrolled = false;
    const timer = window.setInterval(() => {
      tries++;
      const el = target && pathname === route ? findTarget(target) : null;
      if (el && !scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      }
      measure();
      if ((el && tries > 3) || tries > 30) window.clearInterval(timer);
    }, 100);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, i, route, target, pathname]);

  if (!open) return null;

  const close = () => {
    onClose();
    if (pathname !== "/dashboard") router.push("/dashboard");
  };

  const pad = 6;
  const hole = box ? { top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 } : null;
  // The card sits below the highlighted part, or above it when there is no room below.
  const cardBelow = hole ? hole.top + hole.height + 12 : 0;
  const placeAbove = hole ? cardBelow + 230 > view.h && hole.top > 250 : false;
  const cardStyle: React.CSSProperties = hole
    ? placeAbove
      ? { bottom: Math.max(12, view.h - hole.top + 12) }
      : { top: Math.min(cardBelow, Math.max(12, view.h - 250)) }
    : { top: "50%", transform: "translateY(-50%)" };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={s.title}>
      {hole ? (
        <div
          key="spotlight"
          className="pointer-events-none absolute rounded-lg ring-2 ring-white transition-[top,left,width,height] duration-200"
          style={{ ...hole, boxShadow: "0 0 0 9999px rgb(15 12 20 / 0.62)" }}
        />
      ) : (
        <div key="shade" className="absolute inset-0 bg-[rgb(15_12_20/0.62)]" />
      )}
      <div className="absolute inset-x-3 mx-auto max-w-sm rounded-lg bg-card p-4 shadow-lift ring-1 ring-black/5" style={cardStyle}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {i + 1} / {list.length}
            </p>
            <h2 className="mt-0.5 text-base font-semibold">{s.title}</h2>
          </div>
          <button type="button" onClick={close} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Skip tour">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{s.en}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.hi}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {list.map((_, k) => (
              <span key={k} className={k === i ? "h-1.5 w-4 rounded-full bg-primary" : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30"} />
            ))}
          </div>
          {i > 0 ? (
            <Button size="sm" variant="outline" onClick={() => setI((x) => Math.max(0, x - 1))}>
              <ArrowLeft /> Back
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={close}>
              Skip
            </Button>
          )}
          <Button size="sm" onClick={() => (last ? close() : setI((x) => x + 1))}>
            {last ? "Start using the app" : i === 0 ? "Start tour" : "Next"} {last ? null : <ArrowRight />}
          </Button>
        </div>
      </div>
    </div>
  );
}
