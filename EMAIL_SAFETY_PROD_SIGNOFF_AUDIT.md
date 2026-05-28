# EMAIL_SAFETY production-email sign-off — Audit

> **STATUS**: scratch work, audit-first per the slice 4-6 discipline.
> Not the implementation — this is the read-first verification that the
> staged production-email rollout lands cleanly. No code/config/env
> changed by this document.
>
> **Naming/location note**: placed at repo **root** as
> `EMAIL_SAFETY_PROD_SIGNOFF_AUDIT.md`, beside the safety/gate-doc family
> it belongs to — `EMAIL_SAFETY.md` (which it audits and whose new §8 it
> drafts), `AI_AUTOMATION_SAFETY.md`, `SECURITY_REVIEW.md`,
> `PRODUCTION_CHECKLIST.md`, and the standalone audits
> (`SECTION_11_AUDIT_PACKET.md`, `PHASE_6/7_AUDIT_DRAFT.md`). `docs/`
> holds phase/slice audits (`PHASE_7_SLICE_N_AUDIT.md`); this is not a
> slice, so root is the consistent home. The proposed
> `docs/EMAIL_SAFETY_PROD_SIGNOFF_AUDIT.md` would have orphaned it from
> the gate-doc family.
>
> **All design decisions pre-locked** (2026-05-28 handoff Q1-Q8). §0
> records the ledger; the body is the read-first verification.

---

## §0 — Scope + decisions ledger

**Goal.** Replace the current all-or-nothing production block with a
**deny-by-default staged rollout**: production sending is off until two
independent affirmative flags are set, and even when on, recipients are
allowlist-restricted until an explicit open-send flag flips. No real
email is sent by this audit; implementation + the operator flip are
separate, gated steps. **This session's code scope is logic/config
only** (the re-gate + new deny-by-default parse helpers + a guard
comment); the production key/domain/flip is an operator runbook (§7).

**Decisions ledger (authoritative — locked):**

| # | Decision |
|---|---|
| 1 | **Allowlist = deny-by-default.** Empty allowlist = send to NOBODY in BOTH modes (never fail-open). test mode: `APPROVED_TEST_EMAILS` (unchanged). production mode: a **separate** prod-scoped allowlist applies by default (empty = nobody); recipients open to all only via an explicit open-send flag. Going fully live is an affirmative flag-set, never absence of config. |
| 2 | **Gate 3 = explicit two-key authorize flag.** Production sending blocked UNLESS (`EMAIL_MODE=production` AND an explicit authorize flag is true). Setting `EMAIL_MODE=production` alone does NOT enable sending. Flag unset → blocked → today's posture preserved. |
| 3 | **Two rollout controls → two phases.** Gate 3 authorize flag = master on/off; Gate 2 open-send flag = recipient scope. Phase 1 = authorize ON + allowlist=self → self only. Phase 2 = open-send ON → all recipients. |
| 4 | **Deny-by-default parsing for every new flag.** Unset/empty/typo/any-non-literal → the SAFE state (mirrors `getEmailMode()` where only literal `"production"` enables). Verbatim parse functions in §2. |
| 5 | **Single-recipient affirmed (§5-item-2 CLOSE).** `to: string` is the type-level assertion; add a guard comment at the chokepoint. No behavior change. |
| 6 | **Walk-test: gate decisions verified PRE-provider; end-to-end SELF-ONLY.** Three states verified via `email_log.status` without provider contact for non-self. prod+open "allows non-self" asserted at UNIT level. NO step delivers to any non-self address. |
| 7 | **Operator runbook → `EMAIL_SAFETY.md §8`**, cross-linked from `PRODUCTION_CHECKLIST.md` Gate-3 row. "Go live" = SET THE OPEN-SEND FLAG (not "clear the allowlist"). |
| 8 | **§6 checklist GROWS.** Close §5-item-2; supersede the test-mode-only-guard tripwire (relaxed under this sign-off, replaced by the staged gate); close "test mode blocks non-allowlisted" (walk-test); ADD authorize-flag / prod-allowlist-default / open-send-flag items; keep prod-key + `EMAIL_MODE=production` open as operator actions. |

**Chosen names** (justified in §2): authorize flag
`EMAIL_PRODUCTION_SEND_AUTHORIZED`; open-send flag `EMAIL_OPEN_SEND`;
prod allowlist `EMAIL_PRODUCTION_ALLOWLIST`.

---

## §1 — Current `send.ts` gate behavior (verbatim) + what changes

