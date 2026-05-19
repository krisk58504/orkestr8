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

## 4. Phase 2 status — email STRUCTURE built; send path NOT wired

The email structure now exists under `src/lib/email/`:

- `config.ts` — `getEmailMode()` (deny-by-default: anything but the literal
  `production` resolves to `test`) and the `APPROVED_TEST_EMAILS` allowlist.
- `templates.ts` — pure `{ subject, html, text }` builders for the Phase 2
  transactional emails. Building a template never sends anything.
- `log.ts` — `logEmailAttempt()` writes every attempt to `email_log`;
  `isDuplicateRecentSend()` provides anti-loop duplicate suppression.
- `send.ts` — `sendEmail()`, the single chokepoint. It runs duplicate
  suppression → mode resolution → test-mode allowlisting → logging.

**The actual provider (Resend) call is intentionally NOT wired.** In
`send.ts`, after a recipient passes every gate, execution reaches an
explicitly-marked **SEND SEAM**: the message is logged with status `queued`
and `sendEmail()` returns `delivered: false`. `deliverViaResend()` is an
unimplemented stub that throws if called. Nothing in the codebase can deliver
mail. The `resend` npm package is not installed. `sendEmail()` is not yet
called from any server action.

This pause is deliberate — wiring a live send path requires the human sign-off
below.

## 5. Before enabling production email

- [x] `sendEmail()` chokepoint implemented with allowlist enforcement.
- [x] Outbound attempts logged to `email_log` (queued/blocked/suppressed).
- [x] Duplicate-send protection in place (`isDuplicateRecentSend()`).
- [ ] **Send seam wired:** `deliverViaResend()` implemented and called from
      `sendEmail()` — requires explicit human sign-off.
- [ ] `resend` package installed.
- [ ] Separate production Resend key configured by the operator (not committed).
- [ ] `EMAIL_MODE=production` set only in the production environment.
- [ ] Verified: with `EMAIL_MODE=test`, no mail reaches non-allowlisted
      addresses.
