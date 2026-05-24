"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { deleteLead } from "@/app/(app)/leasing/actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { LEAD_SOURCE_META, LEAD_STATUS_META } from "@/lib/constants";
import type { Lead } from "@/lib/types/app";
import type { LeadRow } from "@/lib/data/leads";
import { LEAD_STATUS_VALUES } from "@/lib/validations/lead";
import { LeadFormSheet } from "./lead-form-sheet";

export function LeadsView({
  leads,
  propertyOptions,
  assigneeOptions,
  canManage,
}: {
  leads: LeadRow[];
  propertyOptions: { id: string; name: string }[];
  assigneeOptions: { id: string; full_name: string | null; email: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(lead: Lead) {
    setEditing(lead);
    setSheetOpen(true);
  }

  async function handleDelete(lead: LeadRow) {
    const result = await deleteLead(lead.id);
    if (result.ok) {
      toast.success("Lead deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: DataTableColumn<LeadRow>[] = [
    {
      id: "name",
      header: "Name",
      sortAccessor: (l) => l.last_name.toLowerCase(),
      cell: (l) => (
        <Link
          href={`/leasing/${l.id}`}
          className="font-medium hover:underline"
        >
          {l.first_name} {l.last_name}
        </Link>
      ),
    },
    {
      id: "email",
      header: "Email",
      sortAccessor: (l) => l.email ?? "",
      cell: (l) => l.email ?? "—",
    },
    {
      id: "phone",
      header: "Phone",
      cell: (l) => l.phone ?? "—",
    },
    {
      id: "property",
      header: "Property",
      sortAccessor: (l) => l.property_name ?? "",
      cell: (l) => l.property_name ?? "—",
    },
    {
      id: "move_in",
      header: "Move-in",
      sortAccessor: (l) => l.desired_move_in ?? "",
      cell: (l) => l.desired_move_in ?? "—",
    },
    {
      id: "assignee",
      header: "Assignee",
      sortAccessor: (l) => l.assignee_name ?? "",
      cell: (l) => l.assignee_name ?? "Unassigned",
    },
    {
      id: "source",
      header: "Source",
      cell: (l) => {
        const meta = LEAD_SOURCE_META[l.source];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
    {
      id: "status",
      header: "Status",
      sortAccessor: (l) => l.status,
      cell: (l) => {
        const meta = LEAD_STATUS_META[l.status];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
  ];

  return (
    <>
      <DataTable
        rows={leads}
        columns={columns}
        getRowId={(l) => l.id}
        searchText={(l) =>
          `${l.first_name} ${l.last_name} ${l.email ?? ""} ${l.phone ?? ""}`
        }
        searchPlaceholder="Search leads…"
        facet={{
          label: "Status",
          options: LEAD_STATUS_VALUES.map((s) => ({
            value: s,
            label: LEAD_STATUS_META[s].label,
          })),
          matches: (l, v) => l.status === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        onDelete={canManage ? handleDelete : undefined}
        deleteLabel={(l) => `${l.first_name} ${l.last_name}`}
        toolbar={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New lead
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={UserPlus}
            title="No leads yet"
            description="Capture your first prospect to start the pipeline."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="size-4" />
                  New lead
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <LeadFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          lead={editing}
          propertyOptions={propertyOptions}
          assigneeOptions={assigneeOptions}
        />
      ) : null}
    </>
  );
}
