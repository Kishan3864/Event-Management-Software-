"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./auth-provider";
import { ConfirmProvider } from "./confirm-provider";
import { DataProvider } from "./data-provider";
import { PdfProvider } from "./pdf-provider";
import { PwaProvider } from "./pwa-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PwaProvider>
      <AuthProvider>
        <DataProvider>
          <TooltipProvider delayDuration={300}>
            <ConfirmProvider>
              <PdfProvider>
                {children}
                <Toaster position="top-center" closeButton offset={16} mobileOffset={12} />
              </PdfProvider>
            </ConfirmProvider>
          </TooltipProvider>
        </DataProvider>
      </AuthProvider>
    </PwaProvider>
  );
}
