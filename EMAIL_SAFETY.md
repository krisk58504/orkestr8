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
- [x] **Section 5 item 2** — single-recipient invariant: `OutboundEmail.to`
      is a single `string` (no cc/bcc); every send site passes exactly one
      address; guard comment added at the `sendEmail()` chokepoint. _(staged
      rollout audit §4, 2026-05-28)_
- [x] **Staged-rollout re-gate (code, 2026-05-28 — supersedes the
      "test-mode-only guard" tripwire below).** The `mode !== "test"` hard
      block is relaxed under the documented sign-off in
      `EMAIL_SAFETY_PROD_SIGNOFF_AUDIT.md` and replaced by the two-key staged
      gate: Gate 3 blocks production sends unless
      `EMAIL_PRODUCTION_SEND_AUTHORIZED=true`; Gate 2 enforces a per-mode
      allowlist (production: `EMAIL_PRODUCTION_ALLOWLIST`), opening to all only
      when `EMAIL_OPEN_SEND=true`. All three flags parse deny-by-default.
- [x] **Gate 3 authorize flag** `EMAIL_PRODUCTION_SEND_AUTHORIZED` implemented
      (deny-by-default; only literal `"true"` authorizes). _(code)_
- [x] **Production allowlist** `EMAIL_PRODUCTION_ALLOWLIST` enforced by
      default; empty = nobody (no fail-open). _(code)_
- [x] **Open-send flag** `EMAIL_OPEN_SEND` for full launch (deny-by-default).
      _(code — the flag is implemented; SETTING it in prod is the §8 go-live step)_
- [ ] Verified: with `EMAIL_MODE=test`, no mail reaches non-allowlisted
      addresses. _(verified by walk-test — run pending)_
- [ ] Verified sending domain + `EMAIL_FROM` set (real-delivery prerequisite;
      without it the sandbox sender reaches only the verified self address).
      _(operator, §8)_
- [ ] Separate production Resend key configured by the operator (not committed).
      _(operator, §8)_
- [ ] `EMAIL_MODE=production` set only in the production environment.
      _(operator, §8)_
- [ ] `EMAIL_PRODUCTION_SEND_AUTHORIZED=true` set in production (Phase 1 soft
      launch). _(operator, §8)_
- [ ] `EMAIL_OPEN_SEND=true` set when going fully live (Phase 2). _(operator, §8)_

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
- §5/§6 blockers and verifications stand AS OF PHASE 3: Gate 3's
  test-mode-only guard still blocks every production-mode send.
  **[Superseded 2026-05-28]** — Gate 3 is now the two-key
  production-authorize gate (§8 / `EMAIL_SAFETY_PROD_SIGNOFF_AUDIT.md`):
  production sends are permitted only with
  `EMAIL_PRODUCTION_SEND_AUTHORIZED=true`, and stay allowlist-restricted
  (`EMAIL_PRODUCTION_ALLOWLIST`) until `EMAIL_OPEN_SEND=true`.

## 8. Production email rollout runbook (operator-only)

> Design + rationale: `EMAIL_SAFETY_PROD_SIGNOFF_AUDIT.md`. Cross-ref:
> `PRODUCTION_CHECKLIST.md` Gate-3 row. The send code is staged and
> deny-by-default; the steps below are the operator/config actions that
> turn real sending on. Nothing here runs in dev — on dev the new flags
> stay unset, which is the safe default the walk-test exercises.

### 8.1 The three controls (all deny-by-default — only literal `true` enables)

| Env var | Effect | Unset / typo |
|---|---|---|
| `EMAIL_MODE` | `production` selects the prod path; anything else → `test` | → `test` |
| `EMAIL_PRODUCTION_SEND_AUTHORIZED` | Gate 3 master switch — `true` authorizes production sending | → blocked |
| `EMAIL_PRODUCTION_ALLOWLIST` | comma/space-separated recipients permitted in production | → nobody |
| `EMAIL_OPEN_SEND` | `true` lifts the allowlist (full launch — send to everyone) | → allowlist-enforced |

`EMAIL_MODE=production` **alone does not send** — both Gate 3 (authorize)
and Gate 2 (recipient) must admit a message.

### 8.2 Prerequisites (production host environment only — never committed)

1. **Production Resend API key** — a separate key from dev/test; set
   `RESEND_API_KEY` in the prod environment.
2. **Verified sending domain + DNS** — add and verify a domain in Resend;
   publish the required SPF/DKIM records. Until done, the only deliverable
   sender is the sandbox `onboarding@resend.dev`, which delivers **only to
   the Resend account's own verified address** — real recipients log `failed`.
3. **`EMAIL_FROM`** — set to a verified-domain address (e.g.
   `Orkestr8 <noreply@yourdomain.com>`). **Hard prerequisite for real
   delivery**: without it, `getFromAddress()` falls back to the sandbox
   sender.

### 8.3 Staged rollout (each phase reversible)

- **Phase 0 — blocked (default/resting):** none of the new flags set →
  production sending blocked at Gate 3. Safe.
- **Phase 1 — soft launch (self only):**
  1. `EMAIL_PRODUCTION_ALLOWLIST=<operator's own address>`.
  2. `EMAIL_MODE=production` **and** `EMAIL_PRODUCTION_SEND_AUTHORIZED=true`.
  3. Leave `EMAIL_OPEN_SEND` **unset**.
  4. **Verify (soft-launch checkpoint):** trigger a real send to the
     allowlisted self address → confirm `email_log.status='sent'` **and**
     actual receipt through the production domain. Trigger a send to a
     non-allowlisted address → confirm `email_log.status='blocked'` (no
     delivery). This proves the prod path works AND the allowlist restricts.
- **Phase 2 — go live (all recipients):**
  5. **Set `EMAIL_OPEN_SEND=true`.** ← this is "go live". **Do NOT** clear
     the allowlist to go live — an empty allowlist means *nobody* (§8.1).

### 8.4 Rollback (either step, instantly)

- Un-set `EMAIL_OPEN_SEND` → back to allowlist-restricted soft launch.
- Un-set `EMAIL_PRODUCTION_SEND_AUTHORIZED` → back to fully blocked
  (Phase 0), regardless of `EMAIL_MODE`.

### 8.5 The settings-page badge is DECOUPLED from the real gate

The Settings page renders a Test/Production badge from the org-level
`organizations.email_mode` column. **That column is NOT what the send gate
reads** — the gate reads the environment variables above. An operator must
**not** rely on the badge to judge whether mail is flowing: the env vars
(`EMAIL_MODE` + `EMAIL_PRODUCTION_SEND_AUTHORIZED` + the allowlist /
`EMAIL_OPEN_SEND`) are the source of truth. (Future work may wire the badge
to the real gate state or relabel it — see the audit §9.2.1.)
- The audit trail in `email_log` is unchanged in shape.
