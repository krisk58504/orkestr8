"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  approveApplication,
  convertApplicationToLease,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Application, ApplicationStatus } from "@/lib/types/app";

const DECIDABLE_STATES: ApplicationStatus[] = ["submitted", "under_review"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ApplicationDetailActions({
  application,
  unitOptions,
  leadOptions,
  alreadyConverted,
}: {
  application: Application;
  unitOptions: { id: string; unit_number: string }[];
  leadOptions: { id: string; first_name: string; last_name: string }[];
  alreadyConverted: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [decisionMode, setDecisionMode] = useState<
    "approve" | "reject" | null
  >(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const [convertOpen, setConvertOpen] = useState(false);
  const [startDate, setStartDate] = useState(
    application.desired_move_in ?? todayISO(),
  );
  const [monthlyRent, setMonthlyRent] = useState("");
  const [convertErrors, setConvertErrors] = useState<Record<string, string>>(
    {},
  );
  const [convertPending, startConvertTransition] = useTransition();

  const canDecide = DECIDABLE_STATES.includes(application.status);
  const canConvert = application.status === "approved" && !alreadyConverted;

  function openConvert() {
    setStartDate(application.desired_move_in ?? todayISO());
    setMonthlyRent("");
    setConvertErrors({});
    setConvertOpen(true);
  }

  function runConvert() {
    startConvertTransition(async () => {
      const result = await convertApplicationToLease(application.id, {
        start_date: startDate,
        monthly_rent: monthlyRent,
      });
      if (result.ok) {
        toast.success("Tenant and lease created");
        setConvertOpen(false);
        router.refresh();
      } else {
        setConvertErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

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
        {canConvert ? (
          <Button size="sm" onClick={openConvert}>
            <ArrowRightLeft className="size-4" />
            Convert to tenant + lease
          </Button>
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

      <AlertDialog
        open={convertOpen}
        onOpenChange={(open) => {
          if (!open) setConvertOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to tenant + lease?</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a new tenant from {application.applicant_first_name}{" "}
              {application.applicant_last_name}&rsquo;s applicant identity and
              an upcoming lease on the application unit. You can send a portal
              invite from the new tenant&rsquo;s page afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor="convert_start_date"
                className="text-sm font-medium"
              >
                Lease start date
              </label>
              <Input
                id="convert_start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              {convertErrors.start_date ? (
                <p className="text-xs text-destructive">
                  {convertErrors.start_date}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label
                htmlFor="convert_monthly_rent"
                className="text-sm font-medium"
              >
                Monthly rent
              </label>
              <Input
                id="convert_monthly_rent"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                placeholder="e.g. 1850.00"
                required
              />
              {convertErrors.monthly_rent ? (
                <p className="text-xs text-destructive">
                  {convertErrors.monthly_rent}
                </p>
              ) : null}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={convertPending}
              onClick={runConvert}
            >
              {convertPending ? "Converting…" : "Create tenant + lease"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
