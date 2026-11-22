"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => !o && finish(false)}>
        <AlertDialogContent className="rounded-2xl p-5 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="text-lg">{opts?.title}</AlertDialogTitle>
            {opts?.description ? (
              <AlertDialogDescription asChild>
                <div className="text-sm leading-relaxed text-muted-foreground">{opts.description}</div>
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-5 -mb-5 gap-2 rounded-b-2xl p-4 sm:gap-2">
            <AlertDialogCancel onClick={() => finish(false)}>{opts?.cancelText ?? "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              variant={opts?.destructive ? "destructive" : "default"}
              className={opts?.destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={() => finish(true)}
            >
              {opts?.confirmText ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
