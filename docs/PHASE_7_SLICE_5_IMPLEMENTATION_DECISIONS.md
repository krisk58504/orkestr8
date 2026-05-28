# Phase 7 Slice 5 — Implementation Decisions

> Decisions made during slice 5 implementation. The audit
> (`docs/PHASE_7_SLICE_5_AUDIT.md`, committed at `c57da82` + polish
> at `b45ed36`) and its §G locked decisions are the source of truth;
> this document records implementation-time judgment calls and
> deviations.
>
> Slice 5 was pre-locked (Q1-Q6 resolved before audit drafting + items
> A-H captured + audit-polish (a)/(b) applied before implementation
> began). The audit-commit-BEFORE-implementation discipline carried
> forward from slice 4 §F.4 was honored — `c57da82` audit + `b45ed36`
> polish landed before any implementation file commit. This document
> is correspondingly short — most implementation paths matched the
> audit verbatim.

---

## A — Audit deviations

### A.1 — Detection query: single PostgREST query (audit §3.3 verbatim)

**Audit §3.3** sketched the detection as a PostgREST query embedding
the vendors join, filtered on
`organization_id = $1 AND document_type = 'insurance' AND expires_on = ANY($2)`.

**Implementation**: matches exactly. Single supabase-js call:

```typescript
const { data: docs, error: docsError } = await admin
  .from("vendor_documents")
  .select("id, vendor_id, name, expires_on, vendors!inner(name, email)")
  .eq("organization_id", params.organizationId)
  .eq("document_type", "insurance")
  .in("expires_on", targetDateStrings);
```

No deviation. Unlike slice 4's anti-join (which had no clean
PostgREST shape and was split into two queries per slice 4 §A.1),
slice 5's detection is a positive filter (`= ANY(...)`) that
PostgREST handles natively via `.in()`.

### A.2 — Document column selection — omit `document_type`

**Audit §3.3** step 3 sample SQL listed `document_type` in the
SELECT projection. **Implementation** drops it from the projection
because the WHERE clause already pins it to `'insurance'` — the
handler doesn't need to read it back per-row. Smaller payload, no
behavioral change.

The slice 1 handler DOES select `document_type` because its email
template renders it as a field row. Slice 5's template (per audit
§5.1) doesn't render the document type — the subject + body already
say "insurance" — so the column is unused.

No deviation in behavior; a small projection optimization the audit
didn't anticipate but it doesn't conflict with anything in §5.1.

### A.3 — `portalUrl` default fallback in the email builder

**Audit §5.1** specified `portalUrl?: string` as optional with the
note "defaults to the PMS portal root." The audit did not pin the
exact default URL. **Implementation** uses
`"https://app.orkestr8.com"` as the default — matches the brand
constant `BRAND = "Orkestr8"` already in `src/lib/email/templates.ts`
and aligns with the existing CTA URL conventions in the
`tenantInviteEmail` + `tenantMessageReceivedEmail` builders (those
take `acceptUrl` / `conversationUrl` from callers; slice 5's
handler does not pass `portalUrl`, so the builder default kicks in).

The handler does not yet wire a real portal URL into the call site
(slice 5 §3.3 step 4 in the audit shows the call without `portalUrl`).
This means production emails will render the
`https://app.orkestr8.com/documents` default link. If the actual
production portal URL differs (e.g., `pms.orkestr8.com`), the operator
either:
1. Updates the `BRAND`-adjacent default in
   `vendorInsuranceRenewalEmail()` directly, OR
2. Threads a config value through `automations.config.portal_url` and
   passes it from the handler

Option 2 is the cleaner future path; option 1 is acceptable until
the real production URL is settled. Captured as a §10-class future
re-trigger.

### A.4 — Email builder inline in `templates.ts` (matches existing pattern)

**Audit §5.1** said "adds one builder + one EMAIL_TEMPLATE constant
inline to `src/lib/email/templates.ts`." **Implementation** does
exactly this — `vendorInsuranceRenewalEmail()` lives at the bottom of
`templates.ts` adjacent to `vendorDocExpiryEmail()`, and
`EMAIL_TEMPLATE.vendorInsuranceRenewal = "vendor.insurance_renewal"`
joins the existing const map.

No deviation.