`src/lib/email/send.ts` runs four steps. **Gate 1 and the deliver block
are UNCHANGED.** Gates 2 and 3 change.

**Gate 1 — dedup (UNCHANGED):**
```ts
const dup = await checkRecentDuplicate(email);
if (dup.kind === "duplicate") { … return { delivered:false, status:"suppressed", … }; }
if (dup.kind === "unverifiable") { … return { delivered:false, status:"blocked", … }; }  // fail-closed (§5-item-1)
```

**Gate 2 — recipient allowlist (CHANGES via `isRecipientAllowed`):**
```ts
if (!isRecipientAllowed(email.to)) {
  const reason = "Blocked — recipient is not on the APPROVED_TEST_EMAILS allowlist and EMAIL_MODE is not 'production'.";
  await logEmailAttempt(email, mode, "blocked", reason);
  return { delivered: false, status: "blocked", mode, reason };
}
```

**Gate 3 — test-mode-only hard block (REPLACED):**
```ts
if (mode !== "test") {
  const reason = "Blocked — the Resend send path is authorized for test mode only; production sending is not yet permitted (see EMAIL_SAFETY.md).";
  await logEmailAttempt(email, mode, "blocked", reason);
  return { delivered: false, status: "blocked", mode, reason };
}
```

**Deliver (UNCHANGED):** `deliverViaResend()` → `sent` / catch → `failed`.

**What changes (exactly):**
1. **`config.ts`** — add three deny-by-default helpers + rewrite
   `isRecipientAllowed()` (§2/§3). The current production short-circuit
   (`if (getEmailMode() === "production") return true;`) is removed — it
   is the fail-open line this whole effort exists to eliminate.
2. **`send.ts` Gate 2** — reason string updated (the allowlist now
   applies in production too); behavior driven by the new
   `isRecipientAllowed`.
3. **`send.ts` Gate 3** — replace the `mode !== "test"` hard block with
   the two-key authorize check (§3).
4. **`send.ts` chokepoint** — add the single-recipient guard comment (§4).

Nothing else in `send.ts` moves. Gate ORDER stays 1→2→3 (§3 truth
table proves all combinations are correct under this order).

---

## §2 — New config surface (names, parse functions verbatim, read site)

All three live in `src/lib/email/config.ts` (the existing email-config
module; same place `getEmailMode` / `getApprovedTestEmails` already
read `process.env`). **No other module reads them.**

### §2.1 — Names + justification

| Name | Role | Why this name |
|---|---|---|
| `EMAIL_PRODUCTION_SEND_AUTHORIZED` | Gate 3 master authorize flag | `EMAIL_` groups it with `EMAIL_MODE`/`EMAIL_FROM`; `PRODUCTION_SEND_AUTHORIZED` says exactly what it gates — a deliberate, verbose name an operator won't set by accident |
| `EMAIL_OPEN_SEND` | Gate 2 open-send (full-launch) flag | Short, unmistakable: "send openly" = drop the allowlist restriction. Distinct from the authorize flag so the two rollout phases are independent |
| `EMAIL_PRODUCTION_ALLOWLIST` | prod-scoped recipient allowlist | **Separate** from `APPROVED_TEST_EMAILS` per decision 1 — the dev/test allowlist (personal throwaway addresses) must never silently govern prod. The `PRODUCTION` token makes the scope explicit; reusing the test var risks a prod deploy inheriting a dev value |

### §2.2 — Deny-by-default parse functions (verbatim — to add to `config.ts`)

```ts
/**
 * Whether production sending is explicitly authorized (Gate 3, two-key).
 * Deny-by-default: only the literal "true" authorizes; unset/empty/"TRUE"/
 * "1"/"yes"/typo → false → blocked. Mirrors getEmailMode()'s posture.
 */
export function isProductionSendAuthorized(): boolean {
  return process.env.EMAIL_PRODUCTION_SEND_AUTHORIZED === "true";
}

/**
 * Whether recipient restriction is lifted (full launch). Deny-by-default:
 * only the literal "true" opens; anything else keeps the allowlist enforced.
 */
export function isOpenSendEnabled(): boolean {
  return process.env.EMAIL_OPEN_SEND === "true";
}

/**
 * Parsed production allowlist (comma/whitespace-separated). Empty when the
 * env var is unset — which, because isRecipientAllowed treats an empty
 * allowlist as "nobody", blocks all production sends until it is populated
 * OR EMAIL_OPEN_SEND=true is set. Deny-by-default: absence => nobody.
 */
export function getProductionAllowlist(): string[] {
  const raw = process.env.EMAIL_PRODUCTION_ALLOWLIST ?? "";
  return raw
    .split(/[,\s]+/)
    .map((entry) => normalizeAddress(entry))
    .filter((entry) => entry.length > 0);
}
```

