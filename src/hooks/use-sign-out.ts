"use client";

import { useCallback } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useConfirm } from "@/providers/confirm-provider";

/**
 * Signs out after asking. If changes made on this device have not reached the server yet, the person chooses
 * between waiting (stay signed in) and signing out anyway (those changes are deleted with the device's copy).
 */
export function useSignOut() {
  const { logout } = useAuth();
  const confirm = useConfirm();
  return useCallback(
    async (opts: { ask?: boolean; to?: string } = {}) => {
      if (
        opts.ask !== false &&
        !(await confirm({
          title: "Sign out?",
          description: "You will need your email and password to sign in again. The business data kept on this device is removed.",
          confirmText: "Sign out",
        }))
      )
        return;
      if ((await logout({ to: opts.to })) === "done") return;
      const discard = await confirm({
        title: "Changes not uploaded yet",
        description:
          "Some changes made on this device have not reached the server yet (no internet?). Connect to the internet, wait a moment and sign out again. If you sign out now, those changes are deleted.",
        confirmText: "Sign out and delete them",
        cancelText: "Wait",
        destructive: true,
      });
      if (discard) await logout({ discard: true, to: opts.to });
    },
    [confirm, logout]
  );
}
