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

## 4. Phase 2 status — send path WIRED for TEST MODE ONLY

The email structure exists under `src/lib/email/`:

- `config.ts` — `getEmailMode()` (deny-by-default: anything but the literal
  `production` resolves to `test`), the `APPROVED_TEST_EMAILS` allowlist, and
  `getFromAddress()`.
- `templates.ts` — pure `{ subject, html, text }` builders for the Phase 2
  transactional emails. Building a template never sends anything.
- `log.ts` — `logEmailAttempt()` writes every attempt to `email_log`;
  `isDuplicateRecentSend()` provides anti-loop duplicate suppression.
- `send.ts` — `sendEmail()`, the single chokepoint, plus `deliverViaResend()`.

**The Resend send path is wired and active for `test` mode only.** As
authorized on 2026-05-19, `deliverViaResend()` calls the Resend API using the
dev/test `RESEND_API_KEY` from `.env.local`. `sendEmail()` gate order:

1. duplicate suppression → log `suppressed`, stop;
2. test-mode allowlist (`isRecipientAllowed`) → non-allowlisted recipients are
   logged `blocked` and never reach the provider;
3. **test-mode-only guard** — if `getEmailMode()` is not `test`, the message is
   logged `blocked` and not sent. The wired path is authorized for test mode
   only; production sending stays blocked here until section 5 is cleared;
4. send via Resend, then log the provider's verdict: `sent` (with the Resend
   message id) or `failed` — logged **after** the provider responds, never a
   pre-emptive `queued`.

`EMAIL_MODE` remains `test` and is not set anywhere by application code.

## 5. Blocking before production — MUST be resolved before `EMAIL_MODE=production`

Recorded 2026-05-19 as a precondition of the test-mode wiring:

1. **Dedup check must fail _closed_.** ✅ **RESOLVED 2026-05-19.** The dedup
   helper has been renamed `checkRecentDuplicate()` and now returns a
   discriminated union — `unique` / `duplicate` / `unverifiable` — rather
   than a bare boolean. Any exception inside the function, and any non-null
   `error` field on the supabase-js query response (which the SDK surfaces
   without throwing — the original silent fail-open path), now collapse to
   `unverifiable`. `sendEmail()` treats `unverifiable` as a **block**: the
   message is logged with `status='blocked'` and the reason
   `"Blocked — duplicate-suppression check could not verify this is not a
   replay; failing closed."` and is NOT handed to Resend. An unsendable email
   is recoverable; a runaway loop to real recipients is not. Verified by
   `scripts/test-email.ts` cases T3 (genuine duplicate → `suppressed`) and
   T4 (forced unverifiable via `EMAIL_DEDUP_FORCE_FAIL=1` test seam →
   `blocked`).
2. **The gate assumes a single recipient.** `sendEmail()` / `isRecipientAllowed`
   check exactly one address (`email.to`). Any future `cc`/`bcc`/multi-recipient
   sending **must re-gate every individual address** through the allowlist —
   adding recipients must not bypass the allowlist.
3. **Confirm `queued`/`sent`/`failed` logging is correct post-send.** Verified
   2026-05-19 by `scripts/test-email.ts`: T1 (allowlisted send) logs `sent`
   with the Resend message id on `email_log.payload` only after the provider
   responds — no pre-emptive `queued`; T2/T3/T4 log `blocked`/`suppressed`
   without ever calling Resend.

## 6. Before enabling production email

- [x] `sendEmail()` chokepoint implemented with allowlist enforcement.
- [x] Outbound attempts logged to `email_log` (sent/failed/blocked/suppressed).
- [x] Duplicate-send protection in place (`checkRecentDuplicate()`).
- [x] **Send path wired:** `deliverViaResend()` implemented and called from
      `sendEmail()` — for `test` mode only.
