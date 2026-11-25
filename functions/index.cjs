const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp();

const documentId = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\/]/.test(value)
  && value !== "." && value !== "..";

exports.setClientPassword = onCall({ region: "asia-south1", maxInstances: 2 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in again.");
  const { uid, tenantId, password } = request.data ?? {};
  if (!documentId(uid) || !documentId(tenantId) || typeof password !== "string" ||
      password.length < 12 || password.length > 128) {
    throw new HttpsError("invalid-argument", "Select a client login and enter a password of 12–128 characters.");
  }
  const caller = request.auth.uid;
  const authenticationTime = request.auth.token.auth_time;
  if (!authenticationTime || Date.now() / 1000 - authenticationTime > 300) {
    throw new HttpsError("failed-precondition", "Confirm your admin password again.");
  }

  const db = getFirestore();
  const auth = getAuth();
  const [admin, targetAdmin, member, tenant, currentUser] = await Promise.all([
    db.doc(`admins/${caller}`).get(),
    db.doc(`admins/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`tenants/${tenantId}`).get(),
    auth.getUser(caller),
  ]);
  if (!admin.exists || targetAdmin.exists || uid === caller || currentUser.disabled ||
      authenticationTime * 1000 < Date.parse(currentUser.tokensValidAfterTime ?? "")) {
    throw new HttpsError("permission-denied", "Only an active platform admin can change client passwords.");
  }
  if (!tenant.exists || member.data()?.tenantId !== tenantId) {
    throw new HttpsError("not-found", "This login no longer belongs to the selected client.");
  }

  try {
    // Firebase Authentication revokes refresh tokens when a password changes.
    const updated = await auth.updateUser(uid, { password });
    return { email: updated.email ?? member.data()?.email ?? "" };
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "This sign-in account no longer exists.");
    }
    if (error.code === "auth/invalid-password") {
      throw new HttpsError("invalid-argument", "The password does not meet Firebase requirements.");
    }
    throw new HttpsError("internal", "Firebase could not change this password.");
  }
});
