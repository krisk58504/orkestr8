import Image from "next/image";
import { ScrollArea } from "@/components/ui/scroll-area";
import { APP_NAME } from "@/lib/constants";
import type { NavSection } from "./nav";
import { NavLinks } from "./nav-links";

export function Sidebar({ extras }: { extras?: NavSection[] }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-24 items-center justify-center border-b px-5">
        <Image
          src="/logo-stacked.png"
          alt={APP_NAME}
          width={624}
          height={546}
          priority
          className="h-16 w-auto"
        />
      </div>
      <ScrollArea className="flex-1">
        <div className="px-3 py-4">
          <NavLinks extras={extras} />
        </div>
      </ScrollArea>
    </aside>
  );
}
