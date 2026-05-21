"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type { Tone } from "@/lib/constants";

export type UnitStatusSlice = {
  name: string;
  value: number;
  tone: Tone;
};

const TONE_VAR: Record<Tone, string> = {
  neutral: "--neutral",
  info: "--info",
  success: "--success",
  warning: "--warning",
  danger: "--error",
};

const FALLBACK_COLORS: Record<Tone, string> = {
  neutral: "#94a3b8",
  info: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
};

function useToneColors(): Record<Tone, string> {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<Record<Tone, string>>(FALLBACK_COLORS);

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    setColors({
      neutral:
        styles.getPropertyValue(TONE_VAR.neutral).trim() ||
        FALLBACK_COLORS.neutral,
      info:
        styles.getPropertyValue(TONE_VAR.info).trim() || FALLBACK_COLORS.info,
      success:
        styles.getPropertyValue(TONE_VAR.success).trim() ||
        FALLBACK_COLORS.success,
      warning:
        styles.getPropertyValue(TONE_VAR.warning).trim() ||
        FALLBACK_COLORS.warning,
      danger:
        styles.getPropertyValue(TONE_VAR.danger).trim() ||
        FALLBACK_COLORS.danger,
    });
  }, [resolvedTheme]);

  return colors;
}

export function UnitStatusChart({ data }: { data: UnitStatusSlice[] }) {
  const colors = useToneColors();
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No units yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={56}
            outerRadius={86}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((slice) => (
              <Cell key={slice.name} fill={colors[slice.tone]} />
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
        {data.map((slice) => (
          <li key={slice.name} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[slice.tone] }}
            />
            <span className="truncate text-muted-foreground">{slice.name}</span>
            <span className="ml-auto font-medium tabular-nums">
              {slice.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
