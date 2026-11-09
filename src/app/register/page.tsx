import Link from "next/link";
import { RegisterForm } from "@/components/AuthForms";
import { EmptyState, PageHeader } from "@/components/ui";
import { REGISTRATION_LOCKED_MESSAGE, registrationLocked } from "@/lib/siteSettings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign up" };

export default async function RegisterPage() {
  const locked = await registrationLocked();

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Sign up"
        description="Join the games: pick the name everyone sees, and a username and password to sign in with. You're on the roster and in every event right away."
      />

      {locked ? (
        <EmptyState title="Registration is closed">
          {REGISTRATION_LOCKED_MESSAGE}{" "}
          <Link href="/login" className="text-accent underline-offset-4 hover:underline">
            Sign in
          </Link>
        </EmptyState>
      ) : (
        <div className="card max-w-md p-4 sm:p-6">
          <RegisterForm />
        </div>
      )}
    </>
  );
}