Each resolves an unset/empty/typo value to its SAFE state: `false`
(flags) or `[]` (allowlist, which `isRecipientAllowed` reads as nobody).
This is the property that makes "forgot to set it" always land safe.

---

## §3 — The re-gated logic (before/after)

### §3.1 — `isRecipientAllowed` (Gate 2 core)

**Before** (`config.ts:60-66`) — fail-open in production:
```ts
export function isRecipientAllowed(address: string): boolean {
  if (getEmailMode() === "production") return true;            // ← fail-open
  const recipientBase = stripPlusTag(normalizeAddress(address));
  return getApprovedTestEmails().map(stripPlusTag).includes(recipientBase);
}
```

**After** — deny-by-default, per-mode allowlist, explicit open-send:
```ts
export function isRecipientAllowed(address: string): boolean {
  const mode = getEmailMode();
  // Full launch: production + explicit open-send → unrestricted. This is the
  // ONLY path to "everyone", and it requires an affirmative flag (never the
  // mere absence of an allowlist).
  if (mode === "production" && isOpenSendEnabled()) return true;
  // Otherwise allowlist-enforced in BOTH modes. An empty allowlist => nobody.
  const allowlist =
    mode === "production" ? getProductionAllowlist() : getApprovedTestEmails();
  const recipientBase = stripPlusTag(normalizeAddress(address));
  return allowlist.map(stripPlusTag).includes(recipientBase);
}
```
`normalizeAddress` / `stripPlusTag` (the §7.1/§7.2 fixes) are reused
unchanged for both allowlists.

### §3.2 — Gate 3 (send.ts)

**Before:** `if (mode !== "test") → blocked` (all production blocked).

**After:**
```ts
// --- Gate 3: production sending requires explicit two-key authorization ---
// Test mode stays authorized as-is (EMAIL_SAFETY.md §4). Production sending
// is blocked UNLESS EMAIL_PRODUCTION_SEND_AUTHORIZED=true — setting
// EMAIL_MODE=production alone does not start sending (deny-by-default).
if (mode === "production" && !isProductionSendAuthorized()) {
  const reason =
    "Blocked — production sending is not authorized " +
    "(set EMAIL_PRODUCTION_SEND_AUTHORIZED=true after EMAIL_SAFETY.md §8 sign-off).";
  await logEmailAttempt(email, mode, "blocked", reason);
  return { delivered: false, status: "blocked", mode, reason };
}
```

**Interpretation note (see §10 finding 1):** decision 2 phrased it
"block UNLESS (production AND authorized)." Taken literally that would
also block **test** mode (test is `mode !== "production"`). That is NOT
the intent — test-mode sending must keep working (the walk-test + §4
wiring depend on it). The faithful encoding gates only the **production**
path: `mode === "production" && !authorized`. Test mode never blocks at
Gate 3.

### §3.3 — Combined truth table (gate order 1→2→3, all combinations)

| mode | authorize | open-send | recipient on (mode) allowlist | Gate 2 | Gate 3 | Outcome |
|---|---|---|---|---|---|---|
| test | — | — | yes | pass | pass | **deliver** (self/allowlisted) |
| test | — | — | no | **block** | — | blocked (allowlist) |
| test | — | — | allowlist empty | **block** | — | blocked (nobody) |
| production | false | * | * | (pass/block) | **block** | blocked (not authorized) |
| production | true | false | yes | pass | pass | **deliver** (soft-launch) |
| production | true | false | no | **block** | — | blocked (not on prod allowlist) |
| production | true | false | empty allowlist | **block** | — | blocked (nobody) |
| production | true | true | any | pass (open) | pass | **deliver** (full launch) |

Order 1→2→3 is safe: even when `open-send=true` opens Gate 2, Gate 3
still blocks if `authorize=false` — the two-key holds. The only cosmetic
artifact: a production-unauthorized recipient that *is* on the allowlist
is blocked at Gate 3 ("not authorized"), while one *not* on the
allowlist is blocked at Gate 2 ("not on allowlist") — both correct, just
different reasons (§10 finding 2; reorder is an option if a single reason
is preferred).