### A.5 — Subject-line switch with default fallback

**Audit §5.1** specified per-threshold subject lines for 60 / 30 /
14 / 7 + a fallback for non-standard thresholds. **Implementation**
extracts the switch to a small named helper
`vendorInsuranceRenewalSubject(daysUntilExpiry, vendorName)` rather
than inlining it in the builder body — same logic, slightly cleaner
to read. No behavioral change.

---

## B — Walk-test clarifications

### B.1 — EXPLAIN ANALYZE probe (§8.0 step 5)

The audit §8.0 step 5 EXPLAIN ANALYZE probe targets the
`vendor_documents` detection shape (single PostgREST query equivalent).
Implementation matches the audit's projection exactly:

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

Note: the audit's projection includes `vd.vendor_id, vd.name` for
parity with the handler's actual SELECT. Implementation §A.2 dropped
`document_type` from the projection — the EXPLAIN probe should too
(already does — the audit didn't include `document_type` in step 5's
SELECT either).

Expected at Sterling scale: Seq Scan over the partial index
(acceptable contingency per audit §9.2.5 — matches slice 4 §B.1
precedent). NOT a ship-gate.

### B.2 — Cross-slice EXPLAIN — verify slice 1's vendor_doc_expiry plan

Per audit §G.7 + §10.7 future re-trigger, the new partial index also
benefits slice 1's `vendor_doc_expiry` detection query. Walk-test
should ALSO run an EXPLAIN ANALYZE on the slice 1 detection shape
(same `vendor_documents` table, but WITHOUT the
`document_type='insurance'` filter):

```sql
EXPLAIN ANALYZE
SELECT vd.id, vd.vendor_id, vd.name, vd.expires_on, vd.document_type
FROM public.vendor_documents vd
WHERE vd.organization_id = '21084f5f-f3b1-4cbe-a09a-7afae49c7181'
  AND vd.expires_on IS NOT NULL
  AND vd.expires_on = ANY(ARRAY[
    (CURRENT_DATE + INTERVAL '30 days')::date,
    (CURRENT_DATE + INTERVAL '14 days')::date,
    (CURRENT_DATE + INTERVAL '7 days')::date
  ]);
```

Captures whether the cross-slice retroactive benefit (§G.7) actually
materializes at Sterling scale. Expected: same Seq Scan contingency
as slice 5's probe. Production-scale flip is the deferred bet.

### B.3 — Walk-test fixture seed step (per §F.1 / §8.1 step 4)

Audit §8.1 step 4 requires "at least 4 vendor_documents in suitable
test states" + "one non-insurance doc to verify the document_type
filter excludes it." Concrete seed shape (implementation note;
operator can adapt vendor IDs):

```sql
-- Seed scenario (a) fixture — 4 insurance docs at 60/30/14/7 + 1
-- license doc at 7-day mark (negative control).
INSERT INTO public.vendor_documents
  (organization_id, vendor_id, document_type, name, expires_on)
VALUES
  ('21084f5f-...', '<vendor-1-id>', 'insurance',  'Liability cert',  (CURRENT_DATE + INTERVAL '60 days')::date),
  ('21084f5f-...', '<vendor-2-id>', 'insurance',  'Workers comp',    (CURRENT_DATE + INTERVAL '30 days')::date),
  ('21084f5f-...', '<vendor-3-id>', 'insurance',  'Auto policy',     (CURRENT_DATE + INTERVAL '14 days')::date),
  ('21084f5f-...', '<vendor-4-id>', 'insurance',  'Umbrella policy', (CURRENT_DATE + INTERVAL '7 days')::date),
  ('21084f5f-...', '<vendor-5-id>', 'license',    'Business license',(CURRENT_DATE + INTERVAL '7 days')::date);
```

The `<vendor-N-id>` placeholders must reference existing rows in
`public.vendors` for the org (FK constraint). Vendor 5 in the
negative-control row should have a resolvable recipient — the test
verifies slice 5 SKIPS this row via the `document_type='insurance'`
filter, not via no-recipient.

---

## C — Substrate verification (Step 0)

Walk-test Step 0 (§8.0) probes confirmed during pre-implementation
audit-walk inventory:

