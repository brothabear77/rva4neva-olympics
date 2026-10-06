import Link from "next/link";
import { ClaimForm } from "@/components/AuthForms";
import { EmptyState, PageHeader } from "@/components/ui";
import { getUnclaimedAthletes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Claim your athlete" };

export default async function ClaimPage() {
  const athletes = await getUnclaimedAthletes();

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Claim your athlete"
        description="Pick yourself from the roster and choose a password. The admin checks your phone number to confirm it's you, then deletes it. All your account keeps is your name and your password."
      />

      {athletes.length === 0 ? (
        <EmptyState title="Everyone's been claimed">
          If you're on the roster and someone else has your athlete, tell the admin.{" "}
          <Link href="/login" className="text-accent underline-offset-4 hover:underline">
            Sign in
          </Link>
        </EmptyState>
      ) : (
        <div className="card max-w-md p-4 sm:p-6">
          <ClaimForm athletes={athletes} />
        </div>
      )}
    </>
  );
}
