"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { revokePropertyOwnership } from "@/app/(app)/properties/owner-actions";
import { GrantOwnerDialog } from "@/components/properties/grant-owner-dialog";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PropertyOwnerRow } from "@/lib/data/property-owners";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PropertyOwnersSection({
  propertyId,
  propertyName,
  owners,
  eligibleCandidates,
  canManage,
}: {
  propertyId: string;
  propertyName: string;
  owners: PropertyOwnerRow[];
  eligibleCandidates: { id: string; full_name: string | null; email: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<PropertyOwnerRow | null>(
    null,
  );
  const [revokePending, startRevokeTransition] = useTransition();

  function runRevoke() {
    const target = revokeTarget;
    if (!target) return;
    startRevokeTransition(async () => {
      const result = await revokePropertyOwnership(target.id);
      if (result.ok) {
        toast.success("Ownership revoked");
        setRevokeTarget(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  // Already-granted user ids — passed to the grant dialog to disable
  // them in the picker.
  const existingUserIds = new Set(owners.map((o) => o.user_id));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Owners</CardTitle>
          <p className="text-xs text-muted-foreground">
            Investors and owners with portal access to this property.
          </p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={() => setGrantOpen(true)}>
            <UserPlus className="size-4" />
            Add owner
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {owners.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No owners linked. Grant access to an investor or owner via "Add
            owner."
          </p>
        ) : (
          <ul className="divide-y">
            {owners.map((owner) => (
              <li
                key={owner.id}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium">
                    {owner.user_name ?? owner.user_email ?? "(unknown user)"}
                  </p>
                  {owner.user_email && owner.user_name ? (
                    <p className="text-xs text-muted-foreground">
                      {owner.user_email}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Granted {formatDate(owner.created_at)}
                    {owner.granted_by_name ? ` by ${owner.granted_by_name}` : ""}
                  </p>
                </div>
                {canManage ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" />}
                    >
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">Open actions</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setRevokeTarget(owner)}
                      >
                        <UserMinus className="size-4" />
                        Revoke
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {canManage ? (
        <>
          <GrantOwnerDialog
            open={grantOpen}
            onOpenChange={setGrantOpen}
            propertyId={propertyId}
            propertyName={propertyName}
            candidates={eligibleCandidates}
            excludeUserIds={existingUserIds}
          />
          <AlertDialog
            open={revokeTarget !== null}
            onOpenChange={(open) => {
              if (!open) setRevokeTarget(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke owner access?</AlertDialogTitle>
                <AlertDialogDescription>
                  {revokeTarget
                    ? `${revokeTarget.user_name ?? revokeTarget.user_email ?? "This user"} will lose owner-portal visibility into ${propertyName}. Their user account is unaffected; you can re-grant access at any time.`
                    : "This owner will lose portal access."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={revokePending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={revokePending}
                  onClick={runRevoke}
                >
                  {revokePending ? "Revoking…" : "Revoke"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </Card>
  );
}