| Element | Probe verdict | Source |
|---|---|---|
| `vendor_document_type` enum has `'insurance'` | confirmed | Phase 2 migration `20260519000500_vendor_records.sql` |
| `vendor_documents.expires_on` is `date` | confirmed | same migration |
| `vendor_documents.vendor_id` FK with `ON DELETE CASCADE` | confirmed | same migration |
| Slice 1's `vendor_documents_organization_id_idx` exists | confirmed | same migration |
| `automations.automation_type` unconstrained free text | confirmed | slice 1 substrate Q10 |
| Slice 1 handler `vendor_doc_expiry` still registered | confirmed | `src/lib/automation/handlers/index.ts` |
| `vendor_documents_expires_on_idx` does NOT exist pre-slice-5 | confirmed via pg_indexes inspection | this slice adds it |

No pre-implementation gaps. The implementation can proceed without
substrate changes beyond the single new index.

---

## D — Opt-in default (§F.1 / §G.6 honored)

Per Phase 7 §0.4 #9 + audit §G.6 + slice 4 §D precedent:
- NO auto-seed of `vendor_insurance_renewal` automation row at
  org provisioning
- Slice 5 adds NO entry to any seed script / provisioning code
- The handler is **registered** in the registry but no org has an
  `automations` row referencing it until the operator inserts one

Walk-test §8.1 step 3 INSERT (Sterling-only) is the manual opt-in.
For Kristophers cross-org scenario (i) Layer B, a second INSERT is
required for that org.

---

## E — Files NOT in slice 5 (deferred per §G + audit §5)

Per audit §G.4 / §G.5 / §G.6 + §10 future re-triggers, slice 5 does
NOT include:

- `notifications.kind = 'vendor_insurance_renewal.sent'` producer or
  CHECK extension (deferred per §G.4 — paired with future vendor
  portal bell UI slice)
- Auto-suspend on expiry — that's #38, separate future Tier 2 slice
- Per-vendor grace overrides — defer per §10.2 until partner signal
- Document-type-specific cascades for license / w9 / contract — each
  is its own future handler per §10.3
- UNIQUE on `(vendor_document_id, threshold_days)` — substrate UNIQUE
  on `(automation_id, idempotency_key)` covers structurally per §10.4
- `automations` table seed migration (no auto-enable per §D)
- `src/lib/types/database.ts` type-regen (the new index doesn't
  change row/insert/update shapes per audit §7)
