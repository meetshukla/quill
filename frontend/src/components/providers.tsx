"use client";

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AccountProvider } from "@/lib/account-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      <Toaster />
    </AccountProvider>
  );
}
