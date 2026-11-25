import { deleteField, doc, runTransaction, serverTimestamp, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const ACTIVITY_INTERVAL_MS = 120_000;
export const ACTIVE_WINDOW_MS = 300_000;

export interface ClientActivity {
  id: string;
  tenantId: string;
  lastSeen: Timestamp;
  screen: string;
  location?: {
    latCell: number;
    lngCell: number;
    sharedAt: Timestamp;
  };
}

export const activityRef = (uid: string) => doc(db(), "clientActivity", uid);

export async function recordActivity(uid: string, tenantId: string, screen: string) {
  const ref = activityRef(uid);
  await runTransaction(db(), async (transaction) => {
    const existing = (await transaction.get(ref)).data() as ClientActivity | undefined;
    // Two browser tabs can report at once. Limit writes when they are on the same screen.
    if (existing?.tenantId === tenantId && existing.screen === screen &&
        Date.now() - existing.lastSeen.toMillis() < ACTIVITY_INTERVAL_MS - 5_000) return;
    transaction.set(ref, { tenantId, screen, lastSeen: serverTimestamp() }, { merge: existing?.tenantId === tenantId });
  });
}

export function shareActivityLocation(uid: string, tenantId: string, latitude: number, longitude: number) {
  return runTransaction(db(), async (transaction) => {
    transaction.set(activityRef(uid), {
      tenantId,
      lastSeen: serverTimestamp(),
      screen: "more",
      location: { latCell: Math.round(latitude * 10), lngCell: Math.round(longitude * 10), sharedAt: serverTimestamp() },
    });
  });
}

export async function stopSharingActivityLocation(uid: string) {
  const ref = activityRef(uid);
  await runTransaction(db(), async (transaction) => {
    if ((await transaction.get(ref)).exists()) transaction.update(ref, { location: deleteField() });
  });
}