---

## §4 — Single-recipient affirmation (§5-item-2 CLOSE)

**Traced (not assumed):**
- `OutboundEmail.to` is **`to: string`** (`types.ts:30`); the type has
  **no `cc`/`bcc`** fields.
- Every `sendEmail()` call site passes exactly one address: 6 in
  `src/lib/email/notifications.ts` (`to: params.<x>Email`), 2 in the
  vendor handlers (`to: recipient.email`). No arrays, no fan-out within
  a call. Multi-person notifications are DB rows via `produceNotification`
  (not email); any multi-person email would be N separate, individually
  gated `sendEmail` calls.

The type **is** the §5-item-2 assertion. The only addition is a guard
comment at the chokepoint (no behavior change):
```ts
// SINGLE-RECIPIENT INVARIANT (EMAIL_SAFETY.md §5 item 2): sendEmail gates
// exactly one address (email.to). If cc/bcc/multi-recipient is ever added,
// EVERY individual address MUST be re-gated through isRecipientAllowed —
// adding recipients must not bypass the allowlist.
```

---

## §5 — No new schema (confirmed)

This is **config/logic only**:
- **No migration, no table, no column, no enum.** The three new controls
  are environment variables read in `config.ts`; nothing touches the DB.
- **No RLS surface.** No policy added/changed; the cumulative RLS floor
  stays **21 suites / 294 assertions**, untouched.
- **No new Zod schema** (discipline 4 N/A in practice — these are env
  flags, not a config object; if any object were introduced it would be
  plain `z.object()`).
- `database.ts` / types unchanged. The org-level `organizations.email_mode`
  enum column is **not** read by the gate and is **not** modified (see
  §9 residual risk).

---

## §6 — Walk-test rubric

**Hard rule (discipline 6):** no step delivers to any non-self address.
Gate decisions are observable from `email_log.status` **before** any
provider call (each block/suppress path `return`s before the
`deliverViaResend` try-block), so the blocked states need no provider
contact. End-to-end (provider) sends are SELF-ONLY.

**Env handling:** the walk-test must NOT mutate `.env.local` or the real
runner's `EMAIL_MODE`. Production-state cases run in a **throwaway tsx
process** that sets `process.env.*` in-process (e.g.
`EMAIL_MODE=production EMAIL_PRODUCTION_SEND_AUTHORIZED=true … npx tsx scripts/<probe>.ts`)
— transient, never persisted (§10 finding 5).

### §6.1 — Deny-by-default parse tests (unit)
Assert each helper resolves unsafe inputs to safe:
- `isProductionSendAuthorized()` → `false` for unset, `""`, `"TRUE"`, `"1"`, `"yes"`, `" true"`; `true` only for exactly `"true"`.
- `isOpenSendEnabled()` → same matrix.
- `getProductionAllowlist()` → `[]` for unset/`""`/whitespace; parses comma/space lists otherwise.

### §6.2 — Gate-decision states (via `email_log.status`, no non-self delivery)
| State | Setup | Recipient | Expected `email_log.status` | Provider call? |
|---|---|---|---|---|
| test (regression) | EMAIL_MODE=test | non-allowlisted | `blocked` (Gate 2) | no |
| test (regression) | EMAIL_MODE=test | self (allowlisted) | `sent` | yes (self) |
| prod unauthorized | mode=production, authorize unset | self | `blocked` (Gate 3) | no |
| prod soft-launch | mode=production, authorize=true, prod allowlist=self, open unset | self | `sent` | yes (self) |
| prod soft-launch | mode=production, authorize=true, prod allowlist=self, open unset | **non-self** | `blocked` (Gate 2) | **no** (the safety proof) |
| prod open | mode=production, authorize=true, open=true | self | `sent` | yes (self) |

### §6.3 — prod+open "allows non-self" — UNIT level only
Assert `isRecipientAllowed("someone-else@example.com") === true` when
`mode=production` + `open-send=true`. **Do NOT** run this end-to-end
(would invoke the provider for a non-self address). This is the one case
where the decision is verified by the pure function, not `email_log`.

### §6.4 — Confirmations
- Test-mode regression green (still blocks non-allowlisted) → closes a §6 item.
- No `email_log` row with `status='sent'` for any non-self address across the entire walk-test.
- (If any fixtures created — e.g. a probe automation — single-transaction cleanup per discipline 3. Expected: none; the walk-test is gate-logic, not data.)

