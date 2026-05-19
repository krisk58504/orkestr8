import { Building2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { APP_NAME } from "@/lib/constants";
import { NavLinks } from "./nav-links";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-5 font-semibold">
        <Building2 className="size-5" />
        <span>{APP_NAME}</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-3 py-4">
          <NavLinks />
        </div>
      </ScrollArea>
    </aside>
  );
}
