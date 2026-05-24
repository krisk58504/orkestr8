"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  approveApplication,
  rejectApplication,
} from "@/app/(app)/applications/actions";
import { ApplicationFormSheet } from "@/components/applications/application-form-sheet";
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
import { Textarea } from "@/components/ui/textarea";
import type { Application, ApplicationStatus } from "@/lib/types/app";

const DECIDABLE_STATES: ApplicationStatus[] = ["submitted", "under_review"];

export function ApplicationDetailActions({
  application,
  unitOptions,
  leadOptions,
}: {
  application: Application;
  unitOptions: { id: string; unit_number: string }[];
  leadOptions: { id: string; first_name: string; last_name: string }[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [decisionMode, setDecisionMode] = useState<
    "approve" | "reject" | null
  >(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const canDecide = DECIDABLE_STATES.includes(application.status);

  function openDecision(mode: "approve" | "reject") {
    setNotes("");
    setDecisionMode(mode);
  }

  function runDecision() {
    const mode = decisionMode;
    if (!mode) return;
    startTransition(async () => {
      const result =
        mode === "approve"
          ? await approveApplication(application.id, notes)
          : await rejectApplication(application.id, notes);
      if (result.ok) {
        toast.success(
          mode === "approve" ? "Application approved" : "Application rejected",
        );
        setDecisionMode(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" />
          Edit
        </Button>
        {canDecide ? (
          <>
            <Button size="sm" onClick={() => openDecision("approve")}>
              <Check className="size-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openDecision("reject")}
            >
              <X className="size-4" />
              Reject
            </Button>
          </>
        ) : null}
      </div>

      <ApplicationFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        application={application}
        unitOptions={unitOptions}
        leadOptions={leadOptions}
        onSuccess={() => router.refresh()}
      />

      <AlertDialog
        open={decisionMode !== null}
        onOpenChange={(open) => {
          if (!open) setDecisionMode(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {decisionMode === "approve"
                ? "Approve this application?"
                : "Reject this application?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {decisionMode === "approve"
                ? `Approving will record your decision against ${application.applicant_first_name} ${application.applicant_last_name}.`
                : `Rejecting will record your decision against ${application.applicant_first_name} ${application.applicant_last_name}. They cannot be moved back to an earlier state once rejected.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label
              htmlFor="decision_notes"
              className="text-sm font-medium"
            >
              Decision notes <span className="text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="decision_notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Background check passed, income ratio 3.1x"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={decisionMode === "reject" ? "destructive" : undefined}
              disabled={pending}
              onClick={runDecision}
            >
              {pending
                ? "Saving…"
                : decisionMode === "approve"
                  ? "Approve"
                  : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
