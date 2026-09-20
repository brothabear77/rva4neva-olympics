"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, SITE } from "@/lib/site";

export function NavTabs() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--edge)] bg-ink/95 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="flex items-center justify-between gap-4 py-3">
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="font-display text-xl font-bold uppercase tracking-[0.08em] text-paper">
              RVA<span className="text-accent">4</span>NEVA
            </span>
            <span className="hidden font-display text-xs uppercase tracking-[0.22em] text-muted sm:inline">
              Olympics
            </span>
          </Link>
          <span className="eyebrow hidden md:inline">{SITE.tagline}</span>
        </div>

        {/* Tabs scroll horizontally rather than wrap on narrow phones. */}
        <nav
          aria-label="Primary"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "relative whitespace-nowrap px-3 py-2.5 font-display text-sm font-medium uppercase tracking-[0.1em] transition-colors",
                  active ? "text-accent" : "text-muted hover:text-paper",
                ].join(" ")}
              >
                {item.label}
                <span
                  className={[
                    "absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-opacity",
                    active ? "bg-accent opacity-100" : "opacity-0",
                  ].join(" ")}
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
