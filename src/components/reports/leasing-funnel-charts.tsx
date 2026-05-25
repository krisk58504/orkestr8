"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  APPLICATION_STATUS_META,
  LEAD_SOURCE_META,
} from "@/lib/constants";
import type { ApplicationStatus, LeadSource } from "@/lib/types/app";

const TONE_COLORS: Record<string, string> = {
  neutral: "#94a3b8",
  info: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
};

function PieCard({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number; color: string }[];
}) {
  const filtered = data.filter((d) => d.value > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No data in this period
          </div>
        ) : (
          <div className="space-y-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={filtered}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {filtered.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="grid grid-cols-2 gap-1.5 text-sm">
              {filtered.map((slice) => (
                <li key={slice.name} className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="truncate text-muted-foreground">
                    {slice.name}
                  </span>
                  <span className="ml-auto font-medium tabular-nums">
                    {slice.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LeasingFunnelCharts({
  leadsBySource,
  applicationsByStatus,
}: {
  leadsBySource: Record<LeadSource, number>;
  applicationsByStatus: Record<ApplicationStatus, number>;
}) {
  const sourceData = (Object.keys(leadsBySource) as LeadSource[]).map((s) => ({
    name: LEAD_SOURCE_META[s].label,
    value: leadsBySource[s],
    color: TONE_COLORS[LEAD_SOURCE_META[s].tone],
  }));

  const statusData = (
    Object.keys(applicationsByStatus) as ApplicationStatus[]
  ).map((s) => ({
    name: APPLICATION_STATUS_META[s].label,
    value: applicationsByStatus[s],
    color: TONE_COLORS[APPLICATION_STATUS_META[s].tone],
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PieCard title="Leads by source" data={sourceData} />
      <PieCard title="Applications by status" data={statusData} />
    </div>
  );
}
