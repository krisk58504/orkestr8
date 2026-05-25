"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DateRange = { from: string; to: string };

type Preset = "this-month" | "last-month" | "this-year" | "last-year" | "custom";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset: Preset): DateRange | null {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  if (preset === "this-month") {
    return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(today) };
  }
  if (preset === "last-month") {
    return {
      from: iso(new Date(Date.UTC(y, m - 1, 1))),
      to: iso(new Date(Date.UTC(y, m, 0))),
    };
  }
  if (preset === "this-year") {
    return { from: iso(new Date(Date.UTC(y, 0, 1))), to: iso(today) };
  }
  if (preset === "last-year") {
    return {
      from: iso(new Date(Date.UTC(y - 1, 0, 1))),
      to: iso(new Date(Date.UTC(y - 1, 11, 31))),
    };
  }
  return null; // custom
}

const PRESET_LABELS: Record<Preset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
  "last-year": "Last year",
  custom: "Custom",
};

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  // Infer the initial preset by matching the value against each preset's range.
  const initialPreset: Preset = (
    ["this-month", "last-month", "this-year", "last-year"] as const
  ).find((p) => {
    const r = presetRange(p);
    return r?.from === value.from && r?.to === value.to;
  }) ?? "custom";

  const [preset, setPreset] = useState<Preset>(initialPreset);

  function pickPreset(p: Preset) {
    setPreset(p);
    const range = presetRange(p);
    if (range) onChange(range);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
          <Button
            key={p}
            type="button"
            variant={preset === p ? "default" : "outline"}
            size="sm"
            onClick={() => pickPreset(p)}
          >
            {PRESET_LABELS[p]}
          </Button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="from_date" className="text-sm font-medium">
              From
            </label>
            <Input
              id="from_date"
              type="date"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="to_date" className="text-sm font-medium">
              To
            </label>
            <Input
              id="to_date"
              type="date"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {value.from} → {value.to}
        </p>
      )}
    </div>
  );
}
