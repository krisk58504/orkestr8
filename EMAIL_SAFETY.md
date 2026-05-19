# EMAIL_SAFETY.md — outbound email (Resend) safety gate

> Audit record for SPEC.md Gate 3.

## 1. Default posture

- `EMAIL_MODE=test` in `.env.local` (verified present, dev-scoped).
- `APPROVED_TEST_EMAILS` env var holds the dev allowlist.
- Every organization is created with `email_mode = 'test'`
  (`organizations.email_mode`).

## 2. Required behavior (for when transactional email is implemented)

- In `test` mode, outbound mail may be delivered **only** to addresses on the
  `APPROVED_TEST_EMAILS` allowlist. All other recipients are dropped/blocked.
- Real recipients are reachable **only** when `EMAIL_MODE=production`, which is
  an operator-only production action.
- Every outbound attempt is logged.
- Rate limiting and duplicate-send protection guard against automation loops.

## 3. Phase 1 status

- **No application-level outbound email is implemented in Phase 1.** No Resend
  client or send path exists in the codebase yet.
- Account-confirmation / auth emails are handled by Supabase Auth's own email
  service, configured in the Supabase dashboard — not by this application and
  not via the Resend key.
- The Resend key in `.env.local` is a dev/test key and is currently unused by
  application code.
- A `sendEmail()` utility with the test-mode allowlist enforcement, logging,
  rate limiting, and duplicate protection is to be built in the phase that
  introduces transactional email (communications / notifications).

## 4. Before enabling production email

- [ ] `sendEmail()` utility implemented with allowlist enforcement.
- [ ] Outbound attempts logged.
- [ ] Rate limiting + duplicate-send protection in place.
- [ ] Separate production Resend key configured by the operator (not committed).
- [ ] `EMAIL_MODE=production` set only in the production environment.
- [ ] Verified: with `EMAIL_MODE=test`, no mail reaches non-allowlisted
      addresses.
