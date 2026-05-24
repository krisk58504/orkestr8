"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { LeadFormSheet } from "@/components/leasing/lead-form-sheet";
import { Button } from "@/components/ui/button";
import type { Lead } from "@/lib/types/app";

export function LeadDetailEditAffordance({
  lead,
  propertyOptions,
  assigneeOptions,
}: {
  lead: Lead;
  propertyOptions: { id: string; name: string }[];
  assigneeOptions: { id: string; full_name: string | null; email: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-4" />
        Edit
      </Button>
      <LeadFormSheet
        open={open}
        onOpenChange={setOpen}
        lead={lead}
        propertyOptions={propertyOptions}
        assigneeOptions={assigneeOptions}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
