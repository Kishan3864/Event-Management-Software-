"use client";

import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { Bell, BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fromSnap } from "@/lib/db";
import { db } from "@/lib/firebase";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

interface Notice {
  id: string;
  title: string;
  body?: string;
  to: string;
  createdAt?: { toMillis?: () => number };
}

const ms = (n: Notice) => (typeof n.createdAt?.toMillis === "function" ? n.createdAt.toMillis() : Date.now());
const seenKey = (uid: string) => `sth.noticesSeen.${uid}`;

function readSeen(uid: string): number {
  try {
    return Number(localStorage.getItem(seenKey(uid)) || 0);
  } catch {
    return 0;
  }
}

/** Shows a phone notification while the app is open or in the background (needs the person's permission). */
function phoneNotification(n: Notice) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    void navigator.serviceWorker?.ready.then((r) => r.showNotification(n.title, { body: n.body || "", icon: "/icons/icon-192.png", tag: n.id }));
  } catch {
    /* not supported */
  }
}

/** Notifications from the platform admin to this business (all its logins, or this login). */
export function NoticeBell({ className }: { className?: string }) {
  const { user, tenantId, isSuper } = useAuth();
  const uid = user?.uid;
  const enabled = !!uid && !!tenantId && !isSuper;
  const [items, setItems] = useState<Notice[]>([]);
  const [seen, setSeen] = useState(0);
  const [permission, setPermission] = useState<string>("default");

  useEffect(() => {
    if (!enabled || !uid || !tenantId) return;
    setSeen(readSeen(uid));
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    let first = true;
    const q = query(collection(db(), "tenants", tenantId, "notices"), where("to", "in", ["all", uid]), limit(50));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => fromSnap<Notice>(d)).sort((a, b) => ms(b) - ms(a));
        setItems(list);
        if (first) {
          // Opened the app: point out the newest one not seen yet.
          first = false;
          const unread = list.filter((n) => ms(n) > readSeen(uid));
          if (unread.length) toast(unread[0].title, { description: unread[0].body, icon: <BellRing className="size-4" /> });
          return;
        }
        // Arrived while the app is open: show it right away.
        for (const ch of snap.docChanges()) {
          if (ch.type !== "added" || ch.doc.metadata.hasPendingWrites) continue;
          const n = fromSnap<Notice>(ch.doc);
          toast(n.title, { description: n.body, icon: <BellRing className="size-4" />, duration: 8000 });
          phoneNotification(n);
        }
      },
      () => undefined
    );
  }, [enabled, uid, tenantId]);

  const markSeen = useCallback(() => {
    if (!uid || !items.length) return;
    const latest = Math.max(...items.map(ms));
    try {
      localStorage.setItem(seenKey(uid), String(latest));
    } catch {
      /* ignore */
    }
    setSeen(latest);
  }, [uid, items]);

  if (!enabled) return null;
  const unread = items.filter((n) => ms(n) > seen).length;

  return (
    <Popover onOpenChange={(o) => o && markSeen()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={cn("relative", className)} aria-label={unread ? `${unread} new notifications` : "Notifications"}>
          <Bell />
          {unread ? (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
        </div>
        <div className="max-h-80 divide-y overflow-y-auto">
          {items.length ? (
            items.map((n) => (
              <div key={n.id} className="px-3 py-2.5">
                <p className="text-sm font-medium">{n.title}</p>
                {n.body ? <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">{n.body}</p> : null}
                {n.createdAt ? <p className="mt-1 text-xs text-muted-foreground">{formatTimestamp(n.createdAt as never)}</p> : null}
              </div>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          )}
        </div>
        {permission === "default" ? (
          <div className="border-t p-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  setPermission(await Notification.requestPermission());
                } catch {
                  /* ignore */
                }
              }}
            >
              <BellRing /> Show them on my phone too
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
