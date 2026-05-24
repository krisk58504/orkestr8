import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Message } from "@/lib/types/app";

export type ConversationSummary = {
  tenant: { id: string; first_name: string; last_name: string };
  last_message: {
    body: string;
    created_at: string;
    sender_role: Message["sender_role"];
  } | null;
  /**
   * Count of unread tenant→staff messages — messages from the tenant that
   * arrived after last_read_by_staff_at. Staff don't need to count their own
   * outbound messages as unread.
   */
  unread_count_for_staff: number;
};

/**
 * Inbox for staff — one row per tenant who has at least one message in this
 * org. Cookie-bound client; RLS enforces org scoping. JS-side aggregation is
 * fine for the message volumes we expect; if conversations grow into many
 * thousands this becomes a candidate for a window-function RPC.
 */
export async function getConversationsForOrg(
  orgId: string,
): Promise<ConversationSummary[]> {
  const supabase = await createClient();

  const [messagesRes, stateRes] = await Promise.all([
    supabase
      .from("messages")
      .select("id, tenant_id, body, sender_role, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_conversation_state")
      .select("tenant_id, last_read_by_staff_at")
      .eq("organization_id", orgId),
  ]);

  const messages = messagesRes.data ?? [];
  if (messages.length === 0) return [];

  const lastReadByTenant = new Map<string, string | null>();
  for (const s of stateRes.data ?? []) {
    lastReadByTenant.set(s.tenant_id, s.last_read_by_staff_at);
  }

  // Walk messages once (already sorted DESC). First sighting per tenant is
  // the most recent. Count unread (tenant→staff with created_at > last read)
  // as we go.
  const summaries = new Map<
    string,
    {
      last_message: ConversationSummary["last_message"];
      unread_count_for_staff: number;
    }
  >();
  for (const m of messages) {
    const entry = summaries.get(m.tenant_id);
    if (!entry) {
      summaries.set(m.tenant_id, {
        last_message: {
          body: m.body,
          created_at: m.created_at,
          sender_role: m.sender_role,
        },
        unread_count_for_staff: 0,
      });
    }
    if (m.sender_role === "tenant") {
      const cutoff = lastReadByTenant.get(m.tenant_id);
      if (!cutoff || m.created_at > cutoff) {
        summaries.get(m.tenant_id)!.unread_count_for_staff += 1;
      }
    }
  }

  const tenantIds = [...summaries.keys()];
  const { data: tenantRows } = await supabase
    .from("tenants")
    .select("id, first_name, last_name")
    .in("id", tenantIds);

  const tenantById = new Map(
    (tenantRows ?? []).map((t) => [
      t.id,
      { id: t.id, first_name: t.first_name, last_name: t.last_name },
    ]),
  );

  return tenantIds
    .map((tid) => {
      const t = tenantById.get(tid);
      if (!t) return null;
      const s = summaries.get(tid)!;
      return {
        tenant: t,
        last_message: s.last_message,
        unread_count_for_staff: s.unread_count_for_staff,
      };
    })
    .filter((c): c is ConversationSummary => c !== null)
    .sort((a, b) => {
      const aTs = a.last_message?.created_at ?? "";
      const bTs = b.last_message?.created_at ?? "";
      return bTs.localeCompare(aTs);
    });
}

/**
 * Messages in a tenant's conversation, chronological. Side-effect: when
 * markAsReadAs is provided, upserts tenant_conversation_state to advance
 * the appropriate high-water mark to now(). Defaults to no-op so test/debug
 * callers don't mutate read state.
 */
export async function getConversationMessages(
  tenantId: string,
  opts: { markAsReadAs?: "staff" | "tenant" } = {},
): Promise<Message[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (opts.markAsReadAs) {
    // Need organization_id for the state row; cheapest source is the tenants
    // table (RLS lets staff and the tenant themselves read it).
    const { data: tenant } = await supabase
      .from("tenants")
      .select("organization_id")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenant) {
      const nowISO = new Date().toISOString();
      await supabase
        .from("tenant_conversation_state")
        .upsert(
          {
            tenant_id: tenantId,
            organization_id: tenant.organization_id,
            last_read_by_staff_at:
              opts.markAsReadAs === "staff" ? nowISO : undefined,
            last_read_by_tenant_at:
              opts.markAsReadAs === "tenant" ? nowISO : undefined,
          },
          { onConflict: "tenant_id" },
        );
    }
  }

  return data ?? [];
}

/**
 * The tenant's own conversation, chronological. Resolves the tenant by
 * user_id and returns null if no tenant record is linked. When markAsRead is
 * true (the default for the portal page), advances last_read_by_tenant_at.
 */
export async function getTenantConversation(
  authUserId: string,
  opts: { markAsRead?: boolean } = {},
): Promise<{ tenantId: string; messages: Message[] } | null> {
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (!tenant) return null;

  const messages = await getConversationMessages(
    tenant.id,
    opts.markAsRead ? { markAsReadAs: "tenant" } : {},
  );
  return { tenantId: tenant.id, messages };
}
