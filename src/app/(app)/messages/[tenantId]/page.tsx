import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sendStaffMessage } from "@/app/(app)/messages/actions";
import { ConversationThread } from "@/components/messages/conversation-thread";
import { MessageComposer } from "@/components/messages/message-composer";
import { createClient } from "@/lib/supabase/server";
import { getConversationMessages } from "@/lib/data/messages";

export const metadata: Metadata = { title: "Conversation" };

export default async function StaffConversationPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  // RLS gates this read — non-staff don't reach (app)/* via the layout guard.
  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, first_name, last_name")
    .eq("id", tenantId)
    .maybeSingle();

  const messages = await getConversationMessages(tenantId, {
    markAsReadAs: "staff",
  });

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-3xl flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Link
          href="/messages"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span className="sr-only">Back to messages</span>
        </Link>
        <h1 className="text-sm font-semibold">
          {tenant
            ? `${tenant.first_name} ${tenant.last_name}`
            : "Conversation"}
        </h1>
      </header>
      <ConversationThread messages={messages} senderSelf="staff" />
      <MessageComposer
        onSend={sendStaffMessage.bind(null, tenantId)}
        placeholder="Reply to your tenant…"
      />
    </div>
  );
}
