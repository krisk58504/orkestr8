# Phase 7 Slice 5 Audit — #39 Insurance Certificate Renewal Cascade

> **STATUS**: scratch work, audit-first per PHASE_7_PLAN.md §0.4
> discipline #1. Not the implementation — this document is the
> read-first verification that slice 5 as planned will land cleanly.
>
> **Greenfield-on-template slice**: no existing insurance-specific
> handler code, but the structural pattern is fully cloned from slice
> 1's vendor-doc-expiry handler (212 lines, shipped, proven across 4
> walk-test cycles). Slice 5 = slice 1's handler scoped to
> `document_type='insurance'` + a specialized email template + a
> partial index that retroactively benefits slice 1 too.
>
> **All design decisions pre-locked** per the slice 5 audit-walk
> 2026-05-27. Six Q1-Q6 questions resolved before this audit was
> drafted; §G captures the locks + a cross-slice index-benefit note;
> §10 surfaces only future re-triggers not covered by §G.

## §1 — Slice metadata

| Field | Value |
|---|---|
| **Slice name** | Insurance Certificate Renewal Cascade (§3.39 from Q4 priority pool) |
| **Phase 7 slice number** | 5 |
| **Authored** | 2026-05-27 |
| **Source plan** | PHASE_7_PLAN.md §5.1 (Tier 2 vendor differentiation candidates — #39 listed as "scoped subset of #37; specialized email template; same handler shape") |
| **Decisions source** | This document §G (6 pre-locked resolutions) + docs/PHASE_7_DECISIONS_2026-05-26.md Q4 (priority pool), Q18 (Tier 2 placement after Tier 1 financial cluster), Q20 (vendor-first-then-financial — slice 5 is the first vendor differentiation slice after Tier 1 closed with slice 4), Q21 / §0.4 #9 (opt-in default for vendor-risky cron handlers — slice 5 honors) |
| **Builds on** | `vendor_documents` + `vendor_document_type` enum (Phase 2, migration `20260519000500_vendor_records.sql`); slice 1's `vendor_doc_expiry` handler as structural template (`src/lib/automation/handlers/vendor-doc-expiry.ts`, 212 lines); slice 1's `resolveVendorRecipient` helper (`src/lib/automation/recipients/vendor.ts`); slice 1 automation substrate (`automations`, `automation_runs`, three-gate chain, runner, handler registry, Vercel Cron entrypoint); Phase 3 email infrastructure (`sendEmail()` chokepoint + `email_log` + dedup) |
| **Blocks** | Future Tier 2 vendor differentiation slices (#38 auto-suspend, #7 SLA breach) — slice 5 does not depend on them but establishes the multi-handler-on-shared-table pattern that #38 will reuse for its auto-suspend SQL probe |
| **Does NOT include** | Auto-suspend on expiry (that's #38, separate slice); SLA breach + reroute (#7, separate); per-vendor grace overrides (defer per slice 4 §G.4 pattern); UNIQUE constraint on `(vendor_document_id, threshold_days)` per pair (the slice 1 `automation_runs.idempotency_key` UNIQUE covers this structurally already); `vendor_insurance_renewal.sent` notification producer (defer per §G.4 — match slice 1's email-only posture); auto-enable provisioning code (§G.3 — discipline #9 honored) |

---

## §2 — Locked schema changes

Slice 5 ships ONE migration: a new partial index on
`vendor_documents`. No new tables, no new columns, no new enum values.
Verbatim DDL lives in §E.1; this section describes the change in prose.

### §2.1 — Pre-flight schema verification

Before slice 5 implementation, walk-test Step 0 (§8.0) confirms:

| Existing element | Verified by query | Required state |
|---|---|---|
| `vendor_document_type` enum has `'insurance'` value | `SELECT enum_range(NULL::public.vendor_document_type)` | confirmed via grep: `'insurance','license','w9','contract','certification','other'` |
| `vendor_documents.expires_on` exists and is `date` type | `\d public.vendor_documents` | confirmed via Phase 2 migration |
| `vendor_documents.vendor_id` FK chain valid (vendor_documents → vendors) | `pg_get_constraintdef` lookup on `vendor_documents` constraints | confirmed; FK exists with `ON DELETE CASCADE` |
| Slice 1's `vendor_documents_organization_id_idx` exists | `pg_indexes` query | confirmed via Phase 2 migration |
| `automations.automation_type` is unconstrained (slice 1+3+4 substrate) | `pg_get_constraintdef` on automations CHECK constraints | confirmed — `'vendor_insurance_renewal'` writable without migration |
| Existing slice 1 handler `vendor_doc_expiry` continues to work | sanity SELECT of slice 1's automation row | confirmed; slice 5 adds a peer handler, not a replacement |
| `vendor_documents_expires_on_idx` does NOT yet exist | `pg_indexes` (pre-migration) | confirmed; slice 5 migration adds it |

### §2.2 — What is NOT changed

- No new tables
- No new columns on `vendor_documents`, `vendors`, `automations`, or any other existing table
- No new enums or CHECK constraints (`document_type` enum already
  has `'insurance'`; `automation_type` is unconstrained free text)
- No new RLS policies — admin client bypasses; existing
  `vendor_documents` policies cover; no new policy surface
- No UNIQUE constraint on `(vendor_document_id, threshold_days)` —
  the slice 1 substrate's
  `automation_runs.idempotency_key UNIQUE(automation_id, idempotency_key)`
  already provides structural enforcement (matches slice 3 §G.5 +
  slice 4 §G.5 deferral patterns)
- No new producer-call-site edits in domain action files (slice 5
  is cron-only; no event-triggered surface in this slice)
- No changes to `src/lib/types/database.ts` — index addition doesn't
  change row/insert/update shape of any table

### §2.3 — What IS changed — new partial index on `vendor_documents.expires_on`

**Index**: `vendor_documents_expires_on_idx`
**Definition** (verbatim in §E.1):
```sql
CREATE INDEX IF NOT EXISTS vendor_documents_expires_on_idx
  ON public.vendor_documents (organization_id, expires_on)
  WHERE expires_on IS NOT NULL;
```

**Composite shape** `(organization_id, expires_on)`:
- Detection queries on `vendor_documents` always start with
  `.eq('organization_id', $1)` (org-scoped admin client filter)
- Then filter on `expires_on` (`.in('expires_on', target_dates)` for
  the cascade pattern)
- The composite matches the natural lookup shape; leading column
  filters most aggressively, trailing column refines

**Partial index** `WHERE expires_on IS NOT NULL`:
- The handlers' detection queries explicitly look for non-null
  expires_on values (documents with no expiration date are not in
  scope — those are non-expiring artifacts like a w9 or a contract
  without renewal)
- Skipping nulls keeps the index smaller; at any production scale a
  meaningful fraction of `vendor_documents` rows will have
  `expires_on IS NULL` (or eventually be old expired-and-not-renewed
  stragglers — different concern)
- Matches the partial-index pattern slice 4 established with
  `rent_charges_parent_charge_id_idx WHERE parent_charge_id IS NOT NULL`

**Cross-slice retroactive benefit** (per item A from STEP 1):
- Slice 1's `vendor_doc_expiry` handler scans the SAME
  `vendor_documents(organization_id, expires_on)` shape — and has done so since 2026-05-26 with NO index on `expires_on`
- After slice 5's migration applies, BOTH handlers' detection queries
  become eligible to plan against the new index
- Captured in §G of this audit as a cross-slice effect
- **Planner-choice expectation at Sterling scale**: 8 vendor_documents total;
  Postgres will likely choose Seq Scan over the partial index, same
  "acceptable contingency" pattern as slice 4 §9.2.5. Walk-test §8.0
  Step 0 includes an EXPLAIN ANALYZE probe to verify the contingency
  without making the index-use a ship-gate.
- **At production scale (hundreds-to-thousands of vendor_documents
  per partner org)**: the planner should flip to Index Scan on the
  partial index for both handlers. Slice 5 audit makes the bet that
  this is the right time to add the index — cheap now, expensive to
  retrofit later if a partner-scale incident exposes the scan cost.

---

## §3 — Handler pattern + cron logic

### §3.1 — Handler registration

**Path**: `src/lib/automation/handlers/vendor-insurance-renewal.ts`

Distinct file from `vendor-doc-expiry.ts` per locked decision Q1.
Same `AutomationHandler` interface (slice 1's
`src/lib/automation/types.ts`). Registry add in
`src/lib/automation/handlers/index.ts`:

```typescript
export const HANDLERS: Record<string, AutomationHandler> = {
  [vendorDocExpiryHandler.type]: vendorDocExpiryHandler,
  [rentChargeGenerationHandler.type]: rentChargeGenerationHandler,
  [lateFeeApplicationHandler.type]: lateFeeApplicationHandler,
  [vendorInsuranceRenewalHandler.type]: vendorInsuranceRenewalHandler,  // NEW
};
```

### §3.2 — `automation_type` constant

`'vendor_insurance_renewal'`. Free text (no enum / CHECK at the DB
level; `automations.automation_type` is unconstrained per slice 1
substrate decision Q10).

### §3.3 — Cron logic flow

For each enabled automation row of type
`'vendor_insurance_renewal'`, inside `handler.run(admin, params)`:

1. **Parse config** via Zod (§4.2 schema). Invalid config → write
   `automation_runs` row with `status='failed'` +
   `error_message='invalid_config'`, return `{ failed: 1 }`. Pattern
   matches slices 1+3+4.
2. **Compute target dates** from today's UTC date + each threshold:
   ```typescript
   const today = new Date();
   today.setUTCHours(0, 0, 0, 0);
   const targets = config.thresholds_days.map((days) => {
     const d = new Date(today);
     d.setUTCDate(d.getUTCDate() + days);
     return { days, dateString: d.toISOString().slice(0, 10) };
   });
   ```
   With `thresholds_days=[60, 30, 14, 7]`, targets = `[{60, '2026-07-26'}, {30, '2026-06-26'}, {14, '2026-06-10'}, {7, '2026-06-03'}]` (example for today=2026-05-27).
3. **Detection query** — filter on `document_type='insurance'`:
   ```sql
   SELECT vd.id, vd.vendor_id, vd.name, vd.expires_on,
          v.name AS vendor_name, v.email AS vendor_email
   FROM public.vendor_documents vd
   JOIN public.vendors v ON v.id = vd.vendor_id
   WHERE vd.organization_id = $1
     AND vd.document_type = 'insurance'           -- slice 5 scope
     AND vd.expires_on IS NOT NULL
     AND vd.expires_on = ANY($2::date[]);
   ```
   `$1` = org_id; `$2` = the array of target dates from step 2. The
   new partial index plans against this query.
4. **For each matched `(vendor_document, threshold_days)` pair**:
   - Compute idempotency key:
     `vendor_insurance_renewal:${vendor_document.id}:${threshold_days}`
   - Insert `automation_runs` row with `status='running'` +
     idempotency key
   - If UNIQUE collision → this pair was processed previously; silent
     skip; continue to next pair
   - Resolve recipient via `resolveVendorRecipient(admin, vendor_id, vendor.email)`
     (per Q6 — verbatim reuse of slice 1's helper)
   - If recipient is null → update run row with `status='skipped'`,
     `result.reason='no_recipient'`; continue
   - Render the insurance-specific email template
     `vendorInsuranceRenewalEmail({ ... })` (§5)
   - Send via `sendEmail()` chokepoint (Phase 3 email infra; Resend
     test-mode in dev)
   - On `sendResult.delivered=true` → update run row to `status='ok'`
     with full result payload
   - On send failure → update run row to `status='failed'` with
     `error_message=sendResult.reason`
5. **Return** `{ attempted, succeeded, skipped, failed }` to the
   runner. The runner's existing per-org summary log block writes a
   single `automation_logs` row with the aggregate counts (slice 1
   behavior, slice 2 added OWNER-on-failure notification — both
   inherited).

### §3.4 — Edge cases (enumerated — matches slice 1's §3.5 shape with insurance-specific additions)

| Case | Behavior |
|---|---|
| `expires_on` is NULL | Filtered out at SQL level (WHERE clause + partial index predicate align) |
| `expires_on` doesn't match any target date | Filtered out at SQL level |
| `document_type` is not `'insurance'` (license / w9 / contract / certification / other) | Filtered out at SQL level (`document_type = 'insurance'` clause). **This is the slice 5 scope discipline.** Slice 1's `vendor_doc_expiry` handler picks up the non-insurance types (same threshold cascade, different email template). The two handlers run in parallel for the same org with no overlap. |
| Document already expired (`expires_on < current_date`) | Filtered out at SQL level — not in target_dates which are all future. This is Tier 2 #38 auto-suspend territory, separate slice. |
| Same `(doc, threshold)` pair processed previously | UNIQUE on `automation_runs(automation_id, idempotency_key)` blocks duplicate; pair counted as skipped |
| Vendor has no primary contact AND `vendor.email` is null | `resolveVendorRecipient` returns null; run row marked `status='skipped'` with `result.reason='no_recipient'`; idempotency key still written so daily runs don't re-log-skip every day |
| Vendor has multiple primary contacts (data anomaly) | `maybeSingle()` in resolver returns null → falls through to `vendor.email` (slice 1 §3.5 row 6 pattern) |
| One vendor has multiple insurance docs at the same threshold | One email per `(doc_id, threshold)` pair (idempotency keyed per-doc, not per-vendor). Vendor may receive 2-3 emails on the same day if they have multiple insurance certs all expiring in the same window — accepted as correct behavior (each cert may need its own renewal action) |
| Retroactive enable: operator inserts automations row after some certs have already crossed a threshold in the past | Targets always compute as `today + N` (future dates), so a cert that crossed the 30-day threshold yesterday is NOT picked up at the 30-day threshold today (yesterday's target was today; today's target is tomorrow). The 14-day or 7-day threshold WILL fire if/when the cert reaches that target naturally. Matches slice 1's retroactive-enable behavior. |
| Org has `automation_freeze=true` | Runner gate catches before handler — no emails written; per slice 1 substrate behavior |
| Org has `automation_mode='disabled'` or `'paused'` | Same — runner skips before dispatch |
| `automations.config` fails Zod validation | Handler writes `automation_runs` row with `status='failed'` and `error_message='invalid_config'`; no emails sent (slices 1+3+4 pattern) |
| `app.is_ai_actor=true` during run (defensive) | `vendor_documents` table does NOT carry an `is_ai_actor` RESTRICTIVE policy (only `rent_charges` + `payments` do per Phase 6 slice 11a). Slice 5's runner is NOT AI-flagged, so this is moot at the per-row level. |
| Mid-handler crash | `automation_runs` row stays in `'running'` state per slice 1 §9.3.2 known limitation; next day's cron re-tries the pair (UNIQUE blocks if completed; if the prior run wrote 'running' but no completion update, the UNIQUE on `idempotency_key` still blocks — the failure mode is "no email sent for this pair, ever, until ops manually deletes the stuck row." Same as slice 1's posture; accepted. |

---

## §4 — Configuration shape

Per Q10 (B1+jsonb hybrid from slice 1 substrate): universal columns
on `automations` typed; per-handler config in `jsonb`.

### §4.1 — Universal `automations` row (slice 5 typical)

```sql
INSERT INTO public.automations
  (organization_id, automation_type, name, description, enabled,
   schedule_cron, config)
VALUES
  ('<org_id>',
   'vendor_insurance_renewal',
   'Vendor insurance certificate renewal cascade',
   'Sends 60/30/14/7-day renewal reminders for insurance documents in vendor_documents.',
   true,
   '0 6 * * *',
   '{}'::jsonb);
```

`schedule_cron = '0 6 * * *'` daily — handler is idempotent via the
slice 1 substrate's UNIQUE on `(automation_id, idempotency_key)`.
Same shared `/api/cron/automations` entrypoint as slices 1+3+4.

### §4.2 — Per-handler config (Zod)

Per locked decision Q2 + item C from STEP 1:

```typescript
const VendorInsuranceRenewalConfigSchema = z.object({
  /** Days-ahead thresholds. Default [60, 30, 14, 7] — insurance
   *  renewal lead time is longer than generic document renewal
   *  (insurer issues → vendor receives → vendor uploads to PMS chain
   *  can take 3-6 weeks); 60-day first warning gives the vendor
   *  enough runway. 30/14/7 mirror slice 1 for operator familiarity. */
  thresholds_days: z
    .array(z.number().int().positive())
    .min(1)
    .default([60, 30, 14, 7]),
  /** Template id for the renewal email. Default
   *  'vendor_insurance_renewal_default'. */
  template_id: z
    .string()
    .default("vendor_insurance_renewal_default"),
});

export type VendorInsuranceRenewalConfig = z.infer<
  typeof VendorInsuranceRenewalConfigSchema
>;
```

**Zod strictness posture** (per slice 4 §G.7 / discipline carry-forward):
plain `z.object({...})` without `.strict()` or `.passthrough()`.
Default behavior strips unknown keys silently. Matches slice 1's
`VendorDocExpiryConfigSchema`, slice 3's `RentChargeGenerationConfigSchema`,
slice 4's `LateFeeApplicationConfigSchema`. Cross-handler `.strict()`
hardening is its own slice (slice 4 §10.7 follow-up).

### §4.3 — Opt-in default (discipline #9)

Per locked decision Q3 + PHASE_7_PLAN.md §0.4 #9 + Q21 +
docs/PHASE_7_SLICE_3_AUDIT.md §G.6 + docs/PHASE_7_SLICE_4_AUDIT.md §G.6:
**explicit opt-in**. No auto-seeded `automations` row at org
provisioning. Partners manually insert a `vendor_insurance_renewal`
row via the (future `/automations` UI; today via direct DB INSERT).

Slice 5 inherits the discipline by reference. NO new
provisioning-side code in slice 5. NO seed-script entry for
`vendor_insurance_renewal`. The handler is **registered** in the
registry but no org has an `automations` row referencing it until
the operator inserts one.

---

## §5 — Side effects scope

### §5.1 — Emails (the slice 5 mechanism) — full template content

Per item B from STEP 1 + slice 1 precedent: slice 5 sends EMAILS via
the existing `sendEmail()` chokepoint. No new email infrastructure —
adds one builder + one EMAIL_TEMPLATE constant inline to
`src/lib/email/templates.ts` per the slice 2 §A.4 / slice 4 patterns
(inline templates rather than per-file directory).

#### Template ID

```typescript
EMAIL_TEMPLATE.vendorInsuranceRenewal = "vendor.insurance_renewal";
```

Stored on `email_log.template` for delivery tracking + dedup keying.

#### Template builder signature

```typescript
export type VendorInsuranceRenewalData = {
  vendorName: string;
  documentName: string;
  expiresOn: string;        // YYYY-MM-DD
  daysUntilExpiry: number;  // matches the threshold that fired
  portalUrl?: string;        // optional — defaults to the PMS portal root
};

export function vendorInsuranceRenewalEmail(
  data: VendorInsuranceRenewalData,
): EmailContent;
```

#### Subject line (varies by threshold)

| Threshold | Subject |
|---|---|
| 60 days | `"Insurance renewal due in 60 days — {vendorName}"` |
| 30 days | `"Insurance renewal due in 30 days — Action required"` |
| 14 days | `"Urgent: Insurance renewal due in 14 days — {vendorName}"` |
| 7 days | `"Final notice: Insurance certificate expires in 7 days"` |

Selection is a small switch on `data.daysUntilExpiry`. For
non-standard thresholds (e.g., partner configures `[45, 20]` — outside
the default set), fallback subject is
`"Insurance renewal due in {daysUntilExpiry} days — {vendorName}"`.

#### Body framing (insurance-specific legal/regulatory copy)

Plain-English paragraphs:

> Hello {vendorName},
>
> Your insurance certificate {documentName} on file with us is set to
> expire on {expiresOn} ({daysUntilExpiry} days from today).
>
> Continued work assignments require valid proof of insurance on
> file. Failure to renew your certificate before the expiration date
> may result in suspension of new work-order assignments. Active
> work orders may continue at the property manager's discretion
> pending updated documentation.
>
> Please request a renewed certificate from your insurer and upload it
> through the vendor portal at {portalUrl}/documents at your earliest
> convenience.
>
> If you have questions about coverage requirements or upload
> instructions, contact your property manager directly.

`{...}` are template variables resolved at render time. The
"suspension of new work-order assignments" language is intentionally
descriptive rather than prescriptive — slice 5 does NOT actually
suspend the vendor (that's #38 auto-suspend, future slice). The copy
sets the expectation; #38 enforces it structurally when shipped.

### §5.2 — Notifications (deferred — Q4 / §G.4)

**No `vendor_insurance_renewal.sent` notification kind in slice 5.**

Rationale (matches slice 1's email-only posture + slice 4 §G.3 +
slice 3 §G.2 patterns):
- Tenant portal bell UI is deferred to Tier 3 — and vendor portal bell
  UI is deferred to a parallel future slice (slice 2 §H.4 follow-up).
- Staff PMs typically don't want a bell ping for every routine
  cascade firing (60-day reminders happen on a predictable cadence).
- Slice 1's `vendor_doc_expiry` handler does not produce notifications;
  slice 5 matches.

`notifications.kind` CHECK constraint stays at slice 2's 6 values
(no extension). No producer call in the handler.

### §5.3 — No tenant-facing or staff-facing surfaces

Slice 5 produces zero in-app notifications, zero tenant-facing emails,
zero staff-facing emails. The only outbound communication is the
vendor renewal email. Operator visibility into runs is via direct
SQL inspection of `automation_runs` (and the slice 2 OWNER-on-failure
notification path if the handler returns `failed > 0`).

### §5.4 — Audit log

The runner writes ONE `automation_logs` row per slice 5 run via the
slice 1 runner's existing per-org summary block (executed/blocked
status; counts in result). No new `audit_logs` actions in slice 5.
Per-email-send details live in `email_log` per the Phase 3 email
infrastructure.

### §5.5 — `email_log` row shape (verbatim from Phase 3 schema)

Each `sendEmail()` call writes ONE row to `email_log` per the Phase 3
chokepoint. Slice 5's rows will have:
- `organization_id` = the org running the cascade
- `to_address` = vendor's resolved recipient email
- `subject` = renewed-cert subject (per threshold)
- `template` = `'vendor.insurance_renewal'`
- `status` = `'sent'` / `'blocked'` / `'failed'` / `'suppressed'`
  (depending on test-mode allowlist, dedup window, Resend response)
- `related_entity_type` = `'vendor_document'`
- `related_entity_id` = the vendor_document.id
- `payload jsonb` = `{ vendor_id, threshold_days, recipient_source }`

---

## §6 — RLS posture

### §6.1 — Existing policies — unchanged

`vendor_documents` carries 4 PERMISSIVE policies from Phase 2 (staff
read/write within org, plus vendor-self read for their own docs).
Slice 5 needs NO changes — the cron runner uses the admin client
(service-role) which bypasses RLS uniformly, same as slices 1/3/4.

### §6.2 — New partial index — no RLS surface

The new `vendor_documents_expires_on_idx` index is a planner
optimization, NOT a row-level access surface. It does not add, modify,
or interact with any RLS policy. Index visibility is controlled by
table-level grants (unchanged); index usage is invisible to RLS-aware
clients (they see the same rows whether the planner used the index or
not).

**Per locked decision item from §0 above + §6 audit-doc-structure
note** — confirming for completeness: the new index introduces
zero new RLS branches. No SECURITY DEFINER helpers needed.

### §6.3 — Service-role bypass paths (for §15.3 inventory)

Slice 5 adds **1 new service-role caller surface**:
- `vendorInsuranceRenewalHandler.run` in
  `src/lib/automation/handlers/vendor-insurance-renewal.ts` — admin
  client SELECT on `vendor_documents` + admin client JOIN-read of
  `vendors` + admin client SELECT/maybeSingle on `vendor_contacts`
  (via `resolveVendorRecipient`) + admin client INSERT/UPDATE on
  `automation_runs`.

No new endpoint (uses slice 1's `/api/cron/automations`). No new
admin-client server action. Single new surface; inventoried alongside
slice 1's `vendor-doc-expiry.ts` (the two share the same service-role
bypass pattern over the same tables).

### §6.4 — Cumulative regression posture

Suites 1-21 (294 assertions) form the binding floor after slice 4.
Slice 5 adds **NO new RLS suite** — every relevant assertion is
already covered:

- Suite 13 (`rls_phase2.sql`) — vendor_documents per-org + per-role
  access matrix (covers the new partial index via existing row-level
  policies; the index is a planner artifact, not a row-access surface)
- Suite 19/20 (`rls_phase7_automations*.sql`) — `automations` +
  `automation_runs` policies (slice 5's automation row + run rows
  inherit these)
- Suite 21 (`rls_phase7_notifications.sql`) — notifications policies
  (slice 5 produces no notifications, so this is unchanged)

**Cumulative floor after slice 5 stays at 21 suites / 294
assertions.** Quiet slice for RLS — same honest signal as slices 3+4
(handlers using admin client + existing tables don't add RLS
surface).

---

## §7 — File inventory

Target: 5-7 files. Ceiling: 10 per Phase 7 §0.4 discipline #8
adjacency rule. Slice 5 ships **5 files** (database.ts unchanged):

| # | Path | Op | Lines (est) | Borderline? |
|---|---|---|---|---|
| 1 | `supabase/migrations/<date>_phase7_slice5_vendor_documents_expires_on_idx.sql` | new | ~25 | no — single CREATE INDEX statement + header comment |
| 2 | `src/lib/automation/handlers/vendor-insurance-renewal.ts` | new | ~220 | no — modeled on slice 1's 212-line handler with insurance scope + new template + threshold defaults |
| 3 | `src/lib/automation/handlers/index.ts` | edit | +2 | no — registry add (import + entry) |
| 4 | `src/lib/email/templates.ts` | edit | +45 | no — `vendorInsuranceRenewalEmail` builder + `EMAIL_TEMPLATE.vendorInsuranceRenewal` const inline, matching slice 1's `vendorDocExpiryEmail` pattern |
| 5 | `docs/PHASE_7_SLICE_5_IMPLEMENTATION_DECISIONS.md` | new | ~150 | no — decisions doc following slice 4 §A-§F shape |

**No `src/lib/types/database.ts` edit** — the slice 5 migration adds
an index, which doesn't change row/insert/update type shapes. No
type-regen needed.

**No new RLS test suite** (§6.4 — cumulative floor unchanged).

**No producer-call-site edits** (§5.2 / §5.3 — no notifications, no
new tenant/staff surface).

**No new UI** (the `/automations` page slice is separate per Q6 of
the Phase 7 audit-walk).

If implementation surfaces a hidden need for additional files,
**stop and resurface scope** — adding files beyond 6 would mean
something in this audit missed reality. The substrate from slices
1+2+3+4 should absorb everything.

---

## §8 — Walk-test rubric

### §8.0 — Pre-walk-test schema verification (Step 0)

Per slice 2 §E.1 discipline gap (carried forward as §F): every
slice's walk-test starts with explicit schema verification + migration
apply.

**Slice 5 specificity**: slice 5 HAS a migration (the partial index).
Step 0 applies it via `npm run db:migrate` AND runs 4 schema probes
PLUS an EXPLAIN ANALYZE probe (per item A — cross-slice index benefit
verification at walk-test scale).

1. **Apply the migration**:
   ```bash
   npm run db:migrate
   ```
   Expected: `apply <date>_phase7_slice5_vendor_documents_expires_on_idx.sql ... ok`.

2. **Verify the index landed**:
   ```sql
   SELECT indexname, indexdef
   FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'vendor_documents'
     AND indexname = 'vendor_documents_expires_on_idx';
   ```
   Expected: one row, indexdef includes
   `... USING btree (organization_id, expires_on) WHERE (expires_on IS NOT NULL)`.

3. **Verify NO new RLS policies introduced**:
   ```sql
   SELECT polname
   FROM pg_policies
   WHERE tablename = 'vendor_documents'
   ORDER BY polname;
   ```
   Expected: same set as Phase 2 (4 policies), no slice 5 additions.

4. **Verify the slice 1 handler still resolves** (`vendor_doc_expiry`
   handler row in `automations` table for Sterling exists and is
   enabled — sanity that the index migration didn't break slice 1's
   substrate):
   ```sql
   SELECT id, automation_type, enabled, schedule_cron
   FROM public.automations
   WHERE organization_id = '21084f5f-f3b1-4cbe-a09a-7afae49c7181'
     AND automation_type = 'vendor_doc_expiry';
   ```
   Expected: one row, `enabled=true`.

5. **EXPLAIN ANALYZE on the slice 5 detection query** (per item A
   cross-slice benefit note + slice 4 §9.2.5 acceptable-contingency
   pattern):
   Seed minimal fixture data first (1-2 insurance docs in Sterling
   matching the threshold dates), then:
   ```sql
   EXPLAIN ANALYZE
   SELECT vd.id, vd.vendor_id, vd.name, vd.expires_on
   FROM public.vendor_documents vd
   WHERE vd.organization_id = '21084f5f-f3b1-4cbe-a09a-7afae49c7181'
     AND vd.document_type = 'insurance'
     AND vd.expires_on IS NOT NULL
     AND vd.expires_on = ANY(ARRAY[
       (CURRENT_DATE + INTERVAL '60 days')::date,
       (CURRENT_DATE + INTERVAL '30 days')::date,
       (CURRENT_DATE + INTERVAL '14 days')::date,
       (CURRENT_DATE + INTERVAL '7 days')::date
     ]);
   ```
   **Expected at Sterling scale (~8 vendor_documents total)**: Seq Scan
   chosen over the new partial index. Acceptable contingency per
   §2.3 cross-slice expectation and slice 4 §9.2.5 precedent. NOT a
   ship-gate fail.
   **At production scale (>1000 vendor_documents per org)**: planner
   should flip to Index Scan on `vendor_documents_expires_on_idx`.
   Slice 5 audit accepts the deferred verification — first
   production partner exercises the path.

If any verification fails, slice 5 stops + investigates before
walk-test scenarios.

### §8.0.5 — Cross-org freeze pre-check (slice 4 §F.4 discipline carry-forward)

Before any walk-test scenario runs, verify that every org touched by
the walk-test has `automation_freeze=false`:

```sql
SELECT id, name, automation_freeze, automation_freeze_at::text
FROM public.organizations
WHERE id IN (
  '21084f5f-f3b1-4cbe-a09a-7afae49c7181',  -- Sterling
  'c865eb60-1f93-4e09-8dc3-c75f754c1d17'   -- Kristophers (if cross-org scenario in scope)
);
```

Expected: `automation_freeze = false` for every row returned. If any
org shows `automation_freeze = true` (likely stale state from a prior
walk-test), STOP. Operator clears via `/settings/automations` UI
manually (NOT via SQL — the UI flow exercises the slice 1 server-action
authorization pattern).

This Step 0.5 directly addresses slice 4 §F.2 #2 + §F.4 — the
cross-slice walk-test discipline that "scenarios that flip safety
primitives should restore them at scenario-end OR the next slice's
setup verifies the state."

### §8.1 — Setup

1. Apply migration per §8.0 step 1; verify index per §8.0 step 2.
2. Confirm `automation_freeze=false` per §8.0.5.
3. **Seed Sterling's `automations` row** for `vendor_insurance_renewal`
   via direct DB INSERT (opt-in per §G.6 — operator manually opts in;
   no auto-seed code):
   ```sql
   INSERT INTO public.automations
     (organization_id, automation_type, name, enabled, schedule_cron, config)
   VALUES (
     '21084f5f-f3b1-4cbe-a09a-7afae49c7181',
     'vendor_insurance_renewal',
     'Vendor insurance renewal cascade — Sterling',
     true,
     '0 6 * * *',
     '{"thresholds_days": [60, 30, 14, 7]}'::jsonb
   )
   RETURNING id;
   ```
   Capture the returned `automation_id` for verification queries.
4. Confirm Sterling has at least 4 vendor_documents in suitable test
   states (insurance docs at varying expires_on dates spanning the
   60/30/14/7 thresholds; one non-insurance doc to verify the
   document_type filter excludes it).

### §8.2 — Scenarios

**Scenario (a) — Cold first run with multiple insurance docs across thresholds**

Seed fixture (4 insurance docs in Sterling expiring at exactly today + 60, 30, 14, 7 days; plus 1 license-type doc expiring at today + 7 days as a negative control):

- Insurance docs at 60/30/14/7 days out → 4 emails expected (one per
  threshold-doc pair)
- License doc at 7 days out → NO email (slice 1's `vendor_doc_expiry`
  handler picks it up; slice 5 handler filters it out at the SQL
  level via `document_type='insurance'`)

Invoke runner. Expected outcomes:
- `runs_attempted += 4` (4 insurance pairs)
- `runs_succeeded += 4` (assuming all 4 vendors have resolvable
  recipients via primary contact or vendor.email)
- `automation_runs` shows 4 rows for the slice 5 automation_id, each
  with `status='ok'` and distinct idempotency keys
- `email_log` shows 4 rows with `template='vendor.insurance_renewal'`
- Subject lines vary per threshold ("60 days", "30 days", "Urgent: 14
  days", "Final notice: 7 days")
- License doc gets NO row in `email_log` from slice 5 (it may or may
  not get a row from slice 1's handler depending on slice 1's state)

**Scenario (b) — Same-day idempotency**

Re-invoke runner immediately. Expected:
- `runs_succeeded += 0` for slice 5
- `runs_skipped += 4` (UNIQUE collision on each idempotency key)
- `email_log` unchanged (0 new rows for `vendor.insurance_renewal`)
- `automation_runs` unchanged (4 rows total for slice 5 — same as
  scenario a end-state)

**Scenario (c) — Next-day inner anti-join**

Simulate "next day" by deleting today's automation_runs rows for the
slice 5 automation_id (matches slice 4 scenario c pattern). Re-invoke
runner. Expected:
- `runs_attempted += 4` (the handler rechecks the targets — but
  today's targets are the same as scenario a's, so same 4 pairs)
- Wait — but the idempotency key includes the threshold (not today's
  date), so re-inserting the same `(doc, threshold)` collides again
- **Correct expected behavior**: `runs_skipped += 4` (UNIQUE collision
  blocks all 4; the inner per-pair idempotency is what prevents
  re-emailing, NOT the outer date)
- `email_log` unchanged

**Note on idempotency shape difference from slice 4**: slice 5's
idempotency key is `vendor_insurance_renewal:{doc_id}:{threshold_days}`
(doc + threshold, no date). This means a doc that crossed the 60-day
threshold yesterday and emailed yesterday CANNOT re-email at the
60-day threshold today (the key is the same). It WILL email at the
30-day threshold when it crosses that future target. This matches
slice 1's vendor_doc_expiry idempotency shape exactly.

**Scenario (d) — Threshold-window in-bounds NOT eligible**

Seed: 1 insurance doc with `expires_on = CURRENT_DATE + INTERVAL '75 days'`
(75 days out — outside the furthest threshold of 60). Invoke runner.
Expected:
- The 75-day doc does NOT appear in `automation_runs` for slice 5
- `email_log` shows no row referencing this doc
- The handler's detection query returns 0 rows for this doc at every
  current target date (75 ≠ any of [60, 30, 14, 7])
- `runs_attempted += 0`; `runs_skipped += 0`; `runs_succeeded += 0`
  (the doc never enters the candidates pool)

This proves the threshold filter at SQL level — analog of slice 4
scenario (d) for grace boundary.

**Scenario (e) — Threshold crossed (60-day boundary)**

Age the scenario (d) doc to exactly 60 days out:
```sql
UPDATE public.vendor_documents
SET expires_on = (CURRENT_DATE + INTERVAL '60 days')::date
WHERE id = '<scenario-d-doc-id>';
```

Delete today's slice 5 automation_runs rows (clear outer block).
Invoke runner. Expected:
- The aged doc NOW enters the candidates pool at the 60-day threshold
- 1 new `automation_runs` row with `idempotency_key='vendor_insurance_renewal:{doc_id}:60'`
- 1 new `email_log` row with the "60 days" subject
- `runs_succeeded += 1`

Proves the boundary-crossing path.

**Scenario (f) — Non-insurance document_type filtered out**

Seed: 1 `document_type='license'` document with `expires_on = CURRENT_DATE + 30 days`. Invoke runner. Expected:
- License doc is NOT in slice 5's candidates (filter excludes
  non-insurance)
- License doc IS in slice 1's `vendor_doc_expiry` candidates (slice 1
  is generic — covers all document_types)
- Verifies the two handlers run in parallel without overlap

**Scenario (g) — Vendor without primary contact AND null vendor.email**

Seed: 1 insurance doc on a vendor whose primary contact has no email
AND whose `vendor.email` is null. Invoke runner. Expected:
- The doc DOES enter candidates pool
- `resolveVendorRecipient` returns null
- `automation_runs` row written with `status='skipped'` and
  `result.reason='no_recipient'`
- `email_log` shows NO row (`sendEmail()` never called)
- Idempotency key still written → next day's run won't re-skip-log
  (matches slice 1 §3.5 edge case)

**Scenario (h) — Org freeze gate**

Flip Sterling's `automation_freeze=true` via the `/settings/automations`
UI. Invoke runner. Expected:
- Slice 5 automation gated at runner-level (`org_gated += 1`)
- No `automation_runs` rows created for slice 5
- No email_log rows
- After flipping freeze back to false and re-invoking: slice 5 runs
  normally

Flip freeze back to FALSE at scenario end (slice 4 §F.4 discipline).

**Scenario (i) — Cross-org isolation (matches slice 4 scenario i pattern)**

Layer A: Kristophers has NO `vendor_insurance_renewal` automation
enabled. Seed 1 insurance doc in Kristophers at 60-day threshold.
Invoke runner. Expected: Kristophers gets 0 emails / 0 runs / 0
candidates pool entries (cron-enumeration isolation — Kristophers's
automation absent from the enumeration).

Layer B: Enable Kristophers's `vendor_insurance_renewal` automation
row. Re-invoke (with Sterling's outer block cleared if needed).
Expected: each org's handler runs scoped to its own
`organization_id`; no cross-org doc bleeds into the other org's
candidates pool.

**Scenario (j) — Cumulative RLS regression**

Run all 21 RLS suites; expected 21/21 / 294/294. No new suite per
§6.4.

### §8.3 — Walk-test sign-off criteria

Slice 5 considered shipped when:
- Step 0 (migration apply + 4 schema probes + EXPLAIN ANALYZE) passes
- Step 0.5 (cross-org freeze pre-check) green
- All 10 §8.2 scenarios pass on dev
- Cumulative RLS regression green (21/21, 294/294)
- At least 2-3 email_log rows manually inspected for subject + body
  rendering correctness (analog of slice 4 §F.5 Addition B amount
  verification)
- `automation_freeze=false` confirmed before and unchanged after the
  walk-test on every org touched (slice 4 §F.4 discipline)

---

## §9 — Risks specific to slice 5

### §9.1 — Carried forward from PHASE_7_PLAN.md §7 + prior slice audits

| Risk | Slice 5 specificity |
|---|---|
| #6 Cron failure modes | Daily cron with per-pair idempotency. Vercel-misses-once is benign — same (doc, threshold) pair re-attempts next day; UNIQUE blocks duplicate sends. |
| #7 Partial-execution state | The handler iterates per-pair; each pair's `automation_runs` row is the unit of progress. Mid-handler crash leaves processed pairs successful and unprocessed pairs unattempted (no `automation_runs` row at all). Next day's run picks them up cleanly. |
| #8 DB lock contention | Per-pair work is small (one SELECT, one resolver lookup, one email). No transaction holds long locks. Not material at any scale. |
| #9 Email rate limits (Resend) | Worst case: 4 emails per vendor doc × N docs × per org. At partner scale (~50 insurance docs per org), one daily run = ~50 emails worst case. Resend tier limits are well above this. Phase 3 email infra has dedup as secondary defense. |
| #10 Slice 10e RLS recursion precedent | Admin client bypasses RLS uniformly. No new junction-mediated chains. §6.2 confirmed no new RLS surface. |
| #11 >25 file slice ceiling | 5 files — comfortable. |
| #12 Service-role bypass paths inventory | 1 new bypass surface; enumerated §6.3. |
| #14 Partner reaction to AI doing something unexpected | N/A — slice 5 has no AI involvement. |

### §9.2 — Newly surfaced during this audit

**§9.2.1 — Wrong-subject-line risk (template fragility)**

Worst case: the subject-line switch in the email template builder has
a bug that picks the wrong threshold's subject. Vendor receives "60
days" subject for a 7-day-warning email. Vendor reputation impact.

**Mitigations**:
- Subject selection is a small `switch(daysUntilExpiry)` — easy to
  walk-test scenario by scenario (per §8.2 scenario a's
  per-threshold verification)
- Walk-test scenario (a) explicitly inspects email_log subjects
- Fallback subject (`"Insurance renewal due in {daysUntilExpiry} days"`)
  is safe even for unexpected threshold values (graceful degrade)

**§9.2.2 — Partner-confused-by-suspension-language risk**

Worst case: the body's "may result in suspension of new work-order
assignments" language is descriptive — slice 5 does not actually
suspend the vendor. A partner reading the email may assume the system
will auto-suspend their vendor, then be surprised when they need to
manually flip vendor_status. Slice 5 sets an expectation that #38
auto-suspend will fulfill structurally; in the gap between slice 5
ship and #38 ship, the partner experience could be confused.

**Mitigations**:
- Document at slice 5 sign-off: "auto-suspend is #38, scheduled for a
  later Tier 2 slice"
- Body language stays descriptive, not promissory ("may result in" not
  "will result in")
- Operator runbook clarifies the gap for partner-facing FAQ

**§9.2.3 — Slice 1 retroactive index benefit verification gap**

The new partial index retroactively benefits slice 1's vendor-doc-expiry
handler. But slice 1's walk-test was complete months ago (2026-05-26)
without the index, and slice 1 has no test that exercises the
index-use path explicitly.

**Mitigations**:
- Walk-test §8.0 step 5 EXPLAIN ANALYZE probes BOTH the slice 5
  detection query AND a slice 1 detection-like query (without the
  `document_type='insurance'` filter) to confirm both handlers' plans
- At Sterling scale: both plans likely Seq Scan (acceptable
  contingency per §9.2.5 precedent); not a ship-gate
- Production scale: production telemetry (Vercel cron logs +
  Postgres slow-query log) will eventually surface whether the index
  is being used; if not, operator can investigate planner-hint
  options (similar to slice 4's `parent_charge_id IS NOT NULL`
  potential hint)

**§9.2.4 — Email template variable injection / XSS-via-vendor-name**

Worst case: a vendor's `name` field contains HTML / template
control characters; rendered into the email body without escaping;
recipient's email client renders unexpected markup or — more
seriously — the unsubscribe-link-like payload.

**Mitigations**:
- The Phase 3 email template builders use plain template literals (no
  Handlebars-style helpers). Existing builders for similar fields
  (`vendorDocExpiryEmail`, `tenantInviteEmail`) have the same
  pattern.
- Email client rendering: HTML email is the dominant format; the
  template should escape vendor_name (which CAN come from
  user-controlled data) for the HTML body. The text body is plain.
- This is a NOT-IDENTIFIED-EARLIER-AND-CARRIED-FORWARD concern that
  applies to ALL Phase 7 email templates. **Surfaced for §10 capture**
  as a cross-cutting hardening candidate.

**§9.2.5 — EXPLAIN ANALYZE planner choice on small seed data (same as slice 4 §9.2.5)**

Worst case: Sterling's 8 vendor_documents are too small for planner
to prefer the new partial index. §8.0 step 5 "verify index is used"
can't confirm cleanly.

**Mitigations**:
- §8.0 step 5 wording: "the plan SHOULD use" not "must use"; not a
  ship-gate fail
- Captured in §2.3 cross-slice expectation
- Production scale will flip the planner — first partner exercises
  the path

---

## §10 — Open questions / future re-triggers (for plan-author future review)

All design decisions are pre-locked via §G. This section catalogs
**future re-trigger conditions** that aren't covered by §G — items
that may surface after slice 5 ships and warrant a future
conversation.

### §10.1 — Auto-suspend on expiry (#38)

**Re-trigger**: scheduled for a later Tier 2 slice per PHASE_7_PLAN.md
§5.1. Slice 5's email body language ("may result in suspension")
sets the expectation that #38 will fulfill. The pair (renewal cascade
+ auto-suspend) becomes operationally cohesive once #38 ships.

### §10.2 — Per-vendor grace overrides

**Re-trigger**: partner with a special-relationship vendor wants a
longer or shorter cascade (e.g., 90/60/30 days for a critical vendor
they're trying to retain through a difficult renewal). Slice 5
config is per-org, not per-vendor.

Defer until partner signal. Adding per-vendor overrides would require
a `vendors.insurance_grace_override` jsonb column OR a join table.
Match slice 4 §G.4 deferral pattern.

### §10.3 — Document-type-specific cascades beyond insurance

**Re-trigger**: partner wants a separate cascade for `'license'`
(business license renewal), `'w9'`, etc. — each with its own email
template and possibly different thresholds.

Pattern: each document_type-specific cascade gets its own handler
file (e.g., `vendor-license-renewal.ts`, `vendor-w9-renewal.ts`).
The handler-per-type pattern matches Q1 locked decision for slice 5.

### §10.4 — UNIQUE constraint on `(vendor_document_id, threshold_days)`

**Re-trigger**: Production Deployment Gate cross. Slice 1+5's
idempotency relies on `automation_runs.idempotency_key UNIQUE` which
is per-automation, not per-vendor_document. A future schema-level
UNIQUE on `(vendor_document_id, automation_type, threshold_days)`
across `automation_runs` rows would be tighter — but adds complexity.

Defer per slice 3+4 §G.5 pattern.

### §10.5 — Email template variable escaping audit (§9.2.4)

**Re-trigger**: a vendor name with unusual characters causes a render
issue OR a security review surfaces XSS-via-template concern.

Cross-cutting concern that applies to all Phase 7 email templates. A
hardening slice should audit every `vendorXxxEmail()` /
`tenantXxxEmail()` builder for HTML escaping. Not slice-5-specific.

### §10.6 — Index planner-hint follow-up

**Re-trigger**: production-scale EXPLAIN ANALYZE shows planner not
picking the new partial index for either slice 1 or slice 5 detection
queries. Add `AND expires_on IS NOT NULL` clause to the handlers'
detection queries as a planner hint (analog of slice 4 §B.1
contingency for the parent_charge_id index).

### §10.7 — Slice 1 `vendor_doc_expiry` index-benefit-verification test

**Re-trigger**: post-production-traffic, audit whether slice 1's
handler is actually using the new index. If not, slice 1's detection
query may need a planner-hint adjustment (parallel to §10.6 for
slice 5).

Captured here so the cross-slice benefit isn't lost-in-the-shuffle.

### §10.8 — Vendor portal bell UI

**Re-trigger**: when the tenant portal bell ships (Tier 3), pair with
a parallel vendor portal bell slice. At that point, slice 5's
notification deferral (Q4 / §G.4) revisits — a
`vendor_insurance_renewal.sent` notification kind would surface in
the vendor's portal bell alongside (or instead of) the email.

### §10.9 — Mid-handler crash sticky `'running'` rows

**Re-trigger**: same as slice 1 §10.6 + slice 3 §10.8 + slice 4 §10.8
— match the deferral. Risk is low; revisit at Phase 7 close if
production telemetry shows stuck rows accumulating.

---

## §E.1 — Migration DDL (verbatim)

**File path**: `supabase/migrations/<YYYYMMDDHHMMSS>_phase7_slice5_vendor_documents_expires_on_idx.sql`

The next available timestamp slot is `20260613000000` (last
migration was `20260612000000_phase7_slice4_rent_charges_parent_charge_id.sql`).
Implementation may bump if a different date is needed for ordering
reasons.

**Verbatim DDL** (per slice 4 §E.1 verbatim-DDL discipline):

```sql
-- ===========================================================================
-- 20260613000000_phase7_slice5_vendor_documents_expires_on_idx.sql
--
-- Phase 7 slice 5 — Insurance Certificate Renewal Cascade.
--
-- Adds a partial composite index on vendor_documents.(organization_id,
-- expires_on) to support efficient threshold-cascade detection queries
-- by both slice 5's vendor_insurance_renewal handler AND slice 1's
-- existing vendor_doc_expiry handler (retroactive benefit — both
-- handlers daily-scan this column shape and currently use the org_id
-- index + post-filter).
--
-- Single delta:
--
--   1. vendor_documents_expires_on_idx — partial index on
--      (organization_id, expires_on) WHERE expires_on IS NOT NULL.
--
--      Composite shape matches the natural lookup: org_id leading
--      (handlers always filter to one org at a time via admin client
--      .eq('organization_id', $1)), then expires_on (the threshold
--      target dates filter).
--
--      Partial predicate (WHERE expires_on IS NOT NULL) — documents
--      without an expiration date are not in scope for either
--      handler (those are non-expiring artifacts like w9s or
--      contracts without renewal). Skipping nulls keeps the index
--      smaller; at production scale a meaningful fraction of rows
--      will have NULL expires_on.
--
-- Partial-index pattern follows slice 4 precedent
-- (rent_charges_parent_charge_id_idx WHERE parent_charge_id IS NOT NULL,
-- per docs/PHASE_7_SLICE_4_AUDIT.md §E.1).
--
-- Cross-slice benefit (per docs/PHASE_7_SLICE_5_AUDIT.md §G):
-- slice 1's vendor_doc_expiry handler (shipped 2026-05-26 in commit
-- ranges around `4b92f0b`) scans the same column shape and benefits
-- retroactively once this index lands. No code change required for
-- slice 1; the planner picks up the new index automatically when
-- selectivity favors it.
--
-- Planner-choice expectation: at Sterling-scale walk-test
-- (~8 vendor_documents total), planner will likely choose Seq Scan
-- over the partial index. Acceptable contingency matching slice 4
-- §9.2.5 + §B.1 pattern. At production scale (hundreds-to-thousands
-- of vendor_documents per partner org), planner should flip to
-- Index Scan on this partial index.
--
-- RLS posture: unchanged. The new index is a planner artifact, not
-- a row-access surface. No new policies needed per audit §6.
-- ===========================================================================

create index if not exists vendor_documents_expires_on_idx
  on public.vendor_documents (organization_id, expires_on)
  where expires_on is not null;
```

---

## §F — Disciplines carry-forward

Slice 5 inherits the following disciplines from prior slices. Citing
rather than re-litigating:

### §F.1 — Phase 7 §0.4 #9 — financial/risky cron handlers default opt-in

**Inherited from**: `PHASE_7_PLAN.md §0.4 #9` (slice 3 audit-walk
2026-05-27 promoted from §G.6 / Q21; slice 4 audit §F.1 carried forward).

**Slice 5 application**: NO auto-seed of the `vendor_insurance_renewal`
automations row at org provisioning. Operator manually inserts per
opt-in. The handler is registered in the registry but no org has an
automations row referencing it until the operator inserts one. Same
pattern as slices 1+3+4.

### §F.2 — Slice 2 §E.1 — migration-apply discipline

**Inherited from**: `docs/PHASE_7_SLICE_2_IMPLEMENTATION_DECISIONS.md §E.1`
+ slice 4 §F.2 — the migration-apply gap where a migration was
committed + pushed but never run against dev, blocking walk-test
until discovered.

**Slice 5 application**: slice 5 HAS a migration (the partial index).
Walk-test Step 0 (§8.0) explicitly applies the migration via
`npm run db:migrate` and verifies the index landed via probe before
proceeding to scenarios. This is a hard gate, not optional.

### §F.3 — Slice 3 §F.2 #1 — cron is GET, not POST

**Inherited from**: `docs/PHASE_7_SLICE_3_IMPLEMENTATION_DECISIONS.md §F.2 #1`
+ slice 4 §F.3 — operator initially used `curl -X POST` and got 405.

**Slice 5 application**: walk-test scenarios explicitly use `GET`
when manual-invoking `/api/cron/automations` for testing. The
`scripts/invoke-runner-once.ts` CLI helper bypasses the HTTPS layer
entirely (no HTTP method to confuse). Both paths exercise the same
handler code.

### §F.4 — Slice 3 §F.2 #2 / slice 4 §F.4 — `automation_freeze` cross-slice freeze pre-check

**Inherited from**: `docs/PHASE_7_SLICE_3_IMPLEMENTATION_DECISIONS.md §F.2 #2`
+ slice 4 §F.4 — cross-slice walk-test state pollution from prior
scenarios leaving `automation_freeze=true` on the wrong org.

**Slice 5 application**: §8.0.5 explicit pre-walk-test step verifies
`automation_freeze=false` on EVERY org touched by the walk-test
(Sterling at minimum; Kristophers if scenario (i) cross-org is in
scope). Hard gate before any scenario runs.

### §F.5 — Slice 3 §F.2 #3 — schema-inspection-first for diagnostic SQL

**Inherited from**: `docs/PHASE_7_SLICE_3_IMPLEMENTATION_DECISIONS.md §F.2 #3`
+ slice 4 §F.5 — diagnostic SQL during walk-test should consult
`information_schema` / `pg_catalog` rather than rely on assistant
memory of column names.

**Slice 5 application**:
- §8.0 Step 0 includes the EXPLAIN ANALYZE probe — a query that
  requires reading the actual pg_indexes shape, not inferring from
  prose
- All Step 0 verification queries use `information_schema` /
  `pg_catalog` introspection rather than relying on assistant memory
- The discipline binds during slice 5 implementation: any diagnostic
  SQL in `docs/PHASE_7_SLICE_5_IMPLEMENTATION_DECISIONS.md` must
  start from a `\d <table>` or `information_schema.columns` lookup,
  not from memory

### §F.6 — Slice 4 §F.4 — audit-commit timing

**Inherited from**: `docs/PHASE_7_SLICE_4_AUDIT.md §F.4` —
slice 4 broke the slice 1/2/3 pattern of committing the audit BEFORE
implementation; the audit document sat untracked through walk-test
and got committed only after sign-off. Documented as a paper-trail
imperfection; slice 5 explicitly reverts.

**Slice 5 application**: this audit document (`docs/PHASE_7_SLICE_5_AUDIT.md`)
MUST be committed as a standalone commit BEFORE implementation begins.
The implementation prompt for slice 5 will include an explicit
"commit the audit before authoring any code" step (or the
audit-author commits-on-write rather than waiting for the
implementation-author's prompt).

### §F.7 — Slice 4 §G.7 — Zod `.strict()` deferral

**Inherited from**: `docs/PHASE_7_SLICE_4_AUDIT.md §G.7` —
slice 4 used plain `z.object({})` matching slice 1+3 precedent;
deferred cross-handler `.strict()` hardening to its own slice.

**Slice 5 application**: matches precedent. Plain `z.object({})` per
§4.2. Cross-handler hardening (now spanning 4 handlers — slice 1+3+4+5)
remains a future cross-cutting slice.

### §F.8 — Phase 7 §0.4 disciplines 1-8 (carry forward unchanged)

The standard Phase 7 disciplines apply without re-listing:
- #1 Audit-first authoring (this document)
- #2 Single-source-of-truth helpers (`resolveVendorRecipient` reused;
  no new resolver per Q6)
- #3 SECURITY DEFINER for junction-mediated chains (N/A — §6.2
  confirms no junction surface)
- #4 Walk-before-push (§8 walk-test gate)
- #5 Cumulative RLS regression (§6.4 — 21/21 floor maintained)
- #6 Service-role bypass paths inventory (§6.3 — 1 new path)
- #7 Pre-flight schema verification (§8.0 — 4 probes + EXPLAIN ANALYZE)
- #8 §13.6 opportunistic adjacency (no scope creep beyond the
  index + handler + registry + template + decisions doc)

---

## §G — Deferral capture + cross-slice index benefit (locked decisions from slice 5 audit-walk 2026-05-27)

Slice 5 decisions were pre-locked before this audit was drafted. §G
captures each lock with rationale, citing slice 1/3/4 §G patterns
where applicable.

### §G.1 — Locked decision Q1 — NEW handler (not config variant of slice 1)

**Resolution**: NEW handler at
`src/lib/automation/handlers/vendor-insurance-renewal.ts`. Distinct
file from slice 1's `vendor-doc-expiry.ts`. Distinct `automation_type`
(`'vendor_insurance_renewal'`), distinct config schema, distinct
email template.

**Rationale**: Path B (config variant of slice 1) creates hidden
coupling — any change to slice 1's handler ripples to slice 5+.
Different email templates per document_type are a real branch in
code, not a config toggle. Each compliance domain (#37, #39, future
#40, #41) deserves its own handler. The shared logic (cron + threshold
cascade + per-pair idempotency keyed on `automation_runs`) is in the
slice 1 substrate (runner module + `AutomationHandler` interface +
`resolveVendorRecipient` helper), not in the handler bodies.

**Audit gap closed**: §3.1 + §3.2.

### §G.2 — Locked decision Q2 — Default thresholds [60, 30, 14, 7]

**Resolution**: `thresholds_days` default `[60, 30, 14, 7]` days.

**Rationale**: insurance renewal lead times are longer than generic
document renewals — insurer-issued cert → vendor receives → vendor
uploads to PMS chain can take 3-6 weeks. The 60-day first warning
gives the vendor enough runway to start the renewal process; subsequent
warnings at 30/14/7 mirror slice 1 for operator familiarity.
Config-overridable via Zod default.

**Audit gap closed**: §3.3 + §4.2 + §10.2 (per-vendor override
deferred).

### §G.3 — Locked decision Q3 — Opt-in default (inherited from §0.4 #9)

**Resolution**: explicit opt-in. NO auto-seed at org provisioning.
Operator manually opts each org in via direct DB INSERT (or via the
future `/automations` UI when that slice ships).

**Rationale**: inherits PHASE_7_PLAN.md §0.4 #9 / Q21 / slice 3 §G.6
/ slice 4 §G.6 — vendor-facing cron handlers carry partner-reputation
risk (a runaway loop sending emails to vendors damages trust). Explicit
opt-in is the right friction.

**Audit gap closed**: §4.3 + §F.1.

### §G.4 — Locked decision Q4 — `vendor_insurance_renewal.sent` notification (deferred)

**Resolution**: DEFER. No new `notifications.kind` value. Email-only
posture, matching slice 1's email-only handler + slice 3 §G.2 /
slice 4 §G.3 deferral patterns.

**Rationale**:
- Vendor portal bell UI is a parallel future slice (slice 2 §H.4
  follow-up) — the producer would write rows with no UI to display
  them
- Staff PM bell would create noise for routine cascade firings
- Slice 1's `vendor_doc_expiry` handler does not produce notifications;
  slice 5 matches for cross-handler consistency

`notifications.kind` CHECK constraint stays at slice 2's 6 values
(no extension). No producer call in the handler.

**Audit gap closed**: §5.2 + §10.8 (vendor portal bell trigger).

### §G.5 — Locked decision Q5 — Partial index on `vendor_documents.(organization_id, expires_on)`

**Resolution**: ADD INDEX in slice 5's migration. Verbatim DDL in
§E.1.

**Rationale**:
- Slice 5 is the second handler to scan `vendor_documents.expires_on`
  (slice 1 was the first). Production-scale data with two daily
  cron handlers scanning the same column without an index is the
  kind of compounding-cost mistake that's cheap to prevent now and
  expensive to retrofit later.
- Partial predicate `WHERE expires_on IS NOT NULL` keeps the index
  smaller (Phase 4 §G.5 pattern — match slice 4's
  `rent_charges_parent_charge_id_idx WHERE parent_charge_id IS NOT NULL`)
- Slice 1 retroactively benefits without any code change — the
  planner picks up the new index when selectivity favors it.

**Cross-slice benefit (per item A from STEP 1)** — captured in §2.3
and §9.2.3:
- Slice 1's `vendor_doc_expiry` handler benefits retroactively
- At Sterling scale: both handlers' plans likely Seq Scan (acceptable
  contingency per slice 4 §9.2.5 pattern); not a ship-gate
- At production scale: both handlers' plans should flip to Index Scan
- Walk-test §8.0 step 5 EXPLAIN ANALYZE probes both handlers'
  detection queries to document the Sterling-scale state

**Audit gap closed**: §2.3 verbatim DDL in §E.1 + §9.2.3 + §10.6/§10.7
follow-up triggers.

### §G.6 — Locked decision Q6 — Reuse `resolveVendorRecipient` verbatim

**Resolution**: REUSE the slice 1 helper at
`src/lib/automation/recipients/vendor.ts` verbatim. No new resolver.

**Rationale**:
- Slice 1 established `resolveVendorRecipient` as the
  single-source-of-truth (per §0.4 #2) for vendor recipient resolution
- Slice 5's vendor doc has the same vendor_id structure, so the same
  resolver returns the same chain (primary contact → vendor.email → null)
- Diverging resolvers per handler is the kind of drift that creates
  surprising partner-facing inconsistencies (one cascade emails the
  primary contact; another emails vendor.email even when contact
  exists)

If insurance-specific recipient logic is needed later (e.g., escalate
to PM on null), it goes in a future-slice update to the shared resolver
(potentially as a parameter), NOT as a slice-5-only resolver.

**Audit gap closed**: §3.3 step 4 + §F.8 #2.

### §G.7 — Cross-slice index benefit (NOT a decision — a captured side effect)

**Captured note** (not a locked decision; documents the §G.5 side effect):

Slice 5's new partial index `vendor_documents_expires_on_idx`
**retroactively benefits slice 1's `vendor_doc_expiry` handler**.
Slice 1 shipped 2026-05-26 without any index on `expires_on`; the
detection query has been Seq Scan + post-filter since. After slice 5's
migration applies, BOTH handlers become eligible to plan against the
new index.

This is intentional cross-slice scope expansion:
- Slice 5's primary purpose is the insurance renewal cascade
- The index serves slice 5 AND happens to serve slice 1 with zero
  marginal code work
- The alternative (waiting for a partner-scale incident to surface
  slice 1's index gap, then adding the index in a future slice)
  would be a worse use of substrate-payoff principle

**Walk-test §8.0 step 5** explicitly probes BOTH handlers' detection
queries via EXPLAIN ANALYZE to document the Sterling-scale state
(both Seq Scan acceptable per §9.2.5).

**Future re-trigger §10.7** is the production-scale verification that
the index is actually used by slice 1. If not, slice 1 may need a
planner-hint adjustment in a future maintenance slice.

---

**AUDIT STATUS**: COMPLETE. 10 sections + §E.1 verbatim DDL + §F
discipline carry-forward (8 disciplines cited) + §G deferral
capture (6 resolutions + 1 cross-slice index benefit note per locked
decisions); 1 migration (partial composite index); 1 new handler
(modeled on slice 1's 212-line shape); 1 registry edit; 1 email
template builder added inline; 5 files total; no new RLS surface;
cumulative floor stays at 21 suites / 294 assertions; 10 walk-test
scenarios incl. Step 0 4 probes + EXPLAIN ANALYZE + Step 0.5
cross-org freeze pre-check + threshold-boundary + non-insurance-filter
+ no-recipient + org-freeze + cross-org isolation Layers A+B; 5 new
risks surfaced; 9 future re-triggers documented in §10 but no open
questions to plan-author (all decisions pre-locked).

Slice 5 audit ready for implementation. Decisions binding per §G.

**STATUS: ready for implementation.**

**Slice 5 audit-commit discipline reminder**: this document MUST be
committed as a standalone commit BEFORE any implementation commits
begin, per §F.6 / slice 4 §F.4.