- [x] `resend` package installed.
- [x] **Section 5 item 1** — `checkRecentDuplicate()` fails CLOSED
      (`unverifiable` → blocked). _(migration on logic only; verified
      `scripts/test-email.ts` T3/T4, 2026-05-19)_
- [ ] **Section 5 item 2** — multi-recipient re-gating addressed (or sending
      kept single-recipient).
- [ ] Separate production Resend key configured by the operator (not committed).
- [ ] Test-mode-only guard in `sendEmail()` removed/relaxed only with sign-off.
- [ ] `EMAIL_MODE=production` set only in the production environment.
- [ ] Verified: with `EMAIL_MODE=test`, no mail reaches non-allowlisted
      addresses.

## 7. Phase 3 gate-tightening — recipient normalization

Two correctness fixes shipped during Phase 3 walk testing. Both **tighten
existing gates** rather than introduce new ones; neither relaxes the test-
mode posture from §4 or the blockers in §5/§6.

### 7.1 Resend handoff case-normalizes the recipient (`37582a6`)

Resend's sandbox sender (`onboarding@resend.dev`) requires the recipient
address to match the verified account email **case-sensitively** — even
though RFC 5321 treats the local-part as case-insensitive. Discovered
during slice 6b walk testing: a tenant email stored as
`KrisK58504@gmail.com` in the DB was rejected by Resend because the verified
account address is `krisk58504@gmail.com`.

`src/lib/email/send.ts:deliverViaResend()` now applies the existing
`normalizeAddress()` helper (`trim().toLowerCase()`) to `email.to` immediately
before handing it to Resend:

```ts
const { data, error } = await resend.emails.send({
  from: getFromAddress(),
  to: normalizeAddress(email.to),    // ← normalize only at the provider boundary
  ...
});
```

Trust-boundary note: the original recipient string remains on
`email.to`, which is what `logEmailAttempt` records in
`email_log.to_address`. Audit queries continue to match against the
user-visible form (whatever the staff member typed), while Resend
sees the canonical lowercase form.

### 7.2 Allowlist comparison strips plus-tag aliases (`d5b5e2c`)

Gmail (and most providers) route every plus-aliased form of an address to
the same inbox: `krisk58504+tenant1@gmail.com`, `krisk58504+test@gmail.com`,
and the bare `krisk58504@gmail.com` all deliver to the same person.
`isRecipientAllowed()` previously did strict string equality after
`normalizeAddress()`, so a plus-aliased recipient failed the
`APPROVED_TEST_EMAILS` allowlist even when the base address was listed —
blocking legitimate test fixtures.

`src/lib/email/config.ts` adds a private `stripPlusTag(normalized)` helper
that truncates the local-part at the first `+`. `isRecipientAllowed()`
applies it to BOTH the recipient and each allowlist entry before
comparing:

```ts
export function isRecipientAllowed(address: string): boolean {
  if (getEmailMode() === "production") return true;
  const recipientBase = stripPlusTag(normalizeAddress(address));
  return getApprovedTestEmails()
    .map(stripPlusTag)
    .includes(recipientBase);
}
```

`normalizeAddress()` itself is unchanged — the Resend handoff in §7.1
still sends the plus-aliased address verbatim so the provider routes it
correctly. Only the allowlist *comparison* normalizes further.

Caveat for future allowlist changes: this trade is only safe when each
allowlist entry is an individual's inbox. If an allowlist entry ever points
at a shared role-account that multiple humans access, plus-tag stripping
would let any plus-aliased variant of that address pass the gate.

### 7.3 What did NOT change

- The four gates of `sendEmail()` (`config`/`send`/`log`/§4) are unchanged
  in order or behavior. §7.1 is a transformation at the Resend handoff
  AFTER all four gates have admitted the send; §7.2 is a comparison
  refinement INSIDE Gate 2.
- §5/§6 blockers and verifications stand: Gate 3's test-mode-only guard
  still blocks every production-mode send.
- The audit trail in `email_log` is unchanged in shape.
