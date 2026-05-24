"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { generateChargesForProperty } from "@/app/(app)/payments/bulk-actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function GenerateChargesDialog({
  open,
  onOpenChange,
  properties,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  properties: { id: string; name: string }[];
  onSuccess: (result: {
    created: number;
    skipped: number;
    leases_without_tenants: number;
    propertyName: string;
    period: string;
  }) => void;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [pending, startTransition] = useTransition();

  // Reset state when dialog opens.
  const [syncedOpen, setSyncedOpen] = useState(open);
  if (syncedOpen !== open) {
    setSyncedOpen(open);
    if (open) {
      setPropertyId("");
      setMonthValue(currentMonthValue());
    }
  }

  function runGenerate() {
    if (!propertyId) {
      toast.error("Pick a property.");
      return;
    }
    const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
    if (!match) {
      toast.error("Pick a valid month.");
      return;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const propertyName =
      properties.find((p) => p.id === propertyId)?.name ?? "(property)";
    const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

    startTransition(async () => {
      const result = await generateChargesForProperty(propertyId, {
        year,
        month,
      });
      if (result.ok) {
        onOpenChange(false);
        onSuccess({
          created: result.created,
          skipped: result.skipped,
          leases_without_tenants: result.leases_without_tenants,
          propertyName,
          period: periodLabel,
        });
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
          <AlertDialogTitle>Generate rent charges</AlertDialogTitle>
          <AlertDialogDescription>
            Creates one rent charge per active or upcoming lease on the
            selected property for the chosen month. Re-running is safe —
            existing charges for the same period are skipped.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="property_id" className="text-sm font-medium">
              Property
            </label>
            <Select
              value={propertyId}
              onValueChange={(v) => setPropertyId(v ?? "")}
            >
              <SelectTrigger id="property_id">
                <SelectValue placeholder="Select a property" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="period_month" className="text-sm font-medium">
              Month
            </label>
            <Input
              id="period_month"
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={runGenerate}>
            {pending ? "Generating…" : "Generate charges"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