---

## §7 — Operator runbook (drafted for `EMAIL_SAFETY.md §8`)

> To be appended to `EMAIL_SAFETY.md` as **§8** on implementation
> approval, and cross-linked from `PRODUCTION_CHECKLIST.md` Gate-3 row.

### §8 — Production email rollout runbook (operator-only)

**Pre-requisites (all in the production host's environment only — never
committed):**
1. **Production Resend API key** — a separate key from the dev/test one;
   set `RESEND_API_KEY` in the prod environment.
2. **Verified sending domain** — add and verify a domain in Resend; add
   the required DNS records (SPF/DKIM). Until this is done, the only
   deliverable sender is the sandbox `onboarding@resend.dev`, which
   delivers **only to the Resend account's own verified address** — real
   recipients would log `failed`.
3. **`EMAIL_FROM`** — set to a verified-domain address (e.g.
   `Orkestr8 <noreply@yourdomain.com>`). **Hard prerequisite for real
   delivery** (without it, `getFromAddress()` falls back to the sandbox
   sender — §9 / §10 finding 3).

**Staged rollout (two phases, each reversible):**

*Phase 0 — still blocked (default):* with none of the flags set,
production resolves to fully blocked (Gate 3). This is the safe resting
state.

*Phase 1 — soft launch (self only):*
1. Set `EMAIL_PRODUCTION_ALLOWLIST` = the operator's own address(es).
2. Set `EMAIL_MODE=production`.
3. Set `EMAIL_PRODUCTION_SEND_AUTHORIZED=true`.
4. Leave `EMAIL_OPEN_SEND` **unset**.
5. **Verify:** trigger a real send to the allowlisted self address →
   confirm `email_log.status='sent'` AND actual receipt. Trigger a send
   to a non-allowlisted address → confirm `email_log.status='blocked'`
   (no delivery). This proves the prod path works AND the allowlist
   restricts.

*Phase 2 — go live (all recipients):*
6. **Set `EMAIL_OPEN_SEND=true`.** ← **this is "go live"** (NOT clearing
   the allowlist — an empty allowlist means *nobody*, §1).

**Rollback (either step, instantly):**
- Un-set `EMAIL_OPEN_SEND` → back to allowlist-restricted soft launch.
- Un-set `EMAIL_PRODUCTION_SEND_AUTHORIZED` → back to fully blocked
  (Phase 0), regardless of mode.

---

## §8 — `EMAIL_SAFETY.md §6` checklist delta

Apply on implementation:

**Close:**
- `[x]` §5-item-2 multi-recipient — single-recipient affirmed
  (`to: string` + guard comment). (§4)
- `[x]` "Verified: with `EMAIL_MODE=test`, no mail reaches
  non-allowlisted addresses" — walk-test §6.2 test-regression row.

