# PRODUCTION_CHECKLIST.md — production deployment gate

> Audit record for SPEC.md Gate 4.
>
> Completing this checklist does **not** authorize production use. Per SPEC.md
> section 6, a gate is crossed only when the human operator personally places
> the withheld production secrets into the production environment, by hand,
> after the corresponding reviews are documented. "The build finishing" is
> never the event that unlocks a gate.

## 1. Current status

| Item | Status |
|---|---|
| Phase 1 build | Complete (auth, orgs, roles, dashboard, properties, buildings, units, tenants) |
| Dev migrations applied | ⛔ **Blocked** — dev DB direct connection is IPv6-only and was unreachable; awaiting a Session-pooler `DATABASE_URL` |
| RLS reviewed (`SECURITY_REVIEW.md`) | ⛔ Awaiting human sign-off |
| RLS tests executed (`RLS_TEST_PLAN.md`) | ⛔ Not run (DB unreachable) |
| Production deployment | ⛔ Not started — gated |

## 2. Environment separation

- [ ] Separate **dev** and **production** Supabase projects.
- [ ] Separate **dev** and **production** Resend API keys.
- [ ] Separate environment variable sets per environment.
- [ ] Production secrets (Supabase `service_role`, DB connection string,
      production Resend key) exist **only** in the production host's
      environment — never in the repo, never in any `.env` the build reads.
- [ ] `.gitignore` confirmed to exclude all `.env*` files. ✅ (verified)

## 3. Gate reviews (all must be documented before launch)

- [ ] **Gate 1 — RLS:** `SECURITY_REVIEW.md` signed off; `RLS_TEST_PLAN.md`
      executed with every cross-org case denying access.
- [ ] **Gate 2 — AI/Automation:** `AI_AUTOMATION_SAFETY.md` reviewed; all orgs
      confirmed `ai_mode = 'disabled'` unless explicitly elevated.
- [ ] **Gate 3 — Email:** `EMAIL_SAFETY.md` reviewed. **Code complete +
      staged gate walk-test-verified 2026-05-28** (deny-by-default two-key
      production-authorize + per-mode allowlist + explicit open-send; see
      `EMAIL_SAFETY_PROD_SIGNOFF_AUDIT.md`). Production email is **NOT live** —
      operator rollout (separate prod Resend key, verified domain +
      `EMAIL_FROM`, `EMAIL_MODE=production`,
      `EMAIL_PRODUCTION_SEND_AUTHORIZED=true`, then `EMAIL_OPEN_SEND=true`)
      per `EMAIL_SAFETY.md` §8 pending.
- [ ] **Gate 4 — Deployment:** this checklist.

## 4. Data hygiene

- [ ] No seed / demo / test data present in the production database.
- [ ] No destructive migration run against production without explicit,
      documented human approval.
- [ ] Database backups / point-in-time recovery confirmed enabled.

## 5. Application

- [ ] `npm run build` passes. ✅ (Phase 1)
- [ ] `npm run lint` passes.
- [ ] Auth flows verified against the production Supabase project.
- [ ] Error monitoring configured.

## 6. Sign-off

| Gate | Reviewer | Date |
|---|---|---|
| RLS | _pending_ | _pending_ |
| AI / Automation | _pending_ | _pending_ |
| Email | _pending_ | _pending_ |
| Deployment | _pending_ | _pending_ |
