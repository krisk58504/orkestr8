/**
 * maintenance-triage.ts — placeholder AI maintenance triage (SPEC Gate 2).
 *
 * This is a PLACEHOLDER. It performs deterministic keyword-rule matching — no
 * model, no network call, no LLM. It exists so the triage *pathway* (gate →
 * run → log → persist a suggestion) is fully wired and testable before any
 * real model is connected.
 *
 * Output is advisory only. Triage NEVER mutates a request's real priority,
 * category, or status, and never dispatches anything — it writes a suggestion
 * to `maintenance_requests.ai_triage` for a human to review and act on.
 *
 * Pure module: no I/O, safe to import on the server or the client.
 */
import type { MaintenanceCategory, MaintenancePriority } from "@/lib/types/app";

/** Identifies which triage implementation produced a result. */
export const TRIAGE_MODEL = "placeholder-rules-v1";

export type MaintenanceTriageResult = {
  /** Implementation that produced this result. */
  model: string;
  /** Suggested priority — advisory, does not change the request. */
  suggestedPriority: MaintenancePriority;
  /** Suggested category — advisory, does not change the request. */
  suggestedCategory: MaintenanceCategory;
  /** 0–100 heuristic urgency score. */
  urgencyScore: number;
  /** 0–1 confidence in the suggestion. */
  confidence: number;
  /** One-line plain-English summary. */
  summary: string;
  /** Suggested next steps for a human to consider. */
  recommendedActions: string[];
  /** Keywords matched in the report — shown for transparency. */
  signals: string[];
  /** Reminder that this output is advisory. */
  disclaimer: string;
};

export type MaintenanceTriageInput = {
  title: string;
  description: string | null;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
};

const DISCLAIMER =
  "Automated suggestion from a placeholder triage model. Advisory only — " +
  "it does not change the request. A human must review and decide.";

/** Category keyword rules. First applied by match count; ties favour order. */
const CATEGORY_KEYWORDS: { category: MaintenanceCategory; words: string[] }[] = [
  {
    category: "plumbing",
    words: [
      "leak", "pipe", "faucet", "toilet", "drain", "water", "sink",
      "clog", "sewer", "sewage", "flush", "overflow",
    ],
  },
  {
    category: "hvac",
    words: [
      "heat", "heating", "furnace", "ac", "a/c", "air condition",
      "hvac", "thermostat", "cooling", "vent", "boiler", "radiator",
    ],
  },
  {
    category: "electrical",
    words: [
      "outlet", "electric", "wiring", "breaker", "circuit", "light",
      "spark", "power", "fuse", "shock",
    ],
  },
  {
    category: "appliance",
    words: [
      "fridge", "refrigerator", "stove", "oven", "dishwasher", "washer",
      "dryer", "microwave", "appliance", "garbage disposal",
    ],
  },
  {
    category: "locks",
    words: ["lock", "key", "keys", "deadbolt", "latch", "lockout"],
  },
  {
    category: "pest",
    words: [
      "pest", "roach", "rodent", "mice", "mouse", "ant", "bug",
      "infest", "termite", "bedbug", "cockroach",
    ],
  },
  {
    category: "landscaping",
    words: [
      "lawn", "grass", "tree", "landscap", "garden", "shrub",
      "irrigation", "sprinkler", "weed",
    ],
  },
  {
    category: "structural",
    words: [
      "roof", "wall", "ceiling", "foundation", "crack", "floor",
      "window", "door frame", "drywall", "stair",
    ],
  },
];

/** Hazard keywords — any match implies an emergency-priority assessment. */
const EMERGENCY_KEYWORDS = [
  "gas", "fire", "smoke", "flood", "flooding", "burst", "sparking",
  "carbon monoxide", "no heat", "exposed wire", "electrocut", "sewage backup",
  "ceiling collapse", "structural collapse",
];

/** Elevated-concern keywords — any match implies a high-priority assessment. */
const HIGH_KEYWORDS = [
  "leak", "no hot water", "not working", "broken", "outage", "overflow",
  "mold", "unsafe", "won't lock", "cannot lock", "locked out", "no cooling",
];

