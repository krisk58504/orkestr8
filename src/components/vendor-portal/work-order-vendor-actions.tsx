"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, Play, X } from "lucide-react";
import { toast } from "sonner";
import {
  acceptWorkOrder,
  declineWorkOrder,
  updateWorkOrderStatus,
} from "@/app/vendor-portal/actions";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { WorkOrderStatus } from "@/lib/types/app";

/**
 * Vendor-facing action panel for a single work order. Renders only the
 * transitions a vendor is allowed to perform:
 *   assigned    -> accepted (Accept) | open (Decline)
 *   accepted    -> in_progress | completed
 *   in_progress -> completed
 * A vendor can never cancel, reassign, or change the org.
 */
export function WorkOrderVendorActions({
  workOrderId,
  status,
}: {
  workOrderId: string;
  status: WorkOrderStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [costActual, setCostActual] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function runAccept() {
    startTransition(async () => {
      const result = await acceptWorkOrder(workOrderId);
      if (result.ok) {
        toast.success("Work order accepted");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function runDecline() {
    startTransition(async () => {
      const result = await declineWorkOrder(workOrderId);
      if (result.ok) {
        toast.success("Work order declined");
        setConfirmDecline(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function runStart() {
    startTransition(async () => {
      const result = await updateWorkOrderStatus(workOrderId, "in_progress");
      if (result.ok) {
        toast.success("Work started");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function runComplete() {
    startTransition(async () => {
      const result = await updateWorkOrderStatus(workOrderId, "completed", {
        notes,
        costActual,
      });
      if (result.ok) {
        toast.success("Work order completed");
        setCompleteOpen(false);
        setNotes("");
        setCostActual("");
        setFieldErrors({});
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  if (status === "assigned") {
    return (
      <>
        <div className="flex flex-wrap gap-2">
          <Button onClick={runAccept} disabled={pending}>
            <Check className="size-4" />
            Accept
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmDecline(true)}
            disabled={pending}
          >
            <X className="size-4" />
            Decline
          </Button>
        </div>
        <AlertDialog
          open={confirmDecline}
          onOpenChange={(open) => {
            if (!open) setConfirmDecline(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Decline this work order?</AlertDialogTitle>
              <AlertDialogDescription>
                The job will be returned to the property-management team so it
                can be reassigned. You will no longer see it in your portal.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={runDecline}
              >
                {pending ? "Declining…" : "Decline"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (status === "accepted" || status === "in_progress") {
    return (
      <>
        <div className="flex flex-wrap gap-2">
          {status === "accepted" ? (
            <Button onClick={runStart} disabled={pending}>
              <Play className="size-4" />
              Start work
            </Button>
          ) : null}
          <Button
            variant={status === "in_progress" ? "default" : "outline"}
            onClick={() => setCompleteOpen(true)}
            disabled={pending}
          >
            <CircleCheck className="size-4" />
            Mark completed
          </Button>
        </div>
        <AlertDialog
          open={completeOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCompleteOpen(false);
              setFieldErrors({});
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Complete this work order?</AlertDialogTitle>
              <AlertDialogDescription>
                Add optional completion notes and the actual cost. This marks
                the job as completed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-1">
              <Field
                label="Completion notes"
                htmlFor="completion-notes"
                hint="Optional."
                error={fieldErrors.notes}
              >
                <Textarea
                  id="completion-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the work performed"
                />
              </Field>
              <Field
                label="Actual cost"
                htmlFor="completion-cost"
                hint="Optional."
                error={fieldErrors.costActual}
              >
                <Input
                  id="completion-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={costActual}
                  onChange={(e) => setCostActual(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={pending} onClick={runComplete}>
                {pending ? "Saving…" : "Mark completed"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // open / on_hold / completed / cancelled — no vendor action available.
  return (
    <p className="text-sm text-muted-foreground">
      No action is available for this work order right now.
    </p>
  );
}
