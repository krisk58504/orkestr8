"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { deleteApplication } from "@/app/(app)/applications/actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { APPLICATION_STATUS_META } from "@/lib/constants";
import type { ApplicationRow } from "@/lib/data/applications";
import type { Application } from "@/lib/types/app";
import { APPLICATION_STATUS_VALUES } from "@/lib/validations/application";
import { ApplicationFormSheet } from "./application-form-sheet";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ApplicationsView({
  applications,
  unitOptions,
  leadOptions,
  canManage,
}: {
  applications: ApplicationRow[];
  unitOptions: { id: string; unit_number: string }[];
  leadOptions: { id: string; first_name: string; last_name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(app: Application) {
    setEditing(app);
    setSheetOpen(true);
  }

  async function handleDelete(app: ApplicationRow) {
    const result = await deleteApplication(app.id);
    if (result.ok) {
      toast.success("Application deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const columns: DataTableColumn<ApplicationRow>[] = [
    {
      id: "applicant",
      header: "Applicant",
      sortAccessor: (a) => a.applicant_last_name.toLowerCase(),
      cell: (a) => (
        <Link
          href={`/applications/${a.id}`}
          className="font-medium hover:underline"
        >
          {a.applicant_first_name} {a.applicant_last_name}
        </Link>
      ),
    },
    {
      id: "email",
      header: "Email",
      sortAccessor: (a) => a.applicant_email,
      cell: (a) => a.applicant_email,
    },
    {
      id: "unit",
      header: "Unit",
      sortAccessor: (a) => a.unit_number ?? "",
      cell: (a) => a.unit_number ?? "—",
    },
    {
      id: "lead",
      header: "Lead",
      sortAccessor: (a) => a.lead_name ?? "",
      cell: (a) => a.lead_name ?? "Walk-in",
    },
    {
      id: "submitted",
      header: "Submitted",
      sortAccessor: (a) => a.submitted_at ?? "",
      cell: (a) => formatDate(a.submitted_at),
    },
    {
      id: "decided",
      header: "Decided",
      sortAccessor: (a) => a.decided_at ?? "",
      cell: (a) => formatDate(a.decided_at),
    },
    {
      id: "status",
      header: "Status",
      sortAccessor: (a) => a.status,
      cell: (a) => {
        const meta = APPLICATION_STATUS_META[a.status];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
  ];

  return (
    <>
      <DataTable
        rows={applications}
        columns={columns}
        getRowId={(a) => a.id}
        searchText={(a) =>
          `${a.applicant_first_name} ${a.applicant_last_name} ${a.applicant_email} ${a.unit_number ?? ""}`
        }
        searchPlaceholder="Search applications…"
        facet={{
          label: "Status",
          options: APPLICATION_STATUS_VALUES.map((s) => ({
            value: s,
            label: APPLICATION_STATUS_META[s].label,
          })),
          matches: (a, v) => a.status === v,
        }}
        onEdit={canManage ? openEdit : undefined}
        onDelete={canManage ? handleDelete : undefined}
        deleteLabel={(a) =>
          `${a.applicant_first_name} ${a.applicant_last_name}`
        }
        toolbar={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New application
            </Button>
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={FileCheck}
            title="No applications yet"
            description="Capture an application to start the screening workflow."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="size-4" />
                  New application
                </Button>
              ) : undefined
            }
          />
        }
      />
      {canManage ? (
        <ApplicationFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          application={editing}
          unitOptions={unitOptions}
          leadOptions={leadOptions}
        />
      ) : null}
    </>
  );
}
