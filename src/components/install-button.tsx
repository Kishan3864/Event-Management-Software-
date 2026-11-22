"use client";

import { MonitorDown, Plus, Share } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PRODUCT } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { usePwa } from "@/providers/pwa-provider";

export function InstallButton({ className, compact }: { className?: string; compact?: boolean }) {
  const { canInstall, isStandalone, ios, install } = usePwa();
  const [hintOpen, setHintOpen] = useState(false);

  if (isStandalone) return null;
  if (!canInstall && !ios) return null;

  const onClick = async () => {
    if (ios && !canInstall) {
      setHintOpen(true);
      return;
    }
    const res = await install();
    if (res === "unavailable") toast.info("Open the browser menu and choose “Install app”.");
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        className={cn("rounded-full border-primary/30 bg-card text-primary hover:bg-accent", className)}
      >
        <MonitorDown />
        {compact ? "Install" : "Install App"}
      </Button>
      <Dialog open={hintOpen} onOpenChange={setHintOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Install on iPhone</DialogTitle>
            <DialogDescription>Add {PRODUCT.name} to your Home Screen in two taps.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-card text-info shadow-sm">
                <Share className="size-5" />
              </span>
              <span>
                Tap the <b>Share</b> button in Safari&apos;s toolbar.
              </span>
            </li>
            <li className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-card shadow-sm">
                <Plus className="size-5" />
              </span>
              <span>
                Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.
              </span>
            </li>
          </ol>
          <Button onClick={() => setHintOpen(false)}>Got it</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
