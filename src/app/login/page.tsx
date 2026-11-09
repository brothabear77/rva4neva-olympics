import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { registrationLocked } from "@/lib/siteSettings";

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
  const locked = await registrationLocked();

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Sign in"
        description="Enter your username and password."
      />

      <div className="card max-w-md p-4 sm:p-6">
        <LoginForm next={next} />
      </div>

      {locked ? null : (
        <p className="mt-6 max-w-md text-sm text-muted">
          New to the games?{" "}
          <Link href="/register" className="text-accent underline-offset-4 hover:underline">
            Sign up
          </Link>{" "}
          to join.
        </p>
      )}
    </>
  );
}
