"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { APP_NAME } from "@/lib/constants";
import type { NavSection } from "./nav";
import { NavLinks } from "./nav-links";

export function MobileNav({ extras }: { extras?: NavSection[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" />
        }
      >
        <Menu className="size-5" />
        <span className="sr-only">Open navigation</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="flex h-24 items-center justify-center border-b px-5">
          <Image
            src="/logo-stacked.png"
            alt={APP_NAME}
            width={624}
            height={546}
            className="h-16 w-auto"
          />
          <span className="sr-only">{APP_NAME}</span>
        </SheetTitle>
        <div className="px-3 py-4">
          <NavLinks onNavigate={() => setOpen(false)} extras={extras} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
