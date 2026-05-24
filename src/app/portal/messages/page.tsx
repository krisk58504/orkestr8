import type { Metadata } from "next";
import { sendTenantMessage } from "@/app/portal/messages/actions";
import { ConversationThread } from "@/components/messages/conversation-thread";
import { MessageComposer } from "@/components/messages/message-composer";
import { getSessionContext } from "@/lib/auth/session";
import { getTenantConversation } from "@/lib/data/messages";

export const metadata: Metadata = { title: "Messages" };

export default async function PortalMessagesPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const conversation = await getTenantConversation(context.authUserId, {
    markAsRead: true,
  });

  if (!conversation) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-2xl font-semibold">Messages aren't set up yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account isn't linked to a tenant record. Contact your property
          manager so they can finish setting up your access.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-3xl flex-col overflow-hidden rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">
          Conversation with {context.organization.name}
        </h1>
        <p className="text-xs text-muted-foreground">
          Messages with your property team.
        </p>
      </header>
      <ConversationThread
        messages={conversation.messages}
        senderSelf="tenant"
      />
      <MessageComposer
        onSend={sendTenantMessage}
        placeholder="Send a message to your property team…"
      />
    </div>
  );
}
