"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MAINTENANCE_PRIORITY_META,
  WORK_ORDER_STATUS_META,
} from "@/lib/constants";
import type {
  MaintenancePriority,
  WorkOrderStatus,
} from "@/lib/types/app";

const TONE_COLORS: Record<string, string> = {
  neutral: "#94a3b8",
  info: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
};

const PRIORITY_COLORS: Record<MaintenancePriority, string> = {
  low: TONE_COLORS.neutral,
  medium: TONE_COLORS.info,
  high: TONE_COLORS.warning,
  emergency: TONE_COLORS.danger,
};

export function MaintenanceCharts({
  requestsByPriority,
  workOrdersByStatus,
}: {
  requestsByPriority: Record<MaintenancePriority, number>;
  workOrdersByStatus: Record<WorkOrderStatus, number>;
}) {
  const priorityData = (Object.keys(requestsByPriority) as MaintenancePriority[])
    .map((p) => ({
      name: MAINTENANCE_PRIORITY_META[p].label,
      value: requestsByPriority[p],
      color: PRIORITY_COLORS[p],
    }))
    .filter((d) => d.value > 0);

  const statusData = (Object.keys(workOrdersByStatus) as WorkOrderStatus[])
    .map((s) => ({
      name: WORK_ORDER_STATUS_META[s].label,
      value: workOrdersByStatus[s],
      color: TONE_COLORS[WORK_ORDER_STATUS_META[s].tone],
    }))
    .filter((d) => d.value > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Work orders by status</CardTitle>
        </CardHeader>
        <CardContent>
          {statusData.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No work orders
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={86}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {statusData.map((s) => (
                    <Cell key={s.name} fill={s.color} />
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requests by priority</CardTitle>
        </CardHeader>
        <CardContent>
          {priorityData.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No requests in this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={priorityData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {priorityData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
