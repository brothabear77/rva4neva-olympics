"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV, SITE, isNavMenu, type NavMenu } from "@/lib/site";

const TAB =
  "relative whitespace-nowrap px-3 py-2.5 font-display text-sm font-medium uppercase tracking-[0.1em] transition-colors";

export function NavTabs() {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());

  // Which menu is open (by label), and where its panel goes.
  const [open, setOpen] = useState<string | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [focusFirst, setFocusFirst] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const openMenu = (menu: NavMenu, withKeyboard: boolean) => {
    const trigger = triggers.current.get(menu.label);
    const header = headerRef.current;
    if (!trigger || !header) return;

    // The panel lives outside the tab strip (which scrolls sideways on a phone
    // and would clip it) and is placed under its trigger, relative to the header.
    const t = trigger.getBoundingClientRect();
    const h = header.getBoundingClientRect();
    const panelWidth = 200;
    setPos({
      left: Math.max(8, Math.min(t.left - h.left, h.width - panelWidth - 8)),
      top: t.bottom - h.top,
    });
    setFocusFirst(withKeyboard);
    setOpen(menu.label);
  };

  const closeMenu = (returnFocus: boolean) => {
    if (open && returnFocus) triggers.current.get(open)?.focus();
    setOpen(null);
  };

  // Moving to another page, from a menu item or anywhere else, closes the menu.
  useEffect(() => setOpen(null), [pathname]);

  // A keyboard opener lands on the first item; a mouse click does not.
  useEffect(() => {
    if (open && focusFirst) panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, focusFirst]);

  // While open: a press anywhere else, or a resize, closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const onTrigger = [...triggers.current.values()].some((t) => t.contains(target));
      if (!panelRef.current?.contains(target) && !onTrigger) setOpen(null);
    };
    const onResize = () => setOpen(null);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);

    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(at + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(at - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // Tabbing out of a menu closes it; focus carries on where Tab was sending it.
      setOpen(null);
    }
  };

  const openMenuData = NAV.find((item) => isNavMenu(item) && item.label === open);

  return (
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-[var(--edge)] bg-ink/95 backdrop-blur">
      <div className="flex w-full items-center gap-4 px-10 py-3">
        <Link href="/" className="group flex shrink-0 items-center">
          <Image
            src="/rva4nevaoly.svg"
            alt="#rva4neva Olympics"
            width={74}
            height={74}
            priority
            unoptimized // Next's optimizer refuses local SVGs by default; this one is our own, trusted file.
            className="h-[74px] w-[74px]"
          />
        </Link>

        {/* Tabs scroll horizontally, within whatever room is left beside the logo,
            rather than wrap onto a second row. */}
        <nav
          aria-label="Primary"
          onScroll={() => open && setOpen(null)}
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {NAV.map((item) => {
            if (isNavMenu(item)) {
              const active = item.items.some((child) => isActive(child.href));
              const expanded = open === item.label;
              return (
                <button
                  key={item.label}
                  ref={(node) => {
                    if (node) triggers.current.set(item.label, node);
                    else triggers.current.delete(item.label);
                  }}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={expanded}
                  aria-controls={`menu-${item.label}`}
                  onClick={(e) => (expanded ? closeMenu(false) : openMenu(item, e.detail === 0))}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      openMenu(item, true);
                    }
                  }}
                  className={[
                    TAB,
                    "inline-flex items-center gap-1.5",
                    active || expanded ? "text-accent" : "text-muted hover:text-paper",
                  ].join(" ")}
                >
                  {item.label}
                  <svg
                    viewBox="0 0 12 12"
                    width="10"
                    height="10"
                    aria-hidden="true"
                    className={["transition-transform", expanded ? "rotate-180" : ""].join(" ")}
                  >
                    <path d="M2 4.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span
                    className={[
                      "absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-opacity",
                      active ? "bg-accent opacity-100" : "opacity-0",
                    ].join(" ")}
                  />
                </button>
              );
            }

            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[TAB, active ? "text-accent" : "text-muted hover:text-paper"].join(" ")}
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

        <span className="eyebrow hidden shrink-0 md:inline">{SITE.tagline}</span>
      </div>

      {openMenuData && isNavMenu(openMenuData) ? (
        <div
          ref={panelRef}
          id={`menu-${openMenuData.label}`}
          role="menu"
          aria-label={openMenuData.label}
          onKeyDown={onPanelKeyDown}
          style={{ left: pos.left, top: pos.top }}
          className="absolute z-50 w-[200px] rounded-b-lg border border-t-0 border-[var(--edge-strong)] bg-ink py-1 shadow-lg"
        >
          {openMenuData.items.map((child) => {
            const active = pathname.startsWith(child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                className={[
                  "block px-4 py-2.5 font-display text-sm font-medium uppercase tracking-[0.1em] transition-colors hover:bg-surface/50",
                  active ? "text-accent" : "text-paper",
                ].join(" ")}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}