**Supersede (record, don't bare-check):**
- ~~`[ ]` Test-mode-only guard in `sendEmail()` removed/relaxed only
  with sign-off~~ → **"Relaxed under this audit's sign-off
  (`EMAIL_SAFETY_PROD_SIGNOFF_AUDIT.md`); the `mode !== "test"` hard
  block is replaced by the staged two-key gate (Gate 3 authorize flag +
  Gate 2 prod allowlist)."**

**Add (new staged-rollout items):**
- `[ ]` Gate 3 authorize flag `EMAIL_PRODUCTION_SEND_AUTHORIZED`
  implemented, deny-by-default (only `"true"` authorizes). *(code)*
- `[ ]` Production allowlist `EMAIL_PRODUCTION_ALLOWLIST` enforced by
  default; empty = nobody (no fail-open). *(code)*
- `[ ]` Explicit open-send flag `EMAIL_OPEN_SEND` for full launch,
  deny-by-default. *(code)*
- `[ ]` Verified sending domain + `EMAIL_FROM` set (real delivery
  prerequisite). *(operator)*

**Keep open (operator actions, per §7):**
- `[ ]` Separate production Resend key configured.
- `[ ]` `EMAIL_MODE=production` set only in production.
- `[ ]` `EMAIL_PRODUCTION_SEND_AUTHORIZED=true` set in production (Phase 1).
- `[ ]` `EMAIL_OPEN_SEND=true` set when going fully live (Phase 2).

---

## §9 — Risks

### §9.1 — Fail-open scenarios this design PREVENTS
1. **Unset prod allowlist → blast-all.** Original brief's "prod + empty
   = everybody" would have sent to all users on a missing/typo'd env
   var. Now empty = **nobody** (deny-by-default). ✅
2. **`EMAIL_MODE=production` set accidentally → sending starts.** Now
   still blocked — the authorize flag is independently required
   (two-key). ✅
3. **Flag typo opens the gate.** `"TRUE"`/`"1"`/`"yes"`/` true ` all
   resolve to the safe state (only literal `"true"` enables). ✅
4. **Dev test allowlist leaks into prod.** Separate
   `EMAIL_PRODUCTION_ALLOWLIST` — the test var has no prod effect. ✅
5. **`open-send` set but not authorized.** Gate 3 still blocks — open-send
   alone cannot send (truth table row 8 requires both). ✅

### §9.2 — Residual risks (flagged, not all in scope)
1. **Org-level `organizations.email_mode` is decoupled from the gate.**
   The settings page (`settings/page.tsx:133-135`) renders a
   Test/Production badge from this column, but the **send gate reads env,
   not the column.** Confusion risk: an operator sees "Production" on the
   badge and assumes mail is flowing, while the env gate may still block
   (or vice-versa). **Recommendation: document the decoupling now**
   (note in EMAIL_SAFETY.md §8); a future slice could either wire the
   badge to the real gate state or relabel/remove it. Not addressed here
   — out of scope (env-gate redesign), but a real partner-confusion risk.
2. **Both flags are GLOBAL, not per-org.** `EMAIL_OPEN_SEND=true` opens
   sending for **every** org at once. Fine for a single-tenant-style
   launch; if per-org production rollout is ever needed, the decoupled
   `organizations.email_mode` column is the natural per-org control —
   future work. Flagged.
3. **`EMAIL_FROM` fallback to the sandbox sender.** If `EMAIL_FROM` is
   unset in prod, `getFromAddress()` returns `onboarding@resend.dev`,
   which only delivers to the Resend account's verified address — real
   recipients would log `failed`. The runbook makes `EMAIL_FROM` a hard
   prerequisite (§7), but the code does not *enforce* it. Acceptable
   (runbook-gated); could add a startup assertion in a future hardening.

---

## §10 — Anything the locked decisions didn't anticipate

1. **Gate 3 literal vs intent.** Decision 2's "block unless (production
   AND authorized)" literally blocks **test** mode too. Test sending
   must keep working (walk-test + §4). Faithful encoding gates only the
   production path: `mode === "production" && !isProductionSendAuthorized()`
   (§3.2). Flagging because the literal reading would break test mode.
2. **Gate order / reason consistency.** Keeping order 1→2→3, a
   production-unauthorized recipient is blocked at Gate 2 *or* Gate 3
   depending on allowlist membership — both correct outcomes, different
   reasons. Option: move the authorize check before the allowlist check
   for a single consistent "not authorized" reason. Left as 1→2→3
   (minimal change); flagged for the plan-author.
3. **`EMAIL_FROM` is effectively a 6th open item.** The original 5 open
   §6 items don't call it out explicitly, but real prod delivery is
   impossible without a verified domain + `EMAIL_FROM` (sandbox fallback
   only reaches self). Added to §8's checklist + §7 prerequisites.
4. **Open-send is global.** The decisions describe a single rollout but
   not org granularity; this design flips all orgs together. Noted as
   residual risk §9.2.2 (the decoupled org column is the future per-org
   lever).
5. **Walk-testing production states without changing env.** Discipline
   says don't change `EMAIL_MODE`/env. The prod-state walk-test rows
   therefore use **in-process** `process.env` overrides in a throwaway
   tsx probe (never editing `.env.local`, never the real runner). §6
   spells this out; the decisions didn't.

---

## §11 — Disciplines carry-forward (slices 4-6)

1. **Audit committed BEFORE implementation** — this doc lands as a
   standalone commit before any `send.ts`/`config.ts` change.
2. **Walk-test with explicit per-state verification** — §6 (three gate
   states + deny-by-default parse tests + test regression), self-only
   end-to-end.
3. **Single-transaction fixture cleanup if any fixtures created** —
   expected none (gate-logic walk-test); honored if a probe row appears.
4. **Plain `z.object()` for any new config** — N/A (env flags, no Zod
   object); if introduced, plain.
5. **Migration DDL verbatim if any schema** — **none** (§5: config/logic
   only, no migration).
6. **NO real email to any non-self address at any point** — §6 hard rule;
   prod+open-non-self asserted at unit level only.
