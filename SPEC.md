# PMS-Build — Project Specification

> **Project 2.** A separate, greenfield AI-first Multifamily Property Management SaaS platform.
> This is NOT Project 1 (Orkestra / `platform`), which is frozen.

---

## Critical safety and production gates

The platform can be built aggressively and autonomously in development, but the
following areas must require explicit human review and approval before being
used with real data, real users, or production systems.

### 1. Row Level Security Gate

All Supabase RLS policies must be generated, tested, and documented, but they
must not be considered production-safe until manually reviewed. This is required
because the platform is multi-tenant and stores tenant PII, lease records,
payment records, vendor documents, and owner financial data.

Required:

- Every table must include `organization_id` where applicable.
- Every RLS policy must enforce organization-level isolation.
- Portal users must only access records they are explicitly allowed to see.
- Tenant users can only access their own lease, unit, documents, messages,
  payments, and maintenance records.
- Vendor users can only access jobs, invoices, messages, and documents assigned
  to their vendor company.
- Owner/investor users can only access properties linked to their ownership
  permissions.
- Create RLS test cases for cross-organization access denial.
- Create a `SECURITY_REVIEW.md` file documenting every policy.

### 2. AI / Automation Control Gate

AI and automations must default to safe mode.

Default AI mode: **disabled or draft-only.**

Do not allow AI to:

- auto-send messages
- auto-dispatch vendors
- approve invoices
- modify lease/payment records
- escalate real tenant issues
- trigger external notifications

unless the organization has explicitly enabled that module and action level.

Required AI modes:

- `disabled`
- `draft_only`
- `suggest_only`
- `auto_with_approval`
- `fully_automated`

Every AI or automation action must check the organization/module setting before
running. Create a centralized permission function such as:

```
canRunAutomationAction(orgId, module, actionType)
```

All AI actions must be logged in `ai_logs`.
All automation actions must be logged in `automation_logs`.

### 3. Resend / Outbound Email Gate

All outbound email must default to test/sandbox mode.

Required:

- In development, emails must only send to approved test inboxes.
- Add `EMAIL_MODE=test|production`.
- Add `APPROVED_TEST_EMAILS` env variable.
- Block real recipient sending unless `EMAIL_MODE=production`.
- Production email mode must require explicit configuration.
- Log all outbound email attempts.
- Prevent automation loops from sending repeated emails.
- Add rate limits and duplicate-send protection.

### 4. Production Deployment Gate

The app may be deployed to preview/dev environments freely, but production
deployment must require human approval.

Required:

- Separate dev and production Supabase projects.
- Separate dev and production Resend API keys.
- Separate environment variables.
- No seed/demo data in production.
- No destructive migrations against production without manual approval.
- Create `PRODUCTION_CHECKLIST.md`.
- Create `SECURITY_REVIEW.md`.
- Create `RLS_TEST_PLAN.md`.
- Create `AI_AUTOMATION_SAFETY.md`.
- Create `EMAIL_SAFETY.md`.

### 5. Development Freedom

Within development, Claude Code should continue building quickly and
autonomously:

- app scaffolding
- UI pages
- CRUD screens
- dashboards
- database schema
- dev migrations
- reusable components
- mock AI features
- test data
- tenant portal
- vendor portal
- owner portal
- reports
- automation builder UI

The goal is not to slow the build down. The goal is to prevent irreversible
harm when switching from dev/demo mode to real tenants, real vendors, real
emails, real money records, and production data.

### 6. Enforcement model (how these gates actually hold)

Sections 1–5 are **not self-enforcing by being written here.** Each gate holds
only because the capability to cross it is structurally withheld from the build
environment, not because this document forbids it:

- Production Supabase credentials (URL, `service_role` key, database connection
  string), the production Resend API key, and the switch that sets any
  organization's AI/automation mode to a level above `draft_only` against real
  data are held **exclusively by the human operator.** They are never placed in
  Claude Code's environment, never committed to the repo, never written to any
  `.env` file the build process reads.
- The dev environment contains only: dev Supabase credentials, a Resend
  test/sandbox key, `EMAIL_MODE=test`, and an `APPROVED_TEST_EMAILS` allowlist.
  With only these, the irreversible actions in sections 1–4 are not
  "forbidden" — they are **impossible**, because the build has no production
  database to write to, no production email key to send real mail with, and no
  ability to grant itself an automated AI mode.
- The `.md` files required by sections 1–4 (`SECURITY_REVIEW.md`,
  `PRODUCTION_CHECKLIST.md`, `RLS_TEST_PLAN.md`, `AI_AUTOMATION_SAFETY.md`,
  `EMAIL_SAFETY.md`) are the **audit record of human review having occurred.**
  They are not the enforcement mechanism. A completed checklist file does not
  authorize crossing a gate; only the human operator placing the withheld
  production credentials into the production environment, after that review,
  does.
- Crossing any gate is therefore a deliberate human act performed **outside**
  the autonomous build: the operator personally placing production secrets into
  Vercel's production environment variables, by hand, after the corresponding
  review is documented. The build "finishing" is never the event that unlocks a
  gate. The documented human review clearing is.

---

## Build instruction (first Claude Code task)

1. Create a git repo at `/Users/kristopherkelley/Downloads/PMS-Build`.
2. Write this spec as `SPEC.md` and make it the **first commit**.
3. Do **not** scaffold, install, or build anything yet.
4. After the commit, report back what credentials are present in the
   environment before any Phase 1 work begins. Expected: dev-only. Any
   production value present is a stop-and-fix before Phase 1.

---

## Product spec

> The full product specification (roles, modules, phases, UI direction, etc.)
> from the original build spec belongs below this line. Paste it here so the
> safety gates above govern the entire document.
