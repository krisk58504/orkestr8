import Link from "next/link";

function Layout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
      <Link
        href="/login"
        className="inline-block text-sm font-medium text-foreground underline"
      >
        Go to sign in
      </Link>
    </div>
  );
}

export function NotFoundState() {
  return (
    <Layout title="Invite not found">
      <p>
        This invite link is invalid. Double-check the URL from your email — or
        contact the property manager who invited you for a fresh link.
      </p>
    </Layout>
  );
}

export function ExpiredState() {
  return (
    <Layout title="This invite has expired">
      <p>
        Invite links are valid for 7 days. Contact the property manager who
        invited you and ask them to send a new one.
      </p>
    </Layout>
  );
}

export function RevokedState() {
  return (
    <Layout title="This invite was revoked">
      <p>
        The property manager has revoked this invite. Contact them if you
        believe this is a mistake.
      </p>
    </Layout>
  );
}

export function AlreadyAcceptedState() {
  return (
    <Layout title="This invite was already accepted">
      <p>
        Your tenant portal account is already set up. Sign in with the email
        and password you chose.
      </p>
    </Layout>
  );
}
