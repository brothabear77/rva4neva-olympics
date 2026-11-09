import { redirect } from "next/navigation";
import { AccountsPanel, RegistrationPanel } from "@/components/AdminPanels";
import { PageHeader } from "@/components/ui";
import { getSession, isAdmin } from "@/lib/auth";
import { getAccounts } from "@/lib/queries";
import { registrationLocked } from "@/lib/siteSettings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (!isAdmin(session)) redirect("/");

  const [accounts, locked] = await Promise.all([getAccounts(), registrationLocked()]);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Accounts"
        description="Open or close registration, and decide who can enter scores. Staff logins are managed with npm run auth:staff."
      />

      <RegistrationPanel locked={locked} />

      <AccountsPanel accounts={accounts.map(({ id, name, username, athleteId, role, isStaff }) => ({ id, name, username, athleteId, role, isStaff }))} />
    </>
  );
}
