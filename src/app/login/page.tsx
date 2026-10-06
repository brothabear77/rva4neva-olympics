import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { getLoginChoices } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

/** Only a path on this site: "/submit", never "//elsewhere.com" or a full URL. */
function safeNext(next: string | string[] | undefined): string {
  const path = typeof next === "string" ? next : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

export default async function LoginPage(props: PageProps<"/login">) {
  const next = safeNext((await props.searchParams).next);
  if (await getSession()) redirect(next);

  const choices = await getLoginChoices();

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Sign in"
        description="Pick your name and enter your password."
      />

      <div className="card max-w-md p-4 sm:p-6">
        <LoginForm choices={choices} next={next} />
      </div>

      <p className="mt-6 max-w-md text-sm text-muted">
        On the roster but not in the list?{" "}
        <Link href="/claim" className="text-accent underline-offset-4 hover:underline">
          Claim your athlete
        </Link>{" "}
        and the admin will approve it.
      </p>
    </>
  );
}
