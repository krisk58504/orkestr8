"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { grantPropertyOwnership } from "@/app/(app)/properties/owner-actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Candidate = { id: string; full_name: string | null; email: string };

export function GrantOwnerDialog({
  open,
  onOpenChange,
  propertyId,
  propertyName,
  candidates,
  excludeUserIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyName: string;
  candidates: Candidate[];
  excludeUserIds: Set<string>;
}) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [pending, startTransition] = useTransition();

  const [syncedOpen, setSyncedOpen] = useState(open);
  if (syncedOpen !== open) {
    setSyncedOpen(open);
    if (open) setUserId("");
  }

  // Filter out users who are already owners of this property.
  const pickable = candidates.filter((c) => !excludeUserIds.has(c.id));

  function runGrant() {
    if (!userId) {
      toast.error("Pick a user.");
      return;
    }
    startTransition(async () => {
      const result = await grantPropertyOwnership({
        user_id: userId,
        property_id: propertyId,
      });
      if (result.ok) {
        toast.success("Owner added");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add owner to {propertyName}</AlertDialogTitle>
          <AlertDialogDescription>
            Pick an existing investor or owner from your organization. They&apos;ll
            gain owner-portal access to this property and the chain hanging off
            it (units, leases, charges, payments). Need to invite a new
            investor? Add them to your org first via user management.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <label htmlFor="grant_user_id" className="text-sm font-medium">
            Eligible owner
          </label>
          {pickable.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              {candidates.length === 0
                ? "No org members hold the INVESTOR or OWNER role yet. Add at least one before granting property ownership."
                : "Every eligible user already owns this property."}
            </p>
          ) : (
            <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
              <SelectTrigger id="grant_user_id">
                <SelectValue placeholder="Select an owner" />
              </SelectTrigger>
              <SelectContent>
                {pickable.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name?.trim() || c.email}
                    {c.full_name?.trim() ? ` · ${c.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || pickable.length === 0}
            onClick={runGrant}
          >
            {pending ? "Granting…" : "Add owner"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
