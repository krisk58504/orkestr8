"use client";

import Link from "next/link";
import { ArrowLeftRight, LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "U";
}

/**
 * Owner portal user menu. Mirrors VendorUserMenu but adds the dual-mode
 * "Switch to staff app" affordance for users holding both an owner-side
 * identity (INVESTOR or property_owners row) AND a staff role.
 */
export function OwnerUserMenu({
  name,
  email,
  contextLabel,
  showStaffAppLink,
}: {
  name: string;
  email: string;
  contextLabel: string;
  showStaffAppLink: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-9 gap-2 px-1.5" />}
      >
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">
          {name}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {email}
              </span>
              <span className="mt-1 truncate text-xs font-normal text-muted-foreground">
                {contextLabel}
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {showStaffAppLink ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/dashboard" />}>
              <ArrowLeftRight className="size-4" />
              Switch to staff app
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem
            variant="destructive"
            render={<button type="submit" className="w-full" />}
          >
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
