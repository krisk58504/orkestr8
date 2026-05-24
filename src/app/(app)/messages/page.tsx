import type { Metadata } from "next";
import { ConversationList } from "@/components/messages/conversation-list";
import { PageHeader } from "@/components/shared/page-header";
import { getSessionContext } from "@/lib/auth/session";
import { getConversationsForOrg } from "@/lib/data/messages";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const context = await getSessionContext();
  if (!context) return null;

  const conversations = await getConversationsForOrg(context.organization.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Conversations with your tenants."
      />
      <ConversationList conversations={conversations} />
    </div>
  );
}