- New RLS suite (cumulative floor stays at 21 / 294 per audit §6.4)
- Producer-call-site edits in any domain action file (cron-only)
- New `/automations` UI work (that's a separate Phase 7 UI slice)

---

## F — Commit boundaries

Slice 5 implementation commits split per slice 4 precedent (two
commits — decisions doc separate from code so reviewers can read the
decisions before reviewing the diff):

1. **Audit commit** — `c57da82` (this is the slice 4 §F.4 audit-
   commit-before-implementation discipline, honored)
2. **Audit polish commit** — `b45ed36` (email wording + scenario c
   naming; both refinements raised during plan-author review)
3. **Decisions doc commit** — "Phase 7 slice 5 — implementation
   decisions and notes" (this doc only)
4. **Implementation commit** — "Phase 7 slice 5 — implementation
   (insurance renewal handler + vendor_documents expires_on partial
   index)" — migration + handler + email template + registry

Migration is NOT applied as part of authoring. Walk-test §8.0 step 1
applies it via `npm run db:migrate` after authoring + commits are
green.

---

## G — Walk-test handoff

The handler is implemented and tsc-clean + lint-clean. Walk-test
prerequisites:

1. Apply migration: `npm run db:migrate` per audit §8.0 step 1
2. Verify the index landed (audit §8.0 step 2 query)
3. Verify the slice 1 substrate is still healthy (§8.0 steps 3-4)
4. EXPLAIN ANALYZE both slice 5 + slice 1 detection queries (§8.0
   step 5 + this doc §B.2)
5. Cross-org freeze pre-check (§8.0.5)
6. Seed Sterling's `automations` row (§8.1 step 3)
7. Seed walk-test fixtures (§B.3 above for concrete shape)
8. Run scenarios (a)-(j) per audit §8.2
9. Cumulative RLS regression (§8.2 scenario j) — 21/21 / 294/294

Sign-off criteria per audit §8.3 — when all met, append a sign-off
section (§F.1-§F.6) to this document following slice 4's structure.

---

## §F — Slice 5 official sign-off

### §F.1 — Walk-test scenarios

All ship-gate scenarios from audit §8.0 + §8.2 verified on dev
(Sterling Property Group seed + Kristophers Apartments for cross-org
isolation). Each scenario was run as discrete tsx invocations against
the dev pooler; per-scenario verbatim outcomes are in the session
transcript.

| # | Scenario | Result | Note |
|---|---|---|---|
| Step 0 | Migration apply + 4 schema probes + EXPLAIN ANALYZE + freeze pre-check + RLS baseline | PASS | `20260613000000_..._vendor_documents_expires_on_idx.sql` applied; partial index `(organization_id, expires_on) WHERE expires_on IS NOT NULL` verified; 2 vendor_documents policies (erratum §F.3); slice 1 `vendor_doc_expiry` automation intact; both orgs `automation_freeze=false`; 21/21 RLS baseline |
| (a) | Cold first run with 4-threshold cascade | PASS | 4 insurance docs at 60/30/14/7 → 4 `automation_runs` rows all `status='ok'`, 4 `email_log` rows with 4 distinct per-threshold subjects matching audit §5.1 verbatim; 1 license doc negative-control filtered out by `document_type='insurance'` (slice 1 picked it up under `vendor_document.expiring` — parallel-handler confirmation) |
| (b) | Same-day idempotency | PASS | Immediate re-invoke produced 0 new runs / 0 new emails; UNIQUE on `(automation_id, idempotency_key)` blocked all 4 re-INSERTs; original 4 `ok` rows preserved verbatim (timestamps + result jsonb untouched) |
| (c) | Cross-threshold cascade + idempotency model | PASS | Case A (60-day doc → 180 days out) produced NO new row — filtered at SQL level. Case B (14-day doc → 30-day target) produced a NEW `:30` run row distinct from the original `:14` row — proving the `(doc, threshold)` keying allows a legitimate cross-threshold re-fire. Surfaced the dedup→`failed` mapping (§F.2 #1): Case B's send was `suppressed` by the 10-min email dedup window, which the handler recorded as `status='failed'` |
| (d) | Threshold-window out-of-bounds NOT eligible | PASS | 75-day insurance doc → 0 `automation_runs` rows (never entered the per-pair loop); `.in("expires_on", targetDateStrings)` excluded it at the org-scoped candidate query; 0 emails across ALL templates |
| (e) | Threshold-boundary crossing (eligible) | PASS | Aged the scenario (d) 75-day doc to exactly the 60-day target → entered candidates, claimed the open `:60` slot, `status='ok'`, `email_status='sent'`, subject "Insurance renewal due in 60 days — Lone Star Plumbing"; runs 5→6, emails 5→6 |
| (f) | Non-insurance document_type filtered out | PASS | w9 doc at the 30-day target (clean threshold match) → 0 slice 5 runs (the `document_type='insurance'` filter excluded it); slice 1's generic handler DID email it (`vendor_document.expiring`, "Reminder: w9 expires in 30 days") — confirms the two handlers partition document types correctly |
| (g) | No resolvable recipient (skip path) | PASS | Insurance doc on a vendor with `email=NULL` + 0 `vendor_contacts` → run row reserved (runs 6→7) then updated to `status='skipped'`, `result.reason='no_recipient'`, no `error_message`; `sendEmail()` never called → 0 `email_log` rows of any template. The key is reserved so daily re-runs don't re-log-skip. **Distinct from the freeze gate** (handler ran and wrote a skip row) **and from suppression** (no send attempted at all) |
| (h) | Org freeze gate | PASS | Freeze ON → `org_gated=4`, `attempted=0` (runner short-circuits BEFORE handler dispatch — the eligible 14-day doc got NO run row of any kind, distinct from the (g) skip path). Freeze OFF → the previously-gated doc fired cleanly (`:14`, `status='ok'`, runs 7→8). **Sterling left `automation_freeze=false` at scenario end (V5)** — slice 4 §F.4 discipline honored, no stale state into (i) |
| (i) Layer A | Cross-org: Kristophers without enabled automation | PASS | Kristophers seeded an eligible 30-day insurance doc but had 0 slice 5 automations → `automations_seen=4` (only Sterling's), 0 Kristophers runs, 0 emails (any template); Sterling unchanged at 8. Cron-enumeration isolation |
| (i) Layer B | Cross-org: both orgs enabled, handler SQL scoping | PASS | Enabled Kristophers's automation → `automations_seen=5`. Kristophers doc's run row attributed to **Kristophers's** automation (`organization_id=c865eb60`), run_count=1. **B.3.V3: Sterling created 0 runs for the Kristophers doc.** **B.3.V4: 100% org-match — every slice 5 run row references a vendor_document in the same org as the run** (Sterling 8/8, Kristophers 1/1). Proves `.eq("organization_id", params.organizationId)` scoping. The Kristophers run landed `status='failed'` because its vendor email `test-vendor@example.com` is off the test allowlist — an allowlist-gate outcome (§F.2 #1), not an isolation defect |
| (j) | Cumulative RLS regression | PASS | 21 / 21 suites, 294 / 294 cumulative assertions; no slice 5 RLS suite added per audit §6.2 (index-only migration, no row-access surface) |

### §F.2 — Observations + follow-ups (NOT ship-blockers)

No defects in slice 5 production code. Three observations, all
recommended for a single dedicated follow-up slice (see #3):

**1. Non-delivery → `status='failed'` conflation**

The handler maps **every** non-`delivered` `sendEmail()` outcome to
`automation_runs.status='failed'` (the `else` branch at
`vendor-insurance-renewal.ts:179-195`). `sendEmail()` can return
`delivered=false` for four distinct reasons (`suppressed`,
`blocked`, `failed`, plus the fail-closed `blocked`-on-unverifiable
dedup), but the handler collapses all of them to `failed`.

Observed **3×** during walk-test:
- Scenario (c) Case B — dedup-`suppressed` (an equivalent email was
  sent <10 min earlier for the same `(to, template, related_entity_id)`)
- Scenario (i) Layer B — allowlist-`blocked` (Kristophers vendor email
  off the test allowlist)
- (the same dedup path also drove the runner's `failed=2` in scenario c
  when slice 1's parallel handler hit the same suppression on the
  cross-threshold doc)

**Production impact**: dedup-suppression **WILL** occur in production
— rapid cron re-runs, cross-threshold expires_on moves, or any
genuine re-send within the 10-minute window all produce
`suppressed`. Those will surface as `failed` runs in operator
dashboards, creating false-alarm noise. (Allowlist-block is
test-mode-only and won't occur in production.)

**Recommended fix**: granular run-status mapping — `suppressed` and
`blocked` as distinct `automation_runs.status` values rather than
`failed`. Likely requires extending the `automation_runs.status`
CHECK/enum. **Affects both slice 1 (`vendor-doc-expiry.ts`) and
slice 5 handlers** — they share the identical `if (sendResult.delivered)
… else { status:'failed' }` shape.

**2. Slice 1 / slice 5 double-email on insurance docs**

Both handlers scan `vendor_documents` and both include
`document_type='insurance'` docs in their candidate pools (slice 1 is
generic — no document_type filter; slice 5 is insurance-only). Their
threshold cascades overlap: slice 1 defaults `[30, 14, 7]`, slice 5
defaults `[60, 30, 14, 7]` — so 30/14/7 are shared.

For an org running **both** automations, an insurance doc at a shared
threshold generates **two** emails: one `vendor_document.expiring`
(slice 1) and one `vendor.insurance_renewal` (slice 5). The email
dedup does NOT suppress the second because the dedup key includes
`template`, and the two templates differ — so neither collapses the
other.

Confirmed structurally in scenario (f) (the w9 doc showed slice 1's
parallel pickup) and scenario (h) (the 14-day insurance doc produced
`succeeded=2` — one per handler).

By-design per audit §3.4 (handlers partition by
`(automation_type, idempotency_key)` — their run-row keys never
collide), but a **real-world coordination question**: a vendor would
receive two differently-worded renewal emails for the same cert.

**Recommended fix**: slice 1 gains a `document_type` exclusion config
(e.g., `exclude_document_types: ['insurance']`) so insurance can be
delegated to slice 5 when both are opted in. No org runs both today
(slice 5 is brand-new opt-in), so there's production runway.

**3. Both follow-ups bundle into a single "slice 1 hardening" slice**

Items (1) and (2) are both slice-1-handler-centric, both surfaced
during slice 5 walk-test, and both have production runway (slice 5 is
brand-new opt-in; no org runs both handlers yet). Recommend a
**dedicated follow-up slice** with its own audit + walk-test rather
than patching either into slice 5:
- (1) the status-mapping change touches the substrate
  (`automation_runs.status` domain) + both handlers — substrate
  changes deserve their own audit
- (2) the document_type exclusion config touches slice 1's schema +
  handler — also out of slice 5's scope
- Bundling avoids two separate small slices that both reopen the
  vendor-document handlers

### §F.3 — Audit erratum (already committed)

Commit `637cd93` corrected audit §8.0 step 3: `vendor_documents` has
**2 policies** (`vendor_documents_select` + `vendor_documents_write`,
per `supabase/migrations/20260519000800_phase2_rls.sql:70+79`), not
the "4 policies" the audit originally stated. The miscount was an
authoring error during slice 5 audit drafting; caught and corrected
after Step 0.3 walk-test verification. Not a regression — slice 5
added 0 policies; the count went 2 → 2.

### §F.4 — Audit-commit timing (discipline restored)

Slice 5 committed its audit (`c57da82`) **and** the audit polish
(`b45ed36`) BEFORE any implementation commits began — restoring the
slice 1/2/3 pre-implementation audit-commit pattern that slice 4 §F.4
documented breaking (slice 4's audit was forward-committed as
`63f5df7` after implementation + walk-test had pushed). The slice 4
anomaly was a one-time session-flow miss; slice 5 reverted to the
correct ordering. Commit sequence:
1. `c57da82` — audit (standalone, pre-implementation)
2. `b45ed36` — audit polish (email wording + scenario c naming)
3. `b1431bb` — implementation decisions doc
4. `918382a` — implementation (migration + handler + template + registry)
5. `0ca1790` — slice 1 variable-shadow back-port (cleanup discovered during review)
6. `637cd93` — audit erratum (2 policies, §F.3)

### §F.5 — Walk-test fixture cleanup

**Cleanup transaction pending — see Part 2.**

Walk-test seeded fixtures across both orgs that are NOT yet removed:
- Sterling: ~8 insurance docs (scenarios a/c/d/e/h) + 1 license doc
  (a) + 1 w9 doc (f) + 1 no-email vendor + its insurance doc (g) +
  the slice 5 `automations` row + ~8 `automation_runs` rows + ~6
  `email_log` rows
- Kristophers: 1 insurance doc (i) + the slice 5 `automations` row +
  1 `automation_runs` row

The actual deleted-row counts + the Sterling-opt-in-row-persistence
decision (see §F.6) get filled in here after Part 2 runs.

### §F.6 — Production readiness

**Yes — production-ready.**

- First scheduled run: next `0 6 * * *` UTC cron tick after this push
  reaches Vercel production.
- **Opt-in posture honored** (§0.4 #9 / audit §G.6): the handler is
  registered in the registry but no org gets an auto-seeded
  `automations` row. Partners explicitly opt in per-org.
- **Walk-test automation-row decision (Part 2)**: Sterling's slice 5
  `automations` row (`0ca066de-...`) and Kristophers's
  (`292e882b-...`) were both **created by walk-test**, NOT by an
  operator opting in. Unlike slice 4 — where Sterling's
  `late_fee_application` row was an intentional production opt-in
  preserved through cleanup — slice 5's rows are walk-test artifacts.
  **Recommendation: clean BOTH** in Part 2 (delete both
  `vendor_insurance_renewal` automations + their runs), leaving slice
  5 in pure opt-in state with zero enabled orgs. An operator then
  explicitly opts in whichever orgs should run the cascade. This
  keeps the "no org runs both handlers yet" runway intact for the
  §F.2 #3 follow-up slice. (Final decision deferred to plan-author in
  Part 2.)
- Kristophers and any other org have no `vendor_insurance_renewal`
  enabled after cleanup — they remain on the opt-in path.
