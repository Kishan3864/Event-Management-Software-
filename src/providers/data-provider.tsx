"use client";

import { onSnapshot, query, where, type DocumentData, type Query } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { pendingOf } from "@/lib/calc";
import { DEFAULT_PREFIXES, DEFAULT_SETTINGS } from "@/lib/constants";
import { colRef, fromSnap, settingsRef } from "@/lib/db";
import { addDays, todayYMD } from "@/lib/dates";
import type { Booking, Category, Item, Location, Settings } from "@/lib/types";
import { useAuth } from "./auth-provider";

interface DataContextValue {
  settings: Settings;
  settingsExists: boolean;
  settingsLoaded: boolean;
  locations: Location[]; // active only
  venues: Location[]; // active resorts + gardens
  categories: Category[];
  items: Item[]; // all (including archived)
  activeItems: Item[];
  counters: Record<string, number>;
  bookings: Booking[]; // recent window + all active + all with dues
  bookingsLoaded: boolean;
  windowStart: string;
  coreLoaded: boolean;
  dueByCustomer: Map<string, { total: number; bookings: Booking[] }>;
  totalDue: number;
  syncing: boolean;
}

const DataContext = createContext<DataContextValue | null>(null);

function tsMillis(v: unknown): number {
  const t = v as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === "function" ? t.toMillis() : 0;
}

function useLiveList<T>(enabled: boolean, build: () => Query<DocumentData> | null, key: string) {
  const [state, setState] = useState<{ data: T[]; loaded: boolean; pending: boolean }>({
    data: [],
    loaded: false,
    pending: false,
  });
  useEffect(() => {
    if (!enabled) {
      setState({ data: [], loaded: false, pending: false });
      return;
    }
    let q: Query<DocumentData> | null = null;
    try {
      q = build();
    } catch {
      return; // business was closed (sign-out / switch) while this was starting
    }
    if (!q) return;
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        setState({
          data: snap.docs.map((d) => fromSnap<T>(d)),
          loaded: true,
          pending: snap.metadata.hasPendingWrites,
        });
      },
      (err) => {
        console.error(`Listener ${key} failed`, err);
        setState((s) => ({ ...s, loaded: true }));
      }
    );
    return unsub;
    // `key` identifies the query; build() only uses stable values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  return state;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { status, tenantId } = useAuth();
  const enabled = status === "ready" && !!tenantId;
  const k = (name: string) => `${tenantId}:${name}`;
  const [windowStart] = useState(() => addDays(todayYMD(), -45));

  // settings document
  const [settingsState, setSettingsState] = useState<{ data: Settings | null; loaded: boolean; pending: boolean }>({
    data: null,
    loaded: false,
    pending: false,
  });
  useEffect(() => {
    if (!enabled) {
      setSettingsState({ data: null, loaded: false, pending: false });
      return;
    }
    let ref;
    try {
      ref = settingsRef();
    } catch {
      return; // business was closed while this was starting
    }
    return onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) =>
        setSettingsState({
          data: snap.exists() ? (snap.data() as Settings) : null,
          loaded: true,
          pending: snap.metadata.hasPendingWrites,
        }),
      (err) => {
        console.error("settings listener failed", err);
        setSettingsState((s) => ({ ...s, loaded: true }));
      }
    );
  }, [enabled, tenantId]);

  const locations = useLiveList<Location>(enabled, () => colRef("locations"), k("locations"));
  const categories = useLiveList<Category>(enabled, () => colRef("categories"), k("categories"));
  const items = useLiveList<Item>(enabled, () => colRef("items"), k("items"));
  const counters = useLiveList<{ id: string; seq: number }>(enabled, () => colRef("counters"), k("counters"));
  const recent = useLiveList<Booking>(
    enabled,
    () => query(colRef("bookings"), where("toDate", ">=", windowStart)),
    k("bookings-recent")
  );
  const live = useLiveList<Booking>(
    enabled,
    () => query(colRef("bookings"), where("status", "in", ["confirmed", "items_out"])),
    k("bookings-live")
  );
  const due = useLiveList<Booking>(
    enabled,
    () => query(colRef("bookings"), where("balance", ">", 0)),
    k("bookings-due")
  );

  const value = useMemo<DataContextValue>(() => {
    const s = settingsState.data;
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      ...(s ?? {}),
      prefixes: { ...DEFAULT_PREFIXES, ...(s?.prefixes ?? {}) },
      bank: { ...DEFAULT_SETTINGS.bank, ...(s?.bank ?? {}) },
    };
    const activeLocations = locations.data
      .filter((l) => l.active !== false)
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    const sortedCategories = [...categories.data].sort(
      (a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name)
    );
    const sortedItems = [...items.data].sort((a, b) => a.name.localeCompare(b.name));

    const map = new Map<string, Booking>();
    for (const list of [recent.data, live.data, due.data]) {
      for (const b of list) {
        const prev = map.get(b.id);
        if (!prev || tsMillis(b.updatedAt) >= tsMillis(prev.updatedAt)) map.set(b.id, b);
      }
    }
    const bookings = [...map.values()];

    const dueByCustomer = new Map<string, { total: number; bookings: Booking[] }>();
    let totalDue = 0;
    for (const b of bookings) {
      const p = pendingOf(b);
      if (p <= 0) continue;
      totalDue += p;
      const entry = dueByCustomer.get(b.customerId) ?? { total: 0, bookings: [] };
      entry.total += p;
      entry.bookings.push(b);
      dueByCustomer.set(b.customerId, entry);
    }

    const counterMap: Record<string, number> = {};
    for (const c of counters.data) counterMap[c.id] = Number(c.seq) || 0;

    return {
      settings,
      settingsExists: !!s,
      settingsLoaded: settingsState.loaded,
      locations: activeLocations,
      venues: activeLocations.filter((l) => l.type !== "godown"),
      categories: sortedCategories,
      items: sortedItems,
      activeItems: sortedItems.filter((i) => i.active !== false),
      counters: counterMap,
      bookings,
      bookingsLoaded: recent.loaded && live.loaded && due.loaded,
      windowStart,
      coreLoaded: settingsState.loaded && locations.loaded && categories.loaded && items.loaded,
      dueByCustomer,
      totalDue: Math.round(totalDue * 100) / 100,
      syncing:
        settingsState.pending || items.pending || recent.pending || live.pending || due.pending || locations.pending,
    };
  }, [settingsState, locations, categories, items, counters, recent, live, due, windowStart]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}
