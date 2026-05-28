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

> **Status**: not yet signed off. This section gets populated
> post-walk-test with the same shape as slice 4 §F.1-§F.6 (walk-test
> scenarios, defects, ship-gate posture, audit-commit timing
> retrospective, fixture cleanup, production readiness).
