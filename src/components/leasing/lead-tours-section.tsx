"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTour } from "@/app/(app)/leasing/tour-actions";
import { TourFormSheet } from "@/components/leasing/tour-form-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
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
import { TOUR_STATUS_META } from "@/lib/constants";
import type { TourRow } from "@/lib/data/tours";

function formatScheduledAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LeadToursSection({
  tours,
  unitOptions,
  agentOptions,
  canManage,
  leadId,
}: {
  tours: TourRow[];
  unitOptions: { id: string; unit_number: string }[];
  agentOptions: { id: string; full_name: string | null; email: string }[];
  canManage: boolean;
  leadId: string;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TourRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TourRow | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  function openSchedule() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(tour: TourRow) {
    setEditing(tour);
    setSheetOpen(true);
  }

  function runDelete() {
    const target = deleteTarget;
    if (!target) return;
    startDeleteTransition(async () => {
      const result = await deleteTour(target.id);
      if (result.ok) {
        toast.success("Tour deleted");
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Tours</CardTitle>
          {canManage ? (
            <Button size="sm" onClick={openSchedule}>
              <CalendarPlus className="size-4" />
              Schedule tour
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {tours.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No tours scheduled yet.
            </p>
          ) : (
            <ul className="divide-y">
              {tours.map((tour) => {
                const meta = TOUR_STATUS_META[tour.status];
                return (
                  <li
                    key={tour.id}
                    className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-sm font-medium">
                          {formatScheduledAt(tour.scheduled_at)}
                        </span>
                        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tour.unit_number
                          ? `Unit ${tour.unit_number}`
                          : "Any unit"}{" "}
                        · {tour.agent_name ?? "Unassigned"}
                      </p>
                      {tour.outcome_notes ? (
                        <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                          {tour.outcome_notes}
                        </p>
                      ) : null}
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
                          <DropdownMenuItem onClick={() => openEdit(tour)}>
                            <Pencil className="size-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(tour)}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <>
          <TourFormSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            leadId={leadId}
            tour={editing}
            unitOptions={unitOptions}
            agentOptions={agentOptions}
          />
          <AlertDialog
            open={deleteTarget !== null}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this tour?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteTarget
                    ? `The tour on ${formatScheduledAt(deleteTarget.scheduled_at)} will be permanently removed. This cannot be undone.`
                    : "This tour will be permanently removed."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deletePending}
                  onClick={runDelete}
                >
                  {deletePending ? "Deleting…" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </>
  );
}