function collectSignals(haystack: string, words: string[]): string[] {
  return words.filter((w) => haystack.includes(w));
}

function priorityLabel(p: MaintenancePriority): string {
  return p === "emergency" ? "emergency" : p;
}

function categoryActionHint(category: MaintenanceCategory): string {
  switch (category) {
    case "plumbing":
      return "Ask the tenant to shut off the local water supply if leaking is active.";
    case "electrical":
      return "Advise the tenant to avoid the affected circuit until it is inspected.";
    case "hvac":
      return "Confirm whether the unit currently has no heating or cooling at all.";
    case "appliance":
      return "Capture the appliance make and model before dispatch.";
    case "locks":
      return "Verify tenant identity before issuing any replacement keys.";
    case "pest":
      return "Coordinate treatment with a licensed pest-control vendor.";
    case "landscaping":
      return "Confirm whether the issue affects safe access to the property.";
    case "structural":
      return "Assess habitability and whether the area should be cordoned off.";
    default:
      return "Review the report and assign an appropriate vendor or technician.";
  }
}

function priorityAction(priority: MaintenancePriority): string {
  switch (priority) {
    case "emergency":
      return "Dispatch an on-call technician immediately.";
    case "high":
      return "Schedule a technician within 24 hours.";
    case "medium":
      return "Schedule a technician within 3–5 business days.";
    case "low":
      return "Add to the routine maintenance queue.";
  }
}

/**
 * Run the placeholder triage. Deterministic: the same input always yields the
 * same result. No model is consulted.
 */
export function runPlaceholderTriage(
  input: MaintenanceTriageInput,
): MaintenanceTriageResult {
  const haystack = `${input.title} ${input.description ?? ""}`.toLowerCase();

  // --- Category: pick the rule with the most keyword hits. ---
  let suggestedCategory: MaintenanceCategory = input.category;
  let bestCount = 0;
  const categorySignals: string[] = [];
  for (const rule of CATEGORY_KEYWORDS) {
    const hits = collectSignals(haystack, rule.words);
    if (hits.length > bestCount) {
      bestCount = hits.length;
      suggestedCategory = rule.category;
      categorySignals.length = 0;
      categorySignals.push(...hits);
    }
  }

  // --- Priority: hazard keywords escalate; otherwise hold a sane default. ---
  const emergencySignals = collectSignals(haystack, EMERGENCY_KEYWORDS);
  const highSignals = collectSignals(haystack, HIGH_KEYWORDS);

  let suggestedPriority: MaintenancePriority;
  let urgencyScore: number;
  if (emergencySignals.length > 0) {
    suggestedPriority = "emergency";
    urgencyScore = 92;
  } else if (highSignals.length > 0) {
    suggestedPriority = "high";
    urgencyScore = 68;
  } else if (input.priority === "low") {
    suggestedPriority = "low";
    urgencyScore = 24;
  } else {
    suggestedPriority = "medium";
    urgencyScore = 45;
  }

  const signals = Array.from(
    new Set([...emergencySignals, ...highSignals, ...categorySignals]),
  );

  const confidence =
    signals.length === 0
      ? 0.4
      : Math.min(0.45 + signals.length * 0.1, 0.9);

  const summary =
    signals.length === 0
      ? `No strong signals detected — defaulting to a ${priorityLabel(
          suggestedPriority,
        )}-priority ${suggestedCategory} assessment for human review.`
      : `Likely a ${suggestedCategory} issue assessed at ${priorityLabel(
          suggestedPriority,
        )} priority from ${signals.length} signal${
          signals.length === 1 ? "" : "s"
        } in the report.`;

  const recommendedActions = [
    priorityAction(suggestedPriority),
    "Confirm access details and permission-to-enter with the tenant.",
    categoryActionHint(suggestedCategory),
  ];

  return {
    model: TRIAGE_MODEL,
    suggestedPriority,
    suggestedCategory,
    urgencyScore,
    confidence: Math.round(confidence * 100) / 100,
    summary,
    recommendedActions,
    signals,
    disclaimer: DISCLAIMER,
  };
}
