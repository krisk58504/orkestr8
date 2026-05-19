# AI_AUTOMATION_SAFETY.md — AI & automation control gate

> Audit record for SPEC.md Gate 2.

## 1. Default posture

Every organization is created with `ai_mode = 'disabled'`
(`organizations.ai_mode`, migration `20260518000200_core_tenancy.sql`). No AI
or automation runs until a human explicitly raises the mode.

## 2. Modes

| Mode | Drafts | Suggestions | Real (side-effecting) actions |
|---|---|---|---|
| `disabled` | ✗ | ✗ | ✗ |
| `draft_only` | ✓ | ✗ | ✗ |
| `suggest_only` | ✓ | ✓ | ✗ |
| `auto_with_approval` | ✓ | ✓ | ✓ — only if module enabled **and** a human approves |
| `fully_automated` | ✓ | ✓ | ✓ — only if module enabled |

"Real actions" = `send_message`, `dispatch_vendor`, `approve_invoice`,
`modify_financials`, `escalate`, `notify_external`.

## 3. Central control function

`canRunAutomationAction(supabase, orgId, module, actionType)` —
`src/lib/auth/permissions.ts`.

- **Deny-by-default**: unknown modes, missing organizations, and modules that
  are not explicitly enabled all return `allowed: false`.
- Every AI or automation action MUST call this function before doing anything.
- Real actions additionally require a per-module opt-in stored in `settings`
  (`module = 'ai'`, `key = 'module:<name>'`, `value.enabled = true`).
- Returns `{ allowed, mode, requiresApproval, reason }`.

## 4. Logging

- `ai_logs` — every AI action (table created in migration
  `20260518000500_infrastructure.sql`).
- `automation_logs` — every automation action.
- Both have **no client INSERT policy**; only trusted server code (service
  role) appends. Both are readable only by org managers.

## 5. Phase 1 status

- No AI features are implemented in Phase 1. The gate function, the `ai_mode`
  enum, the org default, and the log tables all exist and are staged for
  Phase 6.
- Because `ai_mode` defaults to `disabled` and the elevation control is not
  exposed in the application, the irreversible AI actions in SPEC Gate 2 are
  not merely forbidden — they are **impossible** in the current build.

## 6. Before enabling AI in production

- [ ] AI provider key configured by the operator (never committed).
- [ ] `canRunAutomationAction` confirmed on the path of every AI feature.
- [ ] `ai_logs` / `automation_logs` writing confirmed.
- [ ] Mode elevation UI (if added) restricted to OWNER and audit-logged.
- [ ] Loop / duplicate protection reviewed for any action-taking automation.
