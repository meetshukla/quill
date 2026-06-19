"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./brand-mark";
import { SidebarContent } from "./sidebar";

export function MobileTopBar() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Close the drawer on route change.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:hidden">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Open menu">
            <Menu className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent
          showClose={false}
          className="left-0 top-0 h-svh max-w-[17rem] translate-x-0 translate-y-0 rounded-none rounded-r-xl border-l-0 p-0"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarContent />
        </DialogContent>
      </Dialog>
      <div className="flex items-center gap-2">
        <BrandMark className="size-7" />
        <span className="text-sm font-semibold tracking-tight">Quill</span>
      </div>
    </header>
  );
}
