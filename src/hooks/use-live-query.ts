"use client";

import { onSnapshot, type DocumentData, type DocumentReference, type Query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { fromSnap } from "@/lib/db";

export interface LiveState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  fromServer: boolean;
}

/** Real-time list for a query built from `deps`. Return null from build to skip. */
export function useLiveQuery<T>(build: () => Query<DocumentData> | null, deps: unknown[]): LiveState<T[]> {
  const [state, setState] = useState<LiveState<T[]>>({ data: [], loading: true, error: null, fromServer: false });
  useEffect(() => {
    let q: Query<DocumentData> | null = null;
    try {
      q = build();
    } catch {
      q = null; // no business open (signing out / switching)
    }
    if (!q) {
      setState({ data: [], loading: false, error: null, fromServer: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          data: snap.docs.map((d) => fromSnap<T>(d)),
          loading: false,
          error: null,
          fromServer: !snap.metadata.fromCache && !snap.metadata.hasPendingWrites,
        }),
      (err) => {
        console.error(err);
        setState((s) => ({ ...s, loading: false, error: err }));
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** Real-time single document. */
export function useLiveDoc<T>(build: () => DocumentReference<DocumentData> | null, deps: unknown[]): LiveState<T | null> & { exists: boolean } {
  const [state, setState] = useState<LiveState<T | null> & { exists: boolean }>({
    data: null,
    loading: true,
    error: null,
    fromServer: false,
    exists: false,
  });
  useEffect(() => {
    let ref: DocumentReference<DocumentData> | null = null;
    try {
      ref = build();
    } catch {
      ref = null; // no business open (signing out / switching)
    }
    if (!ref) {
      setState({ data: null, loading: false, error: null, fromServer: false, exists: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          data: snap.exists() ? fromSnap<T>(snap) : null,
          exists: snap.exists(),
          loading: false,
          error: null,
          fromServer: !snap.metadata.fromCache,
        }),
      (err) => {
        console.error(err);
        setState((s) => ({ ...s, loading: false, error: err }));
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
