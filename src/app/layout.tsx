import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Oswald } from "next/font/google";
import { NavTabs } from "@/components/NavTabs";
import { SITE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — Live Scoreboard`,
    template: `%s · ${SITE.shortName}`,
  },
  description: SITE.tagline,
};

export const viewport: Viewport = {
  themeColor: "#14110f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <NavTabs />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-[var(--edge)] px-4 py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <span>{SITE.name}</span>
            <Link href="/changelog" className="text-muted underline-offset-4 hover:text-accent hover:underline">
              Change history
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
