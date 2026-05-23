"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resendInvite, sendInvite } from "@/app/(app)/tenants/invite-actions";
import { Field } from "@/components/shared/field";
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
import { Input } from "@/components/ui/input";
import type { TenantRow } from "@/lib/data/tenants";

function defaultEmail(tenant: TenantRow | null): string {
  return tenant?.current_invite?.email ?? tenant?.email ?? "";
}

export function TenantInviteDialog({
  open,
  onOpenChange,
  tenant,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: TenantRow | null;
  onSuccess?: () => void;
}) {
  const isResend = tenant?.invite_status === "pending";
  const [email, setEmail] = useState<string>(() => defaultEmail(tenant));
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-initialize when the dialog opens or switches tenant.
  // Render-phase reset — React's recommended alternative to an effect.
  const formKey = open ? (tenant?.id ?? "__none__") : "__closed__";
  const [syncedKey, setSyncedKey] = useState(formKey);
  if (syncedKey !== formKey) {
    setSyncedKey(formKey);
    if (open) {
      setEmail(defaultEmail(tenant));
      setFormError(null);
    }
  }

  function runSubmit() {
    if (!tenant) return;
    startTransition(async () => {
      const result = isResend
        ? tenant.current_invite
          ? await resendInvite(tenant.current_invite.id, email)
          : { ok: false as const, error: "No pending invite to resend." }
        : await sendInvite(tenant.id, email);
      if (result.ok) {
        toast.success(isResend ? "Invite resent" : "Invite sent");
        onOpenChange(false);
        onSuccess?.();
      } else {
        setFormError(result.error);
      }
    });
  }

  const title = isResend ? "Resend portal invite?" : "Send portal invite?";
  const actionLabel = isResend ? "Resend invite" : "Send invite";
  const pendingLabel = isResend ? "Resending…" : "Sending…";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            The recipient will get an email with a link to set up their tenant
            portal account. The link expires in 7 days.
            {isResend ? " The prior invite will be revoked." : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {tenant ? (
          <div className="space-y-4 py-1">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Tenant</dt>
              <dd>
                {tenant.first_name} {tenant.last_name}
              </dd>
              <dt className="text-muted-foreground">Property</dt>
              <dd>
                {tenant.property_name ?? "—"}
                {tenant.unit_number ? ` · Unit ${tenant.unit_number}` : ""}
              </dd>
            </dl>

            <Field
              label="Email"
              htmlFor="invite_email"
              required
              error={formError ?? undefined}
            >
              <Input
                id="invite_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={runSubmit}>
            {pending ? pendingLabel : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
