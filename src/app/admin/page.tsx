import { redirect } from "next/navigation";
import { AccountsPanel, ClaimsPanel } from "@/components/AdminPanels";
import { PageHeader } from "@/components/ui";
import { getSession, isAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/credentials";
import { getAccounts, getPendingClaims } from "@/lib/queries";
import { formatEventDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (!isAdmin(session)) redirect("/");

  const [claims, accounts] = await Promise.all([getPendingClaims(), getAccounts()]);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Accounts"
        description="Approve people claiming their athlete, and decide who can enter scores. Staff logins are managed with npm run auth:staff."
      />

      <ClaimsPanel
        claims={claims.map((c) => ({
          id: c.id,
          athleteName: c.athleteName,
          phone: formatPhone(c.phone),
          requestedAt: formatEventDateTime(c.createdAt),
        }))}
      />

      <AccountsPanel accounts={accounts.map(({ id, name, role, isStaff }) => ({ id, name, role, isStaff }))} />
    </>
  );
}
